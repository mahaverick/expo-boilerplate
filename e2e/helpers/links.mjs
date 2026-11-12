import { pathToFileURL } from 'node:url'

/** The URL scheme the app registers (`scheme` in app.config.ts). */
const APP_SCHEME = 'expo-boilerplate'

/**
 * Turn an emailed web link into the custom-scheme link the e2e build opens.
 * The path and the whole query stay, so an invitation link keeps both its
 * `token` and its `email`.
 * @param webLink - An `https://<any host>/<path>?<query>` link from an email.
 * @returns `expo-boilerplate://<path>?<query>`.
 * @throws When the link is not an https URL or carries no `token` query.
 */
export function appLink(webLink) {
  let url
  try {
    url = new URL(webLink)
  } catch {
    throw new Error(`not a link: ${webLink}`)
  }
  if (url.protocol !== 'https:') throw new Error(`not an https link: ${webLink}`)
  if (!url.searchParams.get('token')) throw new Error(`link has no token: ${webLink}`)
  return `${APP_SCHEME}://${url.pathname.replace(/^\/+/, '')}${url.search}`
}

/**
 * Print the result of `app-link <webLink>`; any failure prints a message to
 * stderr and sets exit code 1.
 */
function main() {
  const [command, webLink] = process.argv.slice(2)
  try {
    if (command !== 'app-link' || webLink === undefined)
      throw new Error('usage: links.mjs app-link <webLink>')
    console.log(appLink(webLink))
  } catch (error) {
    console.error(`links: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
