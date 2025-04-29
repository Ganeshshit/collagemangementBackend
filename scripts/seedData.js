const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const users = [
  {
    username: 'superadmin',
    email: 'superadmin@example.com',
    password: 'superadmin123',
    role: 'superadmin'
  },
  {
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin'
  },
  {
    username: 'faculty',
    email: 'faculty@example.com',
    password: 'faculty123',
    role: 'faculty'
  },
  {
    username: 'trainer',
    email: 'trainer@example.com',
    password: 'trainer123',
    role: 'trainer'
  },
  {
    username: 'student',
    email: 'student@example.com',
    password: 'student123',
    role: 'student'
  }
];

const seedDatabase = async () => {
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

    // Create new users
    const createdUsers = await User.create(users);
    console.log('Created users:', createdUsers.map(user => user.username));

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
