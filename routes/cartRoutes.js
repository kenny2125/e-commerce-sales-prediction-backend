const express = require('express');
const router = express.Router();
const Cart = require('../models/cart');
const authMiddleware = require('../middleware/auth');

// Get user's cart items
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartItems = await Cart.findByUserId(userId);
    res.json(cartItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, quantity = 1 } = req.body;

    if (!product_id) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    const cartItem = await Cart.addItem(userId, product_id, quantity);
    res.status(201).json(cartItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update item quantity in cart
router.put('/update/:productId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'Valid quantity is required' });
    }

    const cartItem = await Cart.updateQuantity(userId, productId, quantity);
    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }
    res.json(cartItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/remove/:productId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const cartItem = await Cart.removeItem(userId, productId);
    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }
    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear cart
router.delete('/clear', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await Cart.clearCart(userId);
    res.json({ message: 'Cart cleared successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch product details for localStorage cart
router.post('/details', async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ message: 'productIds array is required' });
    }
    const details = await Cart.getProductDetails(productIds);
    res.json(details);
  } catch (err) {
    console.error('Error fetching product details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;