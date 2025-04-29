const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
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
// @desc    Get all reports for faculty
router.get('/faculty', auth, async (req, res) => {
  try {
    const students = await Student.find({ assignedFaculty: req.user._id });
    const studentIds = students.map(student => student._id);
    
    const reports = await Report.find({ student: { $in: studentIds } })
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName')
      .sort({ submissionDate: -1 });
    
    res.json(reports);
  } catch (err) {
    console.error('Get faculty reports error:', err);
    res.status(500).json({ message: 'Server error' });
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
// @desc    Create a new report
router.post('/', [auth, upload.single('reportFile')], async (req, res) => {
  try {
    const { student, title, description, semester, academicYear } = req.body;

    // Verify student exists and user has access
    const studentDoc = await Student.findById(student);
    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (studentDoc.assignedFaculty.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
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
      } : undefined
    });

    await report.save();
    
    const populatedReport = await Report.findById(report._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName');

    res.status(201).json(populatedReport);
  } catch (err) {
    console.error('Create report error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/reports/:id/comments
// @desc    Add a comment to a report
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const student = await Student.findById(report.student);
    if (student.assignedFaculty.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    report.comments.push({
      user: req.user._id,
      text: req.body.text
    });

    await report.save();

    const updatedReport = await Report.findById(report._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('createdBy', 'firstName lastName')
      .populate('comments.user', 'firstName lastName');

    res.json(updatedReport);
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ message: 'Server error' });
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

module.exports = router;
