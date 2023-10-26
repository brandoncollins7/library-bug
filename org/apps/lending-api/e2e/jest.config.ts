/* eslint-disable */
export default {
  displayName: 'lending-api-e2e',
  preset: '../../../jest.preset.js',
  globalSetup: '<rootDir>/support/global-setup.ts',
  globalTeardown: '<rootDir>/support/global-teardown.ts',
  setupFiles: ['<rootDir>/support/test-setup.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/lending-api-e2e'
};
