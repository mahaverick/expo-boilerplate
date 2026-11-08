import { pathToFileURL } from 'node:url'
import { appLink } from './links.mjs'

/** How long to wait between two looks at Mailpit. */
const POLL_INTERVAL_MS = 1000

/** How long one request to Mailpit may take. */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Wait for a time.
 * @param ms - Milliseconds.
 * @returns Resolves after `ms`.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Read JSON from a Mailpit endpoint.
 * @param url - The endpoint.
 * @returns The parsed body.
 * @throws When Mailpit answers with a status other than 200.
 */
async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
    (error) => {
      throw new Error(`Mailpit request to ${url} failed: ${error.message}`, { cause: error })
    }
  )
  if (response.status !== 200) throw new Error(`Mailpit answered ${response.status} for ${url}`)
  return response.json()
}

/**
 * The messages sent to exactly `to`, newest first. The address holds `+` and
 * `@`, so the query is URL-encoded; Mailpit's search matches by substring, so
 * the recipients are checked again here.
 * @param origin - Mailpit's origin, e.g. `http://localhost:8025`.
 * @param to - The recipient address.
 * @returns Mailpit's summaries of those messages.
 */
async function messagesTo(origin, to) {
  const query = encodeURIComponent(`to:"${to}"`)
  const found = await getJson(`${origin}/api/v1/search?query=${query}`)
  const wanted = to.toLowerCase()
  return (found.messages ?? []).filter((message) =>
    (message.To ?? []).some((recipient) => recipient.Address?.toLowerCase() === wanted)
  )
}

/**
 * The links in a message, in order: those in its HTML and in its text.
 * @param origin - Mailpit's origin.
 * @param id - The Mailpit message id.
 * @returns Each link, with HTML's `&amp;` decoded.
 */
async function linksIn(origin, id) {
  const message = await getJson(`${origin}/api/v1/message/${id}`)
  const body = `${message.HTML ?? ''}\n${message.Text ?? ''}`
  return (body.match(/https?:\/\/[^\s"'<>]+/g) ?? []).map((href) => href.replaceAll('&amp;', '&'))
}

/**
 * The ids of every message now in Mailpit for exactly `to`. Take this
 * snapshot before anything that makes express mail the address, and pass it to
 * `latestLink` as `excludeIds`, so a mail from before the trigger is never
 * mistaken for the new one. Express sends an address one sign-in link a
 * minute and answers 202 either way, so a repeat inside the minute mails
 * nothing; use a fresh address per flow.
 * @param origin - Mailpit's origin, e.g. `http://localhost:8025`.
 * @param to - The recipient address.
 * @returns The message ids.
 */
export async function messageIds(origin, to) {
  return (await messagesTo(origin, to)).map((message) => message.ID)
}

/**
 * Poll Mailpit every second for the newest message to `to`, whose id is not in
 * `excludeIds`, that holds a link whose path starts with `pathPrefix`. The
 * caller (the runner) takes `excludeIds` with `messageIds` before the step
 * that triggers the mail, whether that step is an API call or a tap in the app.
 * @param origin - Mailpit's origin, e.g. `http://localhost:8025`.
 * @param to - The recipient address.
 * @param pathPrefix - The link's path prefix, e.g. `/auth/link` or `/invitations/accept`.
 * @param [timeoutMs] - How long to wait; a positive number.
 * @param [excludeIds] - Ids of messages to ignore.
 * @returns The link, query included.
 * @throws When no such mail arrives in time, when `timeoutMs` is not a positive number, and at once when Mailpit fails.
 */
export async function latestLink(origin, to, pathPrefix, timeoutMs = 60_000, excludeIds = []) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`timeoutMs must be a positive number, got ${timeoutMs}`)
  }
  const skip = new Set(excludeIds)
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const { ID } of await messagesTo(origin, to)) {
      if (skip.has(ID)) continue
      const link = (await linksIn(origin, ID)).find((href) => hasPathPrefix(href, pathPrefix))
      if (link) return link
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) break
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`no ${pathPrefix} mail reached ${to} in ${timeoutMs / 1000} s`)
}

/**
 * Whether a link's path starts with a prefix; a string `URL` cannot parse does not.
 * @param href - The link.
 * @param pathPrefix - The prefix.
 * @returns True when it does.
 */
function hasPathPrefix(href, pathPrefix) {
  try {
    return new URL(href).pathname.startsWith(pathPrefix)
  } catch {
    return false
  }
}

/**
 * Run `message-ids <origin> <to>` (prints the ids as a JSON array) or
 * `latest-link|latest-app-link <origin> <to> <pathPrefix> [timeoutMs] [--exclude <json array>]`
 * (prints the emailed web link, or the app link it maps to). Any failure prints
 * a message to stderr and sets exit code 1.
 */
async function main() {
  const argv = process.argv.slice(2)
  try {
    const flag = argv.indexOf('--exclude')
    const exclude = flag === -1 ? [] : JSON.parse(argv.splice(flag, 2)[1] ?? '')
    if (!Array.isArray(exclude)) throw new Error('--exclude takes a JSON array of ids')
    const [command, origin, to, pathPrefix, timeoutMs] = argv
    if (command === 'message-ids' && to) {
      console.log(JSON.stringify(await messageIds(origin, to)))
    } else if (['latest-link', 'latest-app-link'].includes(command) && pathPrefix) {
      const timeout = timeoutMs === undefined ? undefined : Number(timeoutMs)
      const link = await latestLink(origin, to, pathPrefix, timeout, exclude)
      console.log(command === 'latest-app-link' ? appLink(link) : link)
    } else {
      throw new Error(
        'usage: mailpit.mjs message-ids <origin> <to> | latest-link|latest-app-link <origin> <to> <pathPrefix> [timeoutMs] [--exclude <json array>]'
      )
    }
  } catch (error) {
    console.error(`mailpit: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
