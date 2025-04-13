const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');
const { adminAuth, editorAuth, viewerAuth } = require('../middleware/adminAuth');

// Public routes
router.post('/register', userController.register);
router.post('/login', userController.login);

// Protected routes - require authentication
router.get('/profile', authMiddleware, userController.getProfile);
router.put('/profile', authMiddleware, userController.updateProfile);

// Admin routes - require admin authentication
router.get('/users', authMiddleware, adminAuth, userController.getAllUsers);
router.post('/users', authMiddleware, adminAuth, userController.createUser);
router.put('/users/role', authMiddleware, adminAuth, userController.updateUserRole);
router.delete('/users/:userId', authMiddleware, adminAuth, userController.deleteUser);

module.exports = router;
