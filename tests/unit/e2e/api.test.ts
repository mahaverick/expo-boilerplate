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
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
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
    const mailpit = await serve((request, _body, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url?.startsWith('/api/v1/search')) {
        response.end(
          JSON.stringify({
            messages: [{ ID: 'm1', Created: new Date().toISOString(), To: [{ Address: email }] }],
          })
        )
      } else {
        response.end(
          JSON.stringify({ HTML: '<a href="https://app.example.com/auth/link?token=tok-1">go</a>' })
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

  it('exits 1 with usage on an unknown command', async () => {
    const run = await cli('nope')
    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/usage/)
  })
})
