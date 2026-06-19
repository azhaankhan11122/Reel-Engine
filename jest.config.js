/**
 * Jest configuration for testing instagram_mode.js
 */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.js'],
  moduleFileExtensions: ['js'],
  collectCoverageFrom: ['ui/static/instagram_mode.js'],
  coverageDirectory: 'coverage',
  verbose: true,
};