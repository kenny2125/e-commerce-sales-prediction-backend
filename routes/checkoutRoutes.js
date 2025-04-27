const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const authMiddleware = require('../middleware/auth');

// Create a new order (authenticated users only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { payment_method, pickup_method = "processing", purpose, items } = req.body;

    if (!payment_method || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Ensure pickup_method is set to "processing" by default
    const orderData = { 
      user_id, 
      payment_method, 
      pickup_method: pickup_method || "processing", 
      purpose, 
      items 
    };
    const order = await Order.create(orderData);
    res.status(201).json(order);
  } catch (err) {
    console.error('Checkout error:', err);
    // Handle insufficient stock error
    if (err.message && err.message.startsWith('Insufficient stock')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's orders (no authentication required)
router.get('/by-user/:userId', async (req, res) => {
  try {
    const orders = await Order.findByUserId(req.params.userId);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific order details (authenticated users only)
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only allow users to access their own orders
    if (req.user.id !== order.user_id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;