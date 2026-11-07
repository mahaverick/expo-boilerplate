import { jest } from '@jest/globals'
import {
  clearExposureDedupe,
  EXPOSURE_BATCH_MS,
  MAX_EXPOSURE_KEYS,
  reportExposure,
  resetExposureForTests,
} from '@/observability/flags/exposure'
import type { ClientFlagKey } from '@/observability/flags/flag-types'
import { restoreApi, serve, bodyOf } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

const NONE = { kind: 'none' } as const
const TENANT = { kind: 'tenant', slug: 'acme' } as const
const EXP: ClientFlagKey = 'example_cta_experiment'
const BETA: ClientFlagKey = 'example_beta_page'

/** Each exposure POST as `url keys…`, in arrival order. */
let posts: { url: string; keys: string[] }[]
let status = 204

/** Lets one batch window pass, so a due post has been sent. */
async function pastBatchWindow(): Promise<void> {
  await jest.advanceTimersByTimeAsync(EXPOSURE_BATCH_MS)
}

beforeEach(() => {
  jest.useFakeTimers()
  resetExposureForTests()
  posts = []
  status = 204
  serve((config) => {
    posts.push({
      url: config.url ?? '',
      keys: (bodyOf(config) as { keys: string[] }).keys,
    })
    return { status, data: null }
  })
})

afterEach(() => {
  jest.useRealTimers()
  resetExposureForTests()
  restoreApi()
})

describe('reportExposure', () => {
  it('batches reports in one window into one post per scope', async () => {
    reportExposure(NONE, EXP, 'bold')
    reportExposure(NONE, BETA, true)
    reportExposure(TENANT, EXP, 'control')
    expect(EXPOSURE_BATCH_MS).toBe(50)
    await pastBatchWindow()
    expect(posts).toHaveLength(2)
    expect(posts).toEqual([
      { url: '/flags/exposures', keys: [EXP, BETA] },
      { url: '/tenants/acme/flags/exposures', keys: [EXP] },
    ])
  })

  it('reports a scope, key and value once per launch', async () => {
    reportExposure(NONE, EXP, 'bold')
    await pastBatchWindow()
    expect(posts).toHaveLength(1)
    reportExposure(NONE, EXP, 'bold')
    await pastBatchWindow()
    expect(posts).toHaveLength(1)
  })

  it('reports again for another value or another scope', async () => {
    reportExposure(NONE, EXP, 'bold')
    await pastBatchWindow()
    expect(posts).toHaveLength(1)
    reportExposure(NONE, EXP, 'control')
    reportExposure(TENANT, EXP, 'control')
    await pastBatchWindow()
    expect(posts).toHaveLength(3)
  })

  it(`splits a batch into posts of at most ${String(MAX_EXPOSURE_KEYS)} keys`, async () => {
    for (let index = 1; index <= 12; index += 1) {
      reportExposure(NONE, `k${String(index)}` as ClientFlagKey, 'control')
    }
    await pastBatchWindow()
    expect(posts).toHaveLength(2)
    expect(posts.map((post) => post.keys.length)).toEqual([10, 2])
  })

  it('drops a failed post and never retries it', async () => {
    status = 429
    reportExposure(NONE, EXP, 'bold')
    await pastBatchWindow()
    expect(posts).toHaveLength(1)
    reportExposure(NONE, EXP, 'bold')
    await pastBatchWindow()
    expect(posts).toHaveLength(1)
  })
})

describe('clearExposureDedupe', () => {
  it('drops a batch still gathering, so it never posts under the next person', async () => {
    reportExposure(NONE, EXP, 'bold')
    clearExposureDedupe()
    await pastBatchWindow()
    expect(posts).toHaveLength(0)
  })

  it('forgets every mark, so the next person reports afresh', async () => {
    reportExposure(NONE, EXP, 'bold')
    await pastBatchWindow()
    expect(posts).toHaveLength(1)
    clearExposureDedupe()
    reportExposure(NONE, EXP, 'bold')
    await pastBatchWindow()
    expect(posts).toHaveLength(2)
  })
})
