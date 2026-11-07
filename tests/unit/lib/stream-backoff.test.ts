import {
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  nextBackoff,
  reopenJitter,
  withJitter,
} from '@/lib/stream-backoff'
import { describe, expect, it } from '@/tests/support/runner'

describe('nextBackoff', () => {
  it('doubles from 1 second and stops at 30 seconds', () => {
    expect(INITIAL_BACKOFF_MS).toBe(1000)
    expect(MAX_BACKOFF_MS).toBe(30_000)
    const steps = [INITIAL_BACKOFF_MS]
    for (let i = 0; i < 6; i += 1) steps.push(nextBackoff(steps.at(-1) ?? 0))
    expect(steps).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])
  })
})

describe('withJitter', () => {
  it('adds nothing at random 0 and 20% at random 1', () => {
    expect(withJitter(10_000, () => 0)).toBe(10_000)
    expect(withJitter(10_000, () => 1)).toBe(12_000)
    expect(withJitter(10_000, () => 0.5)).toBe(11_000)
  })

  it('stays within 20% with Math.random', () => {
    for (let i = 0; i < 50; i += 1) {
      const value = withJitter(1000)
      expect(value).toBeGreaterThanOrEqual(1000)
      expect(value).toBeLessThanOrEqual(1200)
    }
  })
})

describe('MAX_RETRY_AFTER_MS', () => {
  it('is 5 minutes', () => {
    expect(MAX_RETRY_AFTER_MS).toBe(300_000)
  })
})

describe('reopenJitter', () => {
  it('waits from 0 up to 1 second', () => {
    expect(reopenJitter(() => 0)).toBe(0)
    expect(reopenJitter(() => 0.5)).toBe(500)
    const value = reopenJitter()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1000)
  })
})
