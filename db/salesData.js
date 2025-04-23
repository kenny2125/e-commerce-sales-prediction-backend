const db = require('./db');

// Fetch historical monthly sales data from the database
async function getMonthlySalesData() {
  const { rows } = await db.query(`
    SELECT 
      EXTRACT(YEAR FROM date) as year,
      EXTRACT(MONTH FROM date) as month,
      SUM(actualsales) as total_sales
    FROM historical_sales
    GROUP BY year, month
    ORDER BY year, month
  `);
  return rows.map(row => ({
    year: parseInt(row.year),
    month: parseInt(row.month),
    month_name: new Date(parseInt(row.year), parseInt(row.month) - 1, 1).toLocaleString('default', { month: 'long' }),
    total_sales: parseFloat(row.total_sales)
  }));
}

// Normalize sales data
function normalizeSalesData(salesData) {
  const maxSales = Math.max(...salesData.map(item => item.total_sales));
  const minSales = Math.min(...salesData.map(item => item.total_sales));
  const range = maxSales - minSales || 1;
  const normalizedSales = salesData.map(item => ({
    ...item,
    normalized_sales: (item.total_sales - minSales) / range
  }));
  return { normalizedSales, minSales, maxSales, range };
}

module.exports = {
  getMonthlySalesData,
  normalizeSalesData
};
