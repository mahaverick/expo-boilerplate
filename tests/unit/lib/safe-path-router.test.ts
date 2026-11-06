import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath'
import { safePath } from '@/lib/safe-path'
import { describe, expect, it } from '@/tests/support/runner'

/** The routes the check guards: the token screen, Home and the catch-all. */
const SCREENS = { index: '', 'auth/link': 'auth/link', '+not-found': '*' }

/**
 * Resolves a path to the route name and parameters Expo Router's own parser gives it.
 * @param path - The path to resolve.
 * @returns The matched route's name and params, or `undefined`.
 */
function routeOf(path: string): { name: string; params?: Record<string, unknown> } | undefined {
  const state = getStateFromPath(path, { screens: SCREENS })
  const route = state?.routes[0]
  return route ? { name: route.name, params: route.params as Record<string, unknown> } : undefined
}

describe('safePath against the router', () => {
  it('the parser maps the token path itself to the token screen', () => {
    expect(routeOf('/auth/link?token=x')?.name).toBe('auth/link')
  })

  it.each([
    ['an encoded query mark', '/auth/link%3Ftoken=x'],
    ['a space before the query', '/auth/link ?token=x'],
    ['a dot segment', '/auth/link/..?token=x'],
  ])('%s never reaches the token screen with a token', (_name, raw) => {
    const path = safePath(raw)
    if (path === null) return
    const route = routeOf(path)
    expect(route?.name === 'auth/link' && route.params?.token !== undefined).toBe(false)
  })
})
