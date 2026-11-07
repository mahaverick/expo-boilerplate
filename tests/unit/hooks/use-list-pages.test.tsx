import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { useListPages } from '@/hooks/use-list-pages'
import { listQueryOptions } from '@/queries/list.queries'
import { restoreApi, screenTree, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { ListRequest } from '@/types/list.types'

/** A row of the fake list. */
interface Row {
  id: string
}

/**
 * The options a screen would pass: the shared list query, with no retries.
 * @param request - The request, with the cursor the pager adds.
 * @returns Query options.
 */
const options = (request: ListRequest) =>
  listQueryOptions<Row>({
    key: ['things'],
    path: '/things',
    request,
    retry: () => false,
  })

/**
 * One page of the fake list.
 * @param ids - The row ids.
 * @param next - The next cursor, or null on the last page.
 * @returns A 200 answer.
 */
function pageOf(ids: string[], next: string | null) {
  return {
    status: 200,
    data: {
      success: true,
      data: {
        items: ids.map((id) => ({ id })),
        page: {
          nextCursor: next,
          prevCursor: null,
          hasNext: next !== null,
          hasPrev: false,
          limit: 2,
        },
      },
    },
  }
}

let client: QueryClient

/**
 * Renders the hook inside a real query client.
 * @param initial - The first request.
 * @returns The render result.
 */
function renderPages(initial: ListRequest = {}) {
  return renderHook(
    ({ request }: { request: ListRequest }) => useListPages(options, request, (row) => row.id),
    {
      initialProps: { request: initial },
      wrapper: ({ children }: { children: ReactNode }) => screenTree(<>{children}</>, client),
    }
  )
}

/**
 * A keyset server like express's: rows newest first, two per page, and a
 * cursor that names the row the page starts after.
 * @param rows - The stored rows' ids, in list order. The test edits it.
 * @returns The requests the adapter saw.
 */
function serveKeyset(rows: string[]) {
  return serve((config) => {
    const cursor = (config.params as ListRequest).cursor
    const start = cursor === undefined ? 0 : rows.indexOf(cursor) + 1
    const ids = rows.slice(start, start + 2)
    const more = start + 2 < rows.length
    return pageOf(ids, more ? (ids.at(-1) ?? null) : null)
  })
}

/**
 * Loads page 1, then page 2, of a keyset list.
 * @param rows - The stored rows.
 * @returns The hook's render result.
 */
async function loadTwoPages(rows: string[]) {
  serveKeyset(rows)
  const rendered = await renderPages()
  const { result } = rendered
  await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(rows.slice(0, 2)))
  await act(() => {
    result.current.loadMore()
    return Promise.resolve()
  })
  await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(rows.slice(0, 4)))
  return rendered
}

/**
 * Asserts the shown rows are the stored list's first rows: none lost, none twice.
 * @param shown - The ids the hook returns.
 * @param rows - The stored rows.
 */
function expectWhole(shown: string[], rows: string[]) {
  expect(new Set(shown).size).toBe(shown.length)
  expect(shown).toEqual(rows.slice(0, shown.length))
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  restoreApi()
})

