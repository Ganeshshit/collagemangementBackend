require('dotenv').config({ path: './env.config' });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');
const courseRoutes = require('./routes/courses');
const reportRoutes = require('./routes/reports');
const facultyDashboardRoutes = require('./routes/facultyDashboard');
const adminUserManagementRoutes = require('./routes/adminUserManagement');
const profileRoutes = require('./routes/profile');
const superAdminDashboardRoutes = require('./routes/superAdminDashboard');
const trainerDashboardRoutes = require('./routes/trainerDashboard');
const trainerReportsRoutes = require('./routes/trainerReports');
const assignmentRoutes = require('./routes/assignments');
const assignmentResourcesRoutes = require('./routes/assignmentResources');
const attendanceReportsRoutes = require('./routes/attendanceReports');

// Import middleware
const { errorHandler } = require('./middleware/error');

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize WebSocket
require('./utils/socket')(io);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/college_management', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if we can't connect to database
  });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/faculty-dashboard', facultyDashboardRoutes);
app.use('/api/admin/users', adminUserManagementRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/super-admin', superAdminDashboardRoutes);
app.use('/api/trainer/dashboard', trainerDashboardRoutes);
app.use('/api/trainer/reports', trainerReportsRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/assignment-resources', assignmentResourcesRoutes);
app.use('/api/attendance/reports', attendanceReportsRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'College Management API',
    status: 'running',
    timestamp: new Date().toISOString(),
    documentation: 'API documentation available at /api-docs'
  });
});

// Handle 404 - Not Found
app.all('*', (req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Start server
const server = httpServer.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('💥 Process terminated!');
  });
});
