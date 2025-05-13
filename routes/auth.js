const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { check, validationResult } = require('express-validator');

// Auth middleware
exports.auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Authorize roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `User role ${req.user.role} is not authorized to access this route` 
      });
    }
    next();
  };
};

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
  check('username', 'Username is required').not().isEmpty(),
  check('password', 'Password is required').exists()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create and return JWT token
    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your-secret-key-here',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        
        // Return user info without password
        const userResponse = {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          token
        };

        res.json(userResponse);
      }
    );
  } catch (err) {
    console.error('Server error during login:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', exports.auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  check('username', 'Username is required').not().isEmpty(),
  check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
  check('email', 'Please include a valid email').isEmail(),
  check('firstName', 'First name is required').not().isEmpty(),
  check('lastName', 'Last name is required').not().isEmpty(),
  check('role', 'Role is required').not().isEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password, email, firstName, lastName, role } = req.body;

  try {
    // Check if user exists
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Only allow superadmin to create admin users
    if (role === 'admin' || role === 'superadmin') {
      if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can create admin users' });
      }
    }

    // Create new user
    user = new User({
      username,
      password,
      email,
      firstName,
      lastName,
      role
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Save user to database
    await user.save();

    // Create and return JWT token
    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your-secret-key-here',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          }
        });
      }
    );
  } catch (err) {
    console.error('Server error during registration:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create initial superadmin if no users exist
const createInitialSuperAdmin = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('super123', salt);
      
      const superadmin = new User({
        username: 'superadmin',
        password: hashedPassword,
        email: 'superadmin@example.com',
        firstName: 'Super',
        lastName: 'Admin',
        role: 'superadmin'
      });
      
      await superadmin.save();
      console.log('Initial superadmin created');
    }
  } catch (error) {
    console.error('Error creating initial superadmin:', error);
  }
};

// Call this function when the server starts
createInitialSuperAdmin();

module.exports = router;
