const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Heroku Postgres
  }
});

module.exports = {
  query: (text, params) => {
    // Modify SQL queries to automatically add public schema to table names
    // This regex looks for table names that aren't already prefixed with a schema
    const modifiedText = text.replace(
      /(?<!(public|schema)\.)\b(tbl_users|products|product_variants|cart_items|orders|order_items|historical_sales)(?=\s|\)|;|,|$)/gi, 
      'public.$2'
    );
    return pool.query(modifiedText, params);
  },
};