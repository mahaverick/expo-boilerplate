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
    '^posthog-react-native$': '<rootDir>/tests/mocks/posthog-react-native.ts',
    '^react-native-mmkv$': '<rootDir>/tests/mocks/react-native-mmkv.ts',
    '^@/tests/(.*)$': '<rootDir>/tests/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  /**
   * React's thresholds are statements 88, branches 82, functions 86 and lines
   * 89. Expo's full suite measured statements 90.14%, branches 85.94%,
   * functions 87.27% and lines 90.94% on 7 November 2026, so these are the
   * measured values, rounded down. The shared tests alone cover less (CLAUDE.md,
   * "Follow-ups").
   */
  coverageThreshold: {
    global: { statements: 90, branches: 85, functions: 87, lines: 90 },
  },
}

export default config
