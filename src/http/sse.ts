/**
 * @file The server-sent-events transport: a pure frame parser and a function
 * that opens `GET /notifications/stream` over `expo/fetch` and reports how it
 * ended. Reconnecting is the caller's job.
 */
import { fetch as expoFetch } from 'expo/fetch'

/** One parsed frame. `id` is present only when the frame had an `id:` line. */
export interface SseFrame {
  id?: string
  event: string
  data: string
}

/**
 * The most characters (UTF-16 code units of the decoded text) the parser holds
 * for a frame that has not ended. Complete frames never count.
 */
export const SSE_MAX_BUFFER = 1_048_576

/** Thrown by the parser when an unfinished frame passes `SSE_MAX_BUFFER`. */
export class SseOverflowError extends Error {
  /** Names the limit that was passed. */
  constructor() {
    super(`The stream buffered more than ${String(SSE_MAX_BUFFER)} characters without a frame end.`)
    this.name = 'SseOverflowError'
  }
}

/**
 * Reads one frame's lines.
 * @param raw - The frame text without its blank line.
 * @returns The frame, or undefined for a comment-only frame or one with no data.
 */
function parseFrame(raw: string): SseFrame | undefined {
  let id: string | undefined
  let event = 'message'
  const data: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line === '' || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'id') id = value
    else if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  if (data.length === 0) return undefined
  const frame: SseFrame = { event, data: data.join('\n') }
  if (id !== undefined) frame.id = id
  return frame
}

/**
 * Creates a parser that reports each complete frame, in order. A frame ends at
 * a blank line (`\n\n` or `\r\n\r\n`) and may arrive across any number of chunks.
 * @param onFrame - Called once per frame that has data.
 * @returns The parser; `push` takes decoded text.
 * @throws SseOverflowError From `push`, when the unfinished tail passes `SSE_MAX_BUFFER`.
 */
export function createSseParser(onFrame: (frame: SseFrame) => void): {
  push: (chunk: string) => void
} {
  let buffer = ''
  return {
    push(chunk: string): void {
      buffer += chunk
      const parts = buffer.split(/\r?\n\r?\n/)
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const frame = parseFrame(part)
        if (frame) onFrame(frame)
      }
      if (buffer.length > SSE_MAX_BUFFER) throw new SseOverflowError()
    },
  }
}

/** How a stream that opened or tried to open came to an end. */
export type StreamEnd =
  | { kind: 'ended' }
  | { kind: 'refused'; status: number; code?: string; retryAfterMs?: number }

/** The part of a fetch response this transport reads. */
interface StreamResponse {
  status: number
  ok: boolean
  headers: { get: (name: string) => string | null }
  text: () => Promise<string>
  body: ReadableStream<Uint8Array> | null
}

/** The part of `fetch` this transport calls; tests pass a fake. */
export type StreamFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal }
) => Promise<StreamResponse>

/**
 * Reads the `code` of an error envelope, or nothing when the body is not one.
 * @param response - A refusal.
 * @returns The code, or undefined. The message is never read.
 */
async function readCode(response: StreamResponse): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await response.text())
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const code = (parsed as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  } catch {
    return undefined
  }
}

/**
 * Reads a `Retry-After` header given in seconds.
 * @param value - The header value, or null.
 * @returns Milliseconds, or undefined when absent or not a number.
 */
function readRetryAfterMs(value: string | null): number | undefined {
  if (value === null || !/^\s*\d+(\.\d+)?\s*$/.test(value)) return undefined
  return Math.round(Number(value) * 1000)
}

/**
 * Opens an event stream and feeds its frames to `onFrame` until it ends.
 * @param options - The URL, request headers, abort signal, frame callback and an optional `fetch` (default: `expo/fetch`).
 * @returns `ended` when the body closes; `refused` for a non-2xx answer.
 * @throws On a network failure, an abort, or an `SseOverflowError`.
 */
export async function openEventStream(options: {
  url: string
  headers: Record<string, string>
  signal: AbortSignal
  onFrame: (frame: SseFrame) => void
  fetch?: StreamFetch
}): Promise<StreamEnd> {
  const doFetch: StreamFetch = options.fetch ?? expoFetch
  const response = await doFetch(options.url, {
    method: 'GET',
    headers: { ...options.headers, Accept: 'text/event-stream' },
    signal: options.signal,
  })
  if (!response.ok) {
    const refused: StreamEnd = { kind: 'refused', status: response.status }
    const retryAfterMs = readRetryAfterMs(response.headers.get('Retry-After'))
    const code = await readCode(response)
    if (code !== undefined) refused.code = code
    if (retryAfterMs !== undefined) refused.retryAfterMs = retryAfterMs
    return refused
  }
  if (!response.body) return { kind: 'ended' }
  const parser = createSseParser(options.onFrame)
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }
  return { kind: 'ended' }
}
