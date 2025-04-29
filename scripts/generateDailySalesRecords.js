// Daily script to generate sales records from completed orders
const db = require('../db/db');

async function generateSalesRecords() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to beginning of the day for proper date comparison

  console.log(`Starting daily sales record generation for ${today.toISOString().split('T')[0]}`);
  
  try {
    // Start transaction
    await db.query('BEGIN');
    
    // First, let's check what payment statuses exist in the orders table
    const statusCheckResult = await db.query(
      `SELECT DISTINCT payment_status FROM orders WHERE payment_status IS NOT NULL`
    );
    console.log('Existing payment statuses:', statusCheckResult.rows.map(row => row.payment_status));
    
    // Find completed orders that don't have corresponding sales records yet
    // Using ILIKE for case-insensitive comparison
    const ordersResult = await db.query(
      `SELECT o.id, o.order_number, o.user_id, o.total_amount, o.payment_method, 
              o.payment_status, o.created_at, o.updated_at
       FROM orders o
       LEFT JOIN sales s ON o.id = s.order_id
       WHERE (o.payment_status ILIKE 'paid' OR o.payment_status ILIKE 'paid (discounted)')
       AND s.id IS NULL
       ORDER BY o.created_at ASC`
    );
    
    console.log(`Found ${ordersResult.rows.length} paid orders without sales records`);
    
    if (ordersResult.rows.length === 0) {
      console.log('No new sales records to generate');
      await db.query('COMMIT');
      return {
        success: true,
        recordsGenerated: 0,
        date: today.toISOString().split('T')[0]
      };
    }
    
    // Log the first few orders for debugging
    console.log('Sample orders to process:', 
      ordersResult.rows.slice(0, 3).map(order => ({
        id: order.id,
        order_number: order.order_number,
        payment_status: order.payment_status,
        total_amount: order.total_amount
      }))
    );
    
    // Insert sales records for each completed order
    for (const order of ordersResult.rows) {
      try {
        // Use the order's updated_at timestamp as the sale date
        const saleDate = order.updated_at;
        
        await db.query(
          `INSERT INTO sales 
           (date, amount, order_id, order_number, user_id, payment_method, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          [saleDate, order.total_amount, order.id, order.order_number, order.user_id, order.payment_method, 'completed']
        );
        
        console.log(`Created sales record for order ${order.order_number} (ID: ${order.id})`);
      } catch (insertError) {
        console.error(`Error creating sales record for order ${order.order_number}:`, insertError);
        throw insertError; // Re-throw to trigger rollback
      }
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