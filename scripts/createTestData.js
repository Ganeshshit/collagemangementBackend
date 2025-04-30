const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const Report = require('../models/Report');
require('dotenv').config();

const createTestData = async () => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/faculty_management';
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Student.deleteMany({});
    await Course.deleteMany({});
    await Assignment.deleteMany({});
    await Report.deleteMany({});
    console.log('Existing data cleared');

    // Create users (5 of each role)
    console.log('Creating users...');

    // Create admin users
    const adminUser = await User.create({
      username: 'admin',
      password: 'admin123',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      adminInfo: {
        department: 'IT',
        phoneNumber: '9876543210',
        permissions: ['manage_users', 'manage_courses', 'view_reports']
      }
    });

    // Create superadmin user
    const superAdminUser = await User.create({
      username: 'superadmin',
      password: 'super123',
      email: 'superadmin@example.com',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'superadmin',
      adminInfo: {
        department: 'Management',
        phoneNumber: '9876543211',
        permissions: ['all']
      }
    });

    // Create faculty users
    const facultyUsers = await User.create([
      {
        username: 'faculty',
        password: 'faculty123',
        email: 'faculty@example.com',
        firstName: 'Faculty',
        lastName: 'Member',
        role: 'faculty'
      },
      {
        username: 'john.doe',
        password: 'password123',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'faculty'
      },
      {
        username: 'jane.smith',
        password: 'password123',
        email: 'jane.smith@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'faculty'
      },
      {
        username: 'robert.johnson',
        password: 'password123',
        email: 'robert.johnson@example.com',
        firstName: 'Robert',
        lastName: 'Johnson',
        role: 'faculty'
      },
      {
        username: 'lisa.taylor',
        password: 'password123',
        email: 'lisa.taylor@example.com',
        firstName: 'Lisa',
        lastName: 'Taylor',
        role: 'faculty'
      }
    ]);

    // Create trainer users
    const trainerUsers = await User.create([
      {
        username: 'trainer',
        password: 'trainer123',
        email: 'trainer@example.com',
        firstName: 'Trainer',
        lastName: 'Expert',
        role: 'trainer',
        trainerInfo: {
          specialization: ['Web Development', 'Mobile App Development'],
          experience: 5,
          phoneNumber: '9876543212'
        }
      },
      {
        username: 'alex.wilson',
        password: 'password123',
        email: 'alex.wilson@example.com',
        firstName: 'Alex',
        lastName: 'Wilson',
        role: 'trainer',
        trainerInfo: {
          specialization: ['Data Science', 'Machine Learning'],
          experience: 7,
          phoneNumber: '9876543213'
        }
      },
      {
        username: 'michael.brown',
        password: 'password123',
        email: 'michael.brown@example.com',
        firstName: 'Michael',
        lastName: 'Brown',
        role: 'trainer',
        trainerInfo: {
          specialization: ['Cloud Computing', 'DevOps'],
          experience: 6,
          phoneNumber: '9876543214'
        }
      },
      {
        username: 'emma.davis',
        password: 'password123',
        email: 'emma.davis@example.com',
        firstName: 'Emma',
        lastName: 'Davis',
        role: 'trainer',
        trainerInfo: {
          specialization: ['UI/UX Design', 'Frontend Development'],
          experience: 4,
          phoneNumber: '9876543215'
        }
      },
      {
        username: 'james.wilson',
        password: 'password123',
        email: 'james.wilson@example.com',
        firstName: 'James',
        lastName: 'Wilson',
        role: 'trainer',
        trainerInfo: {
          specialization: ['Cybersecurity', 'Network Administration'],
          experience: 8,
          phoneNumber: '9876543216'
        }
      }
    ]);

    // Create student users
    const studentUsers = await User.create([
      {
        username: 'student',
        password: 'student123',
        email: 'student@example.com',
        firstName: 'Student',
        lastName: 'User',
        role: 'student',
        studentInfo: {
          phoneNumber: '9876543217',
          gender: 'male',
          branch: 'Computer Science',
          semester: 5,
          rollNumber: 'CS2020001'
        }
      },
      {
        username: 'mike.johnson',
        password: 'password123',
        email: 'mike.johnson@example.com',
        firstName: 'Mike',
        lastName: 'Johnson',
        role: 'student',
        studentInfo: {
          phoneNumber: '9876543218',
          gender: 'male',
          branch: 'Computer Science',
          semester: 3,
          rollNumber: 'CS2021002'
        }
      },
      {
        username: 'sarah.davis',
        password: 'password123',
        email: 'sarah.davis@example.com',
        firstName: 'Sarah',
        lastName: 'Davis',
        role: 'student',
        studentInfo: {
          phoneNumber: '9876543219',
          gender: 'female',
          branch: 'Information Technology',
          semester: 3,
          rollNumber: 'IT2021003'
        }
      },
      {
        username: 'david.miller',
        password: 'password123',
        email: 'david.miller@example.com',
        firstName: 'David',
        lastName: 'Miller',
        role: 'student',
        studentInfo: {
          phoneNumber: '9876543220',
          gender: 'male',
          branch: 'Electronics',
          semester: 5,
          rollNumber: 'EC2020004'
        }
      },
      {
        username: 'emily.brown',
        password: 'password123',
        email: 'emily.brown@example.com',
        firstName: 'Emily',
        lastName: 'Brown',
        role: 'student',
        studentInfo: {
          phoneNumber: '9876543221',
          gender: 'female',
          branch: 'Computer Science',
          semester: 7,
          rollNumber: 'CS2019005'
        }
      }
    ]);

    console.log('Created users');

    // Create students
    console.log('Creating students...');
    const students = await Student.create([
      {
        rollNumber: 'CS2020001',
        firstName: 'Student',
        lastName: 'User',
        email: 'student@example.com',
        department: 'Computer Science',
        semester: 5,
        assignedFaculty: facultyUsers[0]._id,
        academicYear: '2023-2024'
      },
      {
        rollNumber: 'CS2021002',
        firstName: 'Mike',
        lastName: 'Johnson',
        email: 'mike.johnson@example.com',
        department: 'Computer Science',
        semester: 3,
        assignedFaculty: facultyUsers[1]._id,
        academicYear: '2023-2024'
      },
      {
        rollNumber: 'IT2021003',
        firstName: 'Sarah',
        lastName: 'Davis',
        email: 'sarah.davis@example.com',
        department: 'Information Technology',
        semester: 3,
        assignedFaculty: facultyUsers[2]._id,
        academicYear: '2023-2024'
      },
      {
        rollNumber: 'EC2020004',
        firstName: 'David',
        lastName: 'Miller',
        email: 'david.miller@example.com',
        department: 'Electronics',
        semester: 5,
        assignedFaculty: facultyUsers[3]._id,
        academicYear: '2023-2024'
      },
      {
        rollNumber: 'CS2019005',
        firstName: 'Emily',
        lastName: 'Brown',
        email: 'emily.brown@example.com',
        department: 'Computer Science',
        semester: 7,
        assignedFaculty: facultyUsers[4]._id,
        academicYear: '2023-2024'
      }
    ]);
    console.log('Created students');

    // Create courses
    console.log('Creating courses...');
    const courses = await Course.create([
      {
        title: 'Introduction to Computer Science',
        description: 'A foundational course covering basic computer science concepts',
        instructor: facultyUsers[0]._id,
        students: [studentUsers[0]._id, studentUsers[1]._id, studentUsers[2]._id],
        startDate: new Date('2023-07-01'),
        endDate: new Date('2023-12-31'),
        schedule: [
          {
            day: 'Monday',
            startTime: '10:00 AM',
            endTime: '11:30 AM'
          },
          {
            day: 'Wednesday',
            startTime: '10:00 AM',
            endTime: '11:30 AM'
          }
        ],
        status: 'ongoing'
      },
      {
        title: 'Data Structures',
        description: 'Learn about various data structures and their implementations',
        instructor: facultyUsers[1]._id,
        students: [studentUsers[0]._id, studentUsers[1]._id, studentUsers[3]._id, studentUsers[4]._id],
        startDate: new Date('2023-07-01'),
        endDate: new Date('2023-12-31'),
        schedule: [
          {
            day: 'Tuesday',
            startTime: '1:00 PM',
            endTime: '2:30 PM'
          },
          {
            day: 'Thursday',
            startTime: '1:00 PM',
            endTime: '2:30 PM'
          }
        ],
        status: 'ongoing'
      },
      {
        title: 'Database Systems',
        description: 'Introduction to database design and management',
        instructor: facultyUsers[2]._id,
        students: [studentUsers[1]._id, studentUsers[2]._id, studentUsers[3]._id, studentUsers[4]._id],
        startDate: new Date('2023-07-01'),
        endDate: new Date('2023-12-31'),
        schedule: [
          {
            day: 'Monday',
            startTime: '3:00 PM',
            endTime: '4:30 PM'
          },
          {
            day: 'Friday',
            startTime: '3:00 PM',
            endTime: '4:30 PM'
          }
        ],
        status: 'ongoing'
      },
      {
        title: 'Web Development',
        description: 'Learn to build modern web applications',
        instructor: facultyUsers[3]._id,
        students: studentUsers.map(student => student._id),
        startDate: new Date('2023-08-01'),
        endDate: new Date('2024-01-31'),
        schedule: [
          {
            day: 'Tuesday',
            startTime: '10:00 AM',
            endTime: '11:30 AM'
          },
          {
            day: 'Thursday',
            startTime: '10:00 AM',
            endTime: '11:30 AM'
          }
        ],
        status: 'upcoming'
      },
      {
        title: 'Machine Learning',
        description: 'Introduction to machine learning algorithms and applications',
        instructor: facultyUsers[4]._id,
        students: [studentUsers[0]._id, studentUsers[4]._id],
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-05-31'),
        schedule: [
          {
            day: 'Wednesday',
            startTime: '1:00 PM',
            endTime: '2:30 PM'
          },
          {
            day: 'Friday',
            startTime: '1:00 PM',
            endTime: '2:30 PM'
          }
        ],
        status: 'completed'
      }
    ]);
    console.log('Created courses');

    // Create assignments
    console.log('Creating assignments...');
    const assignments = await Assignment.create([
      {
        title: 'Algorithm Analysis',
        description: 'Analyze the time and space complexity of given algorithms',
        course: courses[1]._id, // Data Structures course
        dueDate: new Date('2023-09-15'),
        totalPoints: 100,
        submissions: [
          {
            student: studentUsers[0]._id,
            submittedAt: new Date('2023-09-10'),
            fileUrl: 'https://example.com/submissions/algo-analysis-1.pdf',
            grade: 85,
            feedback: 'Good analysis, but could improve on space complexity explanations',
            status: 'graded'
          },
          {
            student: studentUsers[1]._id,
            submittedAt: new Date('2023-09-12'),
            fileUrl: 'https://example.com/submissions/algo-analysis-2.pdf',
            status: 'submitted'
          }
        ],
        createdBy: facultyUsers[1]._id
      },
      {
        title: 'Database Design',
        description: 'Design a normalized database schema for a given scenario',
        course: courses[2]._id, // Database Systems course
        dueDate: new Date('2023-09-20'),
        totalPoints: 100,
        submissions: [
          {
            student: studentUsers[1]._id,
            submittedAt: new Date('2023-09-18'),
            fileUrl: 'https://example.com/submissions/db-design-1.pdf',
            status: 'submitted'
          }
        ],
        createdBy: facultyUsers[2]._id
      },
      {
        title: 'Programming Basics',
        description: 'Implement basic programming constructs in Python',
        course: courses[0]._id, // Intro to CS course
        dueDate: new Date('2023-08-30'),
        totalPoints: 50,
        submissions: [
          {
            student: studentUsers[0]._id,
            submittedAt: new Date('2023-08-25'),
            fileUrl: 'https://example.com/submissions/prog-basics-1.py',
            grade: 48,
            feedback: 'Excellent work!',
            status: 'graded'
          },
          {
            student: studentUsers[1]._id,
            submittedAt: new Date('2023-08-28'),
            fileUrl: 'https://example.com/submissions/prog-basics-2.py',
            grade: 45,
            feedback: 'Good implementation',
            status: 'graded'
          },
          {
            student: studentUsers[2]._id,
            submittedAt: new Date('2023-08-29'),
            fileUrl: 'https://example.com/submissions/prog-basics-3.py',
            grade: 42,
            feedback: 'Good effort, but could improve code organization',
            status: 'graded'
          }
        ],
        createdBy: facultyUsers[0]._id
      },
      {
        title: 'Web Application Project',
        description: 'Build a full-stack web application using React and Node.js',
        course: courses[3]._id, // Web Development course
        dueDate: new Date('2023-12-15'),
        totalPoints: 200,
        submissions: [],
        createdBy: facultyUsers[3]._id
      },
      {
        title: 'Machine Learning Model',
        description: 'Implement and train a machine learning model for a given dataset',
        course: courses[4]._id, // Machine Learning course
        dueDate: new Date('2023-05-15'),
        totalPoints: 150,
        submissions: [
          {
            student: studentUsers[0]._id,
            submittedAt: new Date('2023-05-10'),
            fileUrl: 'https://example.com/submissions/ml-model-1.ipynb',
            grade: 135,
            feedback: 'Excellent model with good accuracy',
            status: 'graded'
          },
          {
            student: studentUsers[4]._id,
            submittedAt: new Date('2023-05-14'),
            fileUrl: 'https://example.com/submissions/ml-model-2.ipynb',
            grade: 142,
            feedback: 'Outstanding work with detailed analysis',
            status: 'graded'
          }
        ],
        createdBy: facultyUsers[4]._id
      }
    ]);
    console.log('Created assignments');

    // Create reports
    console.log('Creating reports...');
    const reports = await Report.create([
      {
        student: students[0]._id,
        title: 'Semester Progress Report',
        description: 'Progress report for the current semester',
        semester: 5,
        academicYear: '2023-2024',
        reportFile: {
          filename: 'progress-report-cs2020001.pdf',
          path: '/uploads/reports/progress-report-cs2020001.pdf',
          mimetype: 'application/pdf',
          size: 1024000
        },
        createdBy: facultyUsers[0]._id,
        status: 'reviewed',
        comments: [
          {
            user: facultyUsers[0]._id,
            text: 'Good progress overall. Keep up the good work!'
          }
        ]
      },
      {
        student: students[1]._id,
        title: 'Course Completion Certificate',
        description: 'Certificate for completing the Data Structures course',
        semester: 3,
        academicYear: '2023-2024',
        reportFile: {
          filename: 'certificate-cs2021002.pdf',
          path: '/uploads/reports/certificate-cs2021002.pdf',
          mimetype: 'application/pdf',
          size: 512000
        },
        createdBy: facultyUsers[1]._id,
        status: 'submitted'
      },
      {
        student: students[2]._id,
        title: 'Project Submission',
        description: 'Final project submission for Web Development course',
        semester: 3,
        academicYear: '2023-2024',
        reportFile: {
          filename: 'project-it2021003.zip',
          path: '/uploads/reports/project-it2021003.zip',
          mimetype: 'application/zip',
          size: 5120000
        },
        createdBy: facultyUsers[2]._id,
        status: 'reviewed',
        comments: [
          {
            user: facultyUsers[2]._id,
            text: 'Excellent project implementation. The UI design is impressive.'
          },
          {
            user: facultyUsers[0]._id,
            text: 'I agree. The code quality is also very good.'
          }
        ]
      },
      {
        student: students[3]._id,
        title: 'Internship Report',
        description: 'Report on summer internship experience',
        semester: 5,
        academicYear: '2023-2024',
        reportFile: {
          filename: 'internship-ec2020004.pdf',
          path: '/uploads/reports/internship-ec2020004.pdf',
          mimetype: 'application/pdf',
          size: 2048000
        },
        createdBy: facultyUsers[3]._id,
        status: 'submitted'
      },
      {
        student: students[4]._id,
        title: 'Research Paper',
        description: 'Research paper on machine learning applications',
        semester: 7,
        academicYear: '2023-2024',
        reportFile: {
          filename: 'research-cs2019005.pdf',
          path: '/uploads/reports/research-cs2019005.pdf',
          mimetype: 'application/pdf',
          size: 3072000
        },
        createdBy: facultyUsers[4]._id,
        status: 'reviewed',
        comments: [
          {
            user: facultyUsers[4]._id,
            text: 'Outstanding research work. Consider submitting to a conference.'
          }
        ]
      }
    ]);
    console.log('Created reports');

    console.log('Test data creation completed successfully!');
    console.log('-------------------------------------');
    console.log(`Created ${facultyUsers.length + trainerUsers.length + studentUsers.length + 2} users`);
    console.log(`Created ${students.length} students`);
    console.log(`Created ${courses.length} courses`);
    console.log(`Created ${assignments.length} assignments`);
    console.log(`Created ${reports.length} reports`);
    console.log('-------------------------------------');
    console.log('Test credentials:');
    console.log('Admin: admin/admin123');
    console.log('SuperAdmin: superadmin/super123');
    console.log('Faculty: faculty/faculty123');
    console.log('Trainer: trainer/trainer123');
    console.log('Student: student/student123');

    process.exit(0);
  } catch (error) {
    console.error('Error creating test data:', error);
    process.exit(1);
  }
};

createTestData();
