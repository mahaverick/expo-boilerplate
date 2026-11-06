import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient, unwrap } from '@/http/client'
import type { ApiSuccess } from '@/types/api.types'

/**
 * One signed-in session of the caller, as `GET /auth/sessions` lists it.
 * `deviceName` is personal data: show it as row text only.
 */
export interface SignedInSession {
  id: string
  client: 'web' | 'native'
  deviceName: string | null
  /** ISO timestamp of the sign-in. */
  createdAt: string
  /** ISO timestamp of the last use. */
  lastUsedAt: string
  /** True for the session that made this request. */
  current: boolean
}

/** The sessions query key, under the `auth` prefix. */
export const sessionKeys = { all: ['auth', 'sessions'] as const }

/**
 * The caller's signed-in sessions: newest use first, at most 100.
 * @returns The query options.
 */
export function sessionsQueryOptions() {
  return queryOptions({
    queryKey: sessionKeys.all,
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.get<ApiSuccess<SignedInSession[]>>('/auth/sessions', { signal })),
  })
}

/**
 * The caller's signed-in devices. Invalidate `sessionKeys.all` after a revoke.
 * @returns The query.
 */
export function useSessions() {
  return useQuery(sessionsQueryOptions())
}
