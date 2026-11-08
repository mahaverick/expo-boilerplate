import { pathToFileURL } from 'node:url'
import { appLink } from './links.mjs'

/** How long to wait between two looks at Mailpit. */
const POLL_INTERVAL_MS = 1000

/**
 * How far Mailpit's clock (the container's) may run behind the caller's.
 * Docker Desktop's VM lags after the host sleeps, and an exact comparison
 * would skip a fresh mail. Express mails one address one sign-in link a
 * minute, so the allowance never reaches back to the previous link.
 */
const CLOCK_SKEW_MS = 30_000

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
  const response = await fetch(url)
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
 * Poll Mailpit every second for the newest message to `to`, received after
 * this call started, that holds a link whose path starts with `pathPrefix`.
 * @param origin - Mailpit's origin, e.g. `http://localhost:8025`.
 * @param to - The recipient address.
 * @param pathPrefix - The link's path prefix, e.g. `/auth/link` or `/invitations/accept`.
 * @param [timeoutMs] - How long to wait.
 * @returns The link, query included.
 * @throws When no such mail arrives in time, and at once when Mailpit fails.
 */
export async function latestLink(origin, to, pathPrefix, timeoutMs = 60_000) {
  const started = Date.now()
  const deadline = started + timeoutMs
  for (;;) {
    for (const { ID, Created } of await messagesTo(origin, to)) {
      if (Date.parse(Created) < started - CLOCK_SKEW_MS) continue
      const link = (await linksIn(origin, ID)).find((href) =>
        new URL(href).pathname.startsWith(pathPrefix)
      )
      if (link) return link
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) break
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`no ${pathPrefix} mail reached ${to} in ${timeoutMs / 1000} s`)
}

/**
 * Run `latest-link` or `latest-app-link` with `<origin> <to> <pathPrefix> [timeoutMs]`
 * and print the link: the emailed web link, or the app link it maps to. Any
 * failure prints a message to stderr and sets exit code 1.
 */
async function main() {
  const [command, origin, to, pathPrefix, timeoutMs] = process.argv.slice(2)
  try {
    if (!['latest-link', 'latest-app-link'].includes(command) || !pathPrefix) {
      throw new Error(
        'usage: mailpit.mjs latest-link|latest-app-link <origin> <to> <pathPrefix> [timeoutMs]'
      )
    }
    const link = await latestLink(origin, to, pathPrefix, timeoutMs ? Number(timeoutMs) : undefined)
    console.log(command === 'latest-app-link' ? appLink(link) : link)
  } catch (error) {
    console.error(`mailpit: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
