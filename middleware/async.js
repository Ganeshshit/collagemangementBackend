/**
 * A higher-order function that wraps async/await route handlers to catch any errors
 * and pass them to Express's error handling middleware.
 * 
 * @param {Function} fn - The async route handler function to wrap
 * @returns {Function} A new function that handles async/await errors
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
