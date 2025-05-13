const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Report = require('../models/Report');
const Student = require('../models/Student');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/reports';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and DOC files are allowed.'));
    }
  }
});

// @route   GET /api/reports/faculty
// @desc    Get all reports for faculty with filtering and pagination
router.get('/faculty', auth, async (req, res) => {
  try {
    const { status, studentId, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Build query for assigned students
    const students = await Student.find({ assignedFaculty: req.user._id });
    const studentIds = students.map(student => student._id);
    
    if (studentIds.length === 0) {
      return res.json({
        success: true,
        count: 0,
        pagination: {},
        data: []
      });
    }

    // Build the query
    const query = { student: { $in: studentIds } };
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }
    
    // Add student filter if provided
    if (studentId) {
      if (!studentIds.includes(studentId)) {
        return res.status(403).json({ 
          success: false,
          message: 'Not authorized to view reports for this student' 
        });
      }
      query.student = studentId;
    }

    // Execute query with pagination
    const reports = await Report.find(query)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName')
      .populate('comments.user', 'firstName lastName')
      .sort({ submissionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Report.countDocuments(query);

    res.json({
      success: true,
      count: reports.length,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total
      },
      data: reports
    });
  } catch (err) {
    console.error('Get faculty reports error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// @route   GET /api/reports/:id
// @desc    Get report by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName')
      .populate('comments.user', 'firstName lastName');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Check if user has access to this report
    const student = await Student.findById(report.student);
    if (student.assignedFaculty.toString() !== req.user._id.toString() &&
        report.createdBy.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(report);
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/reports
// @desc    Create a new report (for teachers/admins)
router.post('/', [auth, upload.single('reportFile')], async (req, res) => {
  try {
    const { student, title, description, semester, academicYear } = req.body;

    // Input validation
    if (!student || !title || !description || !semester || !academicYear) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Only teachers and admins can create reports for students
    if (req.user.role === 'student') {
      return res.status(403).json({ message: 'Students cannot create reports for others' });
    }

    // Verify student exists
    const studentDoc = await Student.findById(student);
    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if the teacher is assigned to this student or is an admin
    if (studentDoc.assignedFaculty.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to create reports for this student' });
    }

    const report = new Report({
      student,
      title,
      description,
      semester,
      academicYear,
      createdBy: req.user._id,
      reportFile: req.file ? {
        filename: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : undefined,
      status: 'submitted'
    });

    await report.save();

    const populatedReport = await Report.findById(report._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName');

    res.status(201).json(populatedReport);
  } catch (err) {
    console.error('Create report error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/reports/student
// @desc    Submit a report (for students)
router.post('/student', [auth, upload.single('reportFile')], async (req, res) => {
  try {
    // Only students can submit their own reports
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can submit reports using this endpoint' });
    }

    const { title, description, semester, academicYear } = req.body;

    // Input validation
    if (!title || !description || !semester || !academicYear || !req.file) {
      return res.status(400).json({ 
        message: 'Please provide all required fields including the report file' 
      });
    }

    // Get the student's record
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const report = new Report({
      student: student._id,
      title,
      description,
      semester,
      academicYear,
      createdBy: req.user._id,
      reportFile: {
        filename: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size
      },
      status: 'submitted'
    });

    await report.save();

    const populatedReport = await Report.findById(report._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName');

    res.status(201).json({
      message: 'Report submitted successfully',
      report: populatedReport
    });
  } catch (err) {
    console.error('Student report submission error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/reports/:id/comments
// @desc    Add a comment to a report
router.post('/:id/comments', [
  auth,
  body('text', 'Comment text is required').notEmpty().trim().escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ 
        success: false,
        message: 'Report not found' 
      });
    }

    // Check if user is authorized to comment (trainer assigned to student or admin)
    const student = await Student.findById(report.student);
    if (student.assignedFaculty.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to comment on this report' 
      });
    }

    const comment = {
      user: req.user._id,
      text: req.body.text,
      createdAt: new Date()
    };

    report.comments.push(comment);
    
    // If this is the first comment from trainer, mark report as reviewed
    if (report.status === 'submitted' && req.user.role !== 'student') {
      report.status = 'reviewed';
    }

    await report.save();

    // Get the saved comment with user details
    const updatedReport = await Report.findById(report._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName')
      .populate('comments.user', 'firstName lastName avatar')
      .lean();

    // Get the newly added comment (last one in the array)
    const newComment = updatedReport.comments[updatedReport.comments.length - 1];

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: {
        reportId: report._id,
        comment: newComment
      }
    });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// @route   GET /api/reports/download/:id
// @desc    Download a report file
router.get('/download/:id', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report || !report.reportFile) {
      return res.status(404).json({ message: 'Report file not found' });
    }

    const student = await Student.findById(report.student);
    if (student.assignedFaculty.toString() !== req.user._id.toString() &&
        report.createdBy.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.download(report.reportFile.path, report.reportFile.filename);
  } catch (err) {
    console.error('Download report error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/student/:studentId
// @desc    Get all reports for a specific student (for trainers)
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Check if the trainer is assigned to this student
    const student = await Student.findById(studentId)
      .select('assignedFaculty')
      .populate('assignedFaculty', '_id');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Verify the trainer is assigned to this student or is an admin
    if (student.assignedFaculty._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view reports for this student'
      });
    }

    // Build query
    const query = { student: studentId };
    if (status) {
      query.status = status;
    }

    // Get paginated reports
    const reports = await Report.find(query)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName')
      .populate('comments.user', 'firstName lastName avatar')
      .sort({ submissionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Report.countDocuments(query);

    res.json({
      success: true,
      count: reports.length,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total
      },
      data: reports
    });
  } catch (err) {
    console.error('Get student reports error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// @route   PATCH /api/reports/:id/status
// @desc    Update report status (e.g., submitted, reviewed, approved, rejected)
router.patch('/:id/status', [
  auth,
  body('status', 'Status is required')
    .isIn(['submitted', 'reviewed', 'approved', 'rejected', 'needs_revision'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { status } = req.body;
    const report = await Report.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check if user is authorized to update status
    const student = await Student.findById(report.student);
    const isAssignedTrainer = student.assignedFaculty && 
                            student.assignedFaculty.toString() === req.user._id.toString();
    
    if (!isAssignedTrainer && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this report status'
      });
    }

    // Update status
    report.status = status;
    report.updatedAt = new Date();
    
    // Add status change to history
    report.statusHistory = report.statusHistory || [];
    report.statusHistory.push({
      status,
      changedBy: req.user._id,
      changedAt: new Date(),
      comment: req.body.comment || ''
    });

    await report.save();

    // Populate the updated report
    const updatedReport = await Report.findById(report._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName')
      .populate('comments.user', 'firstName lastName avatar')
      .populate('statusHistory.changedBy', 'firstName lastName');

    res.json({
      success: true,
      message: `Report status updated to ${status}`,
      data: updatedReport
    });
  } catch (err) {
    console.error('Update report status error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;
