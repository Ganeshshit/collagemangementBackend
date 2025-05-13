const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const { check, validationResult, param, body } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const User = require('../models/User');
const Report = require('../models/Report');
const Assignment = require('../models/Assignment');
const asyncHandler = require('../middleware/async');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/uploads/student');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `student-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only document and image files are allowed'));
    }
  }
}).single('file');

// Using asyncHandler imported from middleware

// Validation middleware
const validateStudent = [
  body('firstName', 'First name is required').not().isEmpty().trim().escape(),
  body('lastName', 'Last name is required').not().isEmpty().trim().escape(),
  body('email', 'Please include a valid email').isEmail().normalizeEmail(),
  body('rollNumber', 'Roll number is required').not().isEmpty().trim(),
  body('branch', 'Branch is required').not().isEmpty().trim().escape(),
  body('semester', 'Semester must be a number between 1 and 8').isInt({ min: 1, max: 8 }),
  body('academicYear', 'Academic year is required').not().isEmpty().trim(),
  body('phoneNumber', 'Please include a valid phone number').isMobilePhone(),
  body('gender', 'Gender is required').isIn(['male', 'female', 'other'])
];

/**
 * @route   GET /api/student/profile/:id
 * @desc    Get student profile by ID
 * @access  Private (Student - own profile, Faculty, Admin)
 */
router.get('/profile/:id', 
  auth,
  [
    param('id', 'Please include a valid student ID').isMongoId()
  ],
  asyncHandler(async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

  const userId = req.params.id;
  
  // Check if user is authorized to view this profile
  if (req.user.role === 'student' && req.user._id.toString() !== userId) {
    return res.status(403).json({ 
      success: false,
      message: 'Not authorized to view this profile'
    });
  }

  const user = await User.findById(userId)
    .select('-password')
    .populate({
      path: 'studentInfo',
      select: 'rollNumber branch semester academicYear gender dateOfBirth address phoneNumber parentInfo'
    })
    .populate({
      path: 'assignedFaculty',
      select: 'firstName lastName email phoneNumber department'
    });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }


  // Prepare response data
  const responseData = {
    success: true,
    data: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatar: user.avatar,
      status: user.status || 'active',
      role: user.role,
      studentInfo: {
        rollNumber: user.studentInfo?.rollNumber,
        branch: user.studentInfo?.branch,
        semester: user.studentInfo?.semester,
        academicYear: user.studentInfo?.academicYear,
        gender: user.studentInfo?.gender,
        dateOfBirth: user.studentInfo?.dateOfBirth,
        phoneNumber: user.studentInfo?.phoneNumber,
        address: user.studentInfo?.address,
        admissionDate: user.studentInfo?.admissionDate,
        parentInfo: user.studentInfo?.parentInfo || {}
      },
      assignedFaculty: user.assignedFaculty,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  };

  res.status(200).json(responseData);
}));

/**
 * @route   PUT /api/student/profile/:id
 * @desc    Update student profile
 * @access  Private (Student - own profile, Admin)
 */
router.put('/profile/:id',
  auth,
  upload,
  [
    param('id', 'Please include a valid student ID').isMongoId(),
    body('firstName', 'First name is required').optional().trim().escape(),
    body('lastName', 'Last name is required').optional().trim().escape(),
    body('email', 'Please include a valid email').optional().isEmail().normalizeEmail(),
    body('studentInfo.phoneNumber', 'Please include a valid phone number').optional().isMobilePhone(),
    body('studentInfo.address', 'Address is required').optional().trim().escape()
  ],
  asyncHandler(async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

  const userId = req.params.id;
  
  // Check authorization
  if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this profile'
    });
  }

  // Handle file upload if present
  if (req.file) {
    // Delete old avatar if exists
    if (req.user.avatar) {
      const oldAvatarPath = path.join(__dirname, '..', req.user.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }
    req.body.avatar = `/uploads/student/${req.file.filename}`;
  }

  // Prepare update data
  const updateData = {};
  const allowedFields = ['firstName', 'lastName', 'email', 'avatar', 'status'];
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  // Handle student info updates
  if (req.body.studentInfo) {
    updateData.studentInfo = req.user.studentInfo || {};
    const studentInfoFields = [
      'phoneNumber', 'gender', 'dateOfBirth', 'address',
      'emergencyContact', 'bloodGroup', 'aadharNumber', 'panNumber'
    ];

    studentInfoFields.forEach(field => {
      if (req.body.studentInfo[field] !== undefined) {
        updateData.studentInfo[field] = req.body.studentInfo[field];
      }
    });
  }

  // Update user in database
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  )
  .select('-password')
  .populate({
    path: 'studentInfo',
    select: 'rollNumber branch semester academicYear gender dateOfBirth address'
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  // Also update in Student collection if exists
  if (user.studentInfo?.rollNumber) {
    const studentUpdate = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.studentInfo?.branch,
      semester: user.studentInfo?.semester,
      academicYear: user.studentInfo?.academicYear,
      phoneNumber: user.studentInfo?.phoneNumber,
      gender: user.studentInfo?.gender,
      dateOfBirth: user.studentInfo?.dateOfBirth,
      address: user.studentInfo?.address
    };

    await Student.findOneAndUpdate(
      { rollNumber: user.studentInfo.rollNumber },
      { $set: studentUpdate },
      { new: true, runValidators: true }
    );
  }

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: user
  });
}));

