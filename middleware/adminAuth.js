const User = require('../models/user');

// Define deprecated roles for compatibility
const DEPRECATED_ROLES = {
  EDITOR: 'editor',
  VIEWER: 'viewer'
};

const adminAuth = async (req, res, next) => {
  try {
    // req.user is set by the auth middleware
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user has admin role
    if (req.user.role !== User.ROLES.ADMIN && req.user.role !== User.ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error in admin authentication' });
  }
};

// Middleware to check if user has editor or admin role
const editorAuth = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Support both active and deprecated roles
    if (![User.ROLES.ADMIN, User.ROLES.SUPER_ADMIN, DEPRECATED_ROLES.EDITOR].includes(req.user.role)) {
      return res.status(403).json({ message: 'Editor access required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error in editor authentication' });
  }
};

// Middleware to check if user has viewer, editor, or admin role
const viewerAuth = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Support both active and deprecated roles
    if (![User.ROLES.ADMIN, User.ROLES.SUPER_ADMIN, DEPRECATED_ROLES.EDITOR, DEPRECATED_ROLES.VIEWER].includes(req.user.role)) {
      return res.status(403).json({ message: 'Viewer access required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error in viewer authentication' });
  }
};

// Middleware to check if user has permission to apply discounts (SUPER_ADMIN, admin, warehouse)
const discountAuth = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Allow SUPER_ADMIN, admin, and warehouse roles to apply discounts
    if (![User.ROLES.SUPER_ADMIN, User.ROLES.ADMIN, User.ROLES.WAREHOUSE].includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to apply discounts' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error in discount permission authentication' });
  }
};

module.exports = { adminAuth, editorAuth, viewerAuth, discountAuth };