/**
 * @file Experiment exposure, reported to express, which re-evaluates each key
 * and records the exposure itself: the app sends keys, never values. Reports
 * are batched, deduped per launch in memory and independent of analytics
 * consent. A failed report is dropped, never retried.
 */
import { apiClient } from '@/http/client'
import { flagScopeId, flagsPathFor, type FlagScope } from './flag-query'
import type { ClientFlagKey } from './flag-types'

/** How long reports gather before they are sent, as one post per scope and chunk of keys. */
export const EXPOSURE_BATCH_MS = 50

/** The most keys one exposure post carries; the endpoint refuses more. */
export const MAX_EXPOSURE_KEYS = 10

/** The keys waiting to be reported for one scope. */
interface PendingBatch {
  scope: FlagScope
  keys: Set<string>
}

/** The scope, key and value marks already reported this launch. */
const reported = new Set<string>()
const pending = new Map<string, PendingBatch>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

/** Sends the pending keys, one post per scope in chunks of `MAX_EXPOSURE_KEYS`; a failed post is dropped. */
function flush(): void {
  flushTimer = null
  const batches = [...pending.values()]
  pending.clear()
  for (const { scope, keys } of batches) {
    const all = [...keys]
    for (let start = 0; start < all.length; start += MAX_EXPOSURE_KEYS) {
      apiClient
        .post(`${flagsPathFor(scope)}/exposures`, {
          keys: all.slice(start, start + MAX_EXPOSURE_KEYS),
        })
        .catch(() => undefined)
    }
  }
}

/**
 * Reports that a screen used an experiment flag's value. The first report of
 * a scope, key and value in this launch joins a batch sent
 * `EXPOSURE_BATCH_MS` later; every later one is dropped.
 * @param scope - The scope the value was read in, which picks the endpoint.
 * @param key - An experiment flag.
 * @param value - The value the screen used, part of the dedupe mark only.
 */
export function reportExposure(
  scope: FlagScope,
  key: ClientFlagKey,
  value: boolean | string
): void {
  const scopeId = flagScopeId(scope)
  const name: string = key
  const mark = `${scopeId}:${name}:${String(value)}`
  if (reported.has(mark)) return
  reported.add(mark)
  const batch = pending.get(scopeId) ?? { scope, keys: new Set<string>() }
  batch.keys.add(name)
  pending.set(scopeId, batch)
  flushTimer ??= setTimeout(flush, EXPOSURE_BATCH_MS)
}

/**
 * Forgets every reported mark and drops the batch still gathering, so the
 * next person on this device reports afresh and a report of the last person
 * never posts under the next one's token.
 */
export function clearExposureDedupe(): void {
  reported.clear()
  pending.clear()
  if (flushTimer !== null) clearTimeout(flushTimer)
  flushTimer = null
}

/** Test-only: drop the pending batch, its timer and every mark. */
export function resetExposureForTests(): void {
  clearExposureDedupe()
}
