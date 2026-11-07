import { formatExpiry, inDays, inMinutes, linkRules } from '@/lib/link-lifetime'
import { describe, expect, it } from '@/tests/support/runner'

describe('link lifetime', () => {
  it('rounds minutes to the nearest, at least 1', () => {
    expect(inMinutes(900)).toBe('15 minutes')
    expect(inMinutes(60)).toBe('1 minute')
    expect(inMinutes(5)).toBe('1 minute')
  })

  it('rounds days up, at least 1', () => {
    expect(inDays(7 * 86_400)).toBe('7 days')
    expect(inDays(86_401)).toBe('2 days')
    expect(inDays(60)).toBe('1 day')
  })

  it('states the link rules with or without a figure', () => {
    expect(linkRules(900)).toBe('The link works once and expires in 15 minutes.')
    expect(linkRules(undefined)).toBe('The link works once.')
  })

  it('formats an expiry with its zone, or null without a valid time', () => {
    expect(formatExpiry('2026-11-03T10:15:00Z', 'UTC')).toBe('3 November 2026 at 10:15 UTC')
    expect(formatExpiry(undefined)).toBeNull()
    expect(formatExpiry('nope')).toBeNull()
  })
})
