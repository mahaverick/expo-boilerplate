import { jest } from '@jest/globals'
import Constants from 'expo-constants'
import { redirectSystemPath } from '@/app/+native-intent'
import { isTokenBearingPath, TOKEN_PATHS } from '@/lib/app-links'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }))

/**
 * Sets the build variant that `expo-constants` reports.
 * @param variant - The `extra.appVariant` value, or undefined for none.
 */
function mockVariant(variant: string | undefined): void {
  Constants.expoConfig = { name: 'x', slug: 'x', extra: { appVariant: variant } }
}

beforeEach(() => {
  mockVariant('production')
})

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

  it('keeps the token on a custom-scheme link in the e2e build', () => {
    mockVariant('e2e')
    expect(
      redirectSystemPath({ path: 'expo-boilerplate://auth/link?token=abc', initial: true })
    ).toBe('/auth/link?token=abc')
  })

  it('keeps an e2e invitation link whole and drops its fragment', () => {
    mockVariant('e2e')
    expect(
      redirectSystemPath({
        path: 'expo-boilerplate://invitations/accept?token=t1',
        initial: false,
      })
    ).toBe('/invitations/accept?token=t1')
    expect(
      redirectSystemPath({ path: 'expo-boilerplate:///auth/link?token=a#frag', initial: false })
    ).toBe('/auth/link?token=a')
    expect(redirectSystemPath({ path: 'expo-boilerplate://settings#a', initial: false })).toBe(
      '/settings'
    )
  })

  it.each(['development', 'preview', 'production', undefined])(
    'strips the token for %s',
    (variant) => {
      mockVariant(variant)
      expect(
        redirectSystemPath({ path: 'expo-boilerplate://auth/link?token=abc', initial: true })
      ).toBe('/')
    }
  )

  it('strips the token when the config has no extra', () => {
    Constants.expoConfig = null
    expect(
      redirectSystemPath({ path: 'expo-boilerplate://auth/link?token=abc', initial: true })
    ).toBe('/')
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
