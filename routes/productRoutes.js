const express = require('express');
const router = express.Router();
const Product = require('../models/product');
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');

// Public routes
router.get('/', async (req, res) => {
  try {
    const products = await Product.findAll();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    const products = await Product.search(q);
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// Protected admin routes - require both authentication and admin role
router.post('/', [authMiddleware, adminAuthMiddleware], async (req, res) => {
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
      return res.status(400).json({ 
        message: 'Missing required fields' 
      });
    }

    const newProduct = await Product.create({
      product_id,
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price
    });

    res.status(201).json(newProduct);
  } catch (err) {
    console.error(err);
    if (err.constraint === 'products_product_id_key') {
      return res.status(400).json({ message: 'Product ID already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', [authMiddleware, adminAuthMiddleware], async (req, res) => {
  try {
    const {
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price
    } = req.body;

    if (!category || !brand || !product_name || !store_price) {
      return res.status(400).json({ 
        message: 'Missing required fields' 
      });
    }

    const updatedProduct = await Product.update(req.params.id, {
      category,
      brand,
      product_name,
      status,
      quantity,
      store_price
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

router.delete('/:id', [authMiddleware, adminAuthMiddleware], async (req, res) => {
  try {
    const deletedProduct = await Product.delete(req.params.id);
    if (!deletedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;