# Test Data Creation Script

This directory contains scripts to create test data for the Faculty Management System.

## createTestData.js

This script creates 5 test records for each model in the database:
- Users (admin, superadmin, faculty, trainer, student)
- Students
- Courses
- Assignments
- Reports

## How to Run

### Option 1: Using the Batch File (Windows)

1. Navigate to the `backend/scripts` directory
2. Double-click on `runCreateTestData.bat`
3. The script will run and create the test data

### Option 2: Using Node.js Directly

1. Open a terminal/command prompt
2. Navigate to the `backend` directory
3. Run the following command:
   ```
   node scripts/createTestData.js
   ```

## Test Credentials

After running the script, you can use the following credentials to log in:

- Admin: admin/admin123
- SuperAdmin: superadmin/super123
- Faculty: faculty/faculty123
- Trainer: trainer/trainer123
- Student: student/student123

## Notes

- The script will clear all existing data in the database before creating new test data
- The MongoDB connection string is read from the `.env` file
- If you encounter any errors, check the console output for details
