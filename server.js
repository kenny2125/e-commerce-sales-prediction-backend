require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db/db');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Sales API is running' });
});

// Get all sales data
app.get('/api/sales', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM sales');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sales data with optional filters
app.get('/api/sales/filter', async (req, res) => {
  try {
    const { date, min_amount, max_amount } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];
    
    if (date) {
      query += ' AND sale_date = $1';
      params.push(date);
    }
    
    if (min_amount) {
      query += ` AND amount >= $${params.length + 1}`;
      params.push(parseFloat(min_amount));
    }
    
    if (max_amount) {
      query += ` AND amount <= $${params.length + 1}`;
      params.push(parseFloat(max_amount));
    }
    
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});