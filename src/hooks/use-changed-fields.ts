import { useEffect, useRef } from 'react'

/**
 * Tracks what an edit form started from, so a save sends only what the person
 * changed. Until `freeze` runs, the baseline follows the `baseline` argument,
 * so a refetch before the first edit updates it. `freeze` (and `changed`, which
 * calls it) pins the baseline at its current value, so a later refetch cannot
 * make an edit look unchanged or send a stale value. `rebase` moves the baseline
 * to the values just saved.
 * @param baseline - The stored values, as of the latest load.
 * @returns `changed`, `freeze` and `rebase`.
 */
export function useChangedFields<T extends Record<string, string>>(baseline: T) {
  const frozen = useRef<T | null>(null)
  const latest = useRef(baseline)
  useEffect(() => {
    latest.current = baseline
  })

  /** Pins the baseline at the values loaded when the form is first touched. */
  function freeze(): void {
    frozen.current ??= latest.current
  }

  /**
   * The keys whose trimmed value differs from the frozen baseline.
   * @param value - The form's current values.
   * @returns The trimmed values of the changed keys, or `null` when none changed.
   */
  function changed(value: T): Partial<T> | null {
    freeze()
    const base = frozen.current ?? latest.current
    const diff: Partial<T> = {}
    let any = false
    for (const key of Object.keys(value) as Array<keyof T>) {
      const next = (value[key] ?? '').trim()
      if (next !== (base[key] ?? '').trim()) {
        diff[key] = next as T[keyof T]
        any = true
      }
    }
    return any ? diff : null
  }

  /**
   * Sets the baseline to the saved values.
   * @param value - The values the save stored.
   */
  function rebase(value: T): void {
    frozen.current = value
  }

  return { changed, freeze, rebase }
}
