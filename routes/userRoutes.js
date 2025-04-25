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

// Admin routes - no authentication required temporarily
router.get('/users', userController.getAllUsers);
router.post('/users', userController.createUser);
router.put('/users/role', userController.updateUserRole);
router.delete('/users/:userId', userController.deleteUser);

module.exports = router;
