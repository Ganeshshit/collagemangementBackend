const winston = require('winston');
const { combine, timestamp, printf, colorize, align } = winston.format;

// Define log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  const logMessage = stack || message;
  return `${timestamp} ${level}: ${logMessage}`;
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    align(),
    logFormat
  ),
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    // Write all logs to `combined.log`
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      align(),
      logFormat
    ),
  }));
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, error);
  // Exit the process with failure
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // Exit the process with failure
  process.exit(1);
});

module.exports = logger;
