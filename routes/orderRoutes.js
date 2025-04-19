const express = require('express');
const router = express.Router();
const Order = require('../models/order');

// Get ongoing orders count - specific route must come before parameterized routes
router.get('/ongoing-count', async (req, res) => {
  try {
    const count = await Order.getOngoingOrdersCount();
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders (admin only)
router.get('/', async (req, res) => {
  try {
    const orders = await Order.findAll();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order analytics stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await Order.getStats();
    res.json(stats);
  } catch (err) {
    console.error('Error fetching order stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (admin only)
router.put('/:orderId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Paid', 'Processing', 'Cancelled', 'Ready to Claim', 'Claimed'];
    
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

// Delete order (admin only)
router.delete('/:orderId', async (req, res) => {
  try {
    const order = await Order.deleteOrder(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;