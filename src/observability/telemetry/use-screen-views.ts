/**
 * @file Sends a screen view for each route the person opens.
 */
import { usePathname, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { captureScreen } from './telemetry'

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
    captureScreen(pattern)
  }, [pattern, pathname])
}
