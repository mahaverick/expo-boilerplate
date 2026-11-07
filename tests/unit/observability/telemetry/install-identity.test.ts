import { jest } from '@jest/globals'
import {
  forgetStaleIdentityWithoutUser,
  installAnalyticsIdentity,
} from '@/observability/telemetry/install-identity'
import { useAuthStore } from '@/states/auth.store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

/** The facade calls in order, as `name(arg)`. */
const mockCalls: string[] = []

jest.mock('@/observability/telemetry/telemetry', () => ({
  forgetStaleIdentity: () => mockCalls.push('forgetStale'),
  identifyUser: (id: string) => mockCalls.push(`identify(${id})`),
  resetAnalytics: () => mockCalls.push('reset'),
  setAnalyticsOptOut: (value: boolean) => mockCalls.push(`optOut(${String(value)})`),
}))

/** A user with the fields the identity reads. */
function user(id: string, analyticsOptOut = false): User {
  return { id, analyticsOptOut } as User
}

let uninstall: () => void

beforeEach(() => {
  mockCalls.length = 0
  useAuthStore.getState().logout()
})

afterEach(() => {
  uninstall()
  useAuthStore.getState().logout()
})

describe('installAnalyticsIdentity', () => {
  it('applies a restored user at install: the opt-out first, then the id', () => {
    useAuthStore.getState().login('tok', user('u1'))
    uninstall = installAnalyticsIdentity()
    expect(mockCalls).toEqual(['optOut(false)', 'identify(u1)'])
  })

  it('an opted-out person is never identified', () => {
    useAuthStore.getState().login('tok', user('u1', true))
    uninstall = installAnalyticsIdentity()
    useAuthStore.getState().login('tok2', user('u1', true))
    expect(mockCalls[0]).toBe('optOut(true)')
    expect(mockCalls.some((call) => call.startsWith('identify'))).toBe(false)
  })

  it('treats a user without the field as opted out, and never identifies them', () => {
    useAuthStore.getState().login('tok', { id: 'u1' } as User)
    uninstall = installAnalyticsIdentity()
    expect(mockCalls).toEqual(['optOut(true)'])
  })

  it('does nothing at install when nobody is signed in', () => {
    uninstall = installAnalyticsIdentity()
    expect(mockCalls).toEqual([])
  })

  it('forgets a stale identity when the restore leaves no user', () => {
    uninstall = installAnalyticsIdentity()
    forgetStaleIdentityWithoutUser()
    expect(mockCalls).toEqual(['forgetStale'])
  })

  it('keeps the identity when the restore signed a user in', () => {
    uninstall = installAnalyticsIdentity()
    useAuthStore.getState().login('tok', user('u1'))
    mockCalls.length = 0
    forgetStaleIdentityWithoutUser()
    expect(mockCalls).toEqual([])
  })

  it('identifies a sign-in by user id only', () => {
    uninstall = installAnalyticsIdentity()
    expect(mockCalls).toEqual([])
    useAuthStore.getState().login('tok', user('u1'))
    expect(mockCalls).toEqual(['optOut(false)', 'identify(u1)'])
  })

  it('resets first for a different user', () => {
    uninstall = installAnalyticsIdentity()
    useAuthStore.getState().login('tok', user('u1'))
    mockCalls.length = 0
    useAuthStore.getState().login('tok', user('u2'))
    expect(mockCalls).toEqual(['reset', 'optOut(false)', 'identify(u2)'])
  })

  it('resets on sign-out and does not touch the opt-out', () => {
    uninstall = installAnalyticsIdentity()
    useAuthStore.getState().login('tok', user('u1', true))
    mockCalls.length = 0
    useAuthStore.getState().logout()
    expect(mockCalls).toEqual(['reset'])
  })

  it('applies a changed analyticsOptOut at once', () => {
    uninstall = installAnalyticsIdentity()
    useAuthStore.getState().login('tok', user('u1'))
    mockCalls.length = 0
    useAuthStore.getState().login('tok', user('u1', true))
    expect(mockCalls).toEqual(['optOut(true)'])
    mockCalls.length = 0
    useAuthStore.getState().login('tok', user('u1', false))
    expect(mockCalls).toEqual(['optOut(false)', 'identify(u1)'])
  })

  it('ignores a token swap and an unchanged profile', () => {
    uninstall = installAnalyticsIdentity()
    useAuthStore.getState().login('tok', user('u1'))
    mockCalls.length = 0
    useAuthStore.getState().setToken('tok2')
    useAuthStore.getState().login('tok2', user('u1'))
    expect(mockCalls).toEqual([])
  })

  it('stops listening once uninstalled', () => {
    uninstall = installAnalyticsIdentity()
    uninstall()
    useAuthStore.getState().login('tok', user('u1'))
    expect(mockCalls).toEqual([])
  })
})
