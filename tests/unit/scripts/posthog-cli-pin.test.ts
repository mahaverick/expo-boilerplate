import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, repoRoot } from '@/tests/support/runner'
import packageJson from '../../../package.json'

/** The version that scripts/posthog-cli.sha256 holds hashes for. */
function pinnedVersion(): string | undefined {
  const text = fs.readFileSync(path.join(repoRoot, 'scripts/posthog-cli.sha256'), 'utf8')
  return /^# @posthog\/cli (\S+)$/m.exec(text)?.[1]
}

describe('posthog-cli pin', () => {
  // A bump of @posthog/cli without new hashes fails the next build that uploads source maps.
  it("hashes the binary of package.json's @posthog/cli version", () => {
    expect(pinnedVersion()).toBe(packageJson.devDependencies['@posthog/cli'])
  })
})
