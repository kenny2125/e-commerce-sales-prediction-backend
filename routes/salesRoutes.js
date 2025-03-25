const express = require('express');
const router = express.Router();
const db = require('../db/db');
const brain = require('brain.js');

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

// Predict future sales using GRU neural network
router.get('/predict', async (req, res) => {
  try {
    // Configuration parameters
    const monthsAhead = parseInt(req.query.months_ahead) || 1;
    const windowSize = parseInt(req.query.window_size) || 3;
    const iterations = parseInt(req.query.iterations) || 1000;
    
    if (monthsAhead < 1 || monthsAhead > 12) {
      return res.status(400).json({ error: 'months_ahead must be between 1 and 12' });
    }

    // Get historical monthly sales data
    const { rows } = await db.query(`
      SELECT 
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        SUM(actualsales) as total_sales
      FROM sales
      GROUP BY year, month
      ORDER BY year, month
    `);
    
    // Format the data for training
    const salesData = rows.map(row => ({
      year: parseInt(row.year),
      month: parseInt(row.month),
      total_sales: parseFloat(row.total_sales)
    }));
    
    if (salesData.length < windowSize + 1) {
      return res.status(400).json({ 
        error: `Not enough data for prediction. Need at least ${windowSize + 1} months of history.` 
      });
    }

    // Normalize data for better training
    const maxSales = Math.max(...salesData.map(item => item.total_sales));
    const minSales = Math.min(...salesData.map(item => item.total_sales));
    const range = maxSales - minSales || 1;
    
    const normalizedSales = salesData.map(item => ({
      ...item,
      normalized_sales: (item.total_sales - minSales) / range
    }));

    // Prepare training data as time series
    const trainingData = [];
    
    for (let i = 0; i <= normalizedSales.length - windowSize - 1; i++) {
      const input = normalizedSales
        .slice(i, i + windowSize)
        .map(item => item.normalized_sales);
      
      trainingData.push({
        input,
        output: [normalizedSales[i + windowSize].normalized_sales]
      });
    }

    // Configure and train GRU model
    console.log(`Training GRU model with ${trainingData.length} samples, window size ${windowSize}...`);
    
    const net = new brain.recurrent.GRU();
    const trainingOptions = {
      iterations,
      errorThresh: 0.005,
      log: true,
      logPeriod: 100
    };

    const trainingResult = net.train(trainingData, trainingOptions);
    console.log(`Training completed after ${trainingResult.iterations} iterations with error: ${trainingResult.error}`);

    // Generate predictions
    let predictions = [];
    let currentInput = normalizedSales
      .slice(-windowSize)
      .map(item => item.normalized_sales);
      
    // Start with the last known data point
    let lastDataPoint = {
      year: salesData[salesData.length - 1].year,
      month: salesData[salesData.length - 1].month
    };
    
    // Make predictions for specified number of months
    for (let i = 0; i < monthsAhead; i++) {
      // Calculate next month/year
      let nextMonth = lastDataPoint.month + 1;
      let nextYear = lastDataPoint.year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
      
      // Make prediction
      const predictedNormalized = net.run(currentInput);
      const predictedSales = predictedNormalized * range + minSales;
      
      // Store prediction
      predictions.push({
        year: nextYear,
        month: nextMonth,
        month_name: new Date(nextYear, nextMonth - 1, 1).toLocaleString('default', { month: 'long' }),
        predicted_sales: Math.round(predictedSales)
      });
      
      // Update for next iteration
      lastDataPoint = { year: nextYear, month: nextMonth };
      
      // Update input window for next prediction by removing oldest and adding the new prediction
      currentInput.shift();
      currentInput.push(predictedNormalized);
    }

    // Return the predictions
    res.json({
      predictions,
      model_info: {
        type: 'GRU Neural Network',
        window_size: windowSize,
        training_samples: trainingData.length,
        iterations: trainingResult.iterations,
        error: trainingResult.error
      }
    });

  } catch (err) {
    console.error('Error in sales prediction:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

module.exports = router;
