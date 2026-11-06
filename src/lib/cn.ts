/**
 * Joins class names. It keeps the truthy parts in order, separated by one
 * space, and does no conflict merging: `cn('p-2', 'p-4')` is `'p-2 p-4'`.
 * @param parts - Class names, or a falsy value to skip.
 * @returns The class names as one string.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
