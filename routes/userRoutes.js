const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');
const { adminAuth, editorAuth, viewerAuth, superAdminAuth } = require('../middleware/adminAuth');

// Public routes
router.post('/register', userController.register);
router.post('/login', userController.login);

// Protected routes - require authentication
router.get('/profile', authMiddleware, userController.getProfile);
router.put('/profile', authMiddleware, userController.updateProfile);

// Add logout route (public so cookie can be cleared even if token missing)
router.post('/logout', userController.logout);

// Admin routes - protected by authentication and super admin authorization
router.get('/users', authMiddleware,superAdminAuth, userController.getAllUsers);
router.post('/users',  authMiddleware, superAdminAuth,userController.createUser);
router.put('/users/role',  authMiddleware, superAdminAuth,userController.updateUserRole);
router.delete('/users/:userId',  authMiddleware, superAdminAuth,userController.deleteUser);

module.exports = router;
