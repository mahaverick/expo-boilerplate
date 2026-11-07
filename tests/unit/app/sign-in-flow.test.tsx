import { jest } from '@jest/globals'
import { act, screen } from '@testing-library/react-native'
import { useEffect, useState } from 'react'
import Home from '@/app/(app)/(tabs)/index'
import AppLayout from '@/app/(app)/_layout'
import Link from '@/app/auth/link'
import { resetSessionForTests } from '@/http/session'
import { resetSessionLifecycleForTests, restoreSession } from '@/http/session-lifecycle'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

/** Where the harness sends a `router.replace`, set while it is mounted. */
let mockNavigate: ((path: string) => void) | undefined
/** The paths the `(app)` guard redirected to. */
const mockRedirects: string[] = []

// The stream opens a real connection; its own suite covers it.
jest.mock('@/components/notifications/notification-stream', () => ({
  NotificationStream: () => null,
}))
jest.mock('expo-router', () => {
  const { useEffect: useMockEffect } = jest.requireActual<typeof import('react')>('react')
  return {
    router: {
      replace: (path: string) => {
        mockNavigate?.(path)
      },
      setParams: jest.fn(),
    },
    useLocalSearchParams: () => ({ token: 'tok', email: 'ada@example.com' }),
    Redirect: ({ href }: { href: string }) => {
      useMockEffect(() => {
        mockRedirects.push(href)
      }, [href])
      return null
    },
    Stack: Object.assign(() => null, { Screen: () => null }),
    usePathname: () => '/',
    useGlobalSearchParams: () => ({}),
    useSegments: () => [],
  }
})
jest.mock('@/lib/storage', () => ({ storage: { getString: () => '1', set: () => undefined } }))

/** Shows `/auth/link` until a replace to `/`, then the guarded Home. */
function Harness() {
  const [path, setPath] = useState('/auth/link')
  useEffect(() => {
    mockNavigate = setPath
    return () => {
      mockNavigate = undefined
    }
  }, [])
  return path === '/' ? (
    <>
      <AppLayout />
      <Home />
    </>
  ) : (
    <Link />
  )
}

beforeEach(() => {
  resetSecureStore()
  resetSessionForTests()
  resetSessionLifecycleForTests()
  mockRedirects.length = 0
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
})

describe('signing in from a mailed link', () => {
  it('ends on Home, and the guard does not send the person to /login', async () => {
    serve((config) => {
      if (config.url === '/auth/link/verify') {
        return {
          status: 200,
          data: {
            success: true,
            data: {
              accessToken: 'access',
              refreshToken: 'refresh',
              refreshTokenExpiresAt: '2027-01-01',
              user: {
                id: 'u1',
                email: 'ada@example.com',
                firstName: null,
                lastName: null,
                createdAt: '2026-01-01',
                platformRole: null,
                analyticsOptOut: false,
              },
              isNewUser: false,
              redirect: null,
            },
          },
        }
      }
      return {
        status: 200,
        data: {
          success: true,
          data: { items: [{ tenant: { id: 't' } }], page: { hasNext: false, nextCursor: null } },
        },
      }
    })
    // Signed out, with the launch restore settled (no stored token).
    await act(async () => {
      await restoreSession()
    })
    await renderScreen(<Harness />)
    expect(
      await screen.findByRole('header', { name: 'Welcome back, ada@example.com' })
    ).toBeTruthy()
    expect(mockRedirects).toEqual([])
  })
})
