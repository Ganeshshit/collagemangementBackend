const express = require('express');
const router = express.Router();
const { check, validationResult, body } = require('express-validator');
const { auth } = require('../middleware/auth');
const asyncHandler = require('../middleware/async');
const { User, Student, Batch, Course } = require('../models');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `users-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /xlsx|xls|csv/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only Excel and CSV files are allowed'));
  }
}).single('usersFile');

/**
 * @route   POST /api/admin/users
 * @desc    Create a new user (student/trainer/faculty)
 * @access  Private (Admin)
 */
router.post('/users', [
  auth,
  async (req, res, next) => {
    // Handle single user creation
    if (!req.file) {
      return next();
    }
    
    // Handle bulk user upload
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      try {
        const result = await processBulkUsers(req.file.path, req.user._id);
        res.json({
          success: true,
          message: 'Bulk user upload completed',
          ...result
        });
      } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({
          success: false,
          message: 'Error processing bulk upload',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });
  },
  [
    check('email', 'Please include a valid email').if(
      (value, { req }) => req.body.email
    ).isEmail(),
    check('firstName', 'First name is required').notEmpty(),
    check('lastName', 'Last name is required').notEmpty(),
    check('role', 'Valid role is required').isIn(['student', 'trainer', 'faculty']),
    check('isActive', 'isActive must be a boolean').optional().isBoolean(),
    check('batchId', 'Batch ID is required for students').if(
      (value, { req }) => req.body.role === 'student'
    ).isMongoId(),
    check('batchIds', 'Batch IDs must be an array').if(
      (value, { req }) => req.body.role === 'trainer' && req.body.batchIds
    ).isArray(),
    check('batchIds.*', 'Invalid batch ID').if(
      (value, { req }) => req.body.role === 'trainer' && req.body.batchIds
    ).isMongoId()
  ],
  asyncHandler(async (req, res) => {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create users'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const session = await User.startSession();
    session.startTransaction();

    try {
      const { email, firstName, lastName, role, isActive = true, batchId, ...otherFields } = req.body;
      
      // Generate a unique username
      let username, isUnique = false, attempts = 0;
      const maxAttempts = 5;
      
      // Keep trying until we find a unique username or hit max attempts
      while (!isUnique && attempts < maxAttempts) {
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase().charAt(0)}`;
        username = `${baseUsername}${randomSuffix}`.substring(0, 20); // Ensure max length
        
        const exists = await User.findOne({ username }).session(session);
        if (!exists) isUnique = true;
        attempts++;
      }
      
      if (!isUnique) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
          success: false,
          message: 'Failed to generate a unique username. Please try again.'
        });
      }
      
      // Generate a stronger random password (10 characters with mixed case, numbers, and special chars)
      const password = generateStrongPassword(10);

      // Check if user with same email or username exists
      if (email) {
        const existingUser = await User.findOne({ 
          $or: [
            { email: email.toLowerCase() },
            { username }
          ]
        }).session(session);
        
        if (existingUser) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: existingUser.email === email.toLowerCase() 
              ? 'Email already in use' 
              : 'Username already exists'
          });
        }
      } else {
        // Check if username exists when no email is provided
        const existingUser = await User.findOne({ username }).session(session);
        if (existingUser) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Username already exists'
          });
        }
      }

      // For students, check batch exists
      if (role === 'student' && batchId) {
        const batch = await Batch.findById(batchId).session(session);
        if (!batch) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: 'Batch not found'
          });
        }
      }

      try {
        // Create user with generated credentials
        user = new User({
          email: email ? email.toLowerCase() : `${username}@college.edu`,
          username,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
          isActive,
          createdBy: req.user._id,
          ...(email && { emailVerified: false }),
          ...otherFields
        });
        
        // Hash password before saving
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        
        await user.save({ session });
      } catch (error) {
        console.error('User creation error:', error);
        await session.abortTransaction();
        session.endSession();
        
        // Handle duplicate key errors
        if (error.code === 11000) {
          const field = Object.keys(error.keyPattern)[0];
          return res.status(400).json({
            success: false,
            message: `${field} already exists`
          });
        }
        
        return res.status(500).json({
          success: false,
          message: 'Error creating user',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }

      // Create student profile if role is student
      if (role === 'student') {
        try {
          const student = new Student({
            user: user._id,
            batch: batchId,
            admissionDate: new Date(),
            ...(otherFields.studentDetails || {})
          });
          
          await student.save({ session });

          // Add student to batch
          await Batch.findByIdAndUpdate(
            batchId,
            { $addToSet: { students: user._id } },
            { session, new: true }
          );
        } catch (error) {
          console.error('Student profile creation error:', error);
          await session.abortTransaction();
          session.endSession();
          
          return res.status(500).json({
            success: false,
            message: 'Error creating student profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
        }
      }

      // Add trainer to batches if specified
      if (role === 'trainer' && Array.isArray(otherFields.batchIds)) {
        try {
          // Verify all batch IDs exist
          const batches = await Batch.find({
            _id: { $in: otherFields.batchIds }
          }).session(session);
          
          if (batches.length !== otherFields.batchIds.length) {
            throw new Error('One or more batch IDs are invalid');
          }
          
          await Batch.updateMany(
            { _id: { $in: otherFields.batchIds } },
            { $addToSet: { trainers: user._id } },
            { session }
          );
        } catch (error) {
          console.error('Batch assignment error:', error);
          await session.abortTransaction();
          session.endSession();
          
          return res.status(400).json({
            success: false,
            message: 'Error assigning trainer to batches',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
        }
      }

      await session.commitTransaction();
      session.endSession();

      // Return user with generated credentials (only once)
      const responseUser = user.toObject();
      const responseData = {
        ...responseUser,
        generatedCredentials: {
          username: responseUser.username,
          password: password // Only time the password is returned
        }
      };
      delete responseUser.password;
      delete responseUser.refreshToken;

      res.status(201).json({
        success: true,
        message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully`,
        data: responseData
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Create user error:', err);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  })
]);

/**
 * @route   GET /api/admin/users/template
 * @desc    Download user upload template
 * @access  Private (Admin)
 */
router.get('/users/template', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to download templates'
    });
  }

  try {
    // Create a sample workbook
    const wb = xlsx.utils.book_new();
    const wsData = [
      ['firstName', 'lastName', 'email', 'role', 'batchId', 'rollNumber', 'department', 'phoneNumber'],
      ['John', 'Doe', 'john.doe@example.com', 'student', '60d21b4667d0d8992e610c85', 'STU2023001', 'Computer Science', '1234567890'],
      ['Jane', 'Smith', 'jane.smith@example.com', 'trainer', '60d21b4667d0d8992e610c85,60d21b4667d0d8992e610c86', '', 'Computer Science', '9876543210'],
      ['Mike', 'Johnson', 'mike.j@example.com', 'faculty', '', '', 'Mathematics', '5551234567']
    ];
    
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    xlsx.utils.book_append_sheet(wb, ws, 'Users');
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=user_upload_template.xlsx');
    
    // Send the file
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (err) {
    console.error('Template download error:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating template',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filtering and pagination
 * @access  Private (Admin)
 */
router.get('/users', [
  auth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view users'
      });
    }

    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Build filter
      const filter = { role: { $ne: 'superadmin' } }; // Don't show superadmins
      if (req.query.role) filter.role = req.query.role;
      if (req.query.isActive) filter.isActive = req.query.isActive === 'true';
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { rollNumber: searchRegex }
        ];
      }

      // Get users with pagination
      const [users, total] = await Promise.all([
        User.find(filter)
          .select('-password -refreshToken')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter)
      ]);

      // Populate additional data based on role
      const populatedUsers = await Promise.all(users.map(async user => {
        if (user.role === 'student') {
          const student = await Student.findOne({ user: user._id })
            .populate('batch', 'name code')
            .lean();
          return { ...user, studentDetails: student };
        } else if (user.role === 'trainer') {
          const batches = await Batch.find({ trainers: user._id }, 'name code').lean();
          return { ...user, batches };
        }
        return user;
      }));

      res.json({
        success: true,
        data: {
          users: populatedUsers,
          pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit
          }
        }
      });
    } catch (err) {
      console.error('Get users error:', err);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  })
]);

/**
 * @route   PUT /api/admin/users/reset-password/:userId
 * @desc    Reset user password
 * @access  Private (Admin)
 */
router.put('/users/reset-password/:userId', [
  auth,
  [
    check('sendEmail', 'sendEmail must be a boolean').optional().isBoolean()
  ],
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reset passwords'
      });
    }

    const { userId } = req.params;
    const { sendEmail = false } = req.body;
    
    // Generate a strong password
    const newPassword = generateStrongPassword(12);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          password: hashedPassword,
          passwordChangedAt: Date.now()
        },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // TODO: Implement email sending logic if sendEmail is true
      
      res.json({
        success: true,
        message: 'Password reset successfully',
        data: {
          newPassword: sendEmail ? undefined : newPassword
        }
      });
    } catch (err) {
      console.error('Password reset error:', err);
      res.status(500).json({
        success: false,
        message: 'Error resetting password',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  })
]);

/**
 * @route   PUT /api/admin/users/:userId
 * @desc    Update a user
 * @access  Private (Admin)
 */
router.put('/users/:userId', [
  auth,
  [
    check('email', 'Please include a valid email').optional().isEmail(),
    check('password', 'Password must be at least 6 characters').optional().isLength({ min: 6 }),
    check('firstName', 'First name is required').optional().notEmpty(),
    check('lastName', 'Last name is required').optional().notEmpty(),
    check('role', 'Valid role is required').optional().isIn(['student', 'trainer', 'faculty']),
    check('isActive', 'isActive must be a boolean').optional().isBoolean(),
    check('batchId', 'Batch ID must be a valid MongoDB ID').optional().isMongoId(),
    check('batchIds', 'Batch IDs must be an array').optional().isArray(),
    check('batchIds.*', 'Invalid batch ID').optional().isMongoId()
  ],
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update users'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const session = await User.startSession();
    session.startTransaction();

    try {
      const { userId } = req.params;
      const updateFields = { ...req.body };

      // Don't allow updating to superadmin
      if (updateFields.role === 'superadmin') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Cannot assign superadmin role'
        });
      }

      // Find user
      let user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Handle password update
      if (updateFields.password) {
        const salt = await bcrypt.genSalt(10);
        updateFields.password = await bcrypt.hash(updateFields.password, salt);
      }

      // Update user fields
      Object.assign(user, updateFields);
      await user.save({ session });

      // Handle student-specific updates
      if (user.role === 'student' && updateFields.studentDetails) {
        await Student.findOneAndUpdate(
          { user: user._id },
          { $set: updateFields.studentDetails },
          { session, new: true, upsert: true }
        );
      }

      // Handle trainer batch assignments
      if (user.role === 'trainer' && Array.isArray(updateFields.batchIds)) {
        // Remove from all batches first
        await Batch.updateMany(
          { trainers: user._id },
          { $pull: { trainers: user._id } },
          { session }
        );
        // Add to selected batches
        if (updateFields.batchIds.length > 0) {
          await Batch.updateMany(
            { _id: { $in: updateFields.batchIds } },
            { $addToSet: { trainers: user._id } },
            { session }
          );
        }
      }

      await session.commitTransaction();
      session.endSession();

      // Return updated user without sensitive data
      user = user.toObject();
      delete user.password;
      delete user.refreshToken;

      res.json({
        success: true,
        message: 'User updated successfully',
        data: user
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Update user error:', err);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  })
]);

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user (student/trainer/faculty)
 * @access  Private (Admin)
 */
/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user (student/trainer/faculty)
 * @access  Private (Super Admin only)
 */
router.delete('/users/:userId', [
  auth,
  asyncHandler(async (req, res) => {
    // Only super admin can delete users
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can delete users'
      });
    }

    const session = await User.startSession();
    session.startTransaction();

    try {
      const { userId } = req.params;

      // Don't allow deleting yourself
      if (userId === req.user._id.toString()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'You cannot delete your own account'
        });
      }

      // Find the user first to determine their role
      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Don't allow deleting superadmins
      if (user.role === 'superadmin') {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          success: false,
          message: 'Cannot delete superadmin accounts'
        });
      }

      // Handle role-specific cleanup
      if (user.role === 'student') {
        // Remove from batch
        await Batch.updateMany(
          { students: user._id },
          { $pull: { students: user._id } },
          { session }
        );
        
        // Delete student record
        await Student.deleteOne({ user: user._id }).session(session);
      } else if (user.role === 'trainer') {
        // Remove from batches
        await Batch.updateMany(
          { trainers: user._id },
          { $pull: { trainers: user._id } },
          { session }
        );
        
        // Remove from courses
        await Course.updateMany(
          { instructors: user._id },
          { $pull: { instructors: user._id } },
          { session }
        );
      } else if (user.role === 'faculty') {
        // Remove from courses
        await Course.updateMany(
          { faculty: user._id },
          { $unset: { faculty: 1 } },
          { session }
        );
      }

      // Delete the user
      await User.findByIdAndDelete(userId).session(session);

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} deleted successfully`
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Delete user error:', err);
      return res.status(500).json({
        success: false,
        message: 'Error deleting user',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  })
]);

/**
 * Generate a unique username
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @returns {Promise<string>} Generated username
 */
async function generateUniqueUsername(firstName, lastName) {
  let username, isUnique = false, attempts = 0;
  const maxAttempts = 5;
  
  while (!isUnique && attempts < maxAttempts) {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase().charAt(0)}`;
    username = `${baseUsername}${randomSuffix}`.substring(0, 20);
    
    const exists = await User.findOne({ username });
    if (!exists) isUnique = true;
    attempts++;
  }
  
  if (!isUnique) {
    // Fallback to UUID if we can't generate a unique username
    return `user_${uuidv4().substring(0, 8)}`;
  }
  
  return username;
}

/**
 * Generate a strong password with the specified length
 * @param {number} length - Length of the password
 * @returns {string} Generated password
 */
function generateStrongPassword(length = 10) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\\\:;?><,./-=';
  let password = '';
  
  // Ensure at least one of each character type
  const requirements = [
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '0123456789',
    '!@#$%^&*()_+~`|}{[]\\\\:;?><,./-='
  ];
  
  // Add one character from each requirement
  requirements.forEach(charset => {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  });
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

module.exports = router;
