import {
  ANALYTICS_APP,
  analyticsConfig,
  isAnalyticsAvailable,
} from '@/observability/telemetry/config'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

/** The two variables the analytics configuration reads, restored after each case. */
const saved = {
  key: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  environment: process.env.EXPO_PUBLIC_APP_ENV,
}

/** Sets or clears one variable. */
function setEnv(name: 'EXPO_PUBLIC_POSTHOG_KEY' | 'EXPO_PUBLIC_APP_ENV', value?: string): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  setEnv('EXPO_PUBLIC_POSTHOG_KEY', saved.key)
  setEnv('EXPO_PUBLIC_APP_ENV', saved.environment)
})

describe('analytics configuration', () => {
  it('names the app expo', () => {
    expect(ANALYTICS_APP).toBe('expo')
  })

  it('has no key and the development environment when nothing is set', () => {
    setEnv('EXPO_PUBLIC_POSTHOG_KEY')
    setEnv('EXPO_PUBLIC_APP_ENV')
    expect(analyticsConfig()).toEqual({ key: null, environment: 'development' })
    expect(isAnalyticsAvailable()).toBe(false)
  })

  it('treats an empty key and environment as unset', () => {
    setEnv('EXPO_PUBLIC_POSTHOG_KEY', '')
    setEnv('EXPO_PUBLIC_APP_ENV', '')
    expect(analyticsConfig()).toEqual({ key: null, environment: 'development' })
  })

  it('reads the key and the environment the build sets', () => {
    setEnv('EXPO_PUBLIC_POSTHOG_KEY', 'phc_test')
    setEnv('EXPO_PUBLIC_APP_ENV', 'staging')
    expect(analyticsConfig()).toEqual({ key: 'phc_test', environment: 'staging' })
    expect(isAnalyticsAvailable()).toBe(true)
  })
})
