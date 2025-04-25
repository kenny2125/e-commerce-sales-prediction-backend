const express = require('express');
const router = express.Router();
const { getMonthlySalesData, normalizeSalesData } = require('../db/salesData');
const { trainAndForecastGRU, forecastSales } = require('../models/predictionModel');

// Flask prediction server URL
// const FLASK_SERVER_URL = 'http://localhost:5000';

// Predict future sales using GRU neural network
router.get('/sales', async (req, res) => {
  try {
    let monthsAhead = req.query.months_ahead !== undefined ? parseInt(req.query.months_ahead) : null;
    if (monthsAhead !== null && (isNaN(monthsAhead) || monthsAhead < 1 || monthsAhead > 60)) {
      return res.status(400).json({ error: 'months_ahead must be between 1 and 60' });
    }

    // Get max_data_points parameter, with a minimum enforced value of 12
    let maxDataPoints = req.query.max_data_points !== undefined ? parseInt(req.query.max_data_points) : 32;
    if (isNaN(maxDataPoints) || maxDataPoints < 12) {
      maxDataPoints = 12; // Enforce minimum of 12 data points
    }
    
    // Fetch and normalize sales data
    const allSalesData = await getMonthlySalesData();
    // Limit to the requested number of data points
    const salesData = allSalesData.length > maxDataPoints 
      ? allSalesData.slice(allSalesData.length - maxDataPoints) 
      : allSalesData;
    
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
      iterations: 49999, // <-- Add this here
      errorThresh: 0.0001,
      log: true,
      logPeriod: 1000,
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
      
      // Enhanced validation details with complete information for chart visualization
      const validationDetails = [];
      
      forecastValidation.forEach((predicted, i) => {
        const actualIndex = series.length - validationMonths + i;
        const actual = actualValidation[i];
        const error = predicted - actual;
        mse += error * error;
        if (actual !== 0) mape += Math.abs(error / actual);
        
        // Add comprehensive information for each validation point
        validationDetails.push({
          actual,
          predicted,
          actual_sales: Math.round(actual * range + minSales),
          predicted_sales: Math.round(predicted * range + minSales),
          // Include date information needed for chart visualization
          year: normalizedSales[actualIndex].year,
          month: normalizedSales[actualIndex].month,
          month_name: normalizedSales[actualIndex].month_name
        });
      });
      
      mse /= actualValidation.length;
      mape = (mape / actualValidation.length) * 100;
      
      const validationUpdate = {
        type: 'validation',
        mse: mse.toFixed(4),
        mape: mape.toFixed(2),
        details: validationDetails
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

// New endpoint to predict sales using the Flask prediction server
// router.get('/flask-prediction', async (req, res) => {
//   try {
//     // Get months_ahead parameter (defaults to 6 if not provided)
//     const monthsAhead = req.query.months_ahead !== undefined ? parseInt(req.query.months_ahead) : 6;
//     if (isNaN(monthsAhead) || monthsAhead < 1 || monthsAhead > 12) {
//       return res.status(400).json({ error: 'months_ahead must be between 1 and 12' });
//     }
    
//     // Get validation_size parameter (defaults to 3 if not provided)
//     const validationSize = req.query.validation_size !== undefined ? parseInt(req.query.validation_size) : 3;
    
//     // Get filter_pandemic parameter (defaults to true if not provided)
//     const filterPandemic = req.query.filter_pandemic !== undefined ? req.query.filter_pandemic === 'true' : true;

//     // Fetch historical sales data
//     const salesData = await getMonthlySalesData();
    
//     // Format data for the Flask server
//     const formattedData = salesData.map(item => ({
//       date: `${item.year}-${item.month.toString().padStart(2, '0')}-01`,
//       sales: item.total_sales
//     }));

//     // Debug information
//     console.log('Total sales data points being sent to Flask:', formattedData.length);
//     console.log('First few sales data points:', formattedData.slice(0, 3));
//     console.log('Last few sales data points:', formattedData.slice(-3));
//     console.log('Filter pandemic data:', filterPandemic);

//     // Send data to Flask server for prediction using fetch
//     const flaskResponse = await fetch(`${FLASK_SERVER_URL}/api/predict?validation_size=${validationSize}&filter_pandemic=${filterPandemic}`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         sales_data: formattedData
//       })
//     });
    
//     if (!flaskResponse.ok) {
//       const errorData = await flaskResponse.json();
//       throw new Error(`Flask server responded with status ${flaskResponse.status}: ${JSON.stringify(errorData)}`);
//     }
    
//     const flaskData = await flaskResponse.json();
//     const predictions = flaskData.predictions;
    
//     // Format the prediction results for the frontend
//     let formattedPredictions = [];
//     let lastDataPoint = {
//       year: salesData[salesData.length - 1].year,
//       month: salesData[salesData.length - 1].month
//     };
    
//     predictions.slice(0, monthsAhead).forEach((prediction, index) => {
//       formattedPredictions.push({
//         year: prediction.year,
//         month: prediction.month,
//         month_name: prediction.month_name,
//         predicted_sales: Math.round(prediction.predicted_sales)
//       });
//     });

//     // Prepare the response including validation metrics if available
//     const response = {
//       predictions: formattedPredictions,
//       model_info: {
//         type: 'GRU Time Series (Flask)',
//         training_data_points: salesData.length
//       },
//       raw_data: salesData
//     };
    
//     // Add validation metrics if available
//     if (flaskData.validation) {
//       response.validation = flaskData.validation;
//     }

//     return res.json(response);
    
//   } catch (err) {
//     console.error('Error in Flask prediction:', err);
//     res.status(500).json({ 
//       error: 'Error connecting to prediction server', 
//       message: err.message,
//       details: err.response?.data || 'No detailed error information available'
//     });
//   }
// });

// // New endpoint to train the model on the Flask prediction server
// router.post('/train-flask-model', async (req, res) => {
//   try {
//     // Fetch historical sales data
//     const salesData = await getMonthlySalesData();
    
//     // Format data for the Flask server
//     const formattedData = salesData.map(item => ({
//       date: `${item.year}-${item.month.toString().padStart(2, '0')}-01`,
//       sales: item.total_sales
//     }));

//     // Send data to Flask server for training using fetch
//     const flaskResponse = await fetch(`${FLASK_SERVER_URL}/api/train`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         training_data: formattedData
//       })
//     });
    
//     if (!flaskResponse.ok) {
//       const errorData = await flaskResponse.json();
//       throw new Error(`Flask server responded with status ${flaskResponse.status}: ${JSON.stringify(errorData)}`);
//     }
    
//     const flaskData = await flaskResponse.json();

//     return res.json({
//       success: true,
//       message: 'Model trained successfully',
//       details: flaskData
//     });
    
//   } catch (err) {
//     console.error('Error training Flask model:', err);
//     res.status(500).json({ 
//       error: 'Error connecting to prediction server', 
//       message: err.message,
//       details: err.response?.data || 'No detailed error information available'
//     });
//   }
// });

module.exports = router;