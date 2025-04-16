const express = require('express');
const router = express.Router();
const { getMonthlySalesData, normalizeSalesData } = require('../db/salesData');
const { trainAndForecastGRU, forecastSales } = require('../models/predictionModel');

// Predict future sales using GRU neural network
router.get('/sales', async (req, res) => {
  try {
    let monthsAhead = req.query.months_ahead !== undefined ? parseInt(req.query.months_ahead) : null;
    if (monthsAhead !== null && (isNaN(monthsAhead) || monthsAhead < 1 || monthsAhead > 60)) {
      return res.status(400).json({ error: 'months_ahead must be between 1 and 60' });
    }

    // Fetch and normalize sales data
    const salesData = await getMonthlySalesData();
    // Display sales data as a table in the console for readability
    if (Array.isArray(salesData) && salesData.length > 0) {
      const tableData = salesData.map((row, idx) => ({
        '#': idx + 1,
        Year: row.year,
        Month: row.month,
        'Total Sales': row.total_sales
      }));
      console.table(tableData);
      console.log('Raw data count (weight):', salesData.length);
    } else {
      console.log('No sales data found.');
    }
    const { normalizedSales, minSales, maxSales, range } = normalizeSalesData(salesData);
    const series = normalizedSales.map(item => item.normalized_sales);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Train model
    const trainingOptions = {
      errorThresh: 0.001,
      log: true,
      logPeriod: 5000,
      callback: (stats) => {
        if (stats.iterations % 1000 === 0 || stats.iterations === 1) {
          const update = {
            type: 'progress',
            iterations: stats.iterations,
            error: stats.error,
            errorThreshold: 0.013
          };
          res.write(`data: ${JSON.stringify(update)}\n\n`);
        }
      }
    };
    const net = trainAndForecastGRU(series, trainingOptions);

    // Validation
    const validationMonths = monthsAhead || 6;
    if (series.length > validationMonths) {
      const trainingSeriesForValidation = series.slice(0, series.length - validationMonths);
      const actualValidation = series.slice(series.length - validationMonths);
      const forecastValidation = forecastSales(net, trainingSeriesForValidation, validationMonths);
      let mse = 0;
      let mape = 0;
      forecastValidation.forEach((predicted, i) => {
        const actual = actualValidation[i];
        const error = predicted - actual;
        mse += error * error;
        if (actual !== 0) mape += Math.abs(error / actual);
      });
      mse /= actualValidation.length;
      mape = (mape / actualValidation.length) * 100;
      const validationUpdate = {
        type: 'validation',
        mse: mse.toFixed(4),
        mape: mape.toFixed(2),
        details: forecastValidation.map((predicted, i) => ({
          actual: actualValidation[i],
          predicted,
          actual_sales: Math.round(actualValidation[i] * range + minSales),
          predicted_sales: Math.round(predicted * range + minSales)
        }))
      };
      res.write(`data: ${JSON.stringify(validationUpdate)}\n\n`);
    }

    // Forecast
    let forecastHorizon = monthsAhead || Math.min(24, salesData.length);
    const forecast = forecastSales(net, series, forecastHorizon);
    let predictions = [];
    let lastDataPoint = {
      year: salesData[salesData.length - 1].year,
      month: salesData[salesData.length - 1].month
    };
    forecast.forEach((predictedNormalized, index) => {
      let nextMonth = lastDataPoint.month + 1;
      let nextYear = lastDataPoint.year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
      const predictedSales = predictedNormalized * range + minSales;
      predictions.push({
        year: nextYear,
        month: nextMonth,
        month_name: new Date(nextYear, nextMonth - 1, 1).toLocaleString('default', { month: 'long' }),
        normalized_prediction: predictedNormalized,
        predicted_sales: Math.round(predictedSales)
      });
      lastDataPoint = { year: nextYear, month: nextMonth };
    });

    // Send final prediction result
    const finalResult = {
      type: 'complete',
      predictions,
      normalization: {
        min_sales: minSales,
        max_sales: maxSales,
        range: range
      },
      model_info: {
        type: 'GRUTimeStep Neural Network',
        training_data_points: salesData.length,
        final_error: net.trainOpts.error,
        error_threshold: trainingOptions.errorThresh,
        iterations_performed: net.trainOpts.iterations
      },
      raw_data: salesData,
      normalized_data: normalizedSales.map(d => ({
        year: d.year,
        month: d.month,
        month_name: d.month_name,
        period: `${d.month}/${d.year}`,
        actual_sales: d.total_sales,
        normalized_sales: d.normalized_sales
      }))
    };
    res.write(`data: ${JSON.stringify(finalResult)}\n\n`);
    res.end();
  } catch (err) {
    console.error('Error in sales prediction:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    } else {
      const errorUpdate = {
        type: 'error',
        message: err.message
      };
      res.write(`data: ${JSON.stringify(errorUpdate)}\n\n`);
      res.end();
    }
  }
});

module.exports = router;