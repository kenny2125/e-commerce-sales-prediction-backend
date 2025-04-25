const express = require('express');
const router = express.Router();
const { getMonthlySalesData, normalizeSalesData } = require('../db/salesData');
const { 
  trainAndForecastGRU, 
  forecastSales, 
  saveModel, 
  loadModel, 
  getSavedModels 
} = require('../models/predictionModel');

// Return information about all saved models
router.get('/models', async (req, res) => {
  try {
    const models = getSavedModels();
    return res.json(models);
  } catch (err) {
    console.error('Error getting model information:', err);
    return res.status(500).json({ error: 'Failed to get model information', message: err.message });
  }
});

// Manually train and save a model
router.post('/train', async (req, res) => {
  try {
    // Set up SSE for real-time progress tracking
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Get parameters from request (with defaults)
    const maxDataPoints = req.body.max_data_points !== undefined ? parseInt(req.body.max_data_points) : 32;
    const iterationsCount = req.body.iterations !== undefined ? parseInt(req.body.iterations) : 29999;
    const errorThreshold = req.body.error_threshold !== undefined ? parseFloat(req.body.error_threshold) : 0.0001;
    
    // Fetch and normalize sales data
    const allSalesData = await getMonthlySalesData();
    const salesData = allSalesData.length > maxDataPoints 
      ? allSalesData.slice(allSalesData.length - maxDataPoints) 
      : allSalesData;
    
    const { normalizedSales, minSales, maxSales, range } = normalizeSalesData(salesData);
    const series = normalizedSales.map(item => item.normalized_sales);
    
    // Configure training with progress callback
    const trainingOptions = {
      iterations: iterationsCount,
      errorThresh: errorThreshold,
      log: true,
      logPeriod: 1000,
      callback: (stats) => {
        if (stats.iterations % 1000 === 0 || stats.iterations === 1) {
          const update = {
            type: 'progress',
            iterations: stats.iterations,
            error: stats.error,
            errorThreshold: errorThreshold
          };
          res.write(`data: ${JSON.stringify(update)}\n\n`);
        }
      }
    };
    
    // Start training
    res.write(`data: ${JSON.stringify({ type: 'start', message: 'Starting model training' })}\n\n`);
    const net = trainAndForecastGRU(series, trainingOptions);
    
    // Save model with metadata
    const modelMetadata = {
      dataPoints: salesData.length,
      minSales,
      maxSales, 
      range,
      trainingParams: {
        iterations: iterationsCount,
        errorThreshold,
        finalError: net.trainOpts.error,
        actualIterations: net.trainOpts.iterations
      },
      lastSalesDate: {
        year: salesData[salesData.length - 1].year,
        month: salesData[salesData.length - 1].month
      }
    };
    
    const saveResult = saveModel(net, modelMetadata);
    
    // Send completion
    res.write(`data: ${JSON.stringify({ 
      type: 'complete', 
      modelSaved: saveResult.success,
      modelPath: saveResult.modelPath,
      metadata: modelMetadata
    })}\n\n`);
    
    res.end();
  } catch (err) {
    console.error('Error training model:', err);
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

// Predict future sales using GRU neural network
router.get('/sales', async (req, res) => {
  try {
    // Get request parameters
    let monthsAhead = req.query.months_ahead !== undefined ? parseInt(req.query.months_ahead) : null;
    if (monthsAhead !== null && (isNaN(monthsAhead) || monthsAhead < 1 || monthsAhead > 60)) {
      return res.status(400).json({ error: 'months_ahead must be between 1 and 60' });
    }

    // Get max_data_points parameter, with a minimum enforced value of 12
    let maxDataPoints = req.query.max_data_points !== undefined ? parseInt(req.query.max_data_points) : 32;
    if (isNaN(maxDataPoints) || maxDataPoints < 12) {
      maxDataPoints = 12; // Enforce minimum of 12 data points
    }
    
    // Force training parameter - if true, always train a new model
    const forceTraining = req.query.force_training === 'true';
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
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

    // Check if we should use an existing model or train a new one
    let net;
    let modelSource = 'new-training';
    
    if (!forceTraining) {
      // Try to load the latest model
      const loadResult = loadModel();
      
      if (loadResult.success) {
        // Check if model is still valid for current data
        const modelMetadata = loadResult.metadata;
        
        // A model is considered valid if:
        // 1. It has metadata
        // 2. The last sales date in the model matches or is later than our current data
        const isModelValid = modelMetadata && 
          modelMetadata.lastSalesDate && 
          (modelMetadata.lastSalesDate.year > salesData[salesData.length - 1].year || 
          (modelMetadata.lastSalesDate.year === salesData[salesData.length - 1].year && 
           modelMetadata.lastSalesDate.month >= salesData[salesData.length - 1].month));
        
        if (isModelValid) {
          net = loadResult.model;
          modelSource = 'loaded-from-file';
          
          // Send model load notification
          res.write(`data: ${JSON.stringify({
            type: 'model-loaded',
            message: 'Using saved model for predictions',
            metadata: loadResult.metadata
          })}\n\n`);
        }
      }
    }
    
    // If we don't have a valid model yet, train a new one
    if (!net) {
      // Training options with progress reporting
      const trainingOptions = {
        iterations: 100000,
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
      
      // Train the model
      net = trainAndForecastGRU(series, trainingOptions);
      
      // Save the trained model with metadata
      const modelMetadata = {
        dataPoints: salesData.length,
        minSales,
        maxSales, 
        range,
        trainingParams: {
          errorThreshold: trainingOptions.errorThresh,
          finalError: net.trainOpts.error,
          actualIterations: net.trainOpts.iterations
        },
        lastSalesDate: {
          year: salesData[salesData.length - 1].year,
          month: salesData[salesData.length - 1].month
        }
      };
      
      saveModel(net, modelMetadata);
    }

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
        source: modelSource,
        training_data_points: salesData.length,
        final_error: net.trainOpts.error,
        error_threshold: net.trainOpts.errorThresh,
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

// New endpoint to load a specific model by filename and use it for prediction
router.get('/predict-with-model/:modelName', async (req, res) => {
  try {
    // Get the model name from the URL parameter
    const modelName = req.params.modelName;
    
    // Get months ahead parameter
    let monthsAhead = req.query.months_ahead !== undefined ? 
      parseInt(req.query.months_ahead) : 6;
    
    if (isNaN(monthsAhead) || monthsAhead < 1 || monthsAhead > 60) {
      return res.status(400).json({ error: 'months_ahead must be between 1 and 60' });
    }
    
    // Try to load the specified model
    const loadResult = loadModel(modelName);
    
    if (!loadResult.success) {
      return res.status(404).json({ 
        error: 'Model not found', 
        message: loadResult.error 
      });
    }
    
    // Get the neural network and metadata
    const net = loadResult.model;
    const metadata = loadResult.metadata;
    
    // We need the normalization parameters from the metadata
    if (!metadata || !metadata.minSales || !metadata.maxSales || !metadata.range) {
      return res.status(400).json({ 
        error: 'Invalid model metadata', 
        message: 'The model does not contain required normalization parameters' 
      });
    }
    
    // Get the latest sales data to determine the starting point for prediction
    const allSalesData = await getMonthlySalesData();
    const lastDataPoint = allSalesData[allSalesData.length - 1];
    
    // Generate predictions
    // We need to use empty array since we're not using the input data for prediction
    const forecast = forecastSales(net, [], monthsAhead);
    
    // Format predictions
    let predictions = [];
    let currentPoint = {
      year: lastDataPoint.year,
      month: lastDataPoint.month
    };
    
    forecast.forEach((predictedNormalized) => {
      let nextMonth = currentPoint.month + 1;
      let nextYear = currentPoint.year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
      
      // Denormalize the prediction
      const predictedSales = predictedNormalized * metadata.range + metadata.minSales;
      
      predictions.push({
        year: nextYear,
        month: nextMonth,
        month_name: new Date(nextYear, nextMonth - 1, 1).toLocaleString('default', { month: 'long' }),
        normalized_prediction: predictedNormalized,
        predicted_sales: Math.round(predictedSales)
      });
      
      currentPoint = { year: nextYear, month: nextMonth };
    });
    
    // Return the predictions
    return res.json({
      success: true,
      model: {
        name: modelName,
        metadata: metadata
      },
      predictions: predictions
    });
    
  } catch (err) {
    console.error('Error predicting with saved model:', err);
    return res.status(500).json({ 
      error: 'Failed to predict with saved model', 
      message: err.message 
    });
  }
});

module.exports = router;