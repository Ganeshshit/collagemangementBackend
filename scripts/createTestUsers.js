require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function createTestUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Create a test student
        const studentPassword = await bcrypt.hash('student123', 10);
        const student = new User({
            username: 'teststudent',
            password: studentPassword,
            email: 'student@test.com',
            firstName: 'Test',
            lastName: 'Student',
            role: 'student',
            studentId: 'STU001',
            semester: 4,
            department: 'Computer Science'
        });

        // Create a test faculty member
        const facultyPassword = await bcrypt.hash('faculty123', 10);
        const faculty = new User({
            username: 'testfaculty',
            password: facultyPassword,
            email: 'faculty@test.com',
            firstName: 'Test',
            lastName: 'Faculty',
            role: 'faculty',
            department: 'Computer Science'
        });

        await User.deleteMany({ 
            username: { $in: ['teststudent', 'testfaculty'] }
        });

        await student.save();
        await faculty.save();

        console.log('Test users created successfully!');
        console.log('\nStudent Credentials:');
        console.log('Username: teststudent');
        console.log('Password: student123');
        console.log('\nFaculty Credentials:');
        console.log('Username: testfaculty');
        console.log('Password: faculty123');

    } catch (error) {
        console.error('Error creating test users:', error);
    } finally {
        await mongoose.disconnect();
    }
}

createTestUsers();
