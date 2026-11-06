import type { Config } from 'jest'

/**
 * The API base the tests run against. Set here, before any worker starts, so
 * the value babel-preset-expo inlines while transforming and the one read at
 * run time agree.
 */
process.env.EXPO_PUBLIC_API_URL ??= 'https://api.example.test'

/** Jest through jest-expo, over every test under tests/. */
const config: Config = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '\\.css$': '<rootDir>/tests/support/stylesheet.ts',
    '^expo-secure-store$': '<rootDir>/tests/mocks/expo-secure-store.ts',
    '^@react-native-community/netinfo$': '<rootDir>/tests/mocks/netinfo.ts',
    '^@/tests/(.*)$': '<rootDir>/tests/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  /**
   * React's thresholds are statements 88, branches 82, functions 86 and lines
   * 89. The shared tests react gives expo cover less of the shared core than
   * that, so these are the measured values, rounded down, until react marks
   * more of its tests for expo (CLAUDE.md, "Follow-ups").
   */
  coverageThreshold: {
    global: { statements: 58, branches: 57, functions: 44, lines: 57 },
  },
}

export default config
