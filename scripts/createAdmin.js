require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faculty_management');
    console.log('Connected to MongoDB');

    const adminData = {
      username: 'admin',
      password: 'admin123',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin'
    };

    // Check if admin already exists
    let admin = await User.findOne({ username: adminData.username });
    if (admin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create new admin user
    admin = new User(adminData);
    await admin.save();
    console.log('Admin user created successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exit(1);
  }
}

createAdmin();
