import { MAX_REDIRECT_LENGTH, landingFor, safePath } from '@/lib/safe-path'
import { describe, expect, it } from '@/tests/support/runner'

describe('safePath', () => {
  it('rejects each unsafe redirect', () => {
    const unsafe = [
      'https://evil.example/x',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/..//evil.example',
      '/auth/link?token=x',
      '/a\tb',
      42,
    ]
    for (const raw of unsafe) expect(safePath(raw)).toBeNull()
  })

  it.each([
    ['an absolute URL', 'https://evil.example/x'],
    ['a protocol-relative URL', '//evil.example'],
    ['a slash and backslash', '/\\evil.example'],
    ['a backslash anywhere', '/a\\b'],
    ['a javascript scheme', 'javascript:alert(1)'],
    ['a bare relative path', 'tenants/acme'],
    ['a control character', '/a\tb'],
    ['a DEL character', '/a\u007fb'],
    ['an empty string', ''],
    ['a path past the length limit', `/${'a'.repeat(MAX_REDIRECT_LENGTH)}`],
    ['a dot-segment route to a double slash', '/..//evil.example'],
    ['an encoded double slash', '/%2f%2fevil.example'],
    ['an encoded backslash', '/%5Cevil'],
    ['a path that does not decode', '/%E0%A4%A'],
    ['a token path', '/auth/link?token=x'],
    ['a token path in upper case', '/AUTH/Link'],
    ['a token path with a trailing slash', '/invitations/accept/'],
    ['a token path with repeated slashes', '/auth//confirm'],
    ['an encoded token path', '/auth%2Flink'],
    ['a token path reached by dot segments', '/a/../auth/link'],
  ])('rejects %s', (_name, raw) => {
    expect(safePath(raw)).toBeNull()
  })

  it('rejects an absolute URL', () => {
    expect(safePath('https://evil.example/x')).toBeNull()
  })

  it('rejects a protocol-relative //evil', () => {
    expect(safePath('//evil')).toBeNull()
  })

  it('rejects a slash and backslash, /\\evil', () => {
    expect(safePath('/\\evil')).toBeNull()
  })

  it('rejects an encoded double slash, /%2F%2Fevil', () => {
    expect(safePath('/%2F%2Fevil')).toBeNull()
  })

  it('rejects the token path /auth/link?token=x', () => {
    expect(safePath('/auth/link?token=x')).toBeNull()
  })

  it('rejects a path over 2048 characters', () => {
    expect(safePath(`/${'a'.repeat(2048)}`)).toBeNull()
  })

  it('rejects an encoded query mark that hides a token path', () => {
    expect(safePath('/auth/link%3Ftoken=x')).toBeNull()
  })

  it('returns the resolved path, so what is checked is what is navigated to', () => {
    expect(safePath('/a/b/../c?x=1#top')).toBe('/a/c?x=1')
    expect(safePath('/a b?x=1')).toBe('/a%20b?x=1')
  })

  it.each([[undefined], [null], [42], [{}], [['/a']]])('rejects the non-string %p', (raw) => {
    expect(safePath(raw)).toBeNull()
  })

  it('keeps a safe path with its query', () => {
    expect(safePath('/tenants/acme?tab=x')).toBe('/tenants/acme?tab=x')
  })

  it('keeps the root, and drops a fragment', () => {
    expect(safePath('/')).toBe('/')
    expect(safePath('/tenants/acme?tab=x#top')).toBe('/tenants/acme?tab=x')
  })

  it('accepts a path of exactly the limit', () => {
    const path = `/${'a'.repeat(MAX_REDIRECT_LENGTH - 1)}`
    expect(safePath(path)).toBe(path)
  })
})

describe('landingFor', () => {
  /** Reads no workspaces. */
  const empty = () => Promise.resolve([])
  /** Reads one workspace. */
  const some = () => Promise.resolve([{ id: 't' }])
  /** Fails the read. */
  const fails = () => Promise.reject(new Error('offline'))

  it('sends a new account to /welcome, whatever was asked for', async () => {
    await expect(landingFor({ isNewUser: true, redirect: '/a' }, '/b', some)).resolves.toBe(
      '/welcome'
    )
  })

  it('prefers the verify answer’s redirect', async () => {
    await expect(landingFor({ isNewUser: false, redirect: '/a' }, '/b', empty)).resolves.toBe('/a')
  })

  it('falls back to the requested path when the answer’s is unsafe or absent', async () => {
    await expect(landingFor({ isNewUser: false, redirect: '//x' }, '/b?c=1', empty)).resolves.toBe(
      '/b?c=1'
    )
    await expect(landingFor({ isNewUser: false, redirect: null }, '/b', empty)).resolves.toBe('/b')
  })

  it('does not read the list when a path applies', async () => {
    let reads = 0
    /** Counts the reads. */
    const counted = () => {
      reads += 1
      return Promise.resolve([])
    }
    await landingFor({ isNewUser: false, redirect: '/a' }, undefined, counted)
    expect(reads).toBe(0)
  })

  it('sends an account with no workspace to /welcome', async () => {
    await expect(landingFor({ isNewUser: false, redirect: null }, '//x', empty)).resolves.toBe(
      '/welcome'
    )
  })

  it('sends an account with a workspace Home', async () => {
    await expect(landingFor({ isNewUser: false, redirect: null }, undefined, some)).resolves.toBe(
      '/'
    )
  })

  it('lands on / when the list read fails', async () => {
    await expect(landingFor({ isNewUser: false, redirect: null }, undefined, fails)).resolves.toBe(
      '/'
    )
  })
})
