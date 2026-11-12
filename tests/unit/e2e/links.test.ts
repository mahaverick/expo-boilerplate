import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it, repoRoot } from '@/tests/support/runner'

/** The module under test. */
const MODULE = path.join(repoRoot, 'e2e/helpers/links.mjs')

/**
 * Runs `appLink` in Node. Babel-based Jest cannot import the module, which
 * uses `import.meta`, so the call runs in a child process.
 * @param webLink - The link to convert.
 * @returns The app link, or the error message when the call throws.
 */
function convert(webLink: string): { link?: string; error?: string } {
  const code = `
    import { appLink } from ${JSON.stringify(MODULE)}
    try {
      console.log(JSON.stringify({ link: appLink(${JSON.stringify(webLink)}) }))
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }))
    }
  `
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  return JSON.parse(run.stdout) as { link?: string; error?: string }
}

describe('appLink', () => {
  it('maps a sign-in link to the scheme and keeps its query', () => {
    expect(
      convert('https://app.example.com/auth/link?token=abc&utm_campaign=sign_in_link').link
    ).toBe('expo-boilerplate://auth/link?token=abc&utm_campaign=sign_in_link')
  })

  it('keeps the token and the email of an invitation link', () => {
    expect(
      convert('https://other.example.org/invitations/confirm?token=t1&email=e2e%2Bx%40example.test')
        .link
    ).toBe('expo-boilerplate://invitations/confirm?token=t1&email=e2e%2Bx%40example.test')
  })

  it('throws on a link with no token', () => {
    expect(convert('https://app.example.com/auth/link?email=a%40b.test').error).toMatch(/no token/)
  })

  it('throws on a link that is not https', () => {
    expect(convert('http://app.example.com/auth/link?token=abc').error).toMatch(/not an https link/)
  })

  it('throws on text that is not a link', () => {
    expect(convert('nonsense').error).toMatch(/not a link/)
  })
})

describe('links command', () => {
  it('prints the app link', () => {
    const run = spawnSync(
      process.execPath,
      [MODULE, 'app-link', 'https://app.example.com/auth/link?token=abc'],
      { encoding: 'utf8' }
    )
    expect(run.status).toBe(0)
    expect(run.stdout.trim()).toBe('expo-boilerplate://auth/link?token=abc')
  })

  it('exits 1 with a message on a link with no token', () => {
    const run = spawnSync(process.execPath, [MODULE, 'app-link', 'https://app.example.com/x'], {
      encoding: 'utf8',
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/no token/)
  })
})
