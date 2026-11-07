/**
 * @file Covers the signed-in sessions query against a fake axios adapter.
 */
import { QueryClient } from '@tanstack/react-query'
import { sessionKeys, sessionsQueryOptions } from '@/queries/sessions.queries'
import { restoreApi, serve } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import { envelope } from '@/tests/support/workspace-api'

afterEach(() => {
  restoreApi()
})

describe('sessionsQueryOptions', () => {
  it('reads the array out of the API’s wrapper, in the order sent', async () => {
    const rows = [
      {
        id: 's2',
        client: 'native',
        deviceName: 'Pixel 9',
        createdAt: '2026-11-02T00:00:00.000Z',
        lastUsedAt: '2026-11-05T00:00:00.000Z',
        current: true,
      },
      {
        id: 's1',
        client: 'web',
        deviceName: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        lastUsedAt: '2026-10-02T00:00:00.000Z',
        current: false,
      },
    ]
    const sent = serve(() => envelope(rows))
    const data = await new QueryClient().fetchQuery(sessionsQueryOptions())
    expect(data).toEqual(rows)
    expect(sent[0]?.url).toBe('/auth/sessions')
    expect(sent[0]?.method).toBe('get')
    expect(sessionKeys.all).toEqual(['auth', 'sessions'])
  })
})
