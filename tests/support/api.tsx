/**
 * @file Helpers for screen tests that call the API: a fake axios adapter and a
 * render that wraps the screen in a real TanStack Query client.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react-native'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import type { ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { apiClient } from '@/http/client'
import { METRICS } from '@/tests/support/a11y'

/** What the fake adapter answers: a status and a body, or a network failure. */
export type FakeAnswer = { status: number; data: unknown } | 'network-error'

/** Picks the answer for a request. May return a promise to hold the answer back. */
export type FakeHandler = (config: InternalAxiosRequestConfig) => FakeAnswer | Promise<FakeAnswer>

/** The adapter `apiClient` had when this module loaded. */
const realAdapter = apiClient.defaults.adapter

/**
 * Installs an adapter that records each request and answers through `handler`.
 * @param handler - Picks the answer for a request.
 * @returns The requests the adapter saw, in order.
 */
export function serve(handler: FakeHandler): InternalAxiosRequestConfig[] {
  const sent: InternalAxiosRequestConfig[] = []
  /** Answers or rejects as the handler says. */
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config)
    const answer = await handler(config)
    if (answer === 'network-error') throw new AxiosError('offline', 'ERR_NETWORK', config)
    const response = {
      data: answer.data,
      status: answer.status,
      statusText: '',
      headers: { 'content-type': 'application/json' },
      config,
    }
    if (answer.status >= 200 && answer.status < 300) return response
    throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response)
  }
  apiClient.defaults.adapter = adapter
  return sent
}

/** Puts back the adapter `apiClient` had. */
export function restoreApi(): void {
  apiClient.defaults.adapter = realAdapter
}

/**
 * The JSON body of a recorded request, or undefined when it had none.
 * @param config - The request config.
 * @returns The parsed body.
 */
export function bodyOf(config: InternalAxiosRequestConfig | undefined): unknown {
  const data = config?.data as string | undefined
  return data === undefined ? undefined : JSON.parse(data)
}

/**
 * Wraps a screen in the safe-area provider and a query client.
 * @param element - The screen.
 * @param client - The query client.
 * @returns The tree to render or re-render.
 */
export function screenTree(element: ReactElement, client: QueryClient): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </SafeAreaProvider>
  )
}

/**
 * Renders a screen inside the safe-area provider and a query client.
 * @param element - The screen.
 * @param client - The query client; a fresh one by default.
 * @returns The promise `render` returns.
 */
export async function renderScreen(
  element: ReactElement,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  return render(screenTree(element, client))
}
