const db = require('../db/db');

class Order {
  static async create(orderData) {
    const { user_id, payment_method, pickup_method, purpose, items } = orderData;
    
    try {
      // Start transaction
      await db.query('BEGIN');
      
      // Check if items have variant_id or sku information to use specific variants
      const variantSkus = items
        .filter(item => item.sku && item.sku.trim() !== '')
        .map(item => item.sku);
      
      let detailsMap = new Map();
      let productRefs = [];
      
      // If specific SKUs are provided, query by SKUs
      if (variantSkus.length > 0) {
        // Get variant details by SKU
        const skuDetailsRes = await db.query(
          `SELECT 
             pv.id AS variant_id,
             pv.product_ref,
             pv.store_price,
             pv.quantity AS stock,
             pv.sku
           FROM product_variants pv
           WHERE pv.sku = ANY($1::text[])`,
          [variantSkus]
        );
        
        // Map details by SKU instead of product_ref to ensure correct variant pricing
        const skuMap = new Map();
        skuDetailsRes.rows.forEach(row => {
          skuMap.set(row.sku, row);
        });
        
        // For each item, use the specific variant details by SKU
        for (const item of items) {
          if (item.sku && skuMap.has(item.sku)) {
            const detail = skuMap.get(item.sku);
            // Store variant details by product_id and SKU combination to ensure uniqueness
            const key = `${item.product_id}-${item.sku}`;
            detailsMap.set(key, detail);
          }
        }
      }
      
      // We don't need fallback to first variant anymore since SKU is required
      
      // Validate stock and compute total amount
      let computedTotal = 0;
      for (const item of items) {
        // Use product_id and SKU combination as the key
        const key = `${item.product_id}-${item.sku}`;
        const detail = detailsMap.get(key);
        
        if (!detail) {
          throw new Error(`No variant found for product ${item.product_id} with SKU ${item.sku}`); 
        }
        if (item.quantity > detail.stock) {
          throw new Error(`Insufficient stock for product ${item.product_id} (variant ${detail.variant_id})`);
        }
        
        // Calculate the line item total using the correct variant price
        const lineItemPrice = detail.store_price;
        const lineItemTotal = lineItemPrice * item.quantity;
        computedTotal += lineItemTotal;
        
        // Store the details we'll need later
        item.variant_id = detail.variant_id;
        item.price_at_time = lineItemPrice;
      }
      
      // Generate order number in format ddmmyyyy-random
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const orderNumber = `${day}${month}${year}-${randomNum}`;
      
      // Map pickup_method to proper pickupStatus for admin panel
      let pickupStatus = 'Processing'; // Changed from 'Preparing' to 'Processing'
      if (pickup_method === 'delivery') {
        pickupStatus = 'Processing'; // Changed from 'On Delivery' to 'Processing'
      }
      
      // Create order - use 'Processing' instead of 'pending' to match admin expectations
      const orderResult = await db.query(
        `INSERT INTO orders 
        (order_number, user_id, total_amount, payment_method, pickup_method, purpose, payment_status, pickup_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [orderNumber, user_id, computedTotal, payment_method, pickup_method, purpose, 'Processing', pickupStatus]
      );
      
      const order = orderResult.rows[0];
      
      // Create order items using the correct variant_id
      for (const item of items) {
        await db.query(
          `INSERT INTO order_items 
          (order_id, product_id, quantity, price_at_time)
          VALUES ($1, $2, $3, $4)`,
          // Use item.variant_id (the actual variant ID) for the product_id column in order_items
          [order.id, item.variant_id, item.quantity, item.price_at_time] 
        );
        
        // Update product variant quantity using the correct variant_id
        await db.query(
          `UPDATE product_variants 
          SET quantity = quantity - $1
          WHERE id = $2`,
          // Use item.variant_id here as well
          [item.quantity, item.variant_id] 
        );
      }
      
      // Commit transaction
      await db.query('COMMIT');
      
      return this.findById(order.id); // Return full order details
    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      console.error('Error creating order:', error);
      throw error;
    }
  }

  // Admin order creation - allows creating orders with specific customer info
  static async createByAdmin(orderData) {
    const { user_id, payment_method, pickup_method, purpose, items, customer_info } = orderData;
    
    try {
      // Start transaction
      await db.query('BEGIN');
      
      // Use existing user ID if provided, otherwise this is a guest checkout
      let userId = user_id;
      let isGuestCheckout = false;
      let companyName = null;
      
      if (!userId) {
        // This is a guest checkout - no need to create a user
        isGuestCheckout = true;
        
        // Extract company name for the orders table
        if (customer_info && customer_info.company_name) {
          companyName = customer_info.company_name;
        }
      }

      // Check if items have variant_id or sku information to use specific variants
      const variantSkus = items
        .filter(item => item.sku && item.sku.trim() !== '')
        .map(item => item.sku);
      
      let detailsMap = new Map();
      let productRefs = [];
      
      // If specific SKUs are provided, query by SKUs
      if (variantSkus.length > 0) {
        // Get variant details by SKU
        const skuDetailsRes = await db.query(
          `SELECT 
             pv.id AS variant_id,
             pv.product_ref,
             pv.store_price,
             pv.quantity AS stock,
             pv.sku
           FROM product_variants pv
           WHERE pv.sku = ANY($1::text[])`,
          [variantSkus]
        );
        
        // Map details by SKU instead of product_ref to ensure correct variant pricing
        const skuMap = new Map();
        skuDetailsRes.rows.forEach(row => {
          skuMap.set(row.sku, row);
        });
        
        // For each item, use the specific variant details by SKU
        for (const item of items) {
          if (item.sku && skuMap.has(item.sku)) {
            const detail = skuMap.get(item.sku);
            // Store variant details by product_id and SKU combination to ensure uniqueness
            const key = `${item.product_id}-${item.sku}`;
            detailsMap.set(key, detail);
          }
        }
      }
      
      // We don't need fallback to first variant anymore since SKU is required
      
      // Validate stock and compute total amount
      let computedTotal = 0;
      for (const item of items) {
        // Use product_id and SKU combination as the key
        const key = `${item.product_id}-${item.sku}`;
        const detail = detailsMap.get(key);
        
        if (!detail) {
          throw new Error(`No variant found for product ${item.product_id} with SKU ${item.sku}`); 
        }
        if (item.quantity > detail.stock) {
          throw new Error(`Insufficient stock for product ${item.product_id} (variant ${detail.variant_id})`);
        }
        
        // Calculate the line item total using the correct variant price
        const lineItemPrice = detail.store_price;
        const lineItemTotal = lineItemPrice * item.quantity;
        computedTotal += lineItemTotal;
        
        // Store the details we'll need later
        item.variant_id = detail.variant_id;
        item.price_at_time = lineItemPrice;
      }
      
      // Generate order number in format ddmmyyyy-random
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const orderNumber = `${day}${month}${year}-${randomNum}`;
      
      // Map pickup_method to proper pickupStatus
      let pickupStatus = 'Processing'; // Changed from 'Preparing' to 'Processing'
      if (pickup_method === 'delivery') {
        pickupStatus = 'Processing'; // Changed from 'On Delivery' to 'Processing'
      }
      
      // Create order - if guest checkout, store customer info in guest_info column
      let orderResult;
      if (isGuestCheckout) {
        orderResult = await db.query(
          `INSERT INTO orders 
          (order_number, total_amount, payment_method, pickup_method, purpose, 
           payment_status, pickup_status, guest_info, company_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [orderNumber, computedTotal, payment_method, pickup_method, purpose, 
           'Processing', pickupStatus, JSON.stringify(customer_info), companyName]
        );
      } else {
        // Regular order with user ID
        orderResult = await db.query(
          `INSERT INTO orders 
          (order_number, user_id, total_amount, payment_method, pickup_method, purpose, 
           payment_status, pickup_status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [orderNumber, userId, computedTotal, payment_method, pickup_method, purpose, 
           'Processing', pickupStatus]
        );
      }
      
      const order = orderResult.rows[0];
      
      // Create order items using the correct variant_id
      for (const item of items) {
        await db.query(
          `INSERT INTO order_items 
          (order_id, product_id, quantity, price_at_time)
          VALUES ($1, $2, $3, $4)`,
          [order.id, item.variant_id, item.quantity, item.price_at_time] 
        );
        
        // Update product variant quantity using the correct variant_id
        await db.query(
          `UPDATE product_variants 
          SET quantity = quantity - $1
          WHERE id = $2`,
          [item.quantity, item.variant_id] 
        );
      }
      
      // Commit transaction
      await db.query('COMMIT');
      
      return {
        orderID: order.order_number,
        totalAmount: computedTotal
      };
    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      console.error('Error creating order by admin:', error);
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const result = await db.query(
        `SELECT o.*, u.first_name, u.last_name, u.address, u.phone,
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_at_time', oi.price_at_time,
           'product_name', p.product_name,
           'variant_name', pv.variant_name,
           'image_url', pv.image_url
         )) as items
         FROM orders o
         JOIN tbl_users u ON o.user_id = u.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN product_variants pv ON oi.product_id = pv.id
         LEFT JOIN products p ON pv.product_ref = p.id
         WHERE o.user_id = $1
         GROUP BY o.id, u.first_name, u.last_name, u.address, u.phone
         ORDER BY o.created_at DESC`,
        [userId]
      );
      
      return result.rows.map(order => ({
        orderID: order.order_number,
        paymentStatus: order.payment_status,
        pickupStatus: order.pickup_status || 'Preparing',
        address: order.address,
        contactNumber: order.phone,
        notes: order.purpose,
        purpose: order.purpose,
        customerName: `${order.first_name} ${order.last_name}`,
        orderDate: order.created_at,
        purchasedProduct: order.items.filter(item => item.product_name).map(item => item.product_name).join(', '),
        totalAmount: parseFloat(order.total_amount),
        items: order.items,
        paymentMethod: order.payment_method,
        pickupMethod: order.pickup_method
      }));
    } catch (error) {
      console.error('Error finding orders:', error);
      throw error;
    }
  }

  static async findById(orderId) {
    try {
      // Determine whether to query by numeric id or order_number string
      const isNumeric = /^\d+$/.test(String(orderId));
      const column = isNumeric ? 'o.id' : 'o.order_number';
      
      // Modified query to handle both guest and user orders
      const result = await db.query(
        `SELECT o.*, 
         COALESCE(u.first_name, '') as first_name, 
         COALESCE(u.last_name, '') as last_name, 
         COALESCE(u.address, '') as user_address, 
         COALESCE(u.phone, '') as user_phone,
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_at_time', oi.price_at_time,
           'product_name', p.product_name,
           'variant_name', pv.variant_name,
           'image_url', pv.image_url
         )) as items
         FROM orders o
         LEFT JOIN tbl_users u ON o.user_id = u.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN product_variants pv ON oi.product_id = pv.id
         LEFT JOIN products p ON pv.product_ref = p.id
         WHERE ${column} = $1
         GROUP BY o.id, u.first_name, u.last_name, u.address, u.phone`,
        [orderId]
      );
      
      const order = result.rows[0];
      if (!order) return null;
      
      // Calculate original total before discount
      const itemsTotal = order.items && order.items[0] !== null 
        ? order.items.reduce((sum, item) => sum + item.quantity * item.price_at_time, 0)
        : 0;
      const discountAmount = order.discount_amount || 0;
      
      // Handle guest orders by checking if guest_info exists
      let customerName, address, phone;
      
      if (order.guest_info) {
        // This is a guest order
        const guestInfo = typeof order.guest_info === 'string' 
          ? JSON.parse(order.guest_info) 
          : order.guest_info;
          
        customerName = guestInfo.name || 'Guest Customer';
        address = guestInfo.address || '';
        phone = guestInfo.phone || '';
      } else {
        // This is a regular user order
        customerName = `${order.first_name} ${order.last_name}`.trim() || 'Unknown Customer';
        address = order.user_address || '';
        phone = order.user_phone || '';
      }
      
      return {
        orderID: order.order_number,
        paymentStatus: order.payment_status,
        pickupStatus: order.pickup_status || 'Processing',
        address: address,
        contactNumber: phone,
        notes: order.purpose,
        purpose: order.purpose,
        customerName: customerName,
        orderDate: order.created_at,
        purchasedProduct: order.items && order.items[0] !== null 
          ? order.items.filter(item => item.product_name).map(item => item.product_name).join(', ')
          : '',
        totalAmount: parseFloat(order.total_amount),
        originalAmount: parseFloat(itemsTotal), // Add original amount before discount
        discountAmount: parseFloat(discountAmount), // Add discount amount
        discountReason: order.discount_reason || '', // Add discount reason
        items: order.items && order.items[0] !== null ? order.items : [],
        paymentMethod: order.payment_method,
        pickupMethod: order.pickup_method,
        companyName: order.company_name || ''
      };
    } catch (error) {
      console.error('Error finding order:', error);
      throw error;
    }
  }

  static async updateStatus(orderId, status, field = 'payment_status') {
    try {
      // Determine which column to update based on the field parameter
      let updateColumn;
      
      if (field === 'pickup_method' || field === 'pickupStatus') {
        updateColumn = 'pickup_status'; // Update pickup_status instead of pickup_method
      } else {
        updateColumn = 'payment_status'; // Default to payment_status
      }
      
      const result = await db.query(
        `UPDATE orders 
         SET ${updateColumn} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE order_number = $2
         RETURNING *`,
        [status, orderId]
      );
      
      if (result.rows.length === 0) return null;
      return this.findById(result.rows[0].id);
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  // Add method to cancel an order
  static async cancelOrder(orderId, userId, userRole) {
    try {
      await db.query('BEGIN');

      // Fetch the order to check status and user ownership (or admin role)
      const orderRes = await db.query(
        'SELECT id, user_id, payment_status FROM orders WHERE order_number = $1',
        [orderId]
      );

      if (orderRes.rows.length === 0) {
        await db.query('ROLLBACK');
        return { success: false, message: 'Order not found', status: 404 };
      }

      const order = orderRes.rows[0];

      // Authorization check: Ensure the user owns the order or is an admin
      if (order.user_id !== userId && userRole !== 'admin') {
         await db.query('ROLLBACK');
         return { success: false, message: 'Unauthorized to cancel this order', status: 403 };
      }

      // Check if order is already cancelled or completed
      if (order.payment_status === 'Cancelled' || order.payment_status === 'Claimed') {
        await db.query('ROLLBACK');
        return { success: false, message: `Order is already ${order.payment_status.toLowerCase()}`, status: 400 };
      }

      // Get order items to restore product quantities
      const itemsResult = await db.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [order.id]
      );

      // Restore product quantities only if the order wasn't already cancelled/claimed
      if (order.payment_status !== 'Cancelled' && order.payment_status !== 'Claimed') {
          for (const item of itemsResult.rows) {
            await db.query(
              `UPDATE product_variants
               SET quantity = quantity + $1
               WHERE id = $2`,
              [item.quantity, item.product_id]
            );
          }
      }

      // Update the order status to 'Cancelled' and also update pickup_status
      const updateResult = await db.query(
        `UPDATE orders
         SET payment_status = 'Cancelled', pickup_status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [order.id]
      );

      await db.query('COMMIT');

      const updatedOrder = await this.findById(updateResult.rows[0].id); // Fetch full details again
      return { success: true, order: updatedOrder, status: 200 };

    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Error cancelling order:', error);
      // Rethrow or return a generic error response
      return { success: false, message: 'Internal server error during cancellation', status: 500 };
    }
  }

  static async deleteOrder(orderId) {
    try {
      await db.query('BEGIN');
      
      // Get order items to restore product quantities
      const itemsResult = await db.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)',
        [orderId]
      );
      
      // Restore product quantities to product_variants table
      for (const item of itemsResult.rows) {
        await db.query(
          `UPDATE product_variants 
           SET quantity = quantity + $1
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }
      
      // Delete the order (cascade will handle order_items)
      const result = await db.query(
        'DELETE FROM orders WHERE order_number = $1 RETURNING *',
        [orderId]
      );
      
      await db.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  static async findAll() {
    try {
      // Modified query to include guest orders using LEFT JOIN instead of JOIN
      const result = await db.query(
        `SELECT 
          o.*,
          COALESCE(u.first_name, '') as first_name,
          COALESCE(u.last_name, '') as last_name,
          COALESCE(u.address, '') as user_address,
          COALESCE(u.phone, '') as user_phone,
          json_agg(
            CASE WHEN oi.id IS NOT NULL THEN
              json_build_object(
                'product_id', oi.product_id,
                'quantity', oi.quantity,
                'price_at_time', oi.price_at_time,
                'product_name', p.product_name,
                'variant_name', pv.variant_name,
                'image_url', pv.image_url
              )
            ELSE NULL END
          ) as items
        FROM orders o
        LEFT JOIN tbl_users u ON o.user_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN product_variants pv ON oi.product_id = pv.id
        LEFT JOIN products p ON pv.product_ref = p.id
        GROUP BY o.id, u.first_name, u.last_name, u.address, u.phone
        ORDER BY o.created_at DESC`,
        []
      );
      
      return result.rows.map(order => {
        // Calculate original total before discount
        const itemsTotal = order.items && order.items[0] !== null 
          ? order.items.reduce((sum, item) => sum + item.quantity * item.price_at_time, 0)
          : 0;
        const discountAmount = order.discount_amount || 0;
        
        // Handle guest orders by checking if guest_info exists
        let customerName, address, phone;
        
        if (order.guest_info) {
          // This is a guest order
          const guestInfo = typeof order.guest_info === 'string' 
            ? JSON.parse(order.guest_info) 
            : order.guest_info;
            
          customerName = guestInfo.name || 'Guest Customer';
          address = guestInfo.address || '';
          phone = guestInfo.phone || '';
        } else {
          // This is a regular user order
          customerName = `${order.first_name} ${order.last_name}`.trim() || 'Unknown Customer';
          address = order.user_address || '';
          phone = order.user_phone || '';
        }
        
        return {
          orderID: order.order_number,
          paymentStatus: order.payment_status,
          pickupStatus: order.pickup_status || 'Processing',
          address: address,
          contactNumber: phone,
          notes: order.purpose,
          purpose: order.purpose,
          customerName: customerName,
          orderDate: order.created_at,
          purchasedProduct: order.items && order.items[0] !== null 
            ? order.items.filter(item => item.product_name).map(item => item.product_name).join(', ')
            : '',
          totalAmount: parseFloat(order.total_amount),
          originalAmount: parseFloat(itemsTotal), // Add original amount before discount
          discountAmount: parseFloat(discountAmount), // Add discount amount
          discountReason: order.discount_reason || '', // Add discount reason
          items: order.items && order.items[0] !== null ? order.items : [],
          paymentMethod: order.payment_method,
          pickupMethod: order.pickup_method,
          companyName: order.company_name || ''
        };
      });
    } catch (error) {
      console.error('Error finding all orders:', error);
      throw error;
    }
  }

  static async getOngoingOrdersCount() {
    try {
      const result = await db.query(
        `SELECT COUNT(*) as count 
         FROM orders 
         WHERE payment_status NOT IN ('Claimed', 'Cancelled')`
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting ongoing orders count:', error);
      throw error;
    }
  }

  // Add method to get overall order stats for analytics
  static async getStats() {
    try {
      // Get current date at midnight to filter for today's orders
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const result = await db.query(
        `SELECT 
          COUNT(*) AS total_orders,
          SUM(CASE WHEN payment_status = 'Processing' THEN 1 ELSE 0 END) AS processing_orders,
          SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) AS paid_orders,
          SUM(CASE WHEN (payment_status = 'Paid' OR payment_status = 'Claimed') 
               AND DATE(created_at) = CURRENT_DATE
               THEN total_amount ELSE 0 END) AS today_revenue
        FROM orders`
      );
      const row = result.rows[0];
      return {
        totalOrders: parseInt(row.total_orders, 10),
        processingOrders: parseInt(row.processing_orders, 10),
        paidOrders: parseInt(row.paid_orders, 10),
        totalRevenue: parseFloat(row.today_revenue) || 0,
      };
    } catch (error) {
      console.error('Error getting order stats:', error);
      throw error;
    }
  }

  static async applyDiscount(orderId, discountData) {
    try {
      const { discountAmount } = discountData;
      
      // Start transaction
      await db.query('BEGIN');

      // Get the current order to calculate the new total
      const orderRes = await db.query(
        'SELECT total_amount, payment_status FROM orders WHERE order_number = $1',
        [orderId]
      );

      if (orderRes.rows.length === 0) {
        await db.query('ROLLBACK');
        return { success: false, message: 'Order not found', status: 404 };
      }

      const currentTotal = parseFloat(orderRes.rows[0].total_amount);
      // Keep the original payment status
      const currentPaymentStatus = orderRes.rows[0].payment_status;
      
      // Validate the discount amount
      if (discountAmount <= 0) {
        await db.query('ROLLBACK');
        return { success: false, message: 'Discount amount must be greater than 0', status: 400 };
      }

      if (discountAmount >= currentTotal) {
        await db.query('ROLLBACK');
        return { success: false, message: 'Discount cannot be greater than or equal to the total amount', status: 400 };
      }

      // Calculate new total after discount
      const newTotal = currentTotal - discountAmount;
      
      // Modify the database schema if discount columns don't exist
      try {
        await db.query(`
          DO $$
          BEGIN
            IF NOT EXISTS(SELECT column_name 
                          FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='discount_amount') THEN
              ALTER TABLE orders ADD COLUMN discount_amount NUMERIC(10,2) DEFAULT 0;
            END IF;
            
            IF NOT EXISTS(SELECT column_name 
                          FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='discount_reason') THEN
              ALTER TABLE orders ADD COLUMN discount_reason TEXT;
            END IF;
          END $$;
        `);
      } catch (schemaError) {
        console.error('Error updating schema:', schemaError);
        await db.query('ROLLBACK');
        return { success: false, message: 'Error updating schema', status: 500 };
      }
      
      // Update the order with the discount BUT NOT changing payment status
      const result = await db.query(
        `UPDATE orders 
         SET total_amount = $1, 
             discount_amount = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE order_number = $3
         RETURNING *`,
        [newTotal, discountAmount, orderId]
      );
      
      await db.query('COMMIT');
      
      if (result.rows.length === 0) {
        return { success: false, message: 'Failed to update order', status: 500 };
      }
      
      // Return the updated order
      const updatedOrder = await this.findById(result.rows[0].id);
      return { success: true, order: updatedOrder, status: 200 };
      
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Error applying discount:', error);
      return { success: false, message: 'Internal server error', status: 500 };
    }
  }

  static async removeDiscount(orderId) {
    try {
      // Start transaction
      await db.query('BEGIN');

      // Get the current order to calculate the original total
      const orderRes = await db.query(
        'SELECT id, discount_amount FROM orders WHERE order_number = $1',
        [orderId]
      );

      if (orderRes.rows.length === 0) {
        await db.query('ROLLBACK');
        return { success: false, message: 'Order not found', status: 404 };
      }

      const order = orderRes.rows[0];
      
      // If there's no discount applied, nothing to remove
      if (!order.discount_amount || parseFloat(order.discount_amount) === 0) {
        await db.query('ROLLBACK');
        return { success: false, message: 'No discount has been applied to this order', status: 400 };
      }

      // Get the total from order items to restore the original amount
      const itemsRes = await db.query(
        'SELECT SUM(quantity * price_at_time) as original_total FROM order_items WHERE order_id = $1',
        [order.id]
      );
      
      const originalTotal = itemsRes.rows[0].original_total;
      
      // Reset the order total to the original amount and clear discount information
      const result = await db.query(
        `UPDATE orders 
         SET total_amount = $1, 
             discount_amount = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE order_number = $2
         RETURNING *`,
        [originalTotal, orderId]
      );
      
      await db.query('COMMIT');
      
      if (result.rows.length === 0) {
        return { success: false, message: 'Failed to update order', status: 500 };
      }
      
      // Return the updated order
      const updatedOrder = await this.findById(result.rows[0].id);
      return { success: true, order: updatedOrder, status: 200 };
      
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Error removing discount:', error);
      return { success: false, message: 'Internal server error', status: 500 };
    }
  }
}

module.exports = Order;