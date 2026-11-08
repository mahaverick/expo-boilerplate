import { spawnSync } from 'node:child_process'
import { describe, expect, it, repoRoot } from '@/tests/support/runner'

/**
 * Whether git ignores a path in this checkout.
 * @param file - A path relative to the repository root.
 * @returns The exit code of `git check-ignore -q`: 0 when ignored, 1 when not.
 */
function checkIgnore(file: string): number | null {
  return spawnSync('git', ['check-ignore', '-q', file], { cwd: repoRoot }).status
}

describe('.gitignore', () => {
  it('lets the update-signing certificates be committed', () => {
    expect(checkIgnore('certs/preview/certificate.pem')).toBe(1)
    expect(checkIgnore('certs/production/certificate.pem')).toBe(1)
  })

  it('still ignores any other .pem, such as a private key', () => {
    expect(checkIgnore('certs/preview/private-key.pem')).toBe(0)
  })
})
