import { useQuery } from '@tanstack/react-query'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { z } from 'zod'
import { clientSettingsQueryOptions } from '@/queries/client-settings.queries'

/** The platforms that have a store. */
export type StoreOs = 'ios' | 'android'

/** Three dot-separated non-negative integers, with no suffix. */
const VERSION = /^\d+\.\d+\.\d+$/

/** What the API says about the minimum build: one version or `null` per platform. */
const minimumSchema = z.object({
  minimumAppVersion: z.object({
    ios: z.string().regex(VERSION).nullable(),
    android: z.string().regex(VERSION).nullable(),
  }),
})

/**
 * Compares two versions part by part, as numbers.
 * @param a - A version such as `1.2.10`.
 * @param b - A version such as `1.2.9`.
 * @returns A negative number, 0 or a positive number as `a` is below, equal to or above `b`; `null` when either does not parse.
 */
export function compareVersions(a: string, b: string): number | null {
  if (!VERSION.test(a) || !VERSION.test(b)) return null
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * The minimum build the server allows on a platform.
 * @param settings - The client settings body, of any shape.
 * @param os - The platform.
 * @returns The version, or `null` when there is no minimum or it does not parse.
 */
export function minimumFor(settings: unknown, os: StoreOs): string | null {
  const parsed = minimumSchema.safeParse(settings)
  return parsed.success ? parsed.data.minimumAppVersion[os] : null
}

/**
 * Whether the installed build is older than the server's minimum. It is false
 * while the settings load, after a failure, and when either version is
 * missing or unreadable, so the app never blocks on a guess. It reads the
 * settings again every 5 minutes while the app is in the foreground, which
 * matches the server's `max-age=300`, so a raised minimum reaches a running app.
 * @returns True when the person must update.
 */
export function useUpdateRequired(): boolean {
  const { data } = useQuery({
    ...clientSettingsQueryOptions(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false
  const minimum = minimumFor(data, Platform.OS)
  const installed = Application.nativeApplicationVersion
  if (minimum === null || installed === null) return false
  const order = compareVersions(installed, minimum)
  return order !== null && order < 0
}

/**
 * The store page of this app.
 * @param os - The platform.
 * @returns The link, or `null` when the build does not know it.
 */
export function storeUrl(os: StoreOs): string | null {
  const config = Constants.expoConfig
  if (os === 'ios') {
    const id = config?.extra?.iosAppStoreId as unknown
    return typeof id === 'string' && id !== '' ? `itms-apps://apps.apple.com/app/id${id}` : null
  }
  const pkg = config?.android?.package
  return pkg ? `market://details?id=${pkg}` : null
}
