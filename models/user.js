const db = require('../db/db');

class User {
  static async findByEmail(email) {
    try {
      const result = await db.query(
        'SELECT * FROM tbl_users WHERE email = $1',
        [email]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  static async findByCredential(credential) {
    try {
      // Check if the credential is an email or username
      const result = await db.query(
        'SELECT * FROM tbl_users WHERE email = $1 OR username = $1',
        [credential]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by credential:', error);
      throw error;
    }
  }

  static async create(userData) {
    const { 
      username, 
      email, 
      password,
      first_name = null,
      last_name = null,
      gender = null,
      address = null,
      phone = null,
      role = 'customer'
    } = userData;
    
    try {
      const result = await db.query(
        `INSERT INTO tbl_users 
        (username, email, password, first_name, last_name, gender, address, phone, role) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING id, username, email, first_name, last_name, role`,
        [username, email, password, first_name, last_name, gender, address, phone, role]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  static async updateLastLogin(userId) {
    try {
      await db.query(
        'UPDATE tbl_users SET last_login = NOW() WHERE id = $1',
        [userId]
      );
    } catch (error) {
      console.error('Error updating last login:', error);
      throw error;
    }
  }
}

module.exports = User;
