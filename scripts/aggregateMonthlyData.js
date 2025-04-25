/**
 * Monthly Sales Data Aggregation Script
 * 
 * This script checks if today is the last day of the month.
 * If it is, it aggregates order data from the current month and
 * stores it in the historical_sales table, then triggers model training.
 */

const db = require('../db/db');
const https = require('https');
const http = require('http');

// Check if today is the last day of the month or if we're in testing mode
function isLastDayOfMonth() {
  // If TESTING_OVERRIDE environment variable is set to 'true', bypass the check
  if (process.env.TESTING_OVERRIDE === 'true') {
    console.log('Testing override enabled - bypassing last day of month check');
    return true;
  }
  
  // Normal check for production use
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return today.getDate() === lastDayOfMonth;
}

// Get the current month and year for aggregation
const getCurrentMonth = () => {
  const now = new Date();
  
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1, // JS months are 0-indexed, we need 1-indexed
    lastDay: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() // Last day of current month
  };
};

// Aggregate orders data for the given month and year
async function aggregateMonthlyOrdersData(year, month, lastDay) {
  try {
    console.log(`Aggregating sales data for ${month}/${year}`);

    // Calculate start and end dates for the month we're processing
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
    
    console.log(`Date range: ${startDate} to ${endDate}`);

    // Query to get total sales from orders for each day of the month
    const query = `
      SELECT 
        DATE(created_at) AS date,
        SUM(total_amount) AS daily_total
      FROM orders
      WHERE 
        created_at >= $1 AND 
        created_at <= $2 AND
        status != 'Cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    const { rows } = await db.query(query, [startDate, endDate]);
    console.log(`Found ${rows.length} days with sales data`);

    // Insert data into historical_sales table
    let processedDays = 0;
    
    for (const row of rows) {
      // Check if data for this date already exists in historical_sales
      const checkQuery = `
        SELECT COUNT(*) 
        FROM historical_sales 
        WHERE date = $1
      `;
      const checkResult = await db.query(checkQuery, [row.date]);
      
      // Only insert if no record exists for this date
      if (parseInt(checkResult.rows[0].count) === 0) {
        const insertQuery = `
          INSERT INTO historical_sales 
          (date, actualsales) 
          VALUES ($1, $2)
        `;
        await db.query(insertQuery, [row.date, row.daily_total]);
        processedDays++;
      } else {
        console.log(`Data for ${row.date} already exists in historical_sales, skipping.`);
      }
    }

    console.log(`Successfully processed and inserted ${processedDays} days of sales data.`);
    return processedDays;
  } catch (error) {
    console.error('Error aggregating monthly data:', error);
    throw error;
  }
}

// Trigger model training using the existing API endpoint
function trainModel() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Triggering model training via API...');
      
      // Get the base URL for the API (defaulting to localhost if not in production)
      const isProduction = process.env.NODE_ENV === 'production';
      const baseUrl = isProduction 
        ? `https://${process.env.HEROKU_APP_NAME || 'your-app-name'}.herokuapp.com` 
        : 'http://localhost:3000';
      
      const url = `${baseUrl}/api/predictions/train`;
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      // Choose http or https based on the URL
      const client = url.startsWith('https') ? https : http;
      
      const req = client.request(url, requestOptions, (res) => {
        console.log(`Training API responded with status: ${res.statusCode}`);
        
        // We don't need to process the streaming response data in detail
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('Model training initiated successfully');
          resolve(true);
        } else {
          console.error(`Failed to trigger model training. Status code: ${res.statusCode}`);
          resolve(false);
        }
      });
      
      req.on('error', (error) => {
        console.error('Error triggering model training:', error);
        resolve(false);
      });
      
      req.end();
    } catch (error) {
      console.error('Exception in trainModel:', error);
      resolve(false);
    }
  });
}

// Main function
async function main() {
  try {
    // Check if today is the last day of the month
    if (!isLastDayOfMonth()) {
      console.log('Today is not the last day of the month. Exiting without processing.');
      process.exit(0);
    }
    
    console.log('Today is the last day of the month. Running monthly aggregation...');
    
    // Get details for the current month we're aggregating
    const { year, month, lastDay } = getCurrentMonth();
    console.log(`Running monthly aggregation for ${month}/${year}`);
    
    // Aggregate monthly data
    const processedDays = await aggregateMonthlyOrdersData(year, month, lastDay);
    
    // If we processed at least one day of data, train the model
    if (processedDays > 0) {
      console.log('New data was added, triggering model training...');
      const trained = await trainModel();
      if (trained) {
        console.log('Monthly data aggregation and model training completed successfully.');
      } else {
        console.log('Monthly data aggregation completed, but model training failed.');
      }
    } else {
      console.log('No new data was added, skipping model training.');
    }
    
  } catch (error) {
    console.error('Error in monthly aggregation process:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Execute the main function
main();