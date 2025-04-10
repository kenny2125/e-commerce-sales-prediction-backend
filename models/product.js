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
      // Only update fields that are provided
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (category !== undefined) {
        updateFields.push(`category = $${paramCount}`);
        values.push(category);
        paramCount++;
      }
      if (brand !== undefined) {
        updateFields.push(`brand = $${paramCount}`);
        values.push(brand);
        paramCount++;
      }
      if (product_name !== undefined) {
        updateFields.push(`product_name = $${paramCount}`);
        values.push(product_name);
        paramCount++;
      }
      if (status !== undefined) {
        updateFields.push(`status = $${paramCount}`);
        values.push(status);
        paramCount++;
      }
      if (quantity !== undefined) {
        updateFields.push(`quantity = $${paramCount}`);
        values.push(quantity);
        paramCount++;
      }
      if (store_price !== undefined) {
        updateFields.push(`store_price = $${paramCount}`);
        values.push(store_price);
        paramCount++;
      }
      if (image_url !== undefined) {
        updateFields.push(`image_url = $${paramCount}`);
        values.push(image_url);
        paramCount++;
      }

      // Add product_id as the last parameter
      values.push(productId);

      const query = `
        UPDATE products 
        SET ${updateFields.join(', ')}
        WHERE product_id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query(query, values);
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

  static async getCategories() {
    try {
      const result = await db.query(
        'SELECT DISTINCT category FROM products ORDER BY category'
      );
      return result.rows.map(row => row.category);
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  }
}

module.exports = Product;