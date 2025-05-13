const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const asyncHandler = require('../middleware/async');
const { validate } = require('../middleware/validation');
const logger = require('../utils/logger');

// Models
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const Report = require('../models/Report');

// Constants
const ROLES = {
  FACULTY: 'faculty',
  SUPER_ADMIN: 'superadmin'
};

/**
 * @route   GET /api/faculty/dashboard/overview
 * @desc    Get college overview for faculty
 * @access  Private (Faculty, Super Admin)
 * @returns {Object} College overview with statistics and recent reports
 */
const getCollegeOverviewValidation = [
  auth,
  authorize([ROLES.FACULTY, ROLES.SUPER_ADMIN])
];

// Faculty dashboard routes
router.get(
  '/overview',
  [
    auth,
    authorize([ROLES.FACULTY, ROLES.SUPER_ADMIN])
  ],
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const { user } = req;
    
    logger.info(`Fetching college overview for user: ${user._id}`);

    try {
      // Get the faculty's college
      const faculty = await User.findById(user._id).select('college').lean();
      
      if (!faculty || !faculty.college) {
        logger.warn(`College information not found for user: ${user._id}`);
        return res.status(400).json({
          success: false,
          message: 'College information not found for your account'
        });
      }

      // Get college statistics in parallel
      const [
        totalStudents,
        departments,
        attendanceSummary,
        recentReports
      ] = await Promise.all([
        // Total students
        Student.countDocuments({ college: faculty.college }),
        
        // Departments with student count
        Student.aggregate([
          { $match: { college: faculty.college } },
          { $group: { _id: '$department', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]).read('primaryPreferred'),
        
        // Attendance summary
        Attendance.aggregate([
          {
            $lookup: {
              from: 'students',
              localField: 'student',
              foreignField: '_id',
              as: 'studentInfo'
            }
          },
          { $unwind: '$studentInfo' },
          { $match: { 'studentInfo.college': faculty.college } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]).read('secondary'),
        
        // Recent reports with pagination
        Report.find({ 'student.college': faculty.college })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('student', 'firstName lastName rollNumber')
          .populate('createdBy', 'firstName lastName')
          .lean()
      ]);

    // Calculate attendance percentage
    const totalAttendance = attendanceSummary.reduce((sum, item) => sum + item.count, 0);
    const presentAttendance = attendanceSummary.find(item => item._id === 'present')?.count || 0;
    const attendancePercentage = totalAttendance > 0 
      ? Math.round((presentAttendance / totalAttendance) * 100) 
      : 0;

      // Prepare response data
      const responseData = {
        success: true,
        data: {
          college: faculty.college,
          stats: {
            totalStudents,
            totalDepartments: departments.length,
            attendancePercentage,
            totalAttendanceRecords: totalAttendance
          },
          departments,
          attendanceSummary: attendanceSummary.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
          }, {}),
          recentReports: recentReports.map(report => ({
            id: report._id,
            title: report.title,
            student: {
              id: report.student._id,
              name: `${report.student.firstName} ${report.student.lastName}`,
              rollNumber: report.student.rollNumber
            },
            status: report.status,
            date: report.createdAt
          }))
        },
        meta: {
          responseTime: `${Date.now() - startTime}ms`,
          requestedAt: new Date().toISOString()
        }
      };

      logger.info(`Successfully fetched college overview for user: ${user._id}`);
      res.json(responseData);
    } catch (err) {
      logger.error(`Error in getCollegeOverview: ${err.message}`, {
        error: err.stack,
        userId: user._id
      });
      
      // Pass error to the error handling middleware
      next(err);
    }
}));

/**
 * @route   GET /api/faculty/students/:studentId/performance
 * @desc    Get detailed performance for a specific student
 * @access  Private (Faculty)
 */
