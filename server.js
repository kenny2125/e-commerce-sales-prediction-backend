require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const salesRoutes = require('./routes/salesRoutes');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const predictionRoutes = require('./routes/predictionRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
// enable CORS with credentials support
// Restrict CORS origin to the actual frontend URL so cookies are allowed
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://192.168.0.10:5173', credentials: true }));
// parse cookies for auth
app.use(cookieParser());

// Increase JSON and URL-encoded payload size limit to accommodate larger requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to 1618 Office Solutions API. You are not supposed to be here.' });
});

// Use routes
app.use('/api/sales', salesRoutes);
app.use('/api/product', productRoutes);
app.use('/api/auth', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/predictions', predictionRoutes);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});