describe('useListPages', () => {
  it('loads the first page, then appends the next on loadMore', async () => {
    serve((config) => {
      const params = config.params as ListRequest
      if (params.cursor === 'c2') return pageOf(['c', 'd'], null)
      return pageOf(['a', 'b'], 'c2')
    })
    const { result } = await renderPages()
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(['a', 'b']))
    expect(result.current.hasNext).toBe(true)
    await act(() => {
      result.current.loadMore()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']))
    expect(result.current.hasNext).toBe(false)
    expect(result.current.isLoadingMore).toBe(false)
  })

  it('starts again at page 1 when the request changes', async () => {
    const sent = serve((config) => {
      const params = config.params as ListRequest
      if (params.search === 'x') return pageOf(['x1'], null)
      if (params.cursor === 'c2') return pageOf(['c'], null)
      return pageOf(['a'], 'c2')
    })
    const { result, rerender } = await renderPages()
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    await act(() => {
      result.current.loadMore()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    await rerender({ request: { search: 'x' } })
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(['x1']))
    expect(sent.at(-1)?.params).toMatchObject({ search: 'x' })
    expect(sent.at(-1)?.params).not.toHaveProperty('cursor')
  })

  it('does not reset for an equal request object', async () => {
    serve((config) =>
      (config.params as ListRequest).cursor === 'c2' ? pageOf(['c'], null) : pageOf(['a'], 'c2')
    )
    const { result, rerender } = await renderPages({ search: 'q' })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    await act(() => {
      result.current.loadMore()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    await rerender({ request: { search: 'q' } })
    expect(result.current.items).toHaveLength(2)
  })

  it('a failed first page is isError, not an empty list', async () => {
    serve(() => ({ status: 500, data: { success: false } }))
    const { result } = await renderPages()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.items).toEqual([])
    expect(result.current.loadMoreFailed).toBe(false)
  })

  it('retry reloads a failed first page', async () => {
    let fail = true
    serve(() => (fail ? { status: 500, data: { success: false } } : pageOf(['a'], null)))
    const { result } = await renderPages()
    await waitFor(() => expect(result.current.isError).toBe(true))
    fail = false
    await act(() => {
      result.current.retry()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.isError).toBe(false)
  })

  it('a failed later page keeps the loaded items and retries that page', async () => {
    let fail = true
    serve((config) => {
      if ((config.params as ListRequest).cursor === 'c2') {
        return fail ? { status: 500, data: { success: false } } : pageOf(['c'], null)
      }
      return pageOf(['a', 'b'], 'c2')
    })
    const { result } = await renderPages()
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    await act(() => {
      result.current.loadMore()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.loadMoreFailed).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(result.current.items.map((r) => r.id)).toEqual(['a', 'b'])
    fail = false
    await act(() => {
      result.current.retry()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(['a', 'b', 'c']))
    expect(result.current.loadMoreFailed).toBe(false)
  })

  it('loses no row when a row is added above the boundary and the list refetches', async () => {
    const rows = ['e', 'd', 'c', 'b', 'a']
    const { result } = await loadTwoPages(rows)
    rows.unshift('f')
    await act(() => client.invalidateQueries({ queryKey: ['things'] }))
    await waitFor(() => expect(result.current.items[0]?.id).toBe('f'))
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    expectWhole(
      result.current.items.map((r) => r.id),
      rows
    )
    expect(result.current.hasNext).toBe(true)
  })

  it('shows no row twice when a row above the boundary goes and the list refetches', async () => {
    const rows = ['e', 'd', 'c', 'b', 'a']
    const { result } = await loadTwoPages(rows)
    rows.shift()
    await act(() => client.invalidateQueries({ queryKey: ['things'] }))
    await waitFor(() => expect(result.current.items[0]?.id).toBe('d'))
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    expectWhole(
      result.current.items.map((r) => r.id),
      rows
    )
  })

  it('Load more never shrinks the list after page 1 refetches the same rows', async () => {
    const rows = ['f', 'e', 'd', 'c', 'b', 'a']
    const { result } = await loadTwoPages(rows)
    await act(() => client.invalidateQueries({ queryKey: ['things'] }))
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    const shown = result.current.items.length
    await act(() => {
      result.current.loadMore()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    expect(result.current.items.length).toBeGreaterThan(shown)
    expectWhole(
      result.current.items.map((r) => r.id),
      rows
    )
  })

  it('keeps the loaded pages when only a later page refetches', async () => {
    const rows = ['e', 'd', 'c', 'b', 'a']
    const { result } = await loadTwoPages(rows)
    await act(() =>
      client.invalidateQueries({
        predicate: (query) => JSON.stringify(query.queryKey).includes('"cursor":"d"'),
      })
    )
    expect(result.current.items.map((r) => r.id)).toEqual(['e', 'd', 'c', 'b'])
  })

  it('keeps page 2 when page 1 changes only in its total and its rows’ fields', async () => {
    const rows = ['e', 'd', 'c', 'b', 'a']
    const { result } = await loadTwoPages(rows)
    serve((config) => {
      const cursor = (config.params as ListRequest).cursor
      const start = cursor === undefined ? 0 : rows.indexOf(cursor) + 1
      const ids = rows.slice(start, start + 2)
      const answer = pageOf(ids, start + 2 < rows.length ? (ids.at(-1) ?? null) : null)
      const data = answer.data.data as Record<string, unknown>
      data.items = ids.map((id) => ({ id, readAt: 'now' }))
      if (cursor === undefined) data.total = { count: 4, capped: false }
      return answer
    })
    await act(() => client.invalidateQueries({ queryKey: ['things'] }))
    await waitFor(() => expect(result.current.items[0]).toEqual({ id: 'e', readAt: 'now' }))
    expect(result.current.items.map((r) => r.id)).toEqual(['e', 'd', 'c', 'b'])
  })

  it('starts again at page 1 when a new row pushes out its last row', async () => {
    const rows = ['e', 'd', 'c', 'b', 'a']
    const { result } = await loadTwoPages(rows)
    rows.unshift('f')
    await act(() => client.invalidateQueries({ queryKey: ['things'] }))
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(['f', 'e']))
  })

  it('starts again at page 1 when its last row is removed', async () => {
    const rows = ['e', 'd', 'c', 'b', 'a']
    const { result } = await loadTwoPages(rows)
    rows.splice(1, 1)
    await act(() => client.invalidateQueries({ queryKey: ['things'] }))
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(['e', 'c']))
  })

  it('shows a row that two pages hold only once', async () => {
    serve((config) =>
      (config.params as ListRequest).cursor === 'c2'
        ? pageOf(['b', 'c'], null)
        : pageOf(['a', 'b'], 'c2')
    )
    const { result } = await renderPages()
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    await act(() => {
      result.current.loadMore()
      return Promise.resolve()
    })
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(['a', 'b', 'c']))
  })

  it('ignores loadMore while a page is loading or none follows', async () => {
    const sent = serve(() => pageOf(['a'], null))
    const { result } = await renderPages()
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    await act(() => {
      result.current.loadMore()
      return Promise.resolve()
    })
    expect(sent).toHaveLength(1)
  })
})
