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
   * 89. Expo's full suite measured statements 87.15%, branches 83.69%,
   * functions 82.47% and lines 87.78% on 7 November 2026, so these are the
   * measured values, rounded down. The shared tests alone cover less (CLAUDE.md,
   * "Follow-ups").
   */
  coverageThreshold: {
    global: { statements: 87, branches: 83, functions: 82, lines: 87 },
  },
}

export default config
