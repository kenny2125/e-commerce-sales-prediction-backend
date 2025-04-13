const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Create a new order
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { total_amount, payment_method, pickup_method, items } = req.body;
    
    if (!total_amount || !payment_method || !pickup_method || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const orderData = {
      user_id: req.user.id,
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

// Get user's orders
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.findByUserId(req.user.id);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific order by ID
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Only allow users to view their own orders (unless admin)
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (admin only)
router.patch('/:orderId/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') 
      });
    }
    
    const order = await Order.updateStatus(req.params.orderId, status);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;