const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    console.log('Auth middleware called');
    console.log('Authorization header:', authHeader);
    
    // Check if no token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No authorization header provided or invalid format');
      return res.status(401).json({ message: 'No token, authorization denied' });
    }
    
    // Extract token from Bearer format
    const token = authHeader.substring(7, authHeader.length);
    
    console.log('Token extracted:', token);
    
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
      // Verify token
      if (!process.env.JWT_SECRET) {
        console.error('JWT secret is missing');
        return res.status(500).json({ message: 'Server error in auth middleware' });
      }
      console.log('Verifying token with secret:', process.env.JWT_SECRET ? 'Secret exists' : 'Secret missing');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded token:', decoded);

      // Add user from payload
      req.user = decoded.user;
      console.log('User ID from token:', req.user.id);
      
      next();
    } catch (err) {
      console.error('Token verification error:', err);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token has expired' });
      } else if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      } else {
        return res.status(401).json({ message: 'Token is not valid' });
      }
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ message: 'Server error in auth middleware' });
  }
};

module.exports = authMiddleware;
