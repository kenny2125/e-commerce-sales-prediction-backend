const express = require('express');
const router = express.Router();
const db = require('../db/db');
const CustomerAcquisition = require('../models/customerAcquisition');
// Note: brain.js is no longer needed in this file as prediction logic has been moved

// Get total revenue (combines sales and orders)
router.get('/total-revenue', async (req, res) => {
  try {
    const query = `
      SELECT 
        COALESCE(
          (SELECT SUM(actualsales) FROM sales),
          0
        ) +
        COALESCE(
          (SELECT SUM(total_amount) FROM orders WHERE status != 'Cancelled'),
          0
        ) as total_revenue
    `;
    
    const { rows } = await db.query(query);
    res.json({ total_revenue: parseFloat(rows[0].total_revenue) || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// Sales predictions have been moved to predictionRoutes.js
// Use /predictions/sales endpoint instead of /sales/predict

// Get recent sales (for dashboard)
router.get('/recent', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT 
        date,
        actualsales as amount
      FROM sales 
      ORDER BY date DESC 
      LIMIT 8`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get most frequently sold items
router.get('/most-frequent', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.product_id,
        p.product_name,
        p.image_url,
        COUNT(oi.product_id) as sold_count,
        SUM(oi.quantity) as total_quantity
      FROM products p
      LEFT JOIN order_items oi ON p.product_id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'Cancelled'
      GROUP BY p.product_id, p.product_name, p.image_url
      ORDER BY total_quantity DESC
      LIMIT 5
    `;
    
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get KPI Summary
router.get('/kpi-summary', async (req, res) => {
  try {
    // 1. Total Revenue (using existing logic)
    const revenueQuery = `
      SELECT 
        COALESCE(
          (SELECT SUM(actualsales) FROM sales),
          0
        ) +
        COALESCE(
          (SELECT SUM(total_amount) FROM orders WHERE status != 'Cancelled'),
          0
        ) as total_revenue
    `;
    const revenueResult = await db.query(revenueQuery);
    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;

    // 2. Total Orders (excluding cancelled)
    const ordersQuery = `SELECT COUNT(*) as total_orders FROM orders WHERE status != 'Cancelled'`;
    const ordersResult = await db.query(ordersQuery);
    const totalOrders = parseInt(ordersResult.rows[0].total_orders) || 0;

    // 3. Average Order Value
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // 4. New Customers (created in the last 30 days - assumes users table with created_at)
    // If your users table or created_at column is named differently, adjust the query.
    let newCustomers = 0;
    try {
      const newCustomersQuery = `
        SELECT COUNT(*) as new_customers 
        FROM tbl_users 
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `;
      const newCustomersResult = await db.query(newCustomersQuery);
      newCustomers = parseInt(newCustomersResult.rows[0].new_customers) || 0;
    } catch (userTableError) {
      // Handle cases where the users table or created_at might not exist as expected
      console.warn("Could not query new customers. Check 'users' table and 'created_at' column.", userTableError.message);
    }

    res.json({
      totalRevenue: totalRevenue,
      totalOrders: totalOrders,
      averageOrderValue: averageOrderValue,
      newCustomers: newCustomers
    });

  } catch (err) {
    console.error('Error fetching KPI summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get customer acquisition vs churn data
router.get('/customer-acquisition-churn', async (req, res) => {
  try {
    const data = await CustomerAcquisition.getMonthlyAcquisitionChurn();
    res.json(data);
  } catch (err) {
    console.error('Error fetching customer acquisition data:', err);
    res.status(500).json({ error: 'Failed to fetch customer acquisition data' });
  }
});

module.exports = router;
