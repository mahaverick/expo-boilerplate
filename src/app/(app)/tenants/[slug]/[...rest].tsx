import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Any deeper path under `/tenants/{slug}/`, such as a link to a screen this
 * version lacks. Android's app links claim the whole `/tenants/` prefix, so
 * such a link opens the app; it lands on the workspace's overview, never on
 * Page not found.
 * @returns A redirect to the overview.
 */
export default function TenantSubpath() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <Redirect href={`/tenants/${slug}`} />
}
