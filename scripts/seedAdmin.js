const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const adminUser = {
  username: 'admin',
  email: 'admin@example.com',
  password: 'admin123',
  role: 'admin'
};

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/faculty-dashboard', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Delete existing users
    await User.deleteMany({});
    console.log('Deleted existing users');

    // Create admin user
    const admin = await User.create(adminUser);
    console.log('Created admin user:', admin.username);

    console.log('\nAdmin Credentials:');
    console.log(`Username: ${adminUser.username}`);
    console.log(`Password: ${adminUser.password}`);
    console.log('\nUse these credentials to login and create other users.');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
