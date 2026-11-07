import { jest } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'
import { useScreenViews } from '@/observability/telemetry/use-screen-views'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

/** What the mocked router reports. */
const mockRoute = { segments: [] as string[], pathname: '/' }
/** The screens the facade was asked to capture. */
const mockScreens: unknown[][] = []

jest.mock('expo-router', () => ({
  useSegments: () => mockRoute.segments,
  usePathname: () => mockRoute.pathname,
}))

jest.mock('@/observability/telemetry/telemetry', () => ({
  captureScreen: (...args: unknown[]) => mockScreens.push(args),
}))

beforeEach(() => {
  mockScreens.length = 0
  mockRoute.segments = []
  mockRoute.pathname = '/'
})

describe('useScreenViews', () => {
  it('screen views send the route pattern, never the path', async () => {
    mockRoute.segments = ['invitations', 'accept']
    mockRoute.pathname = '/invitations/accept'
    const first = await renderHook(() => {
      useScreenViews()
    })
    expect(mockScreens).toEqual([['/invitations/accept']])
    await first.unmount()
    mockScreens.length = 0
    mockRoute.segments = ['(app)', 'settings', 'workspace', '[slug]', 'members']
    mockRoute.pathname = '/settings/workspace/acme/members'
    await renderHook(() => {
      useScreenViews()
    })
    expect(mockScreens).toEqual([['/settings/workspace/[slug]/members']])
    expect(JSON.stringify(mockScreens)).not.toContain('acme')
  })

  it('names the root and drops group segments', async () => {
    mockRoute.segments = ['(app)', '(tabs)']
    await renderHook(() => {
      useScreenViews()
    })
    expect(mockScreens).toEqual([['/']])
  })

  it('sends a screen once per path change', async () => {
    mockRoute.segments = ['(app)', 'tenants', '[slug]']
    mockRoute.pathname = '/tenants/acme'
    const { rerender } = await renderHook(() => {
      useScreenViews()
    })
    await rerender({})
    expect(mockScreens).toHaveLength(1)
    mockRoute.pathname = '/tenants/globex'
    await rerender({})
    expect(mockScreens).toEqual([['/tenants/[slug]'], ['/tenants/[slug]']])
    await rerender({})
    expect(mockScreens).toHaveLength(2)
  })
})
