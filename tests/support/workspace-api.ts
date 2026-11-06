/**
 * @file A fake API for the workspace screens: one workspace, `acme`, with
 * answers for each route the overview reads. A test overrides a route by its
 * `"METHOD /path"` key.
 */
import { serve, type FakeAnswer } from '@/tests/support/api'

/** Wraps data in express's success envelope. */
export function envelope(data: unknown): FakeAnswer {
  return { status: 200, data: { success: true, data } }
}

/** A 404 in express's error envelope. */
export const NOT_FOUND: FakeAnswer = {
  status: 404,
  data: { success: false, message: 'Not found', code: 'NOT_FOUND' },
}

/** A `GET /tenants/acme` body; fields in `overrides` replace the defaults. */
export function acme(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-acme',
    name: 'Acme',
    slug: 'acme',
    description: null,
    logo: null,
    website: null,
    lifecycleState: 'active',
    deletedAt: null,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    isPlatform: false,
    role: 'owner',
    access: 'member',
    ...overrides,
  }
}

/** A membership row of `GET /tenants`. */
export function membership(slug: string, name: string, lifecycleState = 'active') {
  return {
    tenant: { id: `t-${slug}`, name, slug, lifecycleState },
    role: 'owner',
    joinedAt: '2026-01-01',
    isPlatform: false,
  }
}

/** A step of the onboarding checklist. */
export function step(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    title: key,
    description: `Do ${key}`,
    scope: 'tenant',
    kind: 'manual',
    required: true,
    completedAt: null,
    source: null,
    ...overrides,
  }
}

/** A `GET /tenants/acme/onboarding` body. */
export function onboarding(overrides: Record<string, unknown> = {}) {
  return {
    state: 'in_progress',
    steps: [step('profile')],
    requiredDone: 0,
    requiredTotal: 1,
    completedAt: null,
    dismissedAt: null,
    ...overrides,
  }
}

/**
 * Serves the workspace routes. Unlisted routes answer 404.
 * @param overrides - Answers by `"METHOD /path"`.
 * @returns The requests the adapter saw.
 */
export function serveWorkspace(overrides: Record<string, FakeAnswer> = {}) {
  const answers: Record<string, FakeAnswer> = {
    'GET /tenants/acme': envelope(acme()),
    'GET /tenants': envelope({
      items: [membership('acme', 'Acme')],
      page: { hasNext: false, nextCursor: null },
    }),
    'GET /tenants/acme/onboarding': envelope(onboarding({ state: 'not_tracked' })),
    'GET /tenants/acme/billing': envelope({ state: 'free', trialEndsAt: null }),
    'GET /tenants/acme/settings': envelope({ tenantId: 't-acme', timezone: 'UTC' }),
    'GET /status/client-settings': NOT_FOUND,
    ...overrides,
  }
  return serve((config) => {
    const key = `${(config.method ?? 'get').toUpperCase()} ${config.url ?? ''}`
    return answers[key] ?? (key.startsWith('POST') ? envelope(null) : NOT_FOUND)
  })
}
