const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const auth = require('../middleware/auth'); // Import auth middleware
const { discountAuth } = require('../middleware/adminAuth'); // Import discount auth middleware

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

// Get all orders (public access)
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

// Get single order detail by order number
router.get('/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (err) {
    console.error(`Error fetching order ${req.params.orderId}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apply discount to an order (SUPER_ADMIN, admin, warehouse roles only)
router.put('/:orderId/discount', auth, discountAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { discountAmount } = req.body;

    // Validate required fields
    if (!discountAmount || typeof discountAmount !== 'number') {
      return res.status(400).json({ message: 'Discount amount is required and must be a number' });
    }

    // Apply the discount
    const result = await Order.applyDiscount(orderId, { discountAmount });

    // Return appropriate response based on the result
    if (!result.success) {
      return res.status(result.status).json({ message: result.message });
    }

    res.status(result.status).json(result.order);
  } catch (err) {
    console.error(`Error applying discount to order ${req.params.orderId}:`, err);
    res.status(500).json({ 
      message: 'An error occurred while applying the discount', 
      error: err.message 
    });
  }
});

// Remove a discount from an order (SUPER_ADMIN, admin, warehouse roles only)
router.delete('/:orderId/discount', auth, discountAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Remove the discount
    const result = await Order.removeDiscount(orderId);

    // Return appropriate response based on the result
    if (!result.success) {
      return res.status(result.status).json({ message: result.message });
    }

    res.status(result.status).json(result.order);
  } catch (err) {
    console.error(`Error removing discount from order ${req.params.orderId}:`, err);
    res.status(500).json({ 
      message: 'An error occurred while removing the discount', 
      error: err.message 
    });
  }
});

// Update order status (admin only)
router.put('/:orderId/status', async (req, res) => {
  try {
    const { status, field } = req.body;
    // Updated to include the new pickup status options
    const validStatuses = ['Paid', 'Processing', 'Cancelled', 'Preparing', 'On Delivery', 'Claimed', 'Refunded', 'Paid (Discounted)', 'Discounted'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') 
      });
    }
    
    // Determine which field to update based on the 'field' parameter from the frontend
    // The Order.updateStatus method expects 'paymentStatus' or 'pickupStatus'
    let updateField = 'paymentStatus'; // Default to payment status field name expected by the model
    if (field === 'pickupStatus') {
      updateField = 'pickupStatus'; // Use the field name expected by the model
    }
    
    // Call the model method with the correct field identifier
    const order = await Order.updateStatus(req.params.orderId, status, updateField);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel an order (user or admin)
router.put('/:orderId/cancel', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id; // Get user ID from auth middleware
    const userRole = req.user.role; // Get user role from auth middleware

    const result = await Order.cancelOrder(orderId, userId, userRole);

    if (!result.success) {
      return res.status(result.status).json({ message: result.message });
    }

    res.status(result.status).json(result.order);
  } catch (err) {
    // Log the detailed error on the server
    console.error(`Error cancelling order ${req.params.orderId}:`, err);
    // Send a generic error message to the client
    res.status(500).json({ message: 'Internal server error while attempting to cancel order.' });
  }
});

// Add delete order route
router.delete('/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id; // Get user ID from auth middleware
    const userRole = req.user.role; // Get user role from auth middleware

    // Check if the user is authorized to delete the order (admin, SUPER_ADMIN, or accountant only)
    if (userRole !== 'admin' && userRole !== 'SUPER_ADMIN' && userRole !== 'accountant') {
      return res.status(403).json({ message: 'Unauthorized to delete this order' });
    }

    // Delete the order
    const deletedOrder = await Order.deleteOrder(orderId);

    if (!deletedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully', order: deletedOrder });
  } catch (err) {
    console.error(`Error deleting order ${req.params.orderId}:`, err);
    res.status(500).json({ error: 'Internal server error while attempting to delete order.' });
  }
});

// Create a new order (admin only)
router.post('/admin/orders', async (req, res) => {
  try {
    const { 
      user_id, 
      payment_method, 
      pickup_method, 
      purpose, 
      items,
      customer_info 
    } = req.body;

    if (!payment_method || !pickup_method || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Create the order using admin creation method
    const order = await Order.createByAdmin({
      user_id, 
      payment_method, 
      pickup_method, 
      purpose, 
      items,
      customer_info
    });
    
    res.status(201).json(order);
  } catch (err) {
    console.error('Admin order creation error:', err);
    // Handle specific errors
    if (err.message && err.message.startsWith('Insufficient stock')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;