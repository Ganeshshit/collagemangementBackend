const express = require('express');
const Assignment = require('../models/Assignment');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all assignments for a course
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ course: req.params.courseId })
      .populate('createdBy', 'username email')
      .populate('submissions.student', 'username email');
    
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new assignment (faculty only)
router.post('/', auth, authorize('faculty'), async (req, res) => {
  try {
    const assignment = new Assignment({
      ...req.body,
      createdBy: req.user._id
    });

    await assignment.save();
    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit assignment (student only)
router.post('/:id/submit', auth, authorize('student'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if already submitted
    const existingSubmission = assignment.submissions.find(
      sub => sub.student.toString() === req.user._id.toString()
    );

    if (existingSubmission) {
      return res.status(400).json({ message: 'Already submitted' });
    }

    // Check if past due date
    const status = new Date() > assignment.dueDate ? 'late' : 'submitted';

    assignment.submissions.push({
      student: req.user._id,
      fileUrl: req.body.fileUrl,
      status
    });

    await assignment.save();
    res.status(201).json({ message: 'Assignment submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Grade assignment (faculty only)
router.post('/:id/grade/:studentId', auth, authorize('faculty'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const submission = assignment.submissions.find(
      sub => sub.student.toString() === req.params.studentId
    );

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    submission.grade = req.body.grade;
    submission.feedback = req.body.feedback;
    submission.status = 'graded';

    await assignment.save();
    res.json({ message: 'Assignment graded successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student's assignments
router.get('/my-assignments', auth, authorize('student'), async (req, res) => {
  try {
    const assignments = await Assignment.find({
      'submissions.student': req.user._id
    })
      .populate('course', 'title')
      .populate('createdBy', 'username');
    
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
