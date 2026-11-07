import {
  createSseParser,
  openEventStream,
  SSE_MAX_BUFFER,
  SseOverflowError,
  type SseFrame,
} from '@/http/sse'
import { describe, expect, it } from '@/tests/support/runner'

/**
 * Feeds chunks to a fresh parser.
 * @param chunks - The text chunks, in order.
 * @returns The frames the parser reported.
 */
function parse(...chunks: string[]): SseFrame[] {
  const frames: SseFrame[] = []
  const parser = createSseParser((frame) => frames.push(frame))
  for (const chunk of chunks) parser.push(chunk)
  return frames
}

describe('createSseParser', () => {
  it('joins a frame split across two chunks', () => {
    expect(parse('event: notification\nda', 'ta: {"a":1}\n', '\n')).toEqual([
      { event: 'notification', data: '{"a":1}' },
    ])
  })

  it('skips a comment and drops a frame with no data', () => {
    expect(parse(':ping\n\nevent: x\n\ndata: ok\n\n')).toEqual([{ event: 'message', data: 'ok' }])
  })

  it('reads id, event and multi-line data, and strips one space only', () => {
    expect(parse('id: 7\nevent: notification\ndata: a\ndata:  b\ndata:c\n\n')).toEqual([
      { id: '7', event: 'notification', data: 'a\n b\nc' },
    ])
  })

  it('keeps no id when the frame had no id line', () => {
    const [frame] = parse('data: x\n\n')
    expect(frame).toBeDefined()
    expect(frame && 'id' in frame).toBe(false)
  })

  it('handles CRLF, also split inside the separator', () => {
    expect(parse('id: 1\r\ndata: a\r\n\r', '\ndata: b\r\n\r\n')).toEqual([
      { id: '1', event: 'message', data: 'a' },
      { event: 'message', data: 'b' },
    ])
  })

  it('throws past the buffer limit', () => {
    const parser = createSseParser(() => undefined)
    expect(() => {
      parser.push('data: ' + 'x'.repeat(SSE_MAX_BUFFER))
    }).toThrow(SseOverflowError)
    expect(SSE_MAX_BUFFER).toBe(1_048_576)
  })
})

/**
 * Builds a fake fetch response.
 * @param init - The status, headers, text body and stream chunks.
 * @returns The response.
 */
function fakeResponse(init: {
  status?: number
  headers?: Record<string, string>
  text?: string
  chunks?: string[]
}): Response {
  const status = init.status ?? 200
  const encoder = new TextEncoder()
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v] as const)
  )
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: () => Promise.resolve(init.text ?? ''),
    json: () => Promise.resolve(JSON.parse(init.text ?? '')),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of init.chunks ?? []) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
  } as unknown as Response
}

