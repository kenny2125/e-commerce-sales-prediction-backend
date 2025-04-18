const express = require('express');
const multer = require('multer');
const router = express.Router();
const Product = require('../models/product');
const authMiddleware = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const { uploadImage } = require('../utils/cloudinary');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Get inventory statistics (for admin dashboard)
router.get('/stats', [authMiddleware, adminAuth], async (req, res) => {
  try {
    // Query for total products count
    const totalProductsResult = await Product.getCount();
    const totalProducts = totalProductsResult.count;
    
    // Query for low stock items (quantity <= 10)
    const lowStockResult = await Product.getCountByCondition('quantity > 0 AND quantity <= 10');
    const lowStockItems = lowStockResult.count;
    
    // Query for out of stock items
    const outOfStockResult = await Product.getCountByCondition('quantity = 0 OR status = \'Out of Stock\'');
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
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new product with image upload
router.post('/', [authMiddleware, adminAuth, upload.single('image')], async (req, res) => {
  try {
    const {
      product_id,
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price
    } = req.body;

    if (!product_id || !category || !brand || !product_name || !store_price) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let image_url = null;
    if (req.file) {
      // Convert buffer to base64
      const base64Image = req.file.buffer.toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;
      // Upload to Cloudinary
      image_url = await uploadImage(dataURI);
    }

    const newProduct = await Product.create({
      product_id,
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price,
      image_url
    });

    res.status(201).json(newProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product with optional image update
router.put('/:id', [authMiddleware, adminAuth, upload.single('image')], async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price,
      image_url: existingImageUrl // Get the existing image URL from request body
    } = req.body;

    let image_url;
    if (req.file) {
      // If new image uploaded, process and upload to Cloudinary
      const base64Image = req.file.buffer.toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;
      image_url = await uploadImage(dataURI);
    } else if (existingImageUrl) {
      // If no new image but existing URL provided, keep it
      image_url = existingImageUrl;
    }

    const updatedProduct = await Product.update(productId, {
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price,
      image_url // This will be either new uploaded URL, existing URL, or undefined
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(updatedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product
router.delete('/:id', [authMiddleware, adminAuth], async (req, res) => {
  try {
    const deletedProduct = await Product.delete(req.params.id);
    if (!deletedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(deletedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;