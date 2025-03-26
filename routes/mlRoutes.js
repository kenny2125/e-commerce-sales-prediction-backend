const express = require('express');
const router = express.Router();
const axios = require('axios');

// Configuration
const FLASK_SERVER_URL = process.env.FLASK_SERVER_URL || 'http://localhost:5000';

// Get ML predictions from Flask server
router.get('/linear-prediction', async (req, res) => {
  try {
    const { months_ahead = 1 } = req.query;
    
    console.log(`Making request to Flask server at: ${FLASK_SERVER_URL}/predict with months_ahead=${months_ahead}`);
    
    // Make request to Flask server
    const response = await axios.get(`${FLASK_SERVER_URL}/predict`, {
      params: { months_ahead }
    });
    
    console.log('Received response from Flask server:', response.status);
    
    // Forward the complete prediction results to the frontend
    res.json(response.data);
  } catch (err) {
    console.error('Error fetching ML prediction:', err);
    
    // Provide more detailed error information
    if (err.response) {
      // The server responded with a status code outside the 2xx range
      console.error('Flask server response error:', {
        status: err.response.status,
        data: err.response.data
      });
      res.status(err.response.status).json({
        error: 'ML server returned an error',
        details: err.response.data
      });
    } else if (err.request) {
      // The request was made but no response was received
      console.error('No response received from Flask server');
      res.status(503).json({
        error: 'No response from ML server',
        message: 'The ML server is not responding. Please check if it is running.'
      });
    } else {
      // Something else caused the error
      res.status(500).json({ 
        error: 'Failed to get prediction from ML server',
        message: err.message 
      });
    }
  }
});

module.exports = router;
