const express = require('express');
const router = express.Router();
const db = require('../db/db');
const CustomerAcquisition = require('../models/customerAcquisition');
const generateSalesRecords = require('../scripts/generateDailySalesRecords');
// Note: brain.js is no longer needed in this file as prediction logic has been moved

// ==== GENERATE SALES RECORDS MANUALLY ====

// Manually trigger sales record generation (for testing)
router.post('/generate-records', async (req, res) => {
  try {
    const result = await generateSalesRecords();
    res.json({
      success: result.success,
      message: `Sales record generation ${result.success ? 'completed successfully' : 'failed'}`,
      details: result
    });
  } catch (err) {
    console.error('Error generating sales records:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating sales records', 
      error: err.message 
    });
  }
});

// ==== NEW SALES TABLE ROUTES ====

// Get all sales records - public access
router.get('/records', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM sales ORDER BY sale_date DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching sales records:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get historical sales data
router.get('/historical', async (req, res) => {
  try {
    // Simpler query without formatting in SQL
    const query = 'SELECT * FROM historical_sales ORDER BY date DESC';
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching historical sales data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sales record by ID
router.get('/records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM sales WHERE id = $1', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Sales record not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching sales record:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sales records by order ID
router.get('/records/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rows } = await db.query('SELECT * FROM sales WHERE order_id = $1', [orderId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching sales records by order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Filter sales records
router.get('/records/filter', async (req, res) => {
  try {
    const { start_date, end_date, payment_method, status, min_amount, max_amount } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];
    
    if (start_date) {
      query += ` AND sale_date >= $${params.length + 1}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND sale_date <= $${params.length + 1}`;
      params.push(end_date);
    }
    
    if (payment_method) {
      query += ` AND payment_method = $${params.length + 1}`;
      params.push(payment_method);
    }
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (min_amount) {
      query += ` AND amount >= $${params.length + 1}`;
      params.push(parseFloat(min_amount));
    }
    
    if (max_amount) {
      query += ` AND amount <= $${params.length + 1}`;
      params.push(parseFloat(max_amount));
    }
    
    query += ' ORDER BY sale_date DESC';
    
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error filtering sales records:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sales summary
router.get('/records/summary', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT 
        COUNT(*) as total_count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        MIN(sale_date) as earliest_date,
        MAX(sale_date) as latest_date
      FROM sales
      WHERE 1=1
    `;
    const params = [];
    
    if (start_date) {
      query += ` AND sale_date >= $${params.length + 1}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND sale_date <= $${params.length + 1}`;
      params.push(end_date);
    }
    
    const { rows } = await db.query(query, params);
    
    // Format the response
    const result = rows[0] ? {
      totalCount: parseInt(rows[0].total_count) || 0,
      totalAmount: parseFloat(rows[0].total_amount) || 0,
      averageAmount: parseFloat(rows[0].average_amount) || 0,
      earliestDate: rows[0].earliest_date,
      latestDate: rows[0].latest_date
    } : {
      totalCount: 0,
      totalAmount: 0,
      averageAmount: 0,
      earliestDate: null,
      latestDate: null
    };
    
    res.json(result);
  } catch (err) {
    console.error('Error getting sales summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==== HISTORICAL SALES ROUTES ====

// Get total revenue (supports ?source=historical or ?source=sales)
router.get('/total-revenue', async (req, res) => {
  try {
    const source = req.query.source;
    let query;
    if (source === 'historical') {
      query = `SELECT COALESCE(SUM(actualsales), 0) as total_revenue FROM historical_sales`;
    } else {
      // Default to sales table
      query = `SELECT COALESCE(SUM(amount), 0) as total_revenue FROM sales`;
    }
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
    // Use column names that match our schema from the image
    const { rows } = await db.query(`
      SELECT 
        id, 
        date, 
        amount, 
        order_id, 
        order_number, 
        user_id, 
        payment_method, 
        status, 
        created_at, 
        updated_at 
      FROM sales 
      ORDER BY date DESC
    `);
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
    let query = 'SELECT * FROM historical_sales WHERE 1=1';
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
      FROM historical_sales
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
      FROM historical_sales
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

// Get recent sales (for dashboard) - Fetches sales recorded today
router.get('/recent', async (req, res) => {
  try {
    // Query sales table for records where the date is the current date
    const { rows } = await db.query(
      `SELECT 
        id, 
        date, 
        amount, 
        order_id, 
        status 
      FROM sales 
      WHERE date::date = CURRENT_DATE 
      ORDER BY date DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching recent sales:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get most frequent sold products with variants
router.get('/most-frequent', async (req, res) => {
  try {
    const result = await db.query(`
      WITH OrderProducts AS (
        SELECT 
          oi.product_id as variant_id,
          SUM(oi.quantity) as sold_count
        FROM 
          order_items oi
        JOIN 
          orders o ON oi.order_id = o.id
        WHERE 
          o.payment_status IN ('Paid', 'Claimed', 'Completed')
        GROUP BY 
          oi.product_id
        ORDER BY 
          sold_count DESC
        LIMIT 10
      )
      SELECT 
        op.variant_id,
        pv.product_ref as product_id,
        p.product_name,
        pv.variant_name,
        pv.image_url,
        op.sold_count,
        pv.quantity as total_quantity
      FROM 
        OrderProducts op
      JOIN 
        product_variants pv ON op.variant_id = pv.id
      JOIN 
        products p ON pv.product_ref = p.id
      ORDER BY 
        op.sold_count DESC
      LIMIT 5
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching most frequent sold products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get KPI Summary
router.get('/kpi-summary', async (req, res) => {
  try {
    // 1. Total Revenue (from sales table only)
    const salesRevenueQuery = `SELECT COALESCE(SUM(amount), 0) as total_revenue, COUNT(*) as total_orders FROM sales`;
    const salesRevenueResult = await db.query(salesRevenueQuery);
    const totalRevenue = parseFloat(salesRevenueResult.rows[0].total_revenue) || 0;
    const totalOrders = parseInt(salesRevenueResult.rows[0].total_orders) || 0;

    // 2. Average Order Value (from sales table only)
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // 3. New Customers (created in the last 30 days - assumes users table with created_at)
    let newCustomers = 0;
      try {
        const newCustomersQuery = `
          SELECT COUNT(*) as new_customers
          FROM tbl_users
          WHERE created_at >= NOW() - INTERVAL '30 days'
            AND role = 'customer'
        `;
        const newCustomersResult = await db.query(newCustomersQuery);
        newCustomers = parseInt(newCustomersResult.rows[0].new_customers, 10) || 0;
      } catch (userTableError) {
        console.warn(
          "Could not query new customers. Check 'tbl_users' table, 'created_at' column, and 'role' field.",
          userTableError.message
        );
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

// Get revenue trend data with adjustable date range and formatted currency values
router.get('/monthly-revenue-trend', async (req, res) => {
  try {
    // Determine number of months to include (default to 6)
    const monthsCount = parseInt(req.query.months) >= 1 ? parseInt(req.query.months) : 6;

    // Select last N months with actual sales data, ranked and limited
    const query = `
      WITH monthly_data AS (
        SELECT 
          date_trunc('month', date)::date AS month_start,
          SUM(actualsales) AS total_sales
        FROM historical_sales
        GROUP BY month_start
      ),
      ranked AS (
        SELECT
          month_start,
          total_sales,
          ROW_NUMBER() OVER (ORDER BY month_start DESC) AS rn
        FROM monthly_data
      )
      SELECT
        TO_CHAR(month_start, 'YYYY') AS year,
        TO_CHAR(month_start, 'MM') AS month,
        TO_CHAR(month_start, 'Month') AS month_name,
        total_sales,
        TO_CHAR(total_sales, 'FM999,999,999,999.00') AS formatted_sales
      FROM ranked
      WHERE rn <= $1
      ORDER BY month_start ASC;
    `;

    const { rows } = await db.query(query, [monthsCount]);

    const monthlyData = rows.map(row => ({
      year: parseInt(row.year, 10),
      month: parseInt(row.month, 10),
      month_name: row.month_name.trim(),
      total_sales: parseFloat(row.total_sales),
      formatted_sales: `₱${row.formatted_sales}`,
      display_label: `${row.month_name.trim().substring(0, 3)} ${row.year}`
    }));

    res.json(monthlyData);
  } catch (err) {
    console.error('Error fetching revenue trend data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sales data with user names (joined with tbl_users)
router.get('/with-user-names', async (req, res) => {
  try {
    // Use a JOIN query to get the user's full name along with the sales data
    const { rows } = await db.query(`
      SELECT 
        s.id, 
        s.date, 
        s.amount, 
        s.order_id, 
        s.order_number, 
        s.user_id, 
        CONCAT(u.first_name, ' ', u.last_name) as user_fullname, 
        s.payment_method, 
        s.status, 
        s.created_at, 
        s.updated_at 
      FROM sales s
      LEFT JOIN tbl_users u ON s.user_id = u.id
      ORDER BY s.date DESC
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching sales with user names:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
