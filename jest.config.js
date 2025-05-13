module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'routes/**/*.js',
    'controllers/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/test/**'
  ]
};
