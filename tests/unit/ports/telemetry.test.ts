import * as port from '@/observability/telemetry'
import { analyticsKey, getAnalyticsSessionIdFor, track } from '@/observability/telemetry'
import * as registry from '@/observability/telemetry/event-registry'
import * as facade from '@/observability/telemetry/telemetry'
import { clients, resetPostHogMock } from '@/tests/mocks/posthog-react-native'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

beforeEach(() => {
  facade.resetAnalyticsForTests()
  resetPostHogMock()
})

describe('telemetry port', () => {
  it('exports exactly the names the manifest declares', () => {
    expect(Object.keys(port).sort()).toEqual(['analyticsKey', 'getAnalyticsSessionIdFor', 'track'])
  })

  it('is the facade and the registry', () => {
    expect(track).toBe(facade.track)
    expect(getAnalyticsSessionIdFor).toBe(facade.getAnalyticsSessionIdFor)
    expect(analyticsKey).toBe(registry.analyticsKey)
  })

  it('sends nothing and links no session with no key', () => {
    facade.initAnalytics()
    expect(() => {
      track('sign_in_completed', { method: 'link' })
    }).not.toThrow()
    expect(clients).toHaveLength(0)
    expect(getAnalyticsSessionIdFor('user-1')).toBeNull()
  })

  it('returns the key it is given', () => {
    expect(analyticsKey('members')).toBe('members')
  })
})
