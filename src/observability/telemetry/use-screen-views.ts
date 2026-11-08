/**
 * @file Sends a screen view for each route the person opens, and keeps the
 * current route pattern for the exception reporter's `route_id`.
 */
import { usePathname, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { captureScreen } from './telemetry'

/** The pattern of the route on screen, set once its screen view is sent. */
let current: string | undefined

/**
 * The route pattern on screen now, for an exception's `route_id`.
 * @returns The pattern, or undefined before the first screen.
 */
export function currentRoutePattern(): string | undefined {
  return current
}

/**
 * The route pattern for the current segments: group segments dropped,
 * dynamic ones kept as `[name]`, and `/` for the root.
 * @param segments - The segments `useSegments` returns.
 * @returns The pattern, such as `/settings/workspace/[slug]/members`.
 */
function routePattern(segments: readonly string[]): string {
  const kept = segments.filter((segment) => !/^\(.*\)$/.test(segment))
  return `/${kept.join('/')}`
}

/**
 * Captures a screen view once per change of route. The screen is the route
 * pattern, never the path, so a slug or a token never leaves the device.
 */
export function useScreenViews(): void {
  const segments: string[] = useSegments()
  const pathname = usePathname()
  const pattern = routePattern(segments)
  useEffect(() => {
    current = pattern
    captureScreen(pattern)
  }, [pattern, pathname])
}
