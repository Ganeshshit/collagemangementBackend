const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Student = require('../models/Student');
const { auth } = require('../middleware/auth');

// Get student profile by ID
router.get('/profile/:id', auth, async (req, res) => {
  try {
    const userId = req.params.id;
    console.log('Fetching student profile for user ID:', userId);

    // First try to find the user
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is a student
    if (user.role !== 'student') {
      console.log('User is not a student');
      return res.status(400).json({ message: 'User is not a student' });
    }

    // Try to find additional student info
    let studentInfo = null;
    try {
      studentInfo = await Student.findOne({ 
        $or: [
          { rollNumber: user.studentInfo?.rollNumber },
          { email: user.email }
        ]
      });
    } catch (err) {
      console.log('Error finding student record:', err);
      // Continue even if student record is not found
    }

    // Combine user and student info
    const profileData = {
      _id: user._id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      studentInfo: user.studentInfo || {},
      academicInfo: studentInfo ? {
        department: studentInfo.department,
        semester: studentInfo.semester,
        academicYear: studentInfo.academicYear,
        assignedFaculty: studentInfo.assignedFaculty
      } : null
    };

    console.log('Student profile data retrieved successfully');
    res.json(profileData);
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update student profile
router.put('/profile/:id', auth, async (req, res) => {
  try {
    const userId = req.params.id;
    console.log('Updating student profile for user ID:', userId);
    
    // Check if the user is updating their own profile or is an admin
    if (req.user.id !== userId && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is a student
    if (user.role !== 'student') {
      return res.status(400).json({ message: 'User is not a student' });
    }

    // Update user fields
    const { firstName, lastName, email, studentInfo } = req.body;
    
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    
    // Update student info
    if (studentInfo) {
      // Initialize studentInfo if it doesn't exist
      if (!user.studentInfo) {
        user.studentInfo = {};
      }
      
      // Update allowed fields
      const allowedFields = [
        'phoneNumber', 'gender', 'dateOfBirth', 'branch', 'semester', 
        'rollNumber', 'address', 'skills', 'certifications'
      ];
      
      allowedFields.forEach(field => {
        if (studentInfo[field] !== undefined) {
          user.studentInfo[field] = studentInfo[field];
        }
      });
    }

    await user.save();
    
    // Also update the Student model if it exists
    if (user.studentInfo?.rollNumber) {
      const student = await Student.findOne({ rollNumber: user.studentInfo.rollNumber });
      if (student) {
        if (firstName) student.firstName = firstName;
        if (lastName) student.lastName = lastName;
        if (email) student.email = email;
        if (studentInfo?.branch) student.department = studentInfo.branch;
        if (studentInfo?.semester) student.semester = studentInfo.semester;
        
        await student.save();
      }
    }

    console.log('Student profile updated successfully');
    res.json({ 
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        studentInfo: user.studentInfo
      }
    });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
