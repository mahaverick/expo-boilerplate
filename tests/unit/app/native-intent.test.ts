import { redirectSystemPath } from '@/app/+native-intent'
import { isTokenBearingPath, TOKEN_PATHS } from '@/lib/app-links'
import { describe, expect, it } from '@/tests/support/runner'

describe('redirectSystemPath', () => {
  it.each([
    'expo-boilerplate://auth/link?token=x',
    'expo-boilerplate:///auth/link?token=x',
    'expo-boilerplate://auth/confirm?token=x',
    'expo-boilerplate://invitations/accept?token=x',
    'expo-boilerplate:///invitations/confirm?token=x',
    'expo-boilerplate://auth/link',
    'expo-boilerplate://auth/link/?token=x',
    'expo-boilerplate://auth//link?token=x',
    'expo-boilerplate://auth/%6Cink?token=x',
    'expo-boilerplate:/auth/link?token=x',
    'expo-boilerplate://AUTH/Link?token=x',
    'expo-boilerplate://auth%2Flink?token=x',
    'expo-boilerplate://auth/link#token=x',
  ])('drops a custom-scheme path that carries a token: %s', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/')
    expect(redirectSystemPath({ path, initial: false })).toBe('/')
  })

  it('keeps an https app link', () => {
    const path = 'https://app.example.com/auth/link?token=x'
    expect(redirectSystemPath({ path, initial: true })).toBe(path)
  })

  it('strips the query and fragment from a custom-scheme path with no token', () => {
    expect(redirectSystemPath({ path: 'expo-boilerplate://settings?x=1', initial: true })).toBe(
      '/settings'
    )
    expect(redirectSystemPath({ path: 'expo-boilerplate://settings#a', initial: true })).toBe(
      '/settings'
    )
    expect(redirectSystemPath({ path: 'expo-boilerplate:///', initial: false })).toBe('/')
  })

  it('drops a custom-scheme path with a malformed percent sequence', () => {
    expect(redirectSystemPath({ path: 'expo-boilerplate://auth/%E0%A4%A', initial: true })).toBe(
      '/'
    )
  })

  it('keeps a bare in-app path', () => {
    expect(redirectSystemPath({ path: '/auth/link?token=x', initial: false })).toBe(
      '/auth/link?token=x'
    )
  })
})

describe('isTokenBearingPath', () => {
  it('matches each token path, with a query or a fragment, and nothing longer', () => {
    for (const p of TOKEN_PATHS) {
      expect(isTokenBearingPath(p)).toBe(true)
      expect(isTokenBearingPath(`${p}?token=x`)).toBe(true)
      expect(isTokenBearingPath(`${p}#x`)).toBe(true)
    }
    expect(isTokenBearingPath('/auth/linked')).toBe(false)
    expect(isTokenBearingPath('/settings')).toBe(false)
  })
})
