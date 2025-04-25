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
      // First get the product
      const productResult = await db.query(
        'SELECT * FROM products WHERE id = $1',
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        return null;
      }
      
      const product = productResult.rows[0];
      
      // Get variants in the same method
      const variantsResult = await db.query(
        'SELECT * FROM product_variants WHERE product_ref = $1 ORDER BY id',
        [productId]
      );
      
      // Add variants directly to the product object
      product.variants = variantsResult.rows;
      
      return product;
    } catch (error) {
      console.error('Error finding product by ID:', error);
      throw error;
    }
  }

  static async create(productData) {
    const {
      category,
      brand,
      product_name
    } = productData;

    try {
      const result = await db.query(
        `INSERT INTO products 
        (category, brand, product_name)
        VALUES ($1, $2, $3)
        RETURNING *`,
        [category, brand, product_name]
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
      product_name
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

      // Add product id as last parameter
      values.push(productId);

      const query = `
        UPDATE products
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
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
        'DELETE FROM products WHERE id = $1 RETURNING *',
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
        `SELECT category, id, product_name FROM products ORDER BY category, product_name`
      );
      // Group by category
      const grouped = {};
      for (const row of result.rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push({
          product_id: row.id,  // Use id but maintain product_id in response for compatibility
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
        `SELECT p.id, pv.id as variant_id, p.product_name, pv.variant_name, pv.quantity
         FROM product_variants pv
         JOIN products p ON pv.product_ref = p.id
         ORDER BY pv.quantity ASC
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

  static async getCountByCondition(condition, useVariants = false) {
    try {
      let query;
      if (useVariants) {
        // Query using the product_variants table joined with products
        query = `
          SELECT COUNT(DISTINCT pv.id) as count 
          FROM product_variants pv
          JOIN products p ON pv.product_ref = p.id
          WHERE ${condition}
        `;
      } else {
        // Standard query on products table only
        query = `SELECT COUNT(*) as count FROM products WHERE ${condition}`;
      }
      
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
        'SELECT COALESCE(SUM(quantity * store_price), 0) as value FROM product_variants'
      );
      return { value: parseFloat(result.rows[0].value) || 0 };
    } catch (error) {
      console.error('Error calculating total inventory value:', error);
      throw error;
    }
  }
}

module.exports = Product;