const express = require('express');
const multer = require('multer');
const router = express.Router();
const Product = require('../models/product');
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');
const { uploadImage } = require('../utils/cloudinary');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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
router.post('/', [authMiddleware, adminAuthMiddleware, upload.single('image')], async (req, res) => {
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
router.put('/:id', [authMiddleware, adminAuthMiddleware, upload.single('image')], async (req, res) => {
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
router.delete('/:id', [authMiddleware, adminAuthMiddleware], async (req, res) => {
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