router.get('/students/:studentId/performance', auth, asyncHandler(async (req, res) => {
  if (!['faculty', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized'
    });
  }

  try {
    // Get the faculty's college
    const faculty = await User.findById(req.user._id).select('college');
    
    // Get the student and verify they belong to the same college
    const student = await Student.findOne({
      _id: req.params.studentId,
      college: faculty.college
    }).populate('user', 'email');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found or not in your college'
      });
    }

    // Get comprehensive student performance data
    const [
      attendanceSummary,
      recentAttendance,
      assignments,
      reports
    ] = await Promise.all([
      // Attendance summary
      Attendance.aggregate([
        { $match: { student: student._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Recent attendance records
      Attendance.find({ student: student._id })
        .sort({ date: -1 })
        .limit(5)
        .populate('course', 'title')
        .populate('markedBy', 'firstName lastName'),
      
      // Assignment submissions
      Assignment.aggregate([
        { $unwind: '$submissions' },
        { $match: { 'submissions.student': student._id } },
        {
          $project: {
            _id: 1,
            title: 1,
            dueDate: 1,
            submission: {
              status: '$submissions.status',
              submittedAt: '$submissions.submittedAt',
              grade: '$submissions.grade',
              feedback: '$submissions.feedback'
            }
          }
        },
        { $sort: { 'submission.submittedAt': -1 } },
        { $limit: 5 }
      ]),
      
      // Recent reports
      Report.find({ student: student._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('createdBy', 'firstName lastName')
    ]);

    // Calculate attendance percentage
    const totalAttendance = attendanceSummary.reduce((sum, item) => sum + item.count, 0);
    const presentAttendance = attendanceSummary.find(item => item._id === 'present')?.count || 0;
    const attendancePercentage = totalAttendance > 0 
      ? Math.round((presentAttendance / totalAttendance) * 100) 
      : 0;

    // Calculate average grade
    const gradedAssignments = assignments.filter(a => a.submission.grade !== undefined);
    const averageGrade = gradedAssignments.length > 0
      ? Math.round(gradedAssignments.reduce((sum, a) => sum + a.submission.grade, 0) / gradedAssignments.length)
      : null;

    res.json({
      success: true,
      data: {
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          rollNumber: student.rollNumber,
          email: student.user?.email,
          department: student.department,
          semester: student.semester,
          college: student.college
        },
        performance: {
          attendance: {
            percentage: attendancePercentage,
            summary: attendanceSummary.reduce((acc, curr) => {
              acc[curr._id] = curr.count;
              return acc;
            }, {}),
            recent: recentAttendance
          },
          assignments: {
            total: assignments.length,
            submitted: assignments.filter(a => a.submission.status === 'submitted').length,
            averageGrade,
            recent: assignments
          },
          reports: {
            total: reports.length,
            recent: reports.map(report => ({
              id: report._id,
              title: report.title,
              status: report.status,
              date: report.createdAt,
              createdBy: report.createdBy ? 
                `${report.createdBy.firstName} ${report.createdBy.lastName}` : 'System'
            }))
          }
        }
      }
    });
  } catch (err) {
    console.error('Get student attendance error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}));

/**
 * @route   GET /api/faculty/departments/:department/performance
 * @desc    Get performance metrics by department
 * @access  Private (Faculty)
 */
router.get('/departments/:department/performance', auth, asyncHandler(async (req, res) => {
  if (!['faculty', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized'
    });
  }

  try {
    const { department } = req.params;
    const { startDate, endDate } = req.query;
    
    // Get the faculty's college
    const faculty = await User.findById(req.user._id).select('college');
    
    if (faculty.college === 'AITM') {
      // Special handling for AITM
      return getAITMDepartmentPerformance(res, department, faculty.college, startDate, endDate);
    }
    
    // Build date range query
    const dateQuery = {};
    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) dateQuery.$lte = new Date(endDate);
    
    const matchStage = {
      department,
      college: faculty.college
    };
    
    if (startDate || endDate) {
      matchStage.date = dateQuery;
    }

    // Get comprehensive department performance data
    const [
      attendanceSummary,
      studentStats,
      assignmentStats,
      reportStats
    ] = await Promise.all([
      // Attendance summary
      Attendance.aggregate([
        {
          $lookup: {
            from: 'students',
            localField: 'student',
            foreignField: '_id',
            as: 'studentInfo'
          }
        },
        { $unwind: '$studentInfo' },
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Student statistics
      Student.aggregate([
        { $match: { department, college: faculty.college } },
        {
          $lookup: {
            from: 'attendances',
            localField: '_id',
            foreignField: 'student',
            as: 'attendance'
          }
        },
        {
          $project: {
            _id: 1,
            name: { $concat: ['$firstName', ' ', '$lastName'] },
            rollNumber: 1,
            attendanceCount: { $size: '$attendance' },
            presentCount: {
              $size: {
                $filter: {
                  input: '$attendance',
                  as: 'a',
                  cond: { $eq: ['$$a.status', 'present'] }
                }
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            rollNumber: 1,
            attendancePercentage: {
              $cond: [
                { $eq: ['$attendanceCount', 0] },
                0,
                { $multiply: [
                  { $divide: ['$presentCount', '$attendanceCount'] },
                  100
                ]}
              ]
            }
          }
        }
      ]),
      
      // Assignment statistics
      Assignment.aggregate([
        { $unwind: '$submissions' },
        {
          $lookup: {
            from: 'students',
            localField: 'submissions.student',
            foreignField: '_id',
            as: 'studentInfo'
          }
        },
        { $unwind: '$studentInfo' },
        {
          $match: {
            'studentInfo.department': department,
            'studentInfo.college': faculty.college
          }
        },
        {
          $group: {
            _id: '$submissions.status',
            count: { $sum: 1 },
            averageGrade: { $avg: '$submissions.grade' }
          }
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            count: 1,
            averageGrade: { $ifNull: [{ $round: ['$averageGrade', 2] }, 0] }
          }
        }
      ]),
      
      // Report statistics
      Report.aggregate([
        {
          $lookup: {
            from: 'students',
            localField: 'student',
            foreignField: '_id',
            as: 'studentInfo'
          }
        },
        { $unwind: '$studentInfo' },
        {
          $match: {
            'studentInfo.department': department,
            'studentInfo.college': faculty.college
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Calculate overall statistics
    const totalStudents = studentStats.length;
    const totalAttendance = attendanceSummary.reduce((sum, item) => sum + item.count, 0);
    const presentAttendance = attendanceSummary.find(item => item._id === 'present')?.count || 0;
    const attendancePercentage = totalAttendance > 0 
      ? Math.round((presentAttendance / totalAttendance) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        department,
        college: faculty.college,
        stats: {
          totalStudents,
          totalAttendance,
          attendancePercentage,
          totalAssignments: assignmentStats.reduce((sum, item) => sum + item.count, 0),
          totalReports: reportStats.reduce((sum, item) => sum + item.count, 0)
        },
        attendance: attendanceSummary.map(item => ({
          status: item._id,
          count: item.count,
          percentage: Math.round((item.count / totalAttendance) * 100) || 0
        })),
        assignments: assignmentStats,
        reports: reportStats,
        students: studentStats
      }
    });
  } catch (err) {
    console.error('Get department attendance error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

// Special handling for AITM college
async function getAITMDepartmentPerformance(res, department, college, startDate, endDate) {
  try {
    // Build date range query
    const dateQuery = {};
    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) dateQuery.$lte = new Date(endDate);
    
    const matchStage = {
      department,
      college
    };
    
    if (startDate || endDate) {
      matchStage.date = dateQuery;
    }

    // Get comprehensive department performance data for AITM
    const [
      attendanceSummary,
      studentStats,
      assignmentStats,
      reportStats,
      // Additional AITM specific metrics can be added here
    ] = await Promise.all([
      // Attendance summary with AITM specific logic
      Attendance.aggregate([
        {
          $lookup: {
            from: 'students',
            localField: 'student',
            foreignField: '_id',
            as: 'studentInfo'
          }
        },
        { $unwind: '$studentInfo' },
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Student statistics with AITM specific fields
      Student.aggregate([
        { $match: { department, college } },
        {
          $lookup: {
            from: 'attendances',
            localField: '_id',
            foreignField: 'student',
            as: 'attendance'
          }
        },
        {
          $project: {
            _id: 1,
            name: { $concat: ['$firstName', ' ', '$lastName'] },
            rollNumber: 1,
            semester: 1,
            attendanceCount: { $size: '$attendance' },
            presentCount: {
              $size: {
                $filter: {
                  input: '$attendance',
                  as: 'a',
                  cond: { $eq: ['$$a.status', 'present'] }
                }
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            rollNumber: 1,
            semester: 1,
            attendancePercentage: {
              $cond: [
                { $eq: ['$attendanceCount', 0] },
                0,
                { $multiply: [
                  { $divide: ['$presentCount', '$attendanceCount'] },
                  100
                ]}
              ]
            }
          }
        },
        { $sort: { semester: 1, rollNumber: 1 } }
      ]),
      
      // Assignment statistics with AITM specific logic
      Assignment.aggregate([
        { $unwind: '$submissions' },
        {
          $lookup: {
            from: 'students',
            localField: 'submissions.student',
            foreignField: '_id',
            as: 'studentInfo'
          }
        },
        { $unwind: '$studentInfo' },
        {
          $match: {
            'studentInfo.department': department,
            'studentInfo.college': college
          }
        },
        {
          $group: {
            _id: {
              status: '$submissions.status',
              semester: '$studentInfo.semester'
            },
            count: { $sum: 1 },
            averageGrade: { $avg: '$submissions.grade' }
          }
        },
        {
          $group: {
            _id: '$_id.status',
            count: { $sum: '$count' },
            bySemester: {
              $push: {
                semester: '$_id.semester',
                count: '$count',
                averageGrade: { $ifNull: [{ $round: ['$averageGrade', 2] }, 0] }
              }
            },
            averageGrade: { $avg: '$averageGrade' }
          }
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            count: 1,
            averageGrade: { $ifNull: [{ $round: ['$averageGrade', 2] }, 0] },
            bySemester: 1
          }
        },
        { $sort: { status: 1 } }
      ]),
      
      // Report statistics with AITM specific logic
      Report.aggregate([
        {
          $lookup: {
            from: 'students',
            localField: 'student',
            foreignField: '_id',
            as: 'studentInfo'
          }
        },
        { $unwind: '$studentInfo' },
        {
          $match: {
            'studentInfo.department': department,
            'studentInfo.college': college
          }
        },
        {
          $group: {
            _id: {
              status: '$status',
              semester: '$studentInfo.semester'
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.status',
            count: { $sum: '$count' },
            bySemester: {
              $push: {
                semester: '$_id.semester',
                count: '$count'
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            count: 1,
            bySemester: 1
          }
        },
        { $sort: { status: 1 } }
      ])
    ]);

    // Calculate overall statistics for AITM
    const totalStudents = studentStats.length;
    const totalAttendance = attendanceSummary.reduce((sum, item) => sum + item.count, 0);
    const presentAttendance = attendanceSummary.find(item => item._id === 'present')?.count || 0;
    const attendancePercentage = totalAttendance > 0 
      ? Math.round((presentAttendance / totalAttendance) * 100) 
      : 0;

    // Calculate semester-wise statistics
    const semesters = [...new Set(studentStats.map(s => s.semester))].sort();
    const semesterStats = semesters.map(semester => {
      const studentsInSemester = studentStats.filter(s => s.semester === semester);
      const totalAttendanceSemester = studentsInSemester.reduce(
        (sum, s) => sum + (s.attendancePercentage || 0), 0);
      
      return {
        semester,
        studentCount: studentsInSemester.length,
        averageAttendance: studentsInSemester.length > 0 
          ? Math.round(totalAttendanceSemester / studentsInSemester.length)
          : 0
      };
    });

    res.json({
      success: true,
      data: {
        department,
        college: 'AITM', // Hardcoded for AITM
        stats: {
          totalStudents,
          totalAttendance,
          attendancePercentage,
          totalAssignments: assignmentStats.reduce((sum, item) => sum + item.count, 0),
          totalReports: reportStats.reduce((sum, item) => sum + item.count, 0),
          semesters: semesterStats.length
        },
        attendance: attendanceSummary.map(item => ({
          status: item._id,
          count: item.count,
          percentage: Math.round((item.count / totalAttendance) * 100) || 0
        })),
        assignments: assignmentStats,
        reports: reportStats,
        students: studentStats,
        semesterWise: semesterStats
      },
      // AITM specific additional data can be added here
      aitmSpecific: {
        // Add any AITM specific metrics or flags
        isAITM: true,
        lastUpdated: new Date()
      }
    });
  } catch (err) {
    console.error('AITM department performance error:', err);
    throw err; // Let the main error handler handle it
  }
}

module.exports = router;
