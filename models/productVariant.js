const db = require('../db/db');

class ProductVariant {
  static async create({ product_ref, sku, variant_name, description = null, store_price, quantity, image_url = null }) {
    const result = await db.query(
      `INSERT INTO product_variants
        (product_ref, sku, variant_name, description, store_price, quantity, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [product_ref, sku, variant_name, description, store_price, quantity, image_url]
    );
    return result.rows[0];
  }

  static async deleteByProductId(productRef) {
    await db.query(
      'DELETE FROM product_variants WHERE product_ref = $1',
      [productRef]
    );
  }

  static async findByProductId(productRef) {
    const result = await db.query(
      'SELECT * FROM product_variants WHERE product_ref = $1 ORDER BY id',
      [productRef]
    );
    return result.rows;
  }
  
  /**
   * Get specific variant details by product ID and SKU
   * @param {number|string} productId - The product ID
   * @param {string} sku - The variant SKU
   * @returns {Promise<Object|null>} - The variant details or null if not found
   */
  static async getVariantDetails(productId, sku) {
    try {
      const result = await db.query(
        'SELECT * FROM product_variants WHERE product_ref = $1 AND sku = $2 LIMIT 1',
        [productId, sku]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting variant details:', error);
      return null;
    }
  }
}

module.exports = ProductVariant;