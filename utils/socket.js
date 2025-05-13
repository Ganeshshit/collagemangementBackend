const logger = require('./logger');

module.exports = (io) => {
  io.on('connection', (socket) => {
    logger.info('New client connected');

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('Client disconnected');
    });

    // Handle custom events here
    socket.on('join', (room) => {
      socket.join(room);
      logger.info(`Client joined room: ${room}`);
    });

    // Add more event handlers as needed
  });
};
