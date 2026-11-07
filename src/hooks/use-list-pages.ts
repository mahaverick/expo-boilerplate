import { useQueries, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import { useState } from 'react'
import type { ListPage, ListRequest } from '@/types/list.types'

/** What `useListPages` returns. */
interface ListPages<T> {
  /** Every loaded page's rows, in order. */
  items: T[]
  /** True while the first page loads with nothing to show. */
  isPending: boolean
  /** True only when the first page failed and there is no data. */
  isError: boolean
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
interface PagerState {
  signature: string
  cursors: (string | undefined)[]
}

/**
 * Pages a list with "Load more". Each page is its own query from the shared
 * `listQueryOptions`, keyed by its cursor; the rows join in order. A changed
 * request (compared by value) starts again at page 1. It never uses
 * `useInfiniteQuery`, because the shared options serve one page.
 * @param options - Builds the list's query options from a request with a cursor.
 * @param request - The list's request, without a cursor.
 * @returns The rows, the paging state and its actions.
 */
export function useListPages<T, K extends QueryKey>(
  options: (request: ListRequest) => UseQueryOptions<ListPage<T>, Error, ListPage<T>, K>,
  request: ListRequest
): ListPages<T> {
  const signature = JSON.stringify(request)
  const [state, setState] = useState<PagerState>({ signature, cursors: [undefined] })
  let cursors = state.cursors
  if (state.signature !== signature) {
    cursors = [undefined]
    setState({ signature, cursors })
  }

  const results = useQueries({
    queries: cursors.map((cursor) =>
      options(cursor === undefined ? request : { ...request, cursor })
    ),
  })

  const first = results[0]
  const last = results[results.length - 1]
  const items = results.flatMap((result) => result?.data?.items ?? [])
  const lastPage = last?.data?.page
  const hasNext = lastPage !== undefined && lastPage.hasNext && lastPage.nextCursor !== null
  const later = cursors.length > 1
  const loadMoreFailed = later && last?.isError === true && last.data === undefined

  return {
    items,
    isPending: first?.isPending ?? true,
    isError: first?.isError === true && first.data === undefined,
    hasNext,
    isLoadingMore: later && last?.data === undefined && last?.isError !== true,
    loadMoreFailed,
    loadMore: () => {
      const next = lastPage?.nextCursor
      if (!hasNext || next === null || next === undefined) return
      setState({ signature, cursors: [...cursors, next] })
    },
    retry: () => {
      const failed = loadMoreFailed ? last : first
      if (failed?.isError === true) void failed.refetch()
    },
  }
}
