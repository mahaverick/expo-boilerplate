import { useQueries, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import { useState } from 'react'
import type { ListPage, ListRequest } from '@/types/list.types'

/** What `useListPages` returns. */
interface ListPages<T> {
  /** Every loaded page's rows, in order, each key once. */
  items: T[]
  /** True while the first page loads with nothing to show. */
  isPending: boolean
  /** True only when the first page failed and there is no data. */
  isError: boolean
  /** The first page's error, for a caller that reads its status. */
  error: Error | null
  /** True when the last loaded page has a page after it. */
  hasNext: boolean
  /** Loads the page after the last loaded one. Does nothing while one loads or fails. */
  loadMore: () => void
  /** Reloads the failed page: the first page if it failed, else the later one. */
  retry: () => void
  /** True while a later page loads. */
  isLoadingMore: boolean
  /** True when a later page failed. The loaded rows stay. */
  loadMoreFailed: boolean
}

/** The cursors of the pages asked for, for one request. `undefined` is page 1. */
interface PagerState<T> {
  signature: string
  cursors: (string | undefined)[]
  /** Page 1's data when page 2 was asked for; the later cursors come from it. */
  base: ListPage<T> | undefined
}

/**
 * Pages a list with "Load more". Each page is its own query from the shared
 * `listQueryOptions`, keyed by its cursor; the rows join in order, each key
 * once. A changed request (compared by value) starts again at page 1. So does
 * a page 1 whose rows changed after page 2 was asked for (an invalidation or a
 * refocus that brought new rows): express's cursors seek after a boundary row
 * (`list-page.utilities.ts`), so cursors taken from page 1's old rows would
 * skip or repeat rows. A refetch that brings the same rows keeps the pages:
 * structural sharing keeps page 1's data object, and its boundary row holds.
 * It never uses `useInfiniteQuery`, because the shared options serve one page.
 * @param options - Builds the list's query options from a request with a cursor.
 * @param request - The list's request, without a cursor.
 * @param keyOf - A row's unique key, such as its id.
 * @returns The rows, the paging state and its actions.
 */
export function useListPages<T, K extends QueryKey>(
  options: (request: ListRequest) => UseQueryOptions<ListPage<T>, Error, ListPage<T>, K>,
  request: ListRequest,
  keyOf: (item: T) => string
): ListPages<T> {
  const signature = JSON.stringify(request)
  const [state, setState] = useState<PagerState<T>>({
    signature,
    cursors: [undefined],
    base: undefined,
  })
  let cursors = state.cursors
  if (state.signature !== signature) {
    cursors = [undefined]
    setState({ signature, cursors, base: undefined })
  }

  const all = useQueries({
    queries: cursors.map((cursor) =>
      options(cursor === undefined ? request : { ...request, cursor })
    ),
  })
  // Page 1's data is a subscribed field, so new rows re-render at once and this render shows page 1 alone.
  const refolded = cursors.length > 1 && all[0]?.data !== state.base
  if (refolded) {
    cursors = [undefined]
    setState({ signature, cursors, base: undefined })
  }
  const results = refolded ? all.slice(0, 1) : all

  const first = results[0]
  const last = results[results.length - 1]
  const seen = new Set<string>()
  const items = results
    .flatMap((result) => result?.data?.items ?? [])
    .filter((item) => {
      const key = keyOf(item)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  const lastPage = last?.data?.page
  const hasNext = lastPage !== undefined && lastPage.hasNext && lastPage.nextCursor !== null
  const later = cursors.length > 1
  const loadMoreFailed = later && last?.isError === true && last.data === undefined

  return {
    items,
    isPending: first?.isPending ?? true,
    isError: first?.isError === true && first.data === undefined,
    error: first?.error ?? null,
    hasNext,
    isLoadingMore: later && last?.data === undefined && last?.isError !== true,
    loadMoreFailed,
    loadMore: () => {
      const next = lastPage?.nextCursor
      if (!hasNext || next === null || next === undefined) return
      setState({
        signature,
        cursors: [...cursors, next],
        base: cursors.length === 1 ? first?.data : state.base,
      })
    },
    retry: () => {
      const failed = loadMoreFailed ? last : first
      if (failed?.isError === true) void failed.refetch()
    },
  }
}
