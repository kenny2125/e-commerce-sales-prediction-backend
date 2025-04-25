// Daily script to generate sales records from completed orders
const db = require('../db/db');

async function generateSalesRecords() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to beginning of the day for proper date comparison

  console.log(`Starting daily sales record generation for ${today.toISOString().split('T')[0]}`);
  
  try {
    // Start transaction
    await db.query('BEGIN');
    
    // Find completed orders that don't have corresponding sales records yet
    // Statuses considered "completed" include: "Claimed", "Paid", "Completed"
    const ordersResult = await db.query(
      `SELECT o.id, o.order_number, o.user_id, o.total_amount, o.payment_method, o.created_at, o.updated_at
       FROM orders o
       LEFT JOIN sales s ON o.id = s.order_id
       WHERE (o.status = 'Claimed' OR o.status = 'Paid' OR o.status = 'Completed')
       AND s.id IS NULL
       AND o.updated_at >= $1
       AND o.updated_at < NOW()`,
      [today]
    );
    
    console.log(`Found ${ordersResult.rows.length} completed orders without sales records`);
    
    // Insert sales records for each completed order
    for (const order of ordersResult.rows) {
      // Use the order's updated_at timestamp as the sale date (when it was marked as completed)
      // If you prefer to use today's date instead, replace order.updated_at with today
      const saleDate = order.updated_at;
      
      // Insert into sales table with the correct schema fields based on the image
      await db.query(
        `INSERT INTO sales 
         (date, amount, order_id, order_number, user_id, payment_method, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [saleDate, order.total_amount, order.id, order.order_number, order.user_id, order.payment_method, 'completed']
      );
      
      console.log(`Created sales record for order ${order.order_number}`);
    }
    
    // Commit transaction
    await db.query('COMMIT');
    
    console.log(`Successfully generated ${ordersResult.rows.length} sales records`);
    return {
      success: true,
      recordsGenerated: ordersResult.rows.length,
      date: today.toISOString().split('T')[0]
    };
    
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    console.error('Error generating sales records:', error);
    return {
      success: false,
      error: error.message,
      date: today.toISOString().split('T')[0]
    };
  }
}

// If this script is run directly (not imported), execute the function
if (require.main === module) {
  generateSalesRecords()
    .then(result => {
      console.log('Daily sales record generation completed:');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error in sales record generation:', error);
      process.exit(1);
    });
}

// Export for use in other modules if needed
module.exports = generateSalesRecords;