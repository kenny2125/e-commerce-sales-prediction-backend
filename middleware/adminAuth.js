const User = require('../models/user');

const adminAuth = async (req, res, next) => {
  try {
    // req.user is set by the auth middleware
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user has admin role
    if (req.user.role !== User.ROLES.ADMIN) {
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

    if (![User.ROLES.ADMIN, User.ROLES.EDITOR].includes(req.user.role)) {
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

    if (![User.ROLES.ADMIN, User.ROLES.EDITOR, User.ROLES.VIEWER].includes(req.user.role)) {
      return res.status(403).json({ message: 'Viewer access required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error in viewer authentication' });
  }
};

module.exports = { adminAuth, editorAuth, viewerAuth };