// @route   GET /api/student/all
// @desc    Get all students (for admin/faculty)
// @access  Private (Faculty, Admin)
router.get('/all', 
  auth,
  async (req, res) => {
    // Check if user is authorized
    if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view all students' 
      });
    }
  try {

    const students = await User.find({ role: 'student' })
      .select('-password')
      .populate({
        path: 'studentInfo',
        select: 'rollNumber branch semester'
      });

    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/student/roll/:rollNumber
// @desc    Get student by roll number
// @access  Private (Faculty, Admin, Student - own record)
router.get('/roll/:rollNumber',
  auth,
  async (req, res) => {
    try {
      // Check if user is authorized
      if (req.user.role === 'student' && req.user.studentInfo?.rollNumber !== req.params.rollNumber) {
        return res.status(403).json({ 
          success: false,
          message: 'Not authorized to view this student' 
        });
      }
      
      const { rollNumber } = req.params;

    // Find student by roll number
    const student = await Student.findOne({ rollNumber })
      .populate('assignedFaculty', 'firstName lastName email');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if user is authorized
    if (req.user.role === 'student' && req.user.studentInfo?.rollNumber !== rollNumber) {
      return res.status(403).json({ message: 'Not authorized to view this student' });
    }

    res.json(student);
  } catch (error) {
    console.error('Error fetching student by roll number:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/student/performance/:studentId
// @desc    Get student's academic performance
// @access  Private (Student - own record, Faculty, Admin)
router.get('/performance/:studentId',
  auth,
  async (req, res) => {
    try {
      const { studentId } = req.params;

      // Check if user is authorized
      if (req.user.role === 'student' && req.user._id.toString() !== studentId) {
        return res.status(403).json({ 
          success: false,
          message: 'Not authorized to view this information' 
        });
      }

    // Get student's reports
    const reports = await Report.find({ student: studentId })
      .select('title semester academicYear status comments')
      .sort({ academicYear: 1, semester: 1 });

    // Get student's basic info
    const student = await User.findById(studentId)
      .select('firstName lastName studentInfo')
      .populate({
        path: 'studentInfo',
        select: 'rollNumber branch semester'
      });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Calculate performance metrics
    const performance = {
      student: {
        name: `${student.firstName} ${student.lastName}`,
        rollNumber: student.studentInfo?.rollNumber || 'N/A',
        branch: student.studentInfo?.branch || 'N/A',
        currentSemester: student.studentInfo?.semester || 'N/A'
      },
      totalReports: reports.length,
      submittedReports: reports.filter(r => r.status === 'submitted').length,
      reviewedReports: reports.filter(r => r.status === 'reviewed').length,
      reportsBySemester: {}
    };

    // Group reports by semester
    reports.forEach(report => {
      const key = `Semester ${report.semester}`;
      if (!performance.reportsBySemester[key]) {
        performance.reportsBySemester[key] = [];
      }
      performance.reportsBySemester[key].push({
        title: report.title,
        status: report.status,
        comments: report.comments.length,
        academicYear: report.academicYear
      });
    });

    res.json(performance);
  } catch (error) {
    console.error('Error fetching student performance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/student/academic/:studentId
// @desc    Update student's academic details (admin/faculty only)
// @access  Private (Faculty, Admin)
router.put('/academic/:studentId', 
  [
    auth,
    check('semester', 'Semester must be between 1 and 8').isInt({ min: 1, max: 8 }),
    check('branch', 'Branch is required').notEmpty(),
    check('academicYear', 'Academic year is required').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Check if user is authorized
      if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
        return res.status(403).json({ message: 'Not authorized to update academic details' });
      }

      const { studentId } = req.params;
      const { semester, branch, academicYear } = req.body;

      // Update student's academic info in User model
      const updatedUser = await User.findByIdAndUpdate(
        studentId,
        {
          $set: {
            'studentInfo.semester': semester,
            'studentInfo.branch': branch,
            'studentInfo.academicYear': academicYear
          }
        },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(404).json({ message: 'Student not found' });
      }

      // Also update in Student model if exists
      if (updatedUser.studentInfo?.rollNumber) {
        await Student.findOneAndUpdate(
          { rollNumber: updatedUser.studentInfo.rollNumber },
          {
            $set: {
              semester,
              department: branch,
              academicYear
            }
          }
        );
      }

      res.json({
        message: 'Academic details updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Error updating academic details:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   DELETE /api/student/:studentId
// @desc    Delete a student account (admin only)
// @access  Private (Admin)
router.delete('/:studentId', 
  auth,
  async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          message: 'Not authorized to delete accounts' 
        });
      }

    const { studentId } = req.params;

    // Find and delete user
    const deletedUser = await User.findByIdAndDelete(studentId);
    if (!deletedUser) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Also delete from Student model if exists
    if (deletedUser.studentInfo?.rollNumber) {
      await Student.findOneAndDelete({ rollNumber: deletedUser.studentInfo.rollNumber });
    }

    // Optionally: Delete related reports, assignments, etc.
    await Report.deleteMany({ student: studentId });

    res.json({ message: 'Student account deleted successfully' });
  } catch (error) {
    console.error('Error deleting student account:', error);

    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
