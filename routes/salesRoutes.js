const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Get all sales data
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM sales');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sales data with optional filters
router.get('/filter', async (req, res) => {
  try {
    const { date, min_actualsales, max_actualsales } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];
    
    if (date) {
      query += ' AND date = $1';
      params.push(date);
    }
    
    if (min_actualsales) {
      query += ` AND actualsales >= $${params.length + 1}`;
      params.push(parseFloat(min_actualsales));
    }
    
    if (max_actualsales) {
      query += ` AND actualsales <= $${params.length + 1}`;
      params.push(parseFloat(max_actualsales));
    }
    
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chart data (formatted for the interactive chart)
router.get('/chart', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    // Query to get actual sales by date
    let actualSalesQuery = `
      SELECT 
        TO_CHAR(date, 'YYYY-MM-DD') as date,
        SUM(actualsales) as actualsales
      FROM sales
      WHERE 1=1
    `;
    
    const params = [];
    
    if (start_date) {
      actualSalesQuery += ` AND date >= $${params.length + 1}`;
      params.push(start_date);
    }
    
    if (end_date) {
      actualSalesQuery += ` AND date <= $${params.length + 1}`;
      params.push(end_date);
    }
    
    actualSalesQuery += `
      GROUP BY date
      ORDER BY date
    `;
    
    const { rows } = await db.query(actualSalesQuery, params);
    
    // For prediction data, we could either:
    // 1. Use another table with predictions
    // 2. Generate mock predictions based on actual data for demo
    
    // For this implementation, let's simulate predictions (75-125% of actual)
    const chartData = rows.map(row => ({
      date: row.date,
      actualsales: parseFloat(row.actualsales),
      predictedsales: Math.round(row.actualsales * (0.75 + Math.random() * 0.5))
    }));
    
    res.json(chartData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get monthly total sales
router.get('/monthly', async (req, res) => {
  try {
    const { start_date, end_date, year } = req.query;
    
    let monthlySalesQuery = `
      SELECT 
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        TO_CHAR(date, 'Month') as month_name,
        SUM(actualsales) as total_sales
      FROM sales
      WHERE 1=1
    `;
    
    const params = [];
    
    if (start_date) {
      monthlySalesQuery += ` AND date >= $${params.length + 1}`;
      params.push(start_date);
    }
    
    if (end_date) {
      monthlySalesQuery += ` AND date <= $${params.length + 1}`;
      params.push(end_date);
    }
    
    if (year) {
      monthlySalesQuery += ` AND EXTRACT(YEAR FROM date) = $${params.length + 1}`;
      params.push(parseInt(year));
    }
    
    monthlySalesQuery += `
      GROUP BY year, month, month_name
      ORDER BY year, month
    `;
    
    const { rows } = await db.query(monthlySalesQuery, params);
    
    // Format the data to make it client-friendly
    const monthlyData = rows.map(row => ({
      year: parseInt(row.year),
      month: parseInt(row.month),
      month_name: row.month_name.trim(),
      total_sales: parseFloat(row.total_sales)
    }));
    
    res.json(monthlyData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
