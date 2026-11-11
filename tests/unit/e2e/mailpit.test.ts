import { execFile } from 'node:child_process'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'

const execFileAsync = promisify(execFile)

/** The module under test. */
const MODULE = path.join(repoRoot, 'e2e/helpers/mailpit.mjs')

/** The recipient the tests mail; it holds a `+`, as the flows' addresses do. */
const TO = 'e2e+links-1@example.test'

/** One message the fake Mailpit lists. */
interface FakeMessage {
  ID: string
  Created: string
  To: { Address: string }[]
  HTML: string
}

/** The fake Mailpit's servers, closed after each test. */
const servers: http.Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      // A server that never answers holds its sockets open until they are cut.
      server.closeAllConnections()
      return new Promise((done) => server.close(done))
    })
  )
})

/**
 * Start a local fake of Mailpit's search and message endpoints.
 * @param messagesAtPoll - The messages the search lists on the nth search (0-based); the last entry repeats.
 * @returns Its origin and the raw `query` values it received.
 */
async function fakeMailpit(messagesAtPoll: FakeMessage[][]) {
  const queries: (string | null)[] = []
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake')
    response.setHeader('content-type', 'application/json')
    if (url.pathname === '/api/v1/search') {
      queries.push(url.searchParams.get('query'))
      const messages = messagesAtPoll[Math.min(queries.length - 1, messagesAtPoll.length - 1)]
      response.end(JSON.stringify({ messages }))
      return
    }
    const id = url.pathname.split('/').pop()
    const message = messagesAtPoll.flat().find((m) => m.ID === id)
    response.end(JSON.stringify({ HTML: message?.HTML ?? '', Text: '' }))
  })
  servers.push(server)
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, queries }
}

/**
 * A message to `to` holding one link.
 * @param id - The message id.
 * @param createdMsFromNow - When Mailpit received it, relative to now.
 * @param href - The link, as HTML writes it (`&amp;` between query values).
 * @param to - The recipient.
 * @returns The message.
 */
function mail(id: string, createdMsFromNow: number, href: string, to = TO): FakeMessage {
  return {
    ID: id,
    Created: new Date(Date.now() + createdMsFromNow).toISOString(),
    To: [{ Address: to }],
    HTML: `<p><a href="${href}">Sign in</a></p>`,
  }
}

/**
 * Runs `latestLink` in Node, as the Maestro runner does.
 * @param args - The function's arguments.
 * @returns The link, or the error message when the call throws.
 */
async function latest(...args: [string, string, string, number?, string[]?]) {
  const code = `
    import { latestLink } from ${JSON.stringify(MODULE)}
    try {
      console.log(JSON.stringify({ link: await latestLink(...${JSON.stringify(args)}) }))
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }))
    }
  `
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', code])
  return JSON.parse(stdout) as { link?: string; error?: string }
}

/**
 * Start a local server with a handler of the test's own.
 * @param handler - Answers, or holds, each request.
 * @returns Its origin.
 */
