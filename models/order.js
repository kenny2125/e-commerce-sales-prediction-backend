const db = require('../db/db');

class Order {
  static async create(orderData) {
    const { user_id, total_amount, payment_method, pickup_method, items } = orderData;
    
    try {
      // Start transaction
      await db.query('BEGIN');
      
      // Generate order number (timestamp + random number)
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create order
      const orderResult = await db.query(
        `INSERT INTO orders 
        (order_number, user_id, total_amount, payment_method, pickup_method, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [orderNumber, user_id, total_amount, payment_method, pickup_method, 'pending']
      );
      
      const order = orderResult.rows[0];
      
      // Create order items
      for (const item of items) {
        await db.query(
          `INSERT INTO order_items 
          (order_id, product_id, quantity, price_at_time)
          VALUES ($1, $2, $3, $4)`,
          [order.id, item.product_id, item.quantity, item.store_price]
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
      
      return order;
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
        `SELECT o.*, 
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_at_time', oi.price_at_time,
           'product_name', p.product_name,
           'image_url', p.image_url
         )) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN products p ON oi.product_id = p.product_id
         WHERE o.user_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding orders:', error);
      throw error;
    }
  }

  static async findById(orderId) {
    try {
      const result = await db.query(
        `SELECT o.*, 
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_at_time', oi.price_at_time,
           'product_name', p.product_name,
           'image_url', p.image_url
         )) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN products p ON oi.product_id = p.product_id
         WHERE o.id = $1
         GROUP BY o.id`,
        [orderId]
      );
      return result.rows[0];
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
         WHERE id = $2
         RETURNING *`,
        [status, orderId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }
}

module.exports = Order;