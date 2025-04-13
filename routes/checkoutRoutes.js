const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const authMiddleware = require('../middleware/auth');

// Create a new order (authenticated users only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Get user_id from auth token instead of request body
    const user_id = req.user.id;
    const { total_amount, payment_method, pickup_method, items } = req.body;
    
    if (!total_amount || !payment_method || !pickup_method || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const orderData = {
      user_id,
      total_amount,
      payment_method,
      pickup_method,
      items
    };

    const order = await Order.create(orderData);
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's orders (authenticated users only)
router.get('/by-user/:userId', authMiddleware, async (req, res) => {
  try {
    // Only allow users to access their own orders
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

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