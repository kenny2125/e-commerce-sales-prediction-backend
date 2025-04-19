const db = require('../db/db');

class Order {
  static async create(orderData) {
    const { user_id, payment_method, pickup_method, purpose, items } = orderData;
    
    try {
      // Start transaction
      await db.query('BEGIN');
      
      // Fetch current product prices and stock
      const productIds = items.map(item => item.product_id);
      const detailsRes = await db.query(
        `SELECT product_id, store_price, quantity AS stock FROM products WHERE product_id = ANY($1)`,
        [productIds]
      );
      const detailsMap = new Map(detailsRes.rows.map(row => [row.product_id, row]));
      
      // Validate stock and compute total amount
      let computedTotal = 0;
      for (const item of items) {
        const detail = detailsMap.get(item.product_id);
        if (!detail) {
          throw new Error(`Product ${item.product_id} not found`);
        }
        if (item.quantity > detail.stock) {
          throw new Error(`Insufficient stock for product ${item.product_id}`);
        }
        computedTotal += detail.store_price * item.quantity;
        // Attach price_at_time to item for insert
        item.price_at_time = detail.store_price;
      }
      
      // Generate order number (timestamp + random number)
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create order
      const orderResult = await db.query(
        `INSERT INTO orders 
        (order_number, user_id, total_amount, payment_method, pickup_method, purpose, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [orderNumber, user_id, computedTotal, payment_method, pickup_method, purpose, 'pending']
      );
      
      const order = orderResult.rows[0];
      
      // Create order items
      for (const item of items) {
        await db.query(
          `INSERT INTO order_items 
          (order_id, product_id, quantity, price_at_time)
          VALUES ($1, $2, $3, $4)`,
          [order.id, item.product_id, item.quantity, item.price_at_time]
        );
        
        // Update product quantity
        await db.query(
          `UPDATE products 
          SET quantity = quantity - $1
          WHERE product_id = $2`,
          [item.quantity, item.product_id]
        );
      }
      
      // Commit transaction
      await db.query('COMMIT');
      
      return this.findById(order.id); // Return full order details (including purpose)
    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      console.error('Error creating order:', error);
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const result = await db.query(
        `SELECT o.*, u.first_name, u.last_name,
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_at_time', oi.price_at_time,
           'product_name', p.product_name,
           'image_url', p.image_url
         )) as items
         FROM orders o
         JOIN tbl_users u ON o.user_id = u.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN products p ON oi.product_id = p.product_id
         WHERE o.user_id = $1
         GROUP BY o.id, u.first_name, u.last_name
         ORDER BY o.created_at DESC`,
        [userId]
      );
      
      return result.rows.map(order => ({
        orderID: order.order_number,
        paymentStatus: order.status,
        pickupStatus: order.pickup_method,
        purpose: order.purpose,
        customerName: `${order.first_name} ${order.last_name}`,
        orderDate: order.created_at,
        purchasedProduct: order.items.map(item => item.product_name).join(', '),
        totalAmount: parseFloat(order.total_amount),
        items: order.items
      }));
    } catch (error) {
      console.error('Error finding orders:', error);
      throw error;
    }
  }

  static async findById(orderId) {
    try {
      const result = await db.query(
        `SELECT o.*, u.first_name, u.last_name,
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_at_time', oi.price_at_time,
           'product_name', p.product_name,
           'image_url', p.image_url
         )) as items
         FROM orders o
         JOIN tbl_users u ON o.user_id = u.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN products p ON oi.product_id = p.product_id
         WHERE o.id = $1
         GROUP BY o.id, u.first_name, u.last_name`,
        [orderId]
      );
      
      const order = result.rows[0];
      if (!order) return null;
      
      return {
        orderID: order.order_number,
        paymentStatus: order.status,
        pickupStatus: order.pickup_method,
        purpose: order.purpose,
        customerName: `${order.first_name} ${order.last_name}`,
        orderDate: order.created_at,
        purchasedProduct: order.items.map(item => item.product_name).join(', '),
        totalAmount: parseFloat(order.total_amount),
        items: order.items
      };
    } catch (error) {
      console.error('Error finding order:', error);
      throw error;
    }
  }

  static async updateStatus(orderId, status) {
    try {
      const result = await db.query(
        `UPDATE orders 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
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

  static async deleteOrder(orderId) {
    try {
      await db.query('BEGIN');
      
      // Get order items to restore product quantities
      const itemsResult = await db.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)',
        [orderId]
      );
      
      // Restore product quantities
      for (const item of itemsResult.rows) {
        await db.query(
          `UPDATE products 
           SET quantity = quantity + $1
           WHERE product_id = $2`,
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
      const result = await db.query(
        `SELECT o.*, u.first_name, u.last_name,
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_at_time', oi.price_at_time,
           'product_name', p.product_name,
           'image_url', p.image_url
         )) as items
         FROM orders o
         JOIN tbl_users u ON o.user_id = u.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN products p ON oi.product_id = p.product_id
         GROUP BY o.id, u.first_name, u.last_name
         ORDER BY o.created_at DESC`,
        []
      );
      
      return result.rows.map(order => ({
        orderID: order.order_number,
        paymentStatus: order.status,
        pickupStatus: order.pickup_method,
        purpose: order.purpose,
        customerName: `${order.first_name} ${order.last_name}`,
        orderDate: order.created_at,
        purchasedProduct: order.items.map(item => item.product_name).join(', '),
        totalAmount: parseFloat(order.total_amount),
        items: order.items
      }));
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
         WHERE status NOT IN ('Claimed', 'Cancelled')`
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
      const result = await db.query(
        `SELECT 
          COUNT(*) AS total_orders,
          SUM(CASE WHEN status = 'Processing' THEN 1 ELSE 0 END) AS processing_orders,
          SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_orders,
          SUM(total_amount) AS total_revenue
        FROM orders`
      );
      const row = result.rows[0];
      return {
        totalOrders: parseInt(row.total_orders, 10),
        processingOrders: parseInt(row.processing_orders, 10),
        paidOrders: parseInt(row.paid_orders, 10),
        totalRevenue: parseFloat(row.total_revenue) || 0,
      };
    } catch (error) {
      console.error('Error getting order stats:', error);
      throw error;
    }
  }
}

module.exports = Order;