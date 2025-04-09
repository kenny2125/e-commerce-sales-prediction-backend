const db = require('../db/db');

class Product {
  static async findAll() {
    try {
      const result = await db.query('SELECT * FROM products ORDER BY created_at DESC');
      return result.rows;
    } catch (error) {
      console.error('Error finding all products:', error);
      throw error;
    }
  }

  static async findById(productId) {
    try {
      const result = await db.query(
        'SELECT * FROM products WHERE product_id = $1',
        [productId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error finding product by ID:', error);
      throw error;
    }
  }

  static async create(productData) {
    const {
      product_id,
      category,
      brand,
      product_name,
      status = 'In Stock',
      quantity = 0,
      store_price,
      image_url = null
    } = productData;

    try {
      const result = await db.query(
        `INSERT INTO products 
        (product_id, category, brand, product_name, status, quantity, store_price, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [product_id, category, brand, product_name, status, quantity, store_price, image_url]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  static async update(productId, productData) {
    const {
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price,
      image_url
    } = productData;

    try {
      const result = await db.query(
        `UPDATE products 
        SET category = $1, brand = $2, product_name = $3, 
            status = $4, quantity = $5, store_price = $6,
            image_url = $7
        WHERE product_id = $8
        RETURNING *`,
        [category, brand, product_name, status, quantity, store_price, image_url, productId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  static async delete(productId) {
    try {
      const result = await db.query(
        'DELETE FROM products WHERE product_id = $1 RETURNING *',
        [productId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  static async search(query) {
    try {
      const searchQuery = `%${query}%`;
      const result = await db.query(
        `SELECT * FROM products 
        WHERE product_name ILIKE $1 
        OR category ILIKE $1 
        OR brand ILIKE $1
        ORDER BY created_at DESC`,
        [searchQuery]
      );
      return result.rows;
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }
}

module.exports = Product;