async function serveRaw(handler: http.RequestListener) {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/**
 * Start a fake Mailpit whose search honours `start` and `limit`, as Mailpit
 * v1.31.1 does, over a fixed list of messages, and whose message endpoint
 * serves each one.
 * @param messages - Every message, newest first.
 * @returns Its origin and each search's `start` and `limit`.
 */
async function pagedMailpit(messages: FakeMessage[]) {
  const pages: [string | null, string | null][] = []
  const origin = await serveRaw((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake')
    response.setHeader('content-type', 'application/json')
    if (url.pathname.startsWith('/api/v1/message/')) {
      const message = messages.find((m) => m.ID === url.pathname.split('/').pop())
      response.end(JSON.stringify({ HTML: message?.HTML ?? '', Text: '' }))
      return
    }
    const start = Number(url.searchParams.get('start') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 50)
    pages.push([url.searchParams.get('start'), url.searchParams.get('limit')])
    response.end(
      JSON.stringify({
        messages_count: messages.length,
        start,
        messages: messages.slice(start, start + limit),
      })
    )
  })
  return { origin, pages }
}

/**
 * Runs `messageIds` in Node with the request timeout replaced, and records
 * the timeouts the module asked for. The timeout fires after 50 ms, or, with
 * `afterHeaders`, as soon as each response's headers arrive, so a stalled
 * body is what times out.
 * @param origin - Mailpit's origin.
 * @param afterHeaders - Fire the timeout once the headers arrive.
 * @returns The ids, or the error message, and the timeouts asked for.
 */
async function idsWithShortTimeout(origin: string, afterHeaders = false) {
  const code = `
    const asked = []
    let fire = () => {}
    AbortSignal.timeout = (ms) => {
      asked.push(ms)
      const controller = new AbortController()
      fire = () => controller.abort(new DOMException('timed out', 'TimeoutError'))
      if (!${afterHeaders}) setTimeout(fire, 50)
      return controller.signal
    }
    const realFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      const response = await realFetch(...args)
      if (${afterHeaders}) fire()
      return response
    }
    const { messageIds } = await import(${JSON.stringify(MODULE)})
    try {
      console.log(JSON.stringify({ asked, ids: await messageIds(${JSON.stringify(origin)}, ${JSON.stringify(TO)}) }))
    } catch (error) {
      console.log(JSON.stringify({ asked, error: error.message }))
    }
  `
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', code])
  return JSON.parse(stdout) as { asked: number[]; ids?: string[]; error?: string }
}

describe('Mailpit requests', () => {
  it('gives up on a request after 10 s, naming the URL', async () => {
    const origin = await serveRaw(() => {})
    const result = await idsWithShortTimeout(origin)
    expect(result.asked).toEqual([10_000])
    expect(result.error).toMatch(
      new RegExp(`^Mailpit request to ${origin}/api/v1/search\\?query=\\S+ failed: `)
    )
  })

  it('gives up on a body that stalls after the headers, naming the URL', async () => {
    const origin = await serveRaw((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{"messages":')
    })
    const result = await idsWithShortTimeout(origin, true)
    expect(result.asked).toEqual([10_000])
    expect(result.error).toMatch(
      new RegExp(`^Mailpit request to ${origin}/api/v1/search\\?query=\\S+ failed: timed out$`)
    )
  })

  it('reads every page of a search, 50 at a time', async () => {
    const messages = Array.from({ length: 120 }, (_, i) =>
      mail(`m${i}`, 0, `https://app.example.com/auth/link?token=t${i}`)
    )
    const { origin, pages } = await pagedMailpit(messages)
    const ids = await execFileAsync(process.execPath, [MODULE, 'message-ids', origin, TO])
    expect(JSON.parse(ids.stdout)).toEqual(messages.map((m) => m.ID))
    expect(pages).toEqual([
      ['0', '50'],
      ['50', '50'],
      ['100', '50'],
    ])
  })

  it('finds a link on a later page when the earlier pages are excluded', async () => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      mail(`m${i}`, 0, `https://app.example.com/invitations/accept?token=t${i}`)
    )
    messages[55] = mail('m55', 0, 'https://app.example.com/auth/link?token=late')
    const { origin } = await pagedMailpit(messages)
    const result = await latest(origin, TO, '/auth/link', 5_000)
    expect(result.link).toBe('https://app.example.com/auth/link?token=late')
  })

  it('fails instead of truncating when a search runs past 20 pages', async () => {
    const page = Array.from({ length: 50 }, (_, i) => mail(`m${i}`, 0, 'https://app.example.com/x'))
    const origin = await serveRaw((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ messages_count: 5_000, messages: page }))
    })
    const failure = await execFileAsync(process.execPath, [
      MODULE,
      'message-ids',
      origin,
      TO,
    ]).catch((error: { code: number; stderr: string }) => error)
    expect(failure).toMatchObject({ code: 1 })
    expect((failure as { stderr: string }).stderr.trim()).toBe(
      `mailpit: Mailpit holds more than 1000 messages to ${TO}; use a fresh address`
    )
  })
})

