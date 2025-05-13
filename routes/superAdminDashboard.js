const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const asyncHandler = require('../middleware/async');
const {
  User,
  Student,
  Course,
  Batch,
  Assignment,
  Attendance,
  Report
} = require('../models');
const mongoose = require('mongoose');

/**
 * @route   GET /api/super-admin/overview
 * @desc    Get system overview statistics
 * @access  Private (Super Admin)
 */
router.get('/overview', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access super admin resources'
    });
  }

  try {
    const [
      usersCount,
      activeUsersCount,
      studentsCount,
      trainersCount,
      facultyCount,
      adminsCount,
      batchesCount,
      activeBatchesCount,
      coursesCount,
      activeCoursesCount,
      assignmentsCount,
      recentActivity
    ] = await Promise.all([
      // User statistics
      User.countDocuments({}),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'trainer' }),
      User.countDocuments({ role: 'faculty' }),
      User.countDocuments({ role: 'admin' }),
      
      // Batch statistics
      Batch.countDocuments({}),
      Batch.countDocuments({ isActive: true }),
      
      // Course statistics
      Course.countDocuments({}),
      Course.countDocuments({ isActive: true }),
      
      // Assignment statistics
      Assignment.countDocuments({}),
      
      // Recent activity
      User.aggregate([
        { $match: { lastLogin: { $exists: true } } },
        { $sort: { lastLogin: -1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 1,
            name: { $concat: ['$firstName', ' ', '$lastName'] },
            email: 1,
            role: 1,
            lastLogin: 1,
            isActive: 1
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: usersCount,
          active: activeUsersCount,
          byRole: {
            students: studentsCount,
            trainers: trainersCount,
            faculty: facultyCount,
            admins: adminsCount
          }
        },
        batches: {
          total: batchesCount,
          active: activeBatchesCount
        },
        courses: {
          total: coursesCount,
          active: activeCoursesCount
        },
        assignments: {
          total: assignmentsCount
        },
        recentActivity
      }
    });
  } catch (err) {
    console.error('Super admin overview error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   GET /api/super-admin/users
 * @desc    Get all users with filtering and pagination
 * @access  Private (Super Admin)
 */
router.get('/users', [
  auth,
  check('page', 'Page number must be a positive integer').optional().isInt({ min: 1 }),
  check('limit', 'Limit must be a positive integer').optional().isInt({ min: 1, max: 100 }),
  check('role', 'Invalid role').optional().isIn(['student', 'trainer', 'faculty', 'admin']),
  check('isActive', 'isActive must be a boolean').optional().isBoolean(),
  check('search', 'Search query must be a string').optional().isString().trim()
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access user management'
    });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
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

    res.json({
      success: true,
      data: {
        users,
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
}));

/**
 * @route   GET /api/super-admin/batches
 * @desc    Get all batches with statistics
 * @access  Private (Super Admin)
 */
router.get('/batches', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access batch data'
    });
  }

  try {
    const batches = await Batch.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'trainers',
          foreignField: '_id',
          as: 'trainers'
        }
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: 'batchId',
          as: 'courses'
        }
      },
      {
        $project: {
          name: 1,
          code: 1,
          startDate: 1,
          endDate: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          trainerCount: { $size: '$trainers' },
          studentCount: { $size: '$students' },
          courseCount: { $size: '$courses' },
          durationWeeks: {
            $ceil: {
              $divide: [
                { $subtract: ['$endDate', '$startDate'] },
                7 * 24 * 60 * 60 * 1000 // Convert ms to weeks
              ]
            }
          }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json({
      success: true,
      data: batches
    });
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   GET /api/super-admin/system-health
 * @desc    Get system health and metrics
 * @access  Private (Super Admin)
 */
router.get('/system-health', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access system health'
    });
  }

  try {
    // Get database stats
    const dbStats = await mongoose.connection.db.stats();
    
    // Get collection counts
    const [users, batches, courses, assignments, attendances, reports] = await Promise.all([
      User.countDocuments(),
      Batch.countDocuments(),
      Course.countDocuments(),
      Assignment.countDocuments(),
      Attendance.countDocuments(),
      Report.countDocuments()
    ]);

    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      success: true,
      data: {
        database: {
          name: dbStats.db,
          collections: dbStats.collections,
          objects: dbStats.objects,
          avgObjSize: dbStats.avgObjSize,
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize,
          fileSize: dbStats.fileSize
        },
        collections: {
          users,
          batches,
          courses,
          assignments,
          attendances,
          reports
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external
          },
          uptime: {
            hours: Math.floor(uptime / 3600),
            minutes: Math.floor((uptime % 3600) / 60),
            seconds: Math.floor(uptime % 60)
          }
        }
      }
    });
  } catch (err) {
    console.error('System health check error:', err);
    res.status(500).json({
      success: false,
      message: 'Error checking system health',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   POST /api/super-admin/users
 * @desc    Create a new user (admin, faculty, trainer)
 * @access  Private (Super Admin)
 */
router.post('/users', [
  auth,
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
  check('firstName', 'First name is required').notEmpty(),
  check('lastName', 'Last name is required').notEmpty(),
  check('role', 'Valid role is required').isIn(['admin', 'faculty', 'trainer']),
  check('isActive', 'isActive must be a boolean').optional().isBoolean()
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') {
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

  try {
    const { email, password, firstName, lastName, role, isActive = true } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create user
    user = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      isActive,
      createdBy: req.user._id
    });

    await user.save();

    // Return user without password
    user = user.toObject();
    delete user.password;
    delete user.refreshToken;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   PUT /api/super-admin/users/:userId
 * @desc    Update a user
 * @access  Private (Super Admin)
 */
router.put('/users/:userId', [
  auth,
  check('email', 'Please include a valid email').optional().isEmail(),
  check('password', 'Password must be at least 6 characters').optional().isLength({ min: 6 }),
  check('firstName', 'First name is required').optional().notEmpty(),
  check('lastName', 'Last name is required').optional().notEmpty(),
  check('role', 'Valid role is required').optional().isIn(['admin', 'faculty', 'trainer']),
  check('isActive', 'isActive must be a boolean').optional().isBoolean()
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') {
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

  try {
    const { userId } = req.params;
    const updateFields = { ...req.body };

    // Don't allow updating the superadmin
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update your own role or status'
      });
    }

    // Find user
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields
    if (updateFields.password) {
      user.password = updateFields.password;
      delete updateFields.password;
    }

    Object.assign(user, updateFields);
    await user.save();

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
    console.error('Update user error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   DELETE /api/super-admin/users/:userId
 * @desc    Delete a user (admin, student, trainer, or faculty) with role-specific cleanup
 * @access  Private (Super Admin)
 */
router.delete('/users/:userId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete users'
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;

    // Don't allow deleting yourself
    if (userId === req.user._id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Find the user to be deleted
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Role-specific cleanup
    switch (user.role) {
      case 'admin':
        // Remove from any admin-related collections
        await Batch.updateMany(
          { createdBy: user._id },
          { $set: { createdBy: req.user._id } },
          { session }
        );
        break;

      case 'trainer':
        // Remove from batches and courses
        await Batch.updateMany(
          { trainers: user._id },
          { $pull: { trainers: user._id } },
          { session }
        );

        // Reassign or remove courses
        await Course.updateMany(
          { instructor: user._id },
          { $set: { instructor: null } },
          { session }
        );
        break;

      case 'faculty':
        // Remove faculty references
        await Student.updateMany(
          { assignedFaculty: user._id },
          { $unset: { assignedFaculty: 1 } },
          { session }
        );
        break;

      case 'student':
        // Remove from courses, batches, and submissions
        await Course.updateMany(
          { 'students.student': user._id },
          { $pull: { students: { student: user._id } } },
          { session }
        );

        // Remove submissions
        await Assignment.updateMany(
          { 'submissions.student': user._id },
          { $pull: { submissions: { student: user._id } } },
          { session }
        );

        // Remove attendance records
        await Attendance.deleteMany(
          { student: user._id },
          { session }
        );

        // Delete student profile if exists
        await Student.findOneAndDelete(
          { user: user._id },
          { session }
        );
        break;
    }

    // Finally, delete the user
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
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

module.exports = router;
