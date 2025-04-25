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
      // Ensure productIds are integers
      const integerProductIds = productIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (integerProductIds.length === 0) {
        return []; // Return empty if no valid IDs
      }

      const result = await db.query(
        `WITH FirstVariant AS (
          SELECT 
            pv.product_ref,
            pv.store_price,
            pv.image_url,
            ROW_NUMBER() OVER(PARTITION BY pv.product_ref ORDER BY pv.id ASC) as rn
          FROM product_variants pv
          WHERE pv.product_ref = ANY($1::int[])
        ), ProductQuantities AS (
          SELECT 
            product_ref,
            COALESCE(SUM(quantity), 0) AS total_quantity
          FROM product_variants
          WHERE product_ref = ANY($1::int[])
          GROUP BY product_ref
        )
        SELECT 
          p.id AS product_id,
          p.product_name,
          fv.store_price,
          fv.image_url,
          COALESCE(pq.total_quantity, 0) AS stock
        FROM 
          products p
        LEFT JOIN 
          FirstVariant fv ON p.id = fv.product_ref AND fv.rn = 1
        LEFT JOIN
          ProductQuantities pq ON p.id = pq.product_ref
        WHERE p.id = ANY($1::int[])`,
        [integerProductIds]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching product details:', error);
      throw error;
    }
  }
}

module.exports = Cart;