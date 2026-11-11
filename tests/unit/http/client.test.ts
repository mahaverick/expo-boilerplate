import { jest } from '@jest/globals'
import { apiOriginUrl, apiUrl } from '@/http/client'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

describe('apiUrl', () => {
  it('puts the API prefix between the origin and the path', () => {
    expect(apiUrl('/notifications/stream')).toBe(
      'https://api.example.test/api/v1/notifications/stream'
    )
    expect(apiUrl('/notifications/stream').endsWith('/api/v1/notifications/stream')).toBe(true)
  })
})

describe('apiOriginUrl', () => {
  it('puts the path straight after the origin, with no API prefix', () => {
    expect(apiOriginUrl('/health')).toBe('https://api.example.test/health')
  })
})
