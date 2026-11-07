import { Redirect, type Href, useGlobalSearchParams, useLocalSearchParams } from 'expo-router'
import type { WorkspaceSection } from '@/constants/settings'

/**
 * Sends the person to one workspace settings screen and keeps the query. A
 * `token` parameter and the route's own path segments are dropped.
 * @param props - The screen to open.
 * @param props.to - The section's key.
 * @returns The redirect.
 */
export function WorkspaceSettingsRedirect({ to }: { to: WorkspaceSection['key'] }) {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const params = useGlobalSearchParams()
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'token' || key === 'slug' || key === 'rest' || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
  }
  const path = `/settings/workspace/${slug}/${to}`
  const text = query.toString()
  return <Redirect href={(text ? `${path}?${text}` : path) as Href} />
}
