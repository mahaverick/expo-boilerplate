/**
 * @file The workspaces the person has left whose cache is still to drop. A
 * leave records the slug and navigates; the workspace list drops each cache
 * when it gains focus, once no screen of the left workspace is mounted.
 */

/** The slugs of workspaces left since the list last gained focus. */
const left = new Set<string>()

/**
 * Records a workspace the person has left.
 * @param slug - The workspace's web address.
 */
export function markLeft(slug: string): void {
  left.add(slug)
}

/**
 * Returns the recorded slugs and clears the record.
 * @returns The slugs, in the order they were left.
 */
export function takeLeft(): string[] {
  const slugs = [...left]
  left.clear()
  return slugs
}
