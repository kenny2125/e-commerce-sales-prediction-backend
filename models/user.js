const db = require('../db/db');

const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  CUSTOMER: 'customer'
};

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
      address = null,
      phone = null,
      role = 'customer'
    } = userData;
    
    try {
      const result = await db.query(
        `INSERT INTO tbl_users 
        (username, email, password, first_name, last_name, address, phone, role) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING id, username, email, first_name, last_name, role`,
        [username, email, password, first_name, last_name, address, phone, role]
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

  static async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM tbl_users WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }
  
  static async isEmailTaken(email, userId) {
    try {
      // Check if email exists for any user except the current one
      const result = await db.query(
        'SELECT * FROM tbl_users WHERE email = $1 AND id != $2',
        [email, userId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking email:', error);
      throw error;
    }
  }

  static async isUsernameTaken(username, userId) {
    try {
      // Check if username exists for any user except the current one
      const result = await db.query(
        'SELECT * FROM tbl_users WHERE username = $1 AND id != $2',
        [username, userId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking username:', error);
      throw error;
    }
  }

  static async update(userId, userData) {
    const { 
      username, 
      email,
      first_name,
      last_name,
      address,
      phone
    } = userData;
    
    try {
      // Check if email is taken by another user
      const isEmailTaken = await this.isEmailTaken(email, userId);
      if (isEmailTaken) {
        const error = new Error('Email is already in use');
        error.code = 'DUPLICATE_EMAIL';
        throw error;
      }
      
      // Check if username is taken by another user
      const isUsernameTaken = await this.isUsernameTaken(username, userId);
      if (isUsernameTaken) {
        const error = new Error('Username is already in use');
        error.code = 'DUPLICATE_USERNAME';
        throw error;
      }
      
      const result = await db.query(
        `UPDATE tbl_users 
        SET username = $1, email = $2, first_name = $3, last_name = $4,
            address = $5, phone = $6, updated_at = NOW()
        WHERE id = $7
        RETURNING id, username, email, first_name, last_name, address, phone, role`,
        [username, email, first_name, last_name, address, phone, userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  static async getAllUsers() {
    try {
      const result = await db.query(
        'SELECT id, username, email, first_name, last_name, role, created_at, last_login FROM tbl_users ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting all users:', error);
      throw error;
    }
  }

  static async updateRole(userId, newRole) {
    try {
      // Validate role
      if (!Object.values(ROLES).includes(newRole)) {
        const error = new Error('Invalid role');
        error.code = 'INVALID_ROLE';
        throw error;
      }

      const result = await db.query(
        `UPDATE tbl_users 
        SET role = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, username, email, role`,
        [newRole, userId]
      );

      if (result.rows.length === 0) {
        const error = new Error('User not found');
        error.code = 'USER_NOT_FOUND';
        throw error;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  }

  static async deleteUser(userId) {
    try {
      const result = await db.query(
        'DELETE FROM tbl_users WHERE id = $1 RETURNING id',
        [userId]
      );

      if (result.rows.length === 0) {
        const error = new Error('User not found');
        error.code = 'USER_NOT_FOUND';
        throw error;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  // Make ROLES accessible from the class
  static get ROLES() {
    return ROLES;
  }
}

module.exports = User;
