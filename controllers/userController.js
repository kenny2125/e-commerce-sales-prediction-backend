const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Register a new user
exports.register = async (req, res) => {
  try {
    const { 
      username, 
      email, 
      password,
      first_name,
      last_name,
      address,
      phone,
      role
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      first_name,
      last_name,
      address,
      phone,
      role: role || 'customer' // Default to customer if not specified
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { credential, password } = req.body;

    if (!credential || !password) {
      return res.status(400).json({ 
        message: 'Please provide a username/email and password' 
      });
    }

    // Check if user exists by either username or email
    const user = await User.findByCredential(credential);
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Update last login timestamp
    await User.updateLastLogin(user.id);

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    // The user ID comes from the verified token
    const userId = req.user.id;
    
    // Get user from database
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return user data without password
    res.status(200).json({
      id: user.id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      address: user.address,
      phone: user.phone,
      role: user.role,
      created_at: user.created_at,
      last_login: user.last_login
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      username, 
      email,
      first_name,
      last_name,
      address,
      phone
    } = req.body;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    try {
      // Update user
      const updatedUser = await User.update(userId, {
        username,
        email,
        first_name,
        last_name,
        address,
        phone
      });
      
      res.status(200).json({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          first_name: updatedUser.first_name,
          last_name: updatedUser.last_name,
          address: updatedUser.address,
          phone: updatedUser.phone,
          role: updatedUser.role
        }
      });
    } catch (error) {
      // Handle specific error codes
      if (error.code === 'DUPLICATE_EMAIL') {
        return res.status(400).json({ 
          message: 'Email is already in use by another account',
          code: 'DUPLICATE_EMAIL'
        });
      } else if (error.code === 'DUPLICATE_USERNAME') {
        return res.status(400).json({ 
          message: 'Username is already in use by another account',
          code: 'DUPLICATE_USERNAME'
        });
      }
      throw error; // Re-throw for the outer catch block
    }
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
};

// Admin: Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.getAllUsers();
    res.status(200).json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
};

// Admin: Create new user
exports.createUser = async (req, res) => {
  try {
    const { 
      username, 
      email, 
      password,
      first_name,
      last_name,
      address,
      phone,
      role
    } = req.body;

    // Validate role
    if (role && !Object.values(User.ALL_ROLES).includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role specified',
        validRoles: Object.values(User.ROLES)  // Only send active roles to the frontend
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      first_name,
      last_name,
      address,
      phone,
      role
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error while creating user' });
  }
};

// Admin: Update user role
exports.updateUserRole = async (req, res) => {
  try {
    const { userId, role } = req.body;

    // Validate role
    if (!Object.values(User.ROLES).includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role specified',
        validRoles: Object.values(User.ROLES)
      });
    }

    const updatedUser = await User.updateRole(userId, role);
    
    res.status(200).json({
      message: 'User role updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update role error:', error);
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ message: 'User not found' });
    }
    if (error.code === 'INVALID_ROLE') {
      return res.status(400).json({ 
        message: 'Invalid role specified',
        validRoles: Object.values(User.ROLES)
      });
    }
    res.status(500).json({ message: 'Server error while updating role' });
  }
};

// Admin: Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    await User.deleteUser(userId);
    
    res.status(200).json({
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Server error while deleting user' });
  }
};
