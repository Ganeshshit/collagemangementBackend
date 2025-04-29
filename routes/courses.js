const express = require('express');
const Course = require('../models/Course');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all courses (with filters)
router.get('/', auth, async (req, res) => {
  try {
    const { status, instructor } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (instructor) filter.instructor = instructor;

    // If student, only show enrolled courses
    if (req.user.role === 'student') {
      filter.students = req.user._id;
    }

    const courses = await Course.find(filter)
      .populate('instructor', 'username email')
      .populate('students', 'username email');
    
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new course (faculty/admin only)
router.post('/', auth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    const course = new Course({
      ...req.body,
      instructor: req.user._id
    });

    await course.save();
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get course by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('instructor', 'username email')
      .populate('students', 'username email');
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update course (instructor or admin only)
router.put('/:id', auth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is instructor or admin
    if (req.user.role !== 'admin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    Object.assign(course, req.body);
    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Enroll in course (student only)
router.post('/:id/enroll', auth, authorize('student'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (course.students.includes(req.user._id)) {
      return res.status(400).json({ message: 'Already enrolled' });
    }

    course.students.push(req.user._id);
    await course.save();
    res.json({ message: 'Enrolled successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add course material (instructor only)
router.post('/:id/materials', auth, authorize('faculty'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    course.materials.push(req.body);
    await course.save();
    res.status(201).json(course.materials[course.materials.length - 1]);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
