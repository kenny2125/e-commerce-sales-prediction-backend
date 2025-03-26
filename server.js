require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db/db');
const salesRoutes = require('./routes/salesRoutes');
const mlRoutes = require('./routes/mlRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Sales API is running' });
});

// Use routes
app.use('/api/sales', salesRoutes);
app.use('/api/ml', mlRoutes);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});