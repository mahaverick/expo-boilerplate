import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import * as Application from 'expo-application'
import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { compareVersions, minimumFor, storeUrl, useUpdateRequired } from '@/lib/minimum-version'
import { restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0' }))
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { iosAppStoreId: '123456' },
      android: { package: 'com.example.app' },
    },
  },
}))

const mockedApplication = Application as {
  nativeApplicationVersion: string | null
}
const BASE = {
  signInLinkTtlSeconds: 900,
  stepUpLinkTtlSeconds: 900,
  invitationTtlSeconds: 86400,
  supportEmail: 'help@example.com',
}

/** Serves the settings with this `minimumAppVersion` (omitted when undefined). */
function serveMinimum(minimum: unknown): void {
  serve(() => ({
    status: 200,
    data: {
      success: true,
      data: minimum === undefined ? BASE : { ...BASE, minimumAppVersion: minimum },
    },
  }))
}

/** Reads `useUpdateRequired` inside a fresh query client. */
async function renderRequired(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  return await renderHook(() => useUpdateRequired(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  mockedApplication.nativeApplicationVersion = '1.0.0'
  Platform.OS = 'ios'
})
afterEach(() => {
  restoreApi()
  jest.useRealTimers()
})

describe('compareVersions', () => {
  it('orders 1.2.10 above 1.2.9', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0)
    expect(compareVersions('1.2.9', '1.2.10')).toBeLessThan(0)
  })
  it('gives 0 for equal versions', () => {
    expect(compareVersions('2.0.1', '2.0.1')).toBe(0)
  })
  it.each(['', '1.2', 'abc', '1.2.3.4', '1.2.3-beta', '1.2.-3', '1.2.x'])(
    'returns null for %j',
    (bad) => {
      expect(compareVersions(bad, '1.0.0')).toBeNull()
      expect(compareVersions('1.0.0', bad)).toBeNull()
    }
  )
})

describe('minimumFor', () => {
  it('reads the platform entry', () => {
    const settings = { minimumAppVersion: { ios: '1.2.3', android: '2.0.0' } }
    expect(minimumFor(settings, 'ios')).toBe('1.2.3')
    expect(minimumFor(settings, 'android')).toBe('2.0.0')
  })
  it.each([
    null,
    undefined,
    'text',
    {},
    { minimumAppVersion: null },
    { minimumAppVersion: { ios: null, android: null } },
    { minimumAppVersion: { ios: '1.2', android: 'abc' } },
    { minimumAppVersion: { ios: 5 } },
  ])('gives null for %j', (settings) => {
    expect(minimumFor(settings, 'ios')).toBeNull()
    expect(minimumFor(settings, 'android')).toBeNull()
  })
})

describe('useUpdateRequired', () => {
  it('blocks when the native version is below the minimum', async () => {
    serveMinimum({ ios: '1.0.1', android: null })
    const { result } = await renderRequired()
    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('does not block at or above the minimum', async () => {
    serveMinimum({ ios: '1.0.0', android: null })
    const sent = serve(() => ({
      status: 200,
      data: {
        success: true,
        data: { ...BASE, minimumAppVersion: { ios: '1.0.0', android: null } },
      },
    }))
    const { result } = await renderRequired()
    await waitFor(() => {
      expect(sent.length).toBe(1)
    })
    expect(result.current).toBe(false)
  })

  it('does not block when the minimum is null', async () => {
    const sent = serve(() => ({
      status: 200,
      data: {
        success: true,
        data: { ...BASE, minimumAppVersion: { ios: null, android: null } },
      },
    }))
    const { result } = await renderRequired()
    await waitFor(() => {
      expect(sent.length).toBe(1)
    })
    expect(result.current).toBe(false)
  })

  it('uses the Android entry on Android', async () => {
    Platform.OS = 'android'
    serveMinimum({ ios: null, android: '3.0.0' })
    const { result } = await renderRequired()
    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('never blocks while loading or after a failure', async () => {
    const sent = serve(() => ({ status: 500, data: { success: false } }))
    const { result } = await renderRequired()
    expect(result.current).toBe(false)
    await waitFor(() => {
      expect(sent.length).toBe(1)
    })
    expect(result.current).toBe(false)
  })

  it.each([
    ['empty strings', { ios: '', android: '' }],
    ['two parts', { ios: '1.2', android: '1.2' }],
    ['text', { ios: 'abc', android: 'abc' }],
    ['null', null],
    ['absent', undefined],
    ['a non-object', 'x'],
  ])('never blocks on a version it cannot read (%s)', async (_name, minimum) => {
    const sent = serve(() => ({
      status: 200,
      data: {
        success: true,
        data: minimum === undefined ? BASE : { ...BASE, minimumAppVersion: minimum },
      },
    }))
    const { result } = await renderRequired()
    await waitFor(() => {
      expect(sent.length).toBe(1)
    })
    expect(result.current).toBe(false)
  })

  it.each([null, '1.0'])('never blocks when the native version is %j', async (version) => {
    mockedApplication.nativeApplicationVersion = version
    const sent = serve(() => ({
      status: 200,
      data: {
        success: true,
        data: { ...BASE, minimumAppVersion: { ios: '9.0.0', android: '9.0.0' } },
      },
    }))
    const { result } = await renderRequired()
    await waitFor(() => {
      expect(sent.length).toBe(1)
    })
    expect(result.current).toBe(false)
  })

  it('the query refetches after 5 minutes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    serveMinimum({ ios: null, android: null })
    await renderRequired(client)
    await waitFor(() => {
      expect(client.getQueryState(['client-settings'])?.status).toBe('success')
    })
    const observer = client.getQueryCache().find({ queryKey: ['client-settings'] })?.observers[0]
    expect(observer?.options.staleTime).toBe(5 * 60_000)
  })
})

describe('storeUrl', () => {
  it('builds the App Store and Play Store links', () => {
    expect(storeUrl('ios')).toBe('itms-apps://apps.apple.com/app/id123456')
    expect(storeUrl('android')).toBe('market://details?id=com.example.app')
  })
})
