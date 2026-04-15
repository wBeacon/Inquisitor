module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // 确保 verbose 模式使用默认 reporter 输出测试名称
  reporters: ['default'],
  // 强制 Jest 在测试完成后立即退出，避免因异步操作挂起
  forceExit: true,
};
