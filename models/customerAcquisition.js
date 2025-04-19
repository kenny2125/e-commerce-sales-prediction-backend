const db = require('../db/db');

class CustomerAcquisition {
  static async getMonthlyAcquisitionChurn() {
    try {
      const query = `
        WITH monthly_stats AS (
          SELECT 
            DATE_TRUNC('month', created_at) AS month,
            COUNT(*) as new_users,
            COUNT(CASE WHEN last_login < NOW() - INTERVAL '3 months' THEN 1 END) as churned_users
          FROM tbl_users
          WHERE role = 'customer'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY month DESC
          LIMIT 6
        )
        SELECT 
          TO_CHAR(month, 'Mon YYYY') as month,
          new_users - churned_users as count
        FROM monthly_stats
        ORDER BY month ASC;
      `;

      const { rows } = await db.query(query);
      return rows;
    } catch (error) {
      console.error('Error getting customer acquisition data:', error);
      throw error;
    }
  }

  static async getCustomerMetrics() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_customers,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_customers,
          COUNT(CASE WHEN last_login < NOW() - INTERVAL '3 months' THEN 1 END) as churned_customers
        FROM tbl_users
        WHERE role = 'customer'
      `;

      const { rows } = await db.query(query);
      return rows[0];
    } catch (error) {
      console.error('Error getting customer metrics:', error);
      throw error;
    }
  }
}

module.exports = CustomerAcquisition;