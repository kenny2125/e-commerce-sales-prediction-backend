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

  static async getCategoriesWithProducts() {
    try {
      const result = await db.query(
        `SELECT category, product_id, product_name FROM products ORDER BY category, product_name`
      );
      // Group by category
      const grouped = {};
      for (const row of result.rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push({
          product_id: row.product_id,
          product_name: row.product_name
        });
      }
      // Convert to array format
      return Object.entries(grouped).map(([category, products]) => ({
        category,
        products
      }));
    } catch (error) {
      console.error('Error getting categories with products:', error);
      throw error;
    }
  }

  static async getStockLevels() {
    try {
      const result = await db.query(
        `SELECT product_id, product_name, quantity, status 
         FROM products 
         ORDER BY quantity ASC
         LIMIT 8`
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting stock levels:', error);
      throw error;
    }
  }

  static async getCount() {
    try {
      const result = await db.query('SELECT COUNT(*) as count FROM products');
      return { count: parseInt(result.rows[0].count) };
    } catch (error) {
      console.error('Error getting product count:', error);
      throw error;
    }
  }

  static async getCountByCondition(condition) {
    try {
      const query = `SELECT COUNT(*) as count FROM products WHERE ${condition}`;
      const result = await db.query(query);
      return { count: parseInt(result.rows[0].count) };
    } catch (error) {
      console.error(`Error getting product count with condition '${condition}':`, error);
      throw error;
    }
  }

  static async getTotalInventoryValue() {
    try {
      const result = await db.query(
        'SELECT SUM(quantity * store_price) as value FROM products'
      );
      return { value: parseFloat(result.rows[0].value) || 0 };
    } catch (error) {
      console.error('Error calculating total inventory value:', error);
      throw error;
    }
  }
}

module.exports = Product;