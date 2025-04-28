const db = require('../db/db');

class Product {
  static async findAll() {
    try {
      // Query products, join with variants to get first variant's details and total quantity
      const result = await db.query(`
        WITH FirstVariant AS (
          SELECT 
            pv.product_ref,
            pv.store_price,
            pv.image_url,
            ROW_NUMBER() OVER(PARTITION BY pv.product_ref ORDER BY pv.id ASC) as rn
          FROM product_variants pv
        ), ProductQuantities AS (
          SELECT 
            product_ref,
            COALESCE(SUM(quantity), 0) AS total_quantity
          FROM product_variants
          GROUP BY product_ref
        )
        SELECT 
          p.id AS product_id, -- Alias id to product_id for clarity
          p.category,
          p.brand,
          p.product_name,
          p.created_at,
          p.updated_at,
          fv.store_price,
          fv.image_url,
          COALESCE(pq.total_quantity, 0) AS total_quantity,
          (SELECT COUNT(*) FROM product_variants pv_count WHERE pv_count.product_ref = p.id) AS variant_count
        FROM 
          products p
        LEFT JOIN 
          FirstVariant fv ON p.id = fv.product_ref AND fv.rn = 1
        LEFT JOIN
          ProductQuantities pq ON p.id = pq.product_ref
        ORDER BY 
          p.created_at DESC
      `);
      // Map id to product_id if needed, though aliasing in SQL is better
      return result.rows;
    } catch (error) {
      console.error('Error finding all products:', error);
      throw error;
    }
  }

