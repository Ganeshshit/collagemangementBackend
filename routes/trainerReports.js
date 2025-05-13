const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Report = require('../models/Report');
const Student = require('../models/Student');
const asyncHandler = require('../middleware/async');

/**
 * @route   GET /api/trainer/reports
 * @desc    Get all reports for students assigned to the trainer
 * @access  Private (Trainer)
 */
router.get('/reports', auth, asyncHandler(async (req, res) => {
  // Only trainers can access this endpoint
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access trainer reports'
    });
  }

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

  // Build the base query
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
}));

/**
 * @route   GET /api/trainer/reports/student/:studentId
 * @desc    Get all reports for a specific student (for trainers)
 * @access  Private (Trainer)
 */
router.get('/reports/student/:studentId', auth, asyncHandler(async (req, res) => {
  // Only trainers can access this endpoint
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access student reports'
    });
  }

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

  // Verify the trainer is assigned to this student
  if (student.assignedFaculty._id.toString() !== req.user._id.toString()) {
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
}));

/**
 * @route   GET /api/trainer/reports/:id
 * @desc    Get a specific report with details
 * @access  Private (Trainer)
 */
router.get('/reports/:id', auth, asyncHandler(async (req, res) => {
  // Only trainers can access this endpoint
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this report'
    });
  }

  const report = await Report.findById(req.params.id)
    .populate('student', 'firstName lastName rollNumber')
    .populate('createdBy', 'firstName lastName')
    .populate('comments.user', 'firstName lastName avatar')
    .populate('statusHistory.changedBy', 'firstName lastName');

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found'
    });
  }

  // Check if the trainer is assigned to the student who owns this report
  const student = await Student.findById(report.student._id);
  if (student.assignedFaculty.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this report'
    });
  }

  res.json({
    success: true,
    data: report
  });
}));

/**
 * @route   POST /api/trainer/reports/:id/comments
 * @desc    Add a comment to a report
 * @access  Private (Trainer)
 */
router.post('/reports/:id/comments', [
  auth,
  check('text', 'Comment text is required').notEmpty().trim().escape()
], asyncHandler(async (req, res) => {
  // Only trainers can access this endpoint
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to comment on reports'
    });
  }

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

  // Check if the trainer is assigned to the student who owns this report
  const student = await Student.findById(report.student);
  if (student.assignedFaculty.toString() !== req.user._id.toString()) {
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
  if (report.status === 'submitted') {
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
}));

/**
 * @route   PATCH /api/trainer/reports/:id/status
 * @desc    Update report status (e.g., reviewed, approved, rejected, needs_revision)
 * @access  Private (Trainer)
 */
router.patch('/reports/:id/status', [
  auth,
  check('status', 'Status is required')
    .isIn(['reviewed', 'approved', 'rejected', 'needs_revision'])
], asyncHandler(async (req, res) => {
  // Only trainers can access this endpoint
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update report status'
    });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { status, comment } = req.body;
  
  const report = await Report.findById(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found'
    });
  }

  // Check if the trainer is assigned to the student who owns this report
  const student = await Student.findById(report.student);
  if (student.assignedFaculty.toString() !== req.user._id.toString()) {
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
    comment: comment || ''
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
}));

module.exports = router;
