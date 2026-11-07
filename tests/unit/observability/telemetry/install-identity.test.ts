import { jest } from '@jest/globals'
import { installAnalyticsIdentity } from '@/observability/telemetry/install-identity'
import { useAuthStore } from '@/states/auth.store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

/** The facade calls in order, as `name(arg)`. */
const mockCalls: string[] = []

jest.mock('@/observability/telemetry/telemetry', () => ({
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