  static async findById(productId) {
    try {
      // Validate that productId is a valid integer
      const pid = parseInt(productId, 10);
      if (isNaN(pid)) {
        throw new Error(`Invalid product ID: ${productId}`);
      }
      
      // First get the product
      const productResult = await db.query(
        'SELECT * FROM products WHERE id = $1',
        [pid]
      );
      
      if (productResult.rows.length === 0) {
        return null;
      }
      
      const product = productResult.rows[0];
      
      // Get variants
      const variantsResult = await db.query(
        'SELECT * FROM product_variants WHERE product_ref = $1 ORDER BY id',
        [pid]
      );
      
      // Calculate total quantity
      const quantityResult = await db.query(
        'SELECT COALESCE(SUM(quantity), 0) AS total_quantity FROM product_variants WHERE product_ref = $1',
        [pid]
      );

      // Add variants and total quantity to the product object
      product.variants = variantsResult.rows;
      product.total_quantity = parseInt(quantityResult.rows[0].total_quantity, 10);
      product.product_id = product.id; // Add product_id alias
      
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
      // Add updated_at timestamp
      updateFields.push(`updated_at = NOW()`);

      if (updateFields.length === 1) { // Only updated_at was added
        // No actual product fields to update, fetch and return current product
        // Ensure findById returns the aliased product_id
        return await this.findById(productId);
      }

      values.push(productId); // Add productId as the last parameter for WHERE clause

      const query = `
        UPDATE products
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query(query, values);
      if (result.rows.length === 0) {
        return null; // Product not found
      }

      const updatedProduct = result.rows[0];
      updatedProduct.product_id = updatedProduct.id; // Add alias
      return updatedProduct;

    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  static async delete(productId) {
    try {
      // Check if productId is valid
      if (!productId || isNaN(productId)) {
        throw new Error('Invalid product ID');
      }
      
      // Start a transaction
      await db.query('BEGIN');
      
      // First delete variants to avoid foreign key constraint violations
      await db.query(
        'DELETE FROM product_variants WHERE product_ref = $1',
        [productId]
      );
      
      // Then delete the product
      const result = await db.query(
        'DELETE FROM products WHERE id = $1 RETURNING *',
        [productId]
      );
      
      // Check if a product was actually deleted
      if (result.rows.length === 0) {
        await db.query('ROLLBACK');
        return null;
      }
      
      // Commit the transaction
      await db.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      // Rollback in case of error
      await db.query('ROLLBACK');
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  static async search(query) {
    try {
      const searchQuery = `%${query}%`;
      // Enhanced query to include variant name and SKU in search
      const result = await db.query(
        `WITH FirstVariant AS (
          SELECT 
            pv.product_ref,
            pv.store_price,
            pv.image_url,
            ROW_NUMBER() OVER(PARTITION BY pv.product_ref ORDER BY pv.id ASC) as rn
          FROM product_variants pv
        ), ProductQuantities AS (
          SELECT 
            product_ref,
            COALESCE(SUM(quantity), 0) AS total_quantity
          FROM product_variants
          GROUP BY product_ref
        ), MatchingVariants AS (
          -- Find products with matching variants by name or SKU
          SELECT DISTINCT product_ref
          FROM product_variants
          WHERE variant_name ILIKE $1 OR sku ILIKE $1
        )
        SELECT 
          p.id AS product_id,
          p.category,
          p.brand,
          p.product_name,
          p.created_at,
          p.updated_at,
          fv.store_price,
          fv.image_url,
          COALESCE(pq.total_quantity, 0) AS total_quantity,
          (SELECT COUNT(*) FROM product_variants pv_count WHERE pv_count.product_ref = p.id) AS variant_count
        FROM 
          products p
        LEFT JOIN 
          FirstVariant fv ON p.id = fv.product_ref AND fv.rn = 1
        LEFT JOIN
          ProductQuantities pq ON p.id = pq.product_ref
        WHERE p.product_name ILIKE $1 
          OR p.category ILIKE $1 
          OR p.brand ILIKE $1
          OR p.id IN (SELECT product_ref FROM MatchingVariants)
        ORDER BY p.created_at DESC`,
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
      // Fetch products with their first variant's image URL for potential display
      const result = await db.query(
        `WITH FirstVariantImage AS (
          SELECT 
            pv.product_ref,
            pv.image_url,
            ROW_NUMBER() OVER(PARTITION BY pv.product_ref ORDER BY pv.id ASC) as rn
          FROM product_variants pv
        )
        SELECT 
          p.category, 
          p.id as product_id, 
          p.product_name,
          fvi.image_url 
        FROM products p
        LEFT JOIN FirstVariantImage fvi ON p.id = fvi.product_ref AND fvi.rn = 1
        ORDER BY p.category, p.product_name`
      );
      // Group by category
      const grouped = {};
      for (const row of result.rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push({
          product_id: row.product_id,
          product_name: row.product_name,
          image_url: row.image_url // Include image_url
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

  static async getVariantCount() {
    try {
      const result = await db.query('SELECT COUNT(*) as count FROM product_variants');
      return { count: parseInt(result.rows[0].count) };
    } catch (error) {
      console.error('Error getting variant count:', error);
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

  // Methods for handling product variants

  static async createVariant({ product_ref, sku, variant_name, description = null, store_price, quantity, image_url = null }) {
    try {
      const result = await db.query(
        `INSERT INTO product_variants
          (product_ref, sku, variant_name, description, store_price, quantity, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [product_ref, sku, variant_name, description, store_price, quantity, image_url]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating product variant:', error);
      throw error;
    }
  }

  static async deleteVariantsByProductId(productId) {
    try {
      await db.query(
        'DELETE FROM product_variants WHERE product_ref = $1',
        [productId]
      );
    } catch (error) {
      console.error('Error deleting product variants:', error);
      throw error;
    }
  }

  static async updateWithVariants(productId, productData, variants = [], images = {}) {
     // Ensure productId is an integer
     const pid = parseInt(productId, 10);
     if (isNaN(pid)) {
       throw new Error('Invalid product ID provided for update.');
     }

    try {
      await db.query('BEGIN');

      // 1. Update the product details (category, brand, product_name)
      const { category, brand, product_name } = productData;
      const productUpdateValues = [];
      const productUpdateFields = [];
      let productParamCount = 1;

      if (category !== undefined) {
        productUpdateFields.push(`category = $${productParamCount}`);
        productUpdateValues.push(category);
        productParamCount++;
      }
      if (brand !== undefined) {
        productUpdateFields.push(`brand = $${productParamCount}`);
        productUpdateValues.push(brand);
        productParamCount++;
      }
      if (product_name !== undefined) {
        productUpdateFields.push(`product_name = $${productParamCount}`);
        productUpdateValues.push(product_name);
        productParamCount++;
      }

      let updatedProduct;
      if (productUpdateFields.length > 0) {
        productUpdateFields.push(`updated_at = NOW()`); // Update timestamp
        productUpdateValues.push(pid); // Add product ID for WHERE clause
        const productQuery = `
          UPDATE products
          SET ${productUpdateFields.join(', ')}
          WHERE id = $${productParamCount}
          RETURNING *
        `;
        const productResult = await db.query(productQuery, productUpdateValues);
        if (productResult.rows.length === 0) {
          await db.query('ROLLBACK');
          return null; // Product not found
        }
        updatedProduct = productResult.rows[0];
      } else {
        // If no product details to update, fetch the existing product
        const existingProductResult = await db.query('SELECT * FROM products WHERE id = $1', [pid]);
        if (existingProductResult.rows.length === 0) {
           await db.query('ROLLBACK');
           return null; // Product not found
        }
        updatedProduct = existingProductResult.rows[0];
        // Still update the timestamp even if only variants change
        await db.query('UPDATE products SET updated_at = NOW() WHERE id = $1', [pid]);
      }


      // 2. Delete existing variants
      await db.query('DELETE FROM product_variants WHERE product_ref = $1', [pid]);

      // 3. Create new variants based on the provided array
      if (variants && Array.isArray(variants) && variants.length > 0) {
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i];
          let variantImageUrl = variant.image_url || null; // Use existing URL if provided

          // Check for newly uploaded image for this variant index
          const variantImageFieldName = `variantImage_${i}`;
          if (images[variantImageFieldName]) {
            variantImageUrl = images[variantImageFieldName];
          } else if (!variantImageUrl && i === 0 && images.mainImageUrl) {
            // Fallback: Use main image for first variant if no specific image
            variantImageUrl = images.mainImageUrl;
          }

          // Validate required variant fields
          if (variant.sku === undefined || variant.variant_name === undefined || variant.store_price === undefined || variant.quantity === undefined) {
             console.warn(`Skipping variant due to missing fields: ${JSON.stringify(variant)}`);
             continue; // Skip this variant if essential data is missing
          }

          await db.query(
            `INSERT INTO product_variants
              (product_ref, sku, variant_name, description, store_price, quantity, image_url, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [
              pid,
              variant.sku,
              variant.variant_name,
              variant.description || null,
              variant.store_price,
              variant.quantity,
              variantImageUrl
            ]
          );
        }
      } else if (images.mainImageUrl && (!variants || variants.length === 0)) {
         // Handle case: No variants provided, but a main image exists. Create a default variant.
         // Ensure default values are sensible
         const defaultSku = `${updatedProduct.product_name.substring(0, 10).replace(/\s+/g, '-')}-${pid}`;
         const defaultPrice = productData.store_price || 0.00; // Check if these exist in productData
         const defaultQuantity = productData.quantity || 0;

         await db.query(
           `INSERT INTO product_variants
             (product_ref, sku, variant_name, description, store_price, quantity, image_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
           [
             pid,
             defaultSku,
             'Default',
             productData.description || null,
             defaultPrice,
             defaultQuantity,
             images.mainImageUrl
           ]
         );
      }
      // If variants array is empty and no main image, no variants are created/updated.

      await db.query('COMMIT');

      // Return the fully updated product with its new variants
      return await this.findById(pid);

    } catch (error) {
      await db.query('ROLLBACK');
      console.error(`Error updating product ${productId} with variants:`, error);
      throw error;
    }
  }

  /**
   * Get a product's basic details by ID
   * @param {number|string} productId - The product ID to retrieve
   * @returns {Promise<Object|null>} - The product details or null if not found
   */
  static async getProductDetails(productId) {
    try {
      const result = await db.query(
        'SELECT id as product_id, category, brand, product_name, created_at, updated_at FROM products WHERE id = $1',
        [productId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Get the base product price and quantity from the first variant
      const variantResult = await db.query(
        'SELECT store_price, quantity, image_url FROM product_variants WHERE product_ref = $1 ORDER BY id LIMIT 1',
        [productId]
      );
      
      const product = result.rows[0];
      
      if (variantResult.rows.length > 0) {
        // Add first variant's price, quantity, and image to the product
        product.store_price = variantResult.rows[0].store_price;
        product.quantity = variantResult.rows[0].quantity;
        product.image_url = variantResult.rows[0].image_url;
      } else {
        // No variants found, set defaults
        product.store_price = 0;
        product.quantity = 0;
        product.image_url = null;
      }
      
      return product;
    } catch (error) {
      console.error('Error getting product details:', error);
      return null;
    }
  }

  static async checkDuplicateSku(sku, productId = null) {
    try {
      // Base query to check for duplicates
      let query = 'SELECT product_ref, sku FROM product_variants WHERE sku = $1';
      let params = [sku];
      
      // If productId is provided, exclude variants from this product to allow
      // keeping the same SKU when updating a product variant
      if (productId) {
        query += ' AND product_ref != $2';
        params.push(productId);
      }
      
      const result = await db.query(query, params);
      
      // Return true if a duplicate is found
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking for duplicate SKU:', error);
      throw error;
    }
  }
}

module.exports = Product;