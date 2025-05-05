const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const authMiddleware = require('../middleware/auth');
const { sendOrderReceipt } = require('../services/emailService');

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

// Guest checkout route (no authentication required)
router.post('/guest-checkout', async (req, res) => {
  try {
    const { payment_method, pickup_method = "processing", purpose, items, customer_info } = req.body;

    if (!payment_method || !items || !Array.isArray(items) || !customer_info || !customer_info.email) {
      return res.status(400).json({ message: 'Missing required fields including customer email' });
    }

    // Validate customer info
    if (!customer_info.name || !customer_info.phone || !customer_info.email) {
      return res.status(400).json({ message: 'Customer name, phone, and email are required' });
    }

    // Use the admin order creation method which allows creating orders with customer info
    const order = await Order.createByAdmin({
      payment_method,
      pickup_method: pickup_method || "processing",
      purpose,
      items,
      customer_info
    });

    // Send email receipt
    try {
      await sendOrderReceipt(order, customer_info.email);
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
    }

    res.status(201).json(order);
  } catch (err) {
    console.error('Guest checkout error:', err);
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