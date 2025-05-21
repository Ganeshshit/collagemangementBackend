const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const countUsers = async () => {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/college_management', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB successfully');

        // Get total users
        const totalUsers = await User.countDocuments();
        console.log(`\nTotal users in database: ${totalUsers}`);

        // Get count by role
        const roleCounts = await User.aggregate([
            {
                $group: {
                    _id: "$role",
                    count: { $sum: 1 }
                }
            }
        ]);

        console.log('\nUsers by role:');
        roleCounts.forEach(role => {
            console.log(`${role._id}: ${role.count} users`);
        });

        // Get list of all users with their roles
        console.log('\nList of all users:');
        const users = await User.find({}, { username: 1, role: 1, firstName: 1, lastName: 1 }).sort({ username: 1 });
        users.forEach(user => {
            console.log(`- ${user.username} (${user.role}): ${user.firstName} ${user.lastName}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('\nError counting users:');
        console.error(error.message);
        process.exit(1);
    }
};

console.log('Starting user count script...');
countUsers();
