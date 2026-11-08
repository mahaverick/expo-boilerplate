import http from 'node:http'
import https from 'node:https'
import { pathToFileURL } from 'node:url'
import { latestLink, messageIds } from './mailpit.mjs'

/** The path prefix of the emailed sign-in link. */
const SIGN_IN_PATH = '/auth/link'

/** The header that makes express treat a caller as the native app. */
/** How long one request to express may take. */
const REQUEST_TIMEOUT_MS = 10_000

const NATIVE_HEADERS = { 'x-client': 'native' }

/**
 * Send one JSON request to express. It uses `node:http`, because Node's
 * `fetch` adds a `sec-fetch-mode` header and express refuses a native request
 * that carries a browser header (400 `NATIVE_CLIENT_REFUSED`).
 * @param api - Express's origin, e.g. `http://localhost:4040`.
 * @param path - The path, e.g. `/api/v1/auth/link/request`.
 * @param body - The JSON body.
 * @param [accessToken] - A bearer token for a signed-in call.
 * @returns The status and the parsed body, `null` when it is not JSON.
 */
function post(api, path, body, accessToken) {
  const url = new URL(path, api)
  const payload = JSON.stringify(body)
  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: 'POST',
        headers: {
          ...NATIVE_HEADERS,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...(accessToken && { authorization: `Bearer ${accessToken}` }),
        },
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          let parsed = null
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            // A body that is not JSON stays null.
          }
          resolve({ status: response.statusCode ?? 0, body: parsed })
        })
      }
    )
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error(`request to ${url.href} timed out after ${REQUEST_TIMEOUT_MS / 1000} s`)
      )
    })
    request.on('error', reject)
    request.end(payload)
  })
}

/**
 * Fail unless a response has the expected status.
 * @param what - What was asked, for the message.
 * @param response - The response.
 * @param expected - The status that means success.
 * @throws With the status and body when they differ.
 */
function expectStatus(what, response, expected) {
  if (response.status !== expected) {
    throw new Error(`${what} failed: ${response.status} ${JSON.stringify(response.body)}`)
  }
}

/**
 * Sign an address in as the native app does: request a link, read it from
 * Mailpit and verify its token. The first click creates the account.
 * @param api - Express's origin.
 * @param mailpit - Mailpit's origin.
 * @param email - The address; use a fresh one, as express mails an address one link a minute.
 * @returns The session's tokens.
 */
export async function signIn(api, mailpit, email) {
  const before = await messageIds(mailpit, email)
  const requested = await post(api, '/api/v1/auth/link/request', { email, app: 'web' })
  expectStatus('link request', requested, 202)
  const link = await latestLink(mailpit, email, SIGN_IN_PATH, undefined, before)
  const token = new URL(link).searchParams.get('token')
  const verified = await post(api, '/api/v1/auth/link/verify', {
    token,
    email,
  })
  expectStatus('link verify', verified, 200)
  const { accessToken, refreshToken } = verified.body?.data ?? {}
  if (!accessToken || !refreshToken) throw new Error('link verify returned no tokens')
  return { accessToken, refreshToken }
}

/**
 * Create a workspace. Express needs a slug, which is made from the name.
 * @param api - Express's origin.
 * @param accessToken - The creator's access token.
 * @param name - The workspace name; its lowercase letters and digits, joined by hyphens, become the slug.
 * @returns The slug express stored.
 */
export async function createWorkspace(api, accessToken, name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) throw new Error(`cannot derive a workspace slug from "${name}": use letters or digits`)
  const created = await post(api, '/api/v1/tenants', { name, slug }, accessToken)
  expectStatus('workspace creation', created, 201)
  return { slug: created.body?.data?.slug ?? slug }
}

/**
 * Invite an address to a workspace; express mails the invitation.
 * @param api - Express's origin.
 * @param accessToken - An owner's or admin's access token.
 * @param slug - The workspace slug.
 * @param email - The invitee.
 * @param [role] - The role to grant: owner, admin, manager, editor or viewer (express has no `member` role).
 * @returns Resolves once express accepts the invitation (202).
 */
export async function invite(api, accessToken, slug, email, role = 'viewer') {
  const invited = await post(
    api,
    `/api/v1/tenants/${encodeURIComponent(slug)}/invitations`,
    { email, role },
    accessToken
  )
  expectStatus('invitation', invited, 202)
}

/**
 * Run `sign-in <api> <mailpit> <email>` (prints the tokens as JSON),
 * `create-workspace <api> <accessToken> <name>` (prints `{ slug }`) or
 * `invite <api> <accessToken> <slug> <email> [role]` (prints `ok`). Any
 * failure prints a message to stderr and sets exit code 1.
 */
async function main() {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'sign-in' && args.length === 3) {
      console.log(JSON.stringify(await signIn(...args)))
    } else if (command === 'create-workspace' && args.length === 3) {
      console.log(JSON.stringify(await createWorkspace(...args)))
    } else if (command === 'invite' && (args.length === 4 || args.length === 5)) {
      await invite(...args)
      console.log('ok')
    } else {
      throw new Error(
        'usage: api.mjs sign-in <api> <mailpit> <email> | create-workspace <api> <accessToken> <name> | invite <api> <accessToken> <slug> <email> [role]'
      )
    }
  } catch (error) {
    console.error(`api: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
