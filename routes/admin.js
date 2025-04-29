const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    console.log('isAdmin middleware - user:', req.user);
    
    if (!req.user || !req.user.id) {
      console.log('No user ID in request');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      console.log('User not found in database');
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log('User role:', user.role);
    
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      console.log('User is not admin or superadmin');
      return res.status(403).json({ message: 'Access denied. Admin role required' });
    }
    
    console.log('User is admin, proceeding to next middleware');
    next();
  } catch (err) {
    console.error('isAdmin middleware error:', err);
    res.status(500).json({ message: 'Server error in isAdmin middleware' });
  }
};

// @route   GET api/admin/users
// @desc    Get all users
// @access  Admin only
router.get('/users', auth, isAdmin, async (req, res) => {
  try {
    console.log('GET /users - Fetching all users');
    const users = await User.find().select('-password');
    console.log(`Found ${users.length} users`);
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/admin/users
// @desc    Create a new user
// @access  Admin only
router.post('/users', 
  auth, 
  isAdmin,
  [
    check('username', 'Username is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('firstName', 'First name is required').not().isEmpty(),
    check('lastName', 'Last name is required').not().isEmpty(),
    check('role', 'Role is required').isIn(['student', 'trainer', 'faculty', 'admin'])
  ],
  async (req, res) => {
    console.log('POST /users - Creating new user');
    console.log('Request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, firstName, lastName, role } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ $or: [{ email }, { username }] });

      if (user) {
        console.log('User already exists');
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create new user
      user = new User({
        username,
        email,
        password, // Will be hashed by the pre-save middleware
        firstName,
        lastName,
        role
      });

      // Save user to database
      await user.save();
      console.log('User created successfully:', user._id);

      // Return the user without password
      const userResponse = await User.findById(user._id).select('-password');
      res.status(201).json({ 
        message: 'User created successfully',
        user: userResponse
      });
    } catch (err) {
      console.error('Error creating user:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// @route   PUT api/admin/users/:id
// @desc    Update a user
// @access  Admin only
router.put('/users/:id', auth, isAdmin, async (req, res) => {
  console.log(`PUT /users/${req.params.id} - Updating user`);
  console.log('Request body:', req.body);
  
  const { username, email, password, firstName, lastName, role } = req.body;

  // Build user object
  const userFields = {};
  if (email) userFields.email = email;
  if (firstName) userFields.firstName = firstName;
  if (lastName) userFields.lastName = lastName;
  if (role) userFields.role = role;

  // Hash password if provided
  if (password) {
    const salt = await bcrypt.genSalt(10);
    userFields.password = await bcrypt.hash(password, salt);
  }

  try {
    let user = await User.findById(req.params.id);

    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user
    user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: userFields },
      { new: true }
    ).select('-password');

    console.log('User updated successfully');
    res.json({ 
      message: 'User updated successfully',
      user
    });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/admin/users/:id
// @desc    Delete a user
// @access  Admin only
router.delete('/users/:id', auth, isAdmin, async (req, res) => {
  console.log(`DELETE /users/${req.params.id} - Deleting user`);
  
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndRemove(req.params.id);
    console.log('User deleted successfully');
    
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