describe('latestLink', () => {
  it('returns the link of a message that arrives on the third poll', async () => {
    const link = 'https://app.example.com/auth/link?token=abc&amp;utm_campaign=sign_in_link'
    const { origin, queries } = await fakeMailpit([[], [], [mail('m1', 500, link)]])
    const result = await latest(origin, TO, '/auth/link', 10_000)
    expect(result.link).toBe(
      'https://app.example.com/auth/link?token=abc&utm_campaign=sign_in_link'
    )
    expect(queries).toHaveLength(3)
  })

  it('URL-encodes the exact recipient, whose address holds a plus sign', async () => {
    const { origin, queries } = await fakeMailpit([
      [mail('m1', 0, 'https://app.example.com/auth/link?token=abc')],
    ])
    await latest(origin, TO, '/auth/link', 5_000)
    expect(queries[0]).toBe(`to:"${TO}"`)
  })

  it('ignores a matching message present before the snapshot and returns the newer one', async () => {
    const before = mail('before', -10_000, 'https://app.example.com/auth/link?token=before')
    const after = mail('after', 0, 'https://app.example.com/auth/link?token=after')
    const { origin } = await fakeMailpit([[after, before]])
    const result = await latest(origin, TO, '/auth/link', 5_000, ['before'])
    expect(result.link).toBe('https://app.example.com/auth/link?token=after')
  })

  it('names the address on a timeout when only an excluded message and another recipient exist', async () => {
    const { origin } = await fakeMailpit([
      [
        mail('old', 0, 'https://app.example.com/auth/link?token=old'),
        mail('other', 0, 'https://app.example.com/auth/link?token=other', 'x' + TO),
      ],
    ])
    const result = await latest(origin, TO, '/auth/link', 1_500, ['old'])
    expect(result.error).toBe(`no /auth/link mail reached ${TO} in 1.5 s`)
  })

  it.each([0, -5, Number.NaN])('rejects a timeout of %s', async (timeout) => {
    const { origin } = await fakeMailpit([[]])
    const result = await latest(origin, TO, '/auth/link', timeout)
    expect(result.error).toMatch(/timeoutMs must be a positive number/)
  })

  it('skips a link that URL cannot parse', async () => {
    const { origin } = await fakeMailpit([
      [
        mail('m1', 0, 'https://[bad/auth/link?token=x'),
        mail('m2', 0, 'https://app.example.com/auth/link?token=ok'),
      ],
    ])
    expect((await latest(origin, TO, '/auth/link', 5_000)).link).toBe(
      'https://app.example.com/auth/link?token=ok'
    )
  })

  it('skips a message whose links do not start with the path prefix', async () => {
    const { origin } = await fakeMailpit([
      [mail('m1', 0, 'https://app.example.com/invitations/accept?token=t')],
    ])
    const result = await latest(origin, TO, '/auth/link', 1_500)
    expect(result.error).toMatch(/no \/auth\/link mail reached/)
  })

  it('fails at once when Mailpit answers an error', async () => {
    const server = http.createServer((_request, response) => response.writeHead(500).end())
    servers.push(server)
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const result = await latest(origin, TO, '/auth/link', 5_000)
    expect(result.error).toMatch(/Mailpit answered 500/)
  })
})

describe('mailpit command', () => {
  it('prints message ids as JSON, and latest-link honours --exclude', async () => {
    const { origin } = await fakeMailpit([
      [
        mail('b', 0, 'https://app.example.com/auth/link?token=b'),
        mail('a', 0, 'https://app.example.com/auth/link?token=a'),
      ],
    ])
    const ids = await execFileAsync(process.execPath, [MODULE, 'message-ids', origin, TO])
    expect(JSON.parse(ids.stdout)).toEqual(['b', 'a'])
    const link = await execFileAsync(process.execPath, [
      MODULE,
      'latest-link',
      origin,
      TO,
      '/auth/link',
      '5000',
      '--exclude',
      '["b"]',
    ])
    expect(link.stdout.trim()).toBe('https://app.example.com/auth/link?token=a')
  })

  it('exits 1 on a timeout that is not a number', async () => {
    const { origin } = await fakeMailpit([[]])
    const failure = await execFileAsync(process.execPath, [
      MODULE,
      'latest-link',
      origin,
      TO,
      '/auth/link',
      'abc',
    ]).catch((error: { code: number; stderr: string }) => error)
    expect(failure).toMatchObject({ code: 1 })
  })

  it('exits 1 with a usage message on an empty timeout', async () => {
    const { origin } = await fakeMailpit([[]])
    const failure = await execFileAsync(process.execPath, [
      MODULE,
      'latest-link',
      origin,
      TO,
      '/auth/link',
      '',
    ]).catch((error: { code: number; stderr: string }) => error)
    expect(failure).toMatchObject({ code: 1 })
    expect((failure as { stderr: string }).stderr.trim()).toBe(
      'mailpit: the timeout argument is empty; pass a positive number of milliseconds, or leave it out for 60000'
    )
  })

  it('prints the app link for latest-app-link', async () => {
    const { origin } = await fakeMailpit([
      [mail('m1', 0, 'https://app.example.com/auth/link?token=abc')],
    ])
    const { stdout } = await execFileAsync(process.execPath, [
      MODULE,
      'latest-app-link',
      origin,
      TO,
      '/auth/link',
      '5000',
    ])
    expect(stdout.trim()).toBe('expo-boilerplate://auth/link?token=abc')
  })

  it('exits 1 with a message on a timeout', async () => {
    const { origin } = await fakeMailpit([[]])
    const failure = await execFileAsync(process.execPath, [
      MODULE,
      'latest-link',
      origin,
      TO,
      '/auth/link',
      '1000',
    ]).catch((error: { code: number; stderr: string }) => error)
    expect(failure).toMatchObject({ code: 1 })
    expect((failure as { stderr: string }).stderr).toMatch(/no \/auth\/link mail reached/)
  })
})
