module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/ui/**/*.test.tsx'],
  clearMocks: true,
  // First-render Babel work for React Native's lazy modules can exceed five seconds on a cold cache.
  testTimeout: 15000,
  transform: {
    '\\.[jt]sx?$': ['babel-jest', {
      presets: ['babel-preset-expo'],
      plugins: ['@babel/plugin-transform-dynamic-import'],
    }],
  },
};
