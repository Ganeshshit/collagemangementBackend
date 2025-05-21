const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const updateRole = async (username, newRole) => {
    try {
        // Validate role
        const validRoles = ['student', 'trainer', 'faculty', 'admin', 'superadmin'];
        if (!validRoles.includes(newRole)) {
            console.error('Invalid role. Valid roles are:', validRoles.join(', '));
            process.exit(1);
        }

        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/college_management', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB successfully');

        // Find user by username
        console.log(`Searching for user: ${username}`);
        const user = await User.findOne({ username });
        
        if (!user) {
            console.error(`User '${username}' not found in the database`);
            process.exit(1);
        }

        // Update role
        console.log(`Updating user ${user.username}'s role from ${user.role} to ${newRole}`);
        user.role = newRole;
        await user.save();

        console.log(`\nRole updated successfully!`);
        console.log(`User: ${user.username}`);
        console.log(`New Role: ${newRole}`);
        console.log(`Previous Role: ${user.role}`);
        process.exit(0);
    } catch (error) {
        console.error('\nError updating user role:');
        console.error(error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
};

// Usage: node scripts/updateUserRole.js <username> <role>
if (process.argv.length !== 4) {
    console.log('\nUsage: node scripts/updateUserRole.js <username> <role>');
    console.log('Example: node scripts/updateUserRole.js john_doe admin');
    console.log('Valid roles: student, trainer, faculty, admin, superadmin');
    process.exit(1);
}

const username = process.argv[2];
const newRole = process.argv[3];

console.log('\nStarting user role update process...');
console.log(`Username: ${username}`);
console.log(`New Role: ${newRole}`);
console.log('----------------------------------------');

updateRole(username, newRole);