describe('openEventStream', () => {
  const url = 'https://api.example.test/api/v1/notifications/stream'

  it('sends the headers plus Accept, as GET with the signal', async () => {
    const calls: { url: unknown; init: RequestInit }[] = []
    const controller = new AbortController()
    const result = await openEventStream({
      url,
      headers: { Authorization: 'Bearer t' },
      signal: controller.signal,
      onFrame: () => undefined,
      fetch: (u, init) => {
        calls.push({ url: u, init: init })
        return Promise.resolve(fakeResponse({}))
      },
    })
    expect(result).toEqual({ kind: 'ended' })
    expect(calls[0]?.url).toBe(url)
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.signal).toBe(controller.signal)
    expect(calls[0]?.init.headers).toEqual({
      Authorization: 'Bearer t',
      Accept: 'text/event-stream',
    })
  })

  it('reports frames and resolves ended when the body closes', async () => {
    const frames: SseFrame[] = []
    const result = await openEventStream({
      url,
      headers: {},
      signal: new AbortController().signal,
      onFrame: (f) => frames.push(f),
      fetch: () =>
        Promise.resolve(
          fakeResponse({ chunks: ['retry: 3000\n', 'id: 1\ndata: {"a"', ':1}\n\n'] })
        ),
    })
    expect(result).toEqual({ kind: 'ended' })
    expect(frames).toEqual([{ id: '1', event: 'message', data: '{"a":1}' }])
  })

  it('resolves refused with the status and the code from the body', async () => {
    const result = await openEventStream({
      url,
      headers: {},
      signal: new AbortController().signal,
      onFrame: () => undefined,
      fetch: () =>
        Promise.resolve(
          fakeResponse({
            status: 429,
            text: JSON.stringify({
              success: false,
              message: 'tabs',
              statusCode: 429,
              code: 'too_many_streams',
            }),
          })
        ),
    })
    expect(result).toEqual({ kind: 'refused', status: 429, code: 'too_many_streams' })
  })

  it('reads Retry-After seconds as milliseconds', async () => {
    const result = await openEventStream({
      url,
      headers: {},
      signal: new AbortController().signal,
      onFrame: () => undefined,
      fetch: () =>
        Promise.resolve(
          fakeResponse({
            status: 503,
            headers: { 'Retry-After': '30' },
            text: '{"code":"stream_capacity"}',
          })
        ),
    })
    expect(result).toEqual({
      kind: 'refused',
      status: 503,
      code: 'stream_capacity',
      retryAfterMs: 30000,
    })
  })

  it('leaves code and retryAfterMs out for a non-JSON body and a non-numeric header', async () => {
    const result = await openEventStream({
      url,
      headers: {},
      signal: new AbortController().signal,
      onFrame: () => undefined,
      fetch: () =>
        Promise.resolve(
          fakeResponse({
            status: 503,
            headers: { 'Retry-After': 'Wed, 21 Oct 2026' },
            text: '<html>',
          })
        ),
    })
    expect(result).toEqual({ kind: 'refused', status: 503 })
  })

  it('rejects when the signal aborts', async () => {
    const controller = new AbortController()
    const pending = openEventStream({
      url,
      headers: {},
      signal: controller.signal,
      onFrame: () => undefined,
      fetch: (_u, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        }),
    })
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
  })

  it('rejects when the body read fails after the abort', async () => {
    const controller = new AbortController()
    const response = fakeResponse({})
    ;(response as unknown as { body: ReadableStream }).body = new ReadableStream({
      start(c) {
        controller.signal.addEventListener('abort', () => {
          c.error(new Error('aborted'))
        })
      },
    })
    const pending = openEventStream({
      url,
      headers: {},
      signal: controller.signal,
      onFrame: () => undefined,
      fetch: () => Promise.resolve(response),
    })
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
  })

  it('cancels the body when the parser overflows', async () => {
    let cancelled = false
    const response = fakeResponse({})
    ;(response as unknown as { body: ReadableStream }).body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: ' + 'x'.repeat(SSE_MAX_BUFFER)))
      },
      cancel() {
        cancelled = true
      },
    })
    await expect(
      openEventStream({
        url,
        headers: {},
        signal: new AbortController().signal,
        onFrame: () => undefined,
        fetch: () => Promise.resolve(response),
      })
    ).rejects.toThrow(SseOverflowError)
    expect(cancelled).toBe(true)
  })

  it('rejects when the stream closes cleanly after the abort', async () => {
    const controller = new AbortController()
    const response = fakeResponse({})
    ;(response as unknown as { body: ReadableStream }).body = new ReadableStream({
      start(c) {
        controller.signal.addEventListener('abort', () => {
          c.close()
        })
      },
    })
    const pending = openEventStream({
      url,
      headers: {},
      signal: controller.signal,
      onFrame: () => undefined,
      fetch: () => Promise.resolve(response),
    })
    controller.abort(new Error('stopped'))
    await expect(pending).rejects.toThrow('stopped')
  })

  it('delivers no frame for a body that ends mid-frame', async () => {
    const frames: SseFrame[] = []
    const result = await openEventStream({
      url,
      headers: {},
      signal: new AbortController().signal,
      onFrame: (f) => frames.push(f),
      fetch: () => Promise.resolve(fakeResponse({ chunks: ['data: x\n'] })),
    })
    expect(result).toEqual({ kind: 'ended' })
    expect(frames).toEqual([])
  })
})
