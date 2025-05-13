const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const asyncHandler = require('../middleware/async');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const Student = require('../models/Student');
const Batch = require('../models/Batch');
const User = require('../models/User');

/**
 * @route   GET /api/trainer/batches
 * @desc    Get all batches for the trainer
 * @access  Private (Trainer)
 */
router.get('/batches', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access trainer resources'
    });
  }

  try {
    // Get all batches where the user is a trainer
    const batches = await Batch.find({ trainers: req.user._id })
      .select('name description startDate endDate isActive')
      .sort({ startDate: -1 });

    res.json({
      success: true,
      data: batches
    });
  } catch (err) {
    console.error('Get trainer batches error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   GET /api/trainer/batches/:batchId/overview
 * @desc    Get batch overview with statistics
 * @access  Private (Trainer)
 */
router.get('/batches/:batchId/overview', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access batch data'
    });
  }

  try {
    const batchId = req.params.batchId;

    // Verify the trainer has access to this batch
    const batch = await Batch.findOne({
      _id: batchId,
      trainers: req.user._id
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found or access denied'
      });
    }

    // Get batch courses with student progress
    const courses = await Course.aggregate([
      { $match: { batchId: batch._id } },
      {
        $lookup: {
          from: 'assignments',
          localField: '_id',
          foreignField: 'course',
          as: 'assignments'
        }
      },
      {
        $project: {
          title: 1,
          startDate: 1,
          endDate: 1,
          studentCount: { $size: '$students' },
          assignmentCount: { $size: '$assignments' },
          averageProgress: {
            $ifNull: [
              { $avg: '$students.progress' },
              0
            ]
          }
        }
      }
    ]);

    // Get batch students with their overall progress
    const students = await User.aggregate([
      {
        $lookup: {
          from: 'courses',
          let: { studentId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$batchId', batch._id] },
                    { $in: ['$$studentId', '$students.student'] }
                  ]
                }
              }
            },
            {
              $project: {
                progress: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$students',
                        as: 's',
                        cond: { $eq: ['$$s.student', '$$studentId'] }
                      }
                    },
                    0
                  ]
                }
              }
            }
          ],
          as: 'courses'
        }
      },
      {
        $match: {
          'courses': { $not: { $size: 0 } }
        }
      },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          rollNumber: 1,
          coursesCompleted: {
            $size: {
              $filter: {
                input: '$courses',
                as: 'c',
                cond: { $gte: ['$$c.progress.progress', 100] }
              }
            }
          },
          totalCourses: { $size: '$courses' },
          averageProgress: {
            $avg: '$courses.progress.progress'
          },
          lastActive: {
            $max: '$courses.progress.lastAccessed'
          }
        }
      },
      { $sort: { averageProgress: -1 } }
    ]);

    // Calculate batch statistics
    const totalStudents = students.length;
    const totalCourses = courses.length;
    const batchProgress = students.length > 0
      ? students.reduce((sum, s) => sum + (s.averageProgress || 0), 0) / students.length
      : 0;

    res.json({
      success: true,
      data: {
        batch: {
          _id: batch._id,
          name: batch.name,
          description: batch.description,
          startDate: batch.startDate,
          endDate: batch.endDate,
          isActive: batch.isActive,
          totalStudents,
          totalCourses,
          averageProgress: Math.round(batchProgress * 100) / 100,
          completionRate: totalCourses > 0
            ? Math.round((students.filter(s => s.averageProgress >= 100).length / totalStudents) * 100)
            : 0
        },
        courses,
        students: students.map(s => ({
          ...s,
          averageProgress: Math.round(s.averageProgress * 100) / 100
        }))
      }
    });
  } catch (err) {
    console.error('Get batch overview error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   GET /api/trainer/dashboard
 * @desc    Get trainer dashboard overview with batch filtering
 * @access  Private (Trainer)
 */
router.get('/dashboard', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access trainer dashboard'
    });
  }

  try {
    const { batchId } = req.query;
    const query = { instructor: req.user._id };
    
    if (batchId) {
      // Verify the trainer has access to this batch
      const batch = await Batch.findOne({
        _id: batchId,
        trainers: req.user._id
      });

      if (!batch) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this batch'
        });
      }
      
      query.batchId = batchId;
    }

    // Get trainer's courses with batch filtering
    const courses = await Course.find(query)
      .select('title description startDate endDate batchName')
      .populate({
        path: 'students.student',
        select: 'firstName lastName rollNumber',
        options: { limit: 5 } // Limit to 5 students for the dashboard
      });

    // Get assignments for these courses
    const courseIds = courses.map(course => course._id);
    const assignments = await Assignment.find({ 
      course: { $in: courseIds },
      dueDate: { $gte: new Date() } // Only upcoming assignments
    })
      .populate('course', 'title batchName')
      .sort({ dueDate: 1 }) // Sort by due date ascending
      .limit(5);

    // Get recent submissions with batch filtering
    const submissionMatch = { 
      'submissions.student': { $exists: true },
      'submissions.submittedAt': { $exists: true }
    };
    
    if (batchId) {
      submissionMatch.course = { $in: courseIds };
    } else {
      // Only get submissions for courses where the user is the instructor
      submissionMatch['course.instructor'] = req.user._id;
    }

    const recentSubmissions = await Assignment.aggregate([
      {
        $match: batchId 
          ? { course: { $in: courseIds } } 
          : { 'course.instructor': req.user._id }
      },
      {
        $lookup: {
          from: 'courses',
          localField: 'course',
          foreignField: '_id',
          as: 'course'
        }
      },
      { $unwind: '$course' },
      { $unwind: '$submissions' },
      { $match: { 'submissions.submittedAt': { $exists: true } } },
      { $sort: { 'submissions.submittedAt': -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: 'submissions.student',
          foreignField: '_id',
          as: 'studentInfo'
        }
      },
      { $unwind: '$studentInfo' },
      {
        $project: {
          assignmentId: '$_id',
          assignmentTitle: '$title',
          courseId: '$course._id',
          courseTitle: '$course.title',
          batchId: '$course.batchId',
          batchName: '$course.batchName',
          studentId: '$submissions.student',
          studentName: { $concat: ['$studentInfo.firstName', ' ', '$studentInfo.lastName'] },
          rollNumber: '$studentInfo.rollNumber',
          submittedAt: '$submissions.submittedAt',
          status: '$submissions.status',
          grade: '$submissions.grade',
          feedback: '$submissions.feedback'
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        batchId: batchId || null,
        courses: courses.map(course => ({
          ...course.toObject(),
          studentCount: course.students.length
        })),
        upcomingAssignments: assignments,
        recentSubmissions,
        batchStats: batchId ? {
          totalCourses: courses.length,
          totalStudents: [...new Set(courses.flatMap(c => c.students.map(s => s.student._id.toString())))].length,
          upcomingAssignments: assignments.length
        } : null
      }
    });
  } catch (err) {
    console.error('Trainer dashboard error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

/**
 * @route   GET /api/trainer/courses/:courseId/assignments
 * @desc    Get assignments for a specific course
 * @access  Private (Trainer)
 */
router.get('/courses/:courseId/assignments', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized'
    });
  }

  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor: req.user._id
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or not authorized'
      });
    }

    const assignments = await Assignment.find({ course: course._id })
      .sort({ dueDate: 1 });

    res.json({
      success: true,
      data: assignments
    });
  } catch (err) {
    console.error('Get course assignments error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}));

/**
 * @route   GET /api/trainer/assignments/:assignmentId/submissions
 * @desc    Get submissions for a specific assignment
 * @access  Private (Trainer)
 */
router.get('/assignments/:assignmentId/submissions', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized'
    });
  }

  try {
    const assignment = await Assignment.findById(req.params.assignmentId)
      .populate('course', 'title instructor')
      .populate('submissions.student', 'firstName lastName rollNumber');

    // Check if the current user is the instructor of this course
    if (assignment.course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these submissions'
      });
    }

    res.json({
      success: true,
      data: assignment.submissions
    });
  } catch (err) {
    console.error('Get assignment submissions error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}));

/**
 * @route   POST /api/trainer/submissions/:submissionId/feedback
 * @desc    Add feedback to a submission
 * @access  Private (Trainer)
 */
router.post('/submissions/:submissionId/feedback', [
  auth,
  [
    check('grade', 'Grade is required').isNumeric(),
    check('feedback', 'Feedback is required').notEmpty().trim()
  ]
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'trainer') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized'
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
    const { grade, feedback } = req.body;
    
    // Find the assignment containing this submission
    const assignment = await Assignment.findOne({
      'submissions._id': req.params.submissionId
    }).populate('course', 'instructor');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Check if the current user is the instructor of this course
    if (assignment.course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to provide feedback for this submission'
      });
    }

    // Update the submission
    const submission = assignment.submissions.id(req.params.submissionId);
    submission.grade = grade;
    submission.feedback = feedback;
    submission.status = 'graded';
    submission.gradedAt = new Date();

    await assignment.save();

    // Get the updated submission with populated data
    const updatedAssignment = await Assignment.findById(assignment._id)
      .populate('submissions.student', 'firstName lastName rollNumber email');
    
    const updatedSubmission = updatedAssignment.submissions.id(req.params.submissionId);

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      data: updatedSubmission
    });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

module.exports = router;
