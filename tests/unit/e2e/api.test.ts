import { execFile } from 'node:child_process'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'

const execFileAsync = promisify(execFile)

/** The module under test. */
const MODULE = path.join(repoRoot, 'e2e/helpers/api.mjs')

/** One request the fake services received. */
interface Seen {
  method?: string
  url?: string
  headers: http.IncomingHttpHeaders
  body: unknown
}

/** The fake servers, closed after each test. */
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
 * Start a local server.
 * @param handler - Answers a request given its parsed body.
 * @returns Its origin.
 */
async function serve(
  handler: (request: http.IncomingMessage, body: unknown, response: http.ServerResponse) => void
) {
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      handler(request, text ? (JSON.parse(text) as unknown) : null, response)
    })
  })
  servers.push(server)
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/**
 * Run an api.mjs command in Node.
 * @param args - The command and its arguments.
 * @returns Exit code, output and error text.
 */
async function cli(...args: string[]) {
  return execFileAsync(process.execPath, [MODULE, ...args]).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error: { code: number; stdout: string; stderr: string }) => error
  )
}

describe('api commands', () => {
  it('signs in: requests a link, reads it from Mailpit and verifies it as the native app', async () => {
    const email = 'e2e+signin-1@example.test'
    const seen: Seen[] = []
    const api = await serve((request, body, response) => {
      seen.push({ method: request.method, url: request.url, headers: request.headers, body })
      response.setHeader('content-type', 'application/json')
      if (request.url === '/api/v1/auth/link/request') response.writeHead(202).end('{}')
      else
        response.end(
          JSON.stringify({ data: { accessToken: 'access-1', refreshToken: 'refresh-1' } })
        )
    })
    const stale = { ID: 'stale', Created: new Date().toISOString(), To: [{ Address: email }] }
    const fresh = { ID: 'fresh', Created: new Date().toISOString(), To: [{ Address: email }] }
    const mailpit = await serve((request, _body, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url?.startsWith('/api/v1/search')) {
        // The fresh mail exists only once express has been asked for a link.
        const requested = seen.some((s) => s.url === '/api/v1/auth/link/request')
        response.end(JSON.stringify({ messages: requested ? [fresh, stale] : [stale] }))
      } else {
        const token = request.url?.endsWith('/fresh') ? 'tok-1' : 'stale-token'
        response.end(
          JSON.stringify({
            HTML: `<a href="https://app.example.com/auth/link?token=${token}">go</a>`,
          })
        )
      }
    })

    const run = await cli('sign-in', api, mailpit, email)

    expect(run.code).toBe(0)
    expect(JSON.parse(run.stdout)).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    expect(seen.map((s) => [s.method, s.url, s.body])).toEqual([
      ['POST', '/api/v1/auth/link/request', { email, app: 'web' }],
      ['POST', '/api/v1/auth/link/verify', { token: 'tok-1', email }],
    ])
    for (const { headers } of seen) {
      expect(headers['x-client']).toBe('native')
      // Express refuses a native request that carries a browser header.
      expect(Object.keys(headers).filter((name) => name.startsWith('sec-fetch-'))).toEqual([])
      expect(headers.origin).toBeUndefined()
    }
  })

  it('creates a workspace with a slug made from its name and a bearer token', async () => {
    const seen: Seen[] = []
    const api = await serve((request, body, response) => {
      seen.push({ method: request.method, url: request.url, headers: request.headers, body })
      response.setHeader('content-type', 'application/json')
      response.writeHead(201).end(JSON.stringify({ data: { slug: 'e2e-team-7' } }))
    })

    const run = await cli('create-workspace', api, 'access-1', 'E2E Team 7')

    expect(JSON.parse(run.stdout)).toEqual({ slug: 'e2e-team-7' })
    expect(seen[0]?.url).toBe('/api/v1/tenants')
    expect(seen[0]?.body).toEqual({ name: 'E2E Team 7', slug: 'e2e-team-7' })
    expect(seen[0]?.headers.authorization).toBe('Bearer access-1')
  })

  it('exits 1 for a workspace name with no letters or digits', async () => {
    const run = await cli('create-workspace', 'http://127.0.0.1:1', 'access-1', '!!!')
    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/cannot derive a workspace slug/)
  })

  it('invites with the viewer role unless told otherwise', async () => {
    const seen: Seen[] = []
    const api = await serve((request, body, response) => {
      seen.push({ method: request.method, url: request.url, headers: request.headers, body })
      response.writeHead(202).end('{}')
    })

    expect(
      (await cli('invite', api, 'access-1', 'e2e-team-7', 'a@example.test')).stdout.trim()
    ).toBe('ok')
    await cli('invite', api, 'access-1', 'e2e-team-7', 'b@example.test', 'admin')

    expect(seen.map((s) => [s.url, s.body])).toEqual([
      ['/api/v1/tenants/e2e-team-7/invitations', { email: 'a@example.test', role: 'viewer' }],
      ['/api/v1/tenants/e2e-team-7/invitations', { email: 'b@example.test', role: 'admin' }],
    ])
  })

  it('exits 1 naming the status and body when express refuses', async () => {
    const api = await serve((_request, _body, response) => {
      response.writeHead(400).end('{"code":"NATIVE_CLIENT_REFUSED"}')
    })
    const run = await cli('create-workspace', api, 'access-1', 'E2E Team 7')
    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/workspace creation failed: 400 .*NATIVE_CLIENT_REFUSED/)
  })

  it('gives up on a request to express after 10 s, naming the URL', async () => {
    const api = await serve(() => {})
    const mailpit = await serve((_request, _body, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ messages: [] }))
    })
    // The request's own timeout is cut to 50 ms; the test records what the module asked for.
    const code = `
      import http from 'node:http'
      const asked = []
      const real = http.ClientRequest.prototype.setTimeout
      http.ClientRequest.prototype.setTimeout = function (ms, callback) {
        asked.push(ms)
        return real.call(this, 50, callback)
      }
      const { signIn } = await import(${JSON.stringify(MODULE)})
      try {
        await signIn(${JSON.stringify(api)}, ${JSON.stringify(mailpit)}, 'e2e+t-1@example.test')
      } catch (error) {
        console.log(JSON.stringify({ asked, error: error.message }))
      }
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', code])
    expect(JSON.parse(stdout)).toEqual({
      asked: [10_000],
      error: `request to ${api}/api/v1/auth/link/request timed out after 10 s`,
    })
  })

  it('exits 1 with usage on an unknown command', async () => {
    const run = await cli('nope')
    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/usage/)
  })
})
