const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Report = require('../models/Report');

const createTestData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/faculty_management', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Create faculty user if not exists
    let faculty = await User.findOne({ username: 'faculty' });
    if (!faculty) {
      faculty = await User.create({
        username: 'faculty',
        password: 'faculty123',
        email: 'faculty@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'faculty'
      });
      console.log('Faculty user created');
    }

    // Create test student if not exists
    let student = await Student.findOne({ rollNumber: 'S001' });
    if (!student) {
      student = await Student.create({
        rollNumber: 'S001',
        firstName: 'Test',
        lastName: 'Student',
        email: 'student@example.com',
        department: 'Computer Science',
        semester: 4,
        assignedFaculty: faculty._id
      });
      console.log('Test student created');
    }

    // Create test report if not exists
    const existingReport = await Report.findOne({ 
      student: student._id,
      title: 'Test Report'
    });

    if (!existingReport) {
      await Report.create({
        student: student._id,
        title: 'Test Report',
        description: 'This is a test report for demonstration',
        semester: 4,
        academicYear: '2024-2025',
        createdBy: faculty._id
      });
      console.log('Test report created');
    }

    console.log('Test data creation completed');
    process.exit(0);
  } catch (error) {
    console.error('Error creating test data:', error);
    process.exit(1);
  }
};

createTestData();
