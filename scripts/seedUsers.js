const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const users = [
  {
    username: 'admin1',
    email: 'admin1@example.com',
    password: 'admin123',
    role: 'admin'
  },
  {
    username: 'student1',
    email: 'student1@example.com',
    password: 'student123',
    role: 'student'
  },
  {
    username: 'faculty1',
    email: 'faculty1@example.com',
    password: 'faculty123',
    role: 'faculty'
  }
];

const seedUsers = async () => {
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

    console.log('\nUse these credentials to login:');
    users.forEach(user => {
      console.log(`\n${user.role.toUpperCase()}:`);
      console.log(`Username: ${user.username}`);
      console.log(`Password: ${user.password}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding users:', error);
    process.exit(1);
  }
};

seedUsers();
