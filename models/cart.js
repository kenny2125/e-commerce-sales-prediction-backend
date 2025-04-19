const db = require('../db/db');

class Cart {
  static async findByUserId(userId) {
    try {
      const result = await db.query(
        `SELECT ci.*, p.product_name, p.store_price, p.image_url 
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.product_id
         WHERE ci.user_id = $1`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding cart items:', error);
      throw error;
    }
  }

  static async addItem(userId, productId, quantity = 1) {
    try {
      // Check if item already exists in cart
      const existingItem = await db.query(
        'SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2',
        [userId, productId]
      );

      if (existingItem.rows.length > 0) {
        // Update quantity if item exists
        const result = await db.query(
          `UPDATE cart_items 
           SET quantity = quantity + $3
           WHERE user_id = $1 AND product_id = $2
           RETURNING *`,
          [userId, productId, quantity]
        );
        return result.rows[0];
      } else {
        // Insert new item if it doesn't exist
        const result = await db.query(
          `INSERT INTO cart_items (user_id, product_id, quantity)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [userId, productId, quantity]
        );
        return result.rows[0];
      }
    } catch (error) {
      console.error('Error adding item to cart:', error);
      throw error;
    }
  }

  static async updateQuantity(userId, productId, quantity) {
    try {
      const result = await db.query(
        `UPDATE cart_items 
         SET quantity = $3
         WHERE user_id = $1 AND product_id = $2
         RETURNING *`,
        [userId, productId, quantity]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating cart item quantity:', error);
      throw error;
    }
  }

  static async removeItem(userId, productId) {
    try {
      const result = await db.query(
        'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 RETURNING *',
        [userId, productId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error removing item from cart:', error);
      throw error;
    }
  }

  static async clearCart(userId) {
    try {
      await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  }

  // Fetch product details (price, stock, name, image) for given product IDs
  static async getProductDetails(productIds) {
    try {
      const result = await db.query(
        `SELECT product_id, product_name, store_price, image_url, quantity AS stock 
         FROM products 
         WHERE product_id = ANY($1)`,
        [productIds]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching product details:', error);
      throw error;
    }
  }
}

module.exports = Cart;