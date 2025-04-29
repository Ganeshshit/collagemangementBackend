const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const createInitialUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create superadmin
    const superadminExists = await User.findOne({ username: 'superadmin' });
    if (!superadminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'superadmin',
        email: 'superadmin@example.com',
        password: hashedPassword,
        role: 'superadmin',
        firstName: 'Super',
        lastName: 'Admin'
      });
      console.log('Superadmin created');
    }

    // Create admin
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User'
      });
      console.log('Admin created');
    }

    console.log('Initial users created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating initial users:', error);
    process.exit(1);
  }
};

createInitialUsers();
