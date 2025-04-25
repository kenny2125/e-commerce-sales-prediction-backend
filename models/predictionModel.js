const brain = require('brain.js');
const fs = require('fs');
const path = require('path');

// Directory for saving models
const MODEL_DIR = path.join(__dirname, '../saved_models');

// Ensure the models directory exists
if (!fs.existsSync(MODEL_DIR)) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
}

// Train and forecast sales using GRUTimeStep
function trainAndForecastGRU(series, options = {}) {
  const net = new brain.recurrent.GRUTimeStep({ gpu: false });
  const trainingOptions = {
    iterations: options.iterations || 29999,
    errorThresh: options.errorThresh || 0.1,
    learningRate: options.learningRate || 0.001,
    log: options.log || false,
    logPeriod: options.logPeriod || 10000,
    callback: options.callback || undefined,
    callbackPeriod: options.callbackPeriod || 10,
    timeout: options.timeout || Infinity
  };
  
  net.train([series], trainingOptions);
  return net;
}

// Forecast future sales
function forecastSales(net, series, monthsAhead) {
  return net.forecast(series, monthsAhead);
}

// Save trained model to a file
function saveModel(net, metadata = {}) {
  try {
    // Generate a timestamp for the model
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const modelFileName = `gru_model_${timestamp}.json`;
    const modelPath = path.join(MODEL_DIR, modelFileName);
    
    // Convert the model to JSON
    const modelJSON = net.toJSON();
    
    // Add metadata to the saved model
    const savedData = {
      model: modelJSON,
      metadata: {
        ...metadata,
        createdAt: timestamp,
        modelType: 'GRUTimeStep'
      }
    };
    
    // Write the model to file
    fs.writeFileSync(modelPath, JSON.stringify(savedData));
    
    // Also save as latest model for easy reference
    fs.writeFileSync(path.join(MODEL_DIR, 'latest_model.json'), JSON.stringify(savedData));
    
    console.log(`Model saved to ${modelPath}`);
    return { success: true, modelPath };
  } catch (error) {
    console.error('Error saving model:', error);
    return { success: false, error: error.message };
  }
}

// Load a trained model from a file
function loadModel(modelName = 'latest_model.json') {
  try {
    const modelPath = path.join(MODEL_DIR, modelName);
    
    // Check if the model file exists
    if (!fs.existsSync(modelPath)) {
      return { success: false, error: `Model file ${modelName} not found` };
    }
    
    // Read and parse the model file
    const savedData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    const modelJSON = savedData.model;
    
    // Create a new neural network instance and load the model
    const net = new brain.recurrent.GRUTimeStep();
    net.fromJSON(modelJSON);
    
    return { 
      success: true, 
      model: net, 
      metadata: savedData.metadata 
    };
  } catch (error) {
    console.error('Error loading model:', error);
    return { success: false, error: error.message };
  }
}

// Get information about available saved models
function getSavedModels() {
  try {
    if (!fs.existsSync(MODEL_DIR)) {
      return { success: false, error: 'Model directory does not exist' };
    }
    
    const modelFiles = fs.readdirSync(MODEL_DIR)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(MODEL_DIR, file);
        const stats = fs.statSync(filePath);
        
        try {
          // Try to read the metadata
          const savedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          return {
            filename: file,
            size: stats.size,
            created: stats.mtime,
            metadata: savedData.metadata || {}
          };
        } catch (e) {
          // If we can't read the file, just return basic info
          return {
            filename: file,
            size: stats.size,
            created: stats.mtime,
            error: 'Could not parse model file'
          };
        }
      });
    
    return { success: true, models: modelFiles };
  } catch (error) {
    console.error('Error getting saved models:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  trainAndForecastGRU,
  forecastSales,
  saveModel,
  loadModel,
  getSavedModels
};
