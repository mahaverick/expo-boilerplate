import { pathToFileURL } from 'node:url'

/** A release version: three dot-separated numbers with no leading zeros. */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/**
 * Split a version into its major, minor and patch numbers.
 * @param version - The version, such as `1.4.2`.
 * @returns The three numbers.
 * @throws When the version is not `x.y.z`.
 */
function parseVersion(version) {
  const match = VERSION_PATTERN.exec(version)
  if (!match) throw new Error(`"${version}" is not a version of the form x.y.z`)
  return match.slice(1).map(Number)
}

/**
 * How a release ships. A patch bump whose fingerprint is unchanged ships as a
 * signed over-the-air update, because the store builds already run its native
 * code and a patch carries fixes only. Every other release ships as a store
 * build: a minor bump comes from a `feat:` commit, and downloaded code may not
 * add features.
 * @param input - The last released version (`previousVersion`), the new
 *   `version`, and whether the native fingerprint differs from the latest
 *   production build's (`fingerprintChanged`).
 * @returns The route: `update` or `build`.
 * @throws When either version is not `x.y.z`, or `version` is not greater
 *   than `previousVersion`.
 */
export function releaseRoute({ previousVersion, version, fingerprintChanged }) {
  const before = parseVersion(previousVersion)
  const after = parseVersion(version)
  const order = after.map((part, i) => part - before[i]).find((difference) => difference !== 0)
  if (order === undefined || order < 0) {
    throw new Error(
      `version ${version} is not greater than the previous version ${previousVersion}`
    )
  }
  const patchBump = after[0] === before[0] && after[1] === before[1]
  return patchBump && !fingerprintChanged ? 'update' : 'build'
}

/** Read the inputs from the environment and print `route=<route>` for `$GITHUB_OUTPUT`. */
function main() {
  const changed = process.env.FINGERPRINT_CHANGED
  try {
    if (changed !== 'true' && changed !== 'false') {
      throw new Error(`FINGERPRINT_CHANGED must be true or false. Got "${changed ?? ''}".`)
    }
    const route = releaseRoute({
      previousVersion: process.env.PREVIOUS_VERSION ?? '',
      version: process.env.VERSION ?? '',
      fingerprintChanged: changed === 'true',
    })
    console.log(`route=${route}`)
  } catch (error) {
    console.error(`release-route: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
