const express = require('express');
const router = express.Router();
const Product = require('../models/product');
const { uploadImage } = require('../utils/cloudinary');

// Get inventory statistics (for admin dashboard)
router.get('/stats', async (req, res) => {
  try {
    // Query for total products count
    const totalProductsResult = await Product.getCount();
    const totalProducts = totalProductsResult.count;
    
    // Query for low stock variants (quantity <= 10)
    const lowStockResult = await Product.getCountByCondition('pv.quantity > 0 AND pv.quantity <= 10', true);
    const lowStockItems = lowStockResult.count;
    
    // Query for out of stock variants (based only on quantity)
    const outOfStockResult = await Product.getCountByCondition('pv.quantity = 0', true);
    const outOfStockItems = outOfStockResult.count;
    
    // Query for total inventory value
    const inventoryValueResult = await Product.getTotalInventoryValue();
    const totalInventoryValue = inventoryValueResult.value;
    
    res.json({
      totalProducts,
      lowStockItems,
      outOfStockItems,
      totalInventoryValue
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.findAll();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search products
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      const products = await Product.findAll();
      return res.json(products);
    }
    const products = await Product.search(query);
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.getCategories();
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get categories with their products
router.get('/category-products', async (req, res) => {
  try {
    const result = await Product.getCategoriesWithProducts();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stock levels
router.get('/stock-levels', async (req, res) => {
  try {
    const result = await Product.getStockLevels();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    // No need to fetch variants separately as they're now included in the product
    return res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new product with image upload
router.post('/', async (req, res) => {
  try {
    const {
      category,
      brand,
      product_name
    } = req.body;

    if (!category || !brand || !product_name) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Create the product without status
    const newProduct = await Product.create({
      category,
      brand,
      product_name
    });

    // Process the main uploaded image
    let mainImageUrl = null;
    if (req.files && req.files.image && req.files.image[0]) {
      // Get the uploaded file
      const imageFile = req.files.image[0];
      // Convert buffer to base64
      const base64Image = imageFile.buffer.toString('base64');
      const dataURI = `data:${imageFile.mimetype};base64,${base64Image}`;
      // Upload to Cloudinary
      mainImageUrl = await uploadImage(dataURI);
    }

    // Handle variants array if provided
    const variants = req.body.variants ? JSON.parse(req.body.variants) : [];
    
    // Process each variant
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      let variantImageUrl = null;
      
      // Check if this variant has an uploaded image file
      const variantImageFieldName = `variantImage_${i}`;
      if (variant.hasImage && req.files && req.files[variantImageFieldName] && req.files[variantImageFieldName][0]) {
        const variantImageFile = req.files[variantImageFieldName][0];
        // Convert buffer to base64
        const base64Image = variantImageFile.buffer.toString('base64');
        const dataURI = `data:${variantImageFile.mimetype};base64,${base64Image}`;
        // Upload to Cloudinary
        variantImageUrl = await uploadImage(dataURI);
      }
      
      // If no specific variant image but we have a main image and this is the first variant,
      // use the main image for the first variant
      if (!variantImageUrl && mainImageUrl && i === 0) {
        variantImageUrl = mainImageUrl;
      }
      
      // Create the variant using the Product model's createVariant method
      await Product.createVariant({
        product_ref: newProduct.id,
        sku: variant.sku,
        variant_name: variant.variant_name,
        description: variant.description || null,
        store_price: variant.store_price,
        quantity: variant.quantity,
        image_url: variantImageUrl || variant.image_url || null
      });
    }
    
    // If no variants but we have a main image, create a default variant
    if (variants.length === 0 && mainImageUrl) {
      await Product.createVariant({
        product_ref: newProduct.id,
        sku: `${product_name.substring(0, 10)}-${newProduct.id}`,
        variant_name: 'Default',
        description: req.body.description || null, // Move description to variant level
        store_price: req.body.store_price || 0.00,
        quantity: req.body.quantity || 0,
        image_url: mainImageUrl
      });
    }

    // Fetch the complete product with variants to return
    const productWithVariants = await Product.findById(newProduct.id);
    res.status(201).json(productWithVariants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product with optional image update (accepts JSON payload)
router.put('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const {
      category,
      brand,
      product_name,
      image_data_uri, // Expect base64 data URI for main image
      variants // Expect variants array directly in JSON body
    } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    // Basic validation for required product fields
    if (!category || !brand || !product_name) {
      return res.status(400).json({ message: 'Missing required product fields (category, brand, product_name)' });
    }

    // Create an images object to store all uploaded image URLs
    const images = {};

    // Process the main uploaded image if provided
    if (image_data_uri) {
      try {
        images.mainImageUrl = await uploadImage(image_data_uri);
      } catch (uploadError) {
        console.error("Error uploading main image:", uploadError);
        // Decide if you want to fail the whole request or just proceed without the image
        return res.status(500).json({ error: 'Failed to upload main image' });
      }
    }

    // Process variant images if variants are provided
    if (variants && Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        const variantImageFieldName = `variantImage_${i}`;

        if (variant.image_data_uri) { // Expect base64 data URI per variant
          try {
            images[variantImageFieldName] = await uploadImage(variant.image_data_uri);
          } catch (uploadError) {
            console.error(`Error uploading image for variant ${i}:`, uploadError);
            // Decide if you want to fail the whole request or just proceed without this variant image
            return res.status(500).json({ error: `Failed to upload image for variant ${i}` });
          }
        }
      }
    }

    // Use the updateWithVariants method to update both product and variants
    // Pass the processed image URLs in the `images` object
    const updatedProduct = await Product.updateWithVariants(
      productId,
      { category, brand, product_name },
      variants || [], // Ensure variants is an array
      images
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found or failed to update' });
    }

    res.json(updatedProduct);
  } catch (err) {
    console.error(err);
    // Check for specific database errors if needed
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    
    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    
    const deletedProduct = await Product.delete(productId);
    
    if (!deletedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json(deletedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

module.exports = router;