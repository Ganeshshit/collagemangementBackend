const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createSuperAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Create superadmin user
    const superadmin = new User({
      username: 'superadmin',
      email: 'superadmin@example.com',
      password: 'admin123', // This will be hashed automatically
      role: 'superadmin',
      firstName: 'Super',
      lastName: 'Admin'
    });

    await superadmin.save();
    console.log('Superadmin created successfully!');

    // Create admin user
    const admin = new User({
      username: 'admin',
      email: 'admin@example.com',
      password: 'admin123', // This will be hashed automatically
      role: 'admin',
      firstName: 'System',
      lastName: 'Admin'
    });

    await admin.save();
    console.log('Admin created successfully!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createSuperAdmin();
