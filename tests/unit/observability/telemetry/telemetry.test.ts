import { jest } from '@jest/globals'
import type { BeforeSendFn, CaptureEvent } from '@posthog/core'
import { apiUrl } from '@/http/client'
import {
  analyticsSettledNow,
  captureScreen,
  forgetStaleIdentity,
  identifyUser,
  initAnalytics,
  registerFeatureProperties,
  resetAnalytics,
  resetAnalyticsForTests,
  setAnalyticsOptOut,
  setTenantGroup,
  track,
  getAnalyticsSessionIdFor,
  unregisterFeatureProperties,
  whenAnalyticsSettled,
} from '@/observability/telemetry/telemetry'
import {
  clients,
  mockControl,
  resetPostHogMock,
  type PostHog,
} from '@/tests/mocks/posthog-react-native'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

/** What the fake MMKV instance holds. */
const mockStored = new Map<string, string>()

jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => {
      mockStored.set(key, value)
    },
  },
}))

/** `track` without the registry's types, for an event shape the registry would refuse. */
const trackAnything = track as unknown as (event: string, properties?: object) => void

/** The variables the facade reads, restored after each case. */
const saved = {
  key: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  environment: process.env.EXPO_PUBLIC_APP_ENV,
}

/** Sets or clears one variable. */
function setEnv(name: 'EXPO_PUBLIC_POSTHOG_KEY' | 'EXPO_PUBLIC_APP_ENV', value?: string): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

/** The one client the facade built. */
function client(): PostHog {
  expect(clients).toHaveLength(1)
  return clients[0] as PostHog
}

/** The properties of the last event the client queued. */
function lastSent(): Record<string, unknown> {
  const sent = client().queued.at(-1)
  expect(sent).toBeDefined()
  return (sent as CaptureEvent).properties as Record<string, unknown>
}

/** The client's `before_send` hook, called directly. */
function beforeSend(event: CaptureEvent): CaptureEvent | null {
  return (client().options.before_send as BeforeSendFn)(event)
}

/**
 * Lets the rejections of the SDK's async calls settle, so a rejection the
 * facade failed to catch surfaces in this case. Nothing observable marks it.
 */
async function settleSdkPromises(): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
}

beforeEach(() => {
  resetAnalyticsForTests()
  resetPostHogMock()
  mockStored.clear()
})

afterEach(() => {
  setEnv('EXPO_PUBLIC_POSTHOG_KEY', saved.key)
  setEnv('EXPO_PUBLIC_APP_ENV', saved.environment)
})

describe('analytics with no key', () => {
  beforeEach(() => {
    setEnv('EXPO_PUBLIC_POSTHOG_KEY')
  })

  it('settles at once as anonymous, even before init', async () => {
    await expect(whenAnalyticsSettled()).resolves.toEqual({
      distinctId: null,
      capturing: false,
      identified: false,
    })
  })

  it('builds no client and sends nothing', async () => {
    initAnalytics()
    track('sign_in_link_requested')
    captureScreen('/(app)/(tabs)/index')
    identifyUser('user-1')
    setAnalyticsOptOut(true)
    setTenantGroup({ id: 'tenant-1', access: 'member' })
    registerFeatureProperties({ '$feature/example_beta_page': true })
    unregisterFeatureProperties(['$feature/example_beta_page'])
    resetAnalytics()
    expect(clients).toHaveLength(0)
    expect(getAnalyticsSessionIdFor('user-1')).toBeNull()
    await expect(whenAnalyticsSettled()).resolves.toEqual({
      distinctId: null,
      capturing: false,
      identified: false,
    })
  })
})

describe('analytics with a key', () => {
  beforeEach(() => {
    setEnv('EXPO_PUBLIC_POSTHOG_KEY', 'phc_test')
    setEnv('EXPO_PUBLIC_APP_ENV', 'staging')
  })

  it('sends to the collect proxy with the plan’s options', () => {
    initAnalytics()
    expect(client().apiKey).toBe('phc_test')
    expect(client().options).toMatchObject({
      host: apiUrl('/collect'),
      persistence: 'file',
      captureAppLifecycleEvents: true,
      preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true,
      enableSessionReplay: false,
      errorTracking: {
        autocapture: {
          uncaughtExceptions: false,
          unhandledRejections: false,
          console: false,
          nativeCrashes: false,
          androidNdkCrashes: false,
        },
      },
    })
    expect(apiUrl('/collect')).toBe('https://api.example.test/api/v1/collect')
  })

  it('keeps the SDK’s state in the app’s MMKV instance', async () => {
    initAnalytics()
    const storage = client().options.customStorage as {
      getItem: (key: string) => string | null
      setItem: (key: string, value: string) => void
    }
    expect(storage.getItem('.posthog-rn.json')).toBeNull()
    storage.setItem('.posthog-rn.json', '{"opted_out":true}')
    expect(mockStored.get('.posthog-rn.json')).toBe('{"opted_out":true}')
    expect(storage.getItem('.posthog-rn.json')).toBe('{"opted_out":true}')
    await settleSdkPromises()
  })

  it('builds one client however often it is called', () => {
    initAnalytics()
    initAnalytics()
    expect(clients).toHaveLength(1)
  })

  it('registers the app and environment super properties on every event', () => {
    initAnalytics()
    track('sign_in_link_requested')
    expect(lastSent()).toMatchObject({ app: 'expo', environment: 'staging' })
    captureScreen('/(app)/(tabs)/index')
    expect(lastSent()).toMatchObject({
      app: 'expo',
      environment: 'staging',
      $screen_name: '/(app)/(tabs)/index',
    })
  })

  it('stamps the super properties on an event the SDK captured before they were registered', () => {
    initAnalytics()
    expect(beforeSend({ event: 'Application Installed', properties: {} })?.properties).toEqual({
      app: 'expo',
      environment: 'staging',
    })
  })

  it('sends the registered event and its properties', () => {
    initAnalytics()
    track('sign_in_completed', { method: 'passkey' })
    expect(client().queued.at(-1)?.event).toBe('sign_in_completed')
    expect(lastSent()).toMatchObject({ method: 'passkey' })
  })

  it('sanitises every URL-like property and drops personal keys at every depth', () => {
    initAnalytics()
    client().capture('Application Opened', {
      url: 'expo-boilerplate://auth/link?token=secret&email=a%40b.test',
      $current_url: 'https://app.example.test/auth/link?token=secret&tab=members#frag',
      path: '/auth/link?token=secret',
      mail: 'mailto:a@b.test',
      route: '/(app)/tenants/[slug]',
      label: 'trial_ended',
      email: 'a@b.test',
      nested: { search: 'acme', list: [{ token: 'x', q: 'y', keep: 1 }], ok: true },
      $set: { email: 'a@b.test', invitation: 'z', plan: 'free' },
    })
    expect(lastSent()).toEqual({
      url: 'expo-boilerplate:',
      $current_url: 'https://app.example.test/auth/link?tab=members',
      path: '/auth/link',
      mail: 'mailto:',
      route: '/(app)/tenants/[slug]',
      label: 'trial_ended',
      nested: { list: [{ keep: 1 }], ok: true },
      $set: { plan: 'free' },
      app: 'expo',
      environment: 'staging',
      distinct_id: client().distinctId,
    })
  })

  it('guards what track and captureScreen pass', () => {
    initAnalytics()
    trackAnything('sign_in_completed', {
      method: 'link',
      redirect: '/tenants/acme',
      link: 'https://app.example.test/invitations/accept?token=secret',
    })
    expect(lastSent()).toMatchObject({
      method: 'link',
      link: 'https://app.example.test/invitations/accept',
    })
    expect(lastSent()).not.toHaveProperty('redirect')
    captureScreen('/auth/link?token=secret#x')
    expect(lastSent()).toMatchObject({ $screen_name: '/auth/link' })
  })

  it('sanitises `$set_once` too', () => {
    initAnalytics()
    expect(
      beforeSend({
        event: '$identify',
        properties: {},
        $set_once: { $initial_url: 'https://a.test/?token=1', email: 'a@b.test' },
      })?.$set_once
    ).toEqual({ $initial_url: 'https://a.test/' })
  })

  it('stops capture on opt-out and resumes on opt-in', () => {
    initAnalytics()
    setAnalyticsOptOut(true)
    expect(client().optOut).toHaveBeenCalledTimes(1)
    track('sign_in_link_requested')
    expect(client().queued).toHaveLength(0)
    setAnalyticsOptOut(true)
    expect(client().optOut).toHaveBeenCalledTimes(1)
    setAnalyticsOptOut(false)
    expect(client().optIn).toHaveBeenCalledTimes(1)
    track('sign_in_link_requested')
    expect(client().queued).toHaveLength(1)
    setAnalyticsOptOut(false)
    expect(client().optIn).toHaveBeenCalledTimes(1)
  })

  it('drops the events still queued when capture turns off', async () => {
    initAnalytics()
    track('sign_in_link_requested')
    captureScreen('/(app)/(tabs)/index')
    setAnalyticsOptOut(true)
    await client().flush()
    expect(client().delivered).toHaveLength(0)
    expect(client().setPersistedProperty).toHaveBeenCalledWith('queue', null)
  })

  it('drops a stored queue when an opt-out issued before init runs', async () => {
    mockControl.stored = {
      queue: [{ event: 'Application Opened', properties: {} }],
      optedOut: false,
    }
    setAnalyticsOptOut(true)
    initAnalytics()
    await client().flush()
    expect(client().optOut).toHaveBeenCalledTimes(1)
    expect(client().delivered).toHaveLength(0)
  })

  it('drops a stored queue when the SDK loads a stored opt-out', async () => {
    mockControl.stored = {
      queue: [{ event: 'Application Opened', properties: {} }],
      optedOut: true,
    }
    initAnalytics()
    await client().flush()
    expect(client().delivered).toHaveLength(0)
  })

  it('keeps a stored queue while capture is on', async () => {
    mockControl.stored = {
      queue: [{ event: 'Application Opened', properties: {} }],
      optedOut: false,
    }
    initAnalytics()
    await client().flush()
    expect(client().delivered.map((event) => event.event)).toEqual(['Application Opened'])
  })

  it('resets, puts the super and feature properties back, and keeps the opt-out', () => {
    initAnalytics()
    identifyUser('user-1')
    registerFeatureProperties({ '$feature/example_beta_page': true })
    setTenantGroup({ id: 'tenant-1', access: 'member' })
    setAnalyticsOptOut(true)
    resetAnalytics()
    expect(client().reset).toHaveBeenCalledTimes(1)
    expect(client().optedOut).toBe(true)
    expect(client().props).toEqual({
      app: 'expo',
      environment: 'staging',
      '$feature/example_beta_page': true,
    })
    expect(getAnalyticsSessionIdFor('user-1')).toBeNull()
  })

  it('leaves capture on after a reset that was not opted out', () => {
    initAnalytics()
    resetAnalytics()
    expect(client().optOut).not.toHaveBeenCalled()
    track('sign_in_link_requested')
    expect(lastSent()).toMatchObject({ app: 'expo' })
  })

  it('links a request to the session only for the identified user while capturing', () => {
    initAnalytics()
    expect(getAnalyticsSessionIdFor('user-1')).toBeNull()
    identifyUser('user-1')
    expect(client().identify).toHaveBeenCalledWith('user-1')
    expect(getAnalyticsSessionIdFor('user-1')).toBe(client().sessionId)
    expect(getAnalyticsSessionIdFor('user-2')).toBeNull()
    expect(getAnalyticsSessionIdFor(null)).toBeNull()
    setAnalyticsOptOut(true)
    expect(getAnalyticsSessionIdFor('user-1')).toBeNull()
  })

  it('links no session while the SDK holds someone else', () => {
    initAnalytics()
    identifyUser('user-1')
    client().distinctId = 'someone-else'
    expect(getAnalyticsSessionIdFor('user-1')).toBeNull()
  })

  it('resets a different identified person before identifying, keeping the opt-out', () => {
    initAnalytics()
    client().identify('stale-user')
    setAnalyticsOptOut(true)
    identifyUser('user-1')
    expect(client().reset).toHaveBeenCalledTimes(1)
    expect(client().optedOut).toBe(true)
    expect(client().distinctId).toBe('user-1')
    identifyUser('user-1')
    expect(client().reset).toHaveBeenCalledTimes(1)
  })

  it('forgets a stored identified person, keeping the opt-out', () => {
    initAnalytics()
    client().identify('stale-user')
    setAnalyticsOptOut(true)
    forgetStaleIdentity()
    expect(client().reset).toHaveBeenCalledTimes(1)
    expect(client().distinctId).not.toBe('stale-user')
    expect(client().optedOut).toBe(true)
  })

  it('does not reset an anonymous person', () => {
    initAnalytics()
    const before = client().distinctId
    forgetStaleIdentity()
    expect(client().reset).not.toHaveBeenCalled()
    expect(client().distinctId).toBe(before)
  })

  it('groups events by tenant and reports a switch', () => {
    initAnalytics()
    setTenantGroup({ id: 'tenant-1', access: 'member' })
    expect(client().group).toHaveBeenCalledWith('tenant', 'tenant-1')
    expect(client().props).toMatchObject({
      tenant_access: 'member',
      $groups: { tenant: 'tenant-1' },
    })
    setTenantGroup({ id: 'tenant-1', access: 'member' })
    expect(client().group).toHaveBeenCalledTimes(1)
    setTenantGroup({ id: 'tenant-2', access: 'platform' })
    expect(client().queued.at(-1)?.event).toBe('tenant_switched')
    expect(lastSent()).toMatchObject({ tenant_access: 'platform', $groups: { tenant: 'tenant-2' } })
    setTenantGroup(null)
    expect(client().props).not.toHaveProperty('$groups')
    expect(client().props).not.toHaveProperty('tenant_access')
    setTenantGroup(null)
    expect(client().unregister).toHaveBeenCalledTimes(2)
  })

  it('registers and removes feature properties', () => {
    initAnalytics()
    registerFeatureProperties({ '$feature/a': true, '$feature/b': 'bold' })
    unregisterFeatureProperties(['$feature/a'])
    track('sign_in_link_requested')
    expect(lastSent()).toMatchObject({ '$feature/b': 'bold' })
    expect(lastSent()).not.toHaveProperty('$feature/a')
  })

  it('swallows a throwing or rejecting SDK call', async () => {
    initAnalytics()
    client().capture.mockImplementation(() => {
      throw new Error('boom')
    })
    client().optOut.mockImplementation(() => Promise.reject(new Error('boom')))
    client().register.mockImplementation(() => Promise.reject(new Error('boom')))
    expect(() => {
      track('sign_in_link_requested')
      setAnalyticsOptOut(true)
      registerFeatureProperties({ '$feature/a': true })
    }).not.toThrow()
    await settleSdkPromises()
  })

  it('drops an event whose guard throws, rather than sending it unguarded', () => {
    initAnalytics()
    const hostile = {}
    Object.defineProperty(hostile, 'value', {
      enumerable: true,
      get: () => {
        throw new Error('boom')
      },
    })
    expect(beforeSend({ event: 'x', properties: { hostile } })).toBeNull()
  })

  it('becomes inert when the SDK fails to start', async () => {
    mockControl.throwOnConstruct = true
    initAnalytics()
    track('sign_in_link_requested')
    expect(clients).toHaveLength(0)
    await expect(whenAnalyticsSettled()).resolves.toEqual({
      distinctId: null,
      capturing: false,
      identified: false,
    })
  })

  it('queues calls made before init and replays them in order', () => {
    identifyUser('user-1')
    track('sign_in_completed', { method: 'link' })
    initAnalytics()
    expect(client().distinctId).toBe('user-1')
    expect(client().queued.map((event) => event.event)).toEqual(['sign_in_completed'])
  })

  it('caps the queue at 100 by dropping the oldest event, never an identity call', () => {
    identifyUser('user-1')
    for (let index = 0; index < 100; index += 1) track('sign_in_link_requested')
    track('billing_page_viewed')
    initAnalytics()
    expect(client().identify).toHaveBeenCalledWith('user-1')
    expect(client().queued).toHaveLength(99)
    expect(client().queued.at(-1)?.event).toBe('billing_page_viewed')
  })

  it('drops a new event when the queue holds only calls it keeps', () => {
    for (let index = 0; index < 100; index += 1) identifyUser(`user-${index}`)
    track('billing_page_viewed')
    initAnalytics()
    expect(client().queued).toHaveLength(0)
    expect(client().distinctId).toBe('user-99')
  })

  it('settles with the distinct id and whether capture is on', async () => {
    identifyUser('user-1')
    const settled = whenAnalyticsSettled()
    initAnalytics()
    await expect(settled).resolves.toEqual({
      distinctId: 'user-1',
      capturing: true,
      identified: true,
    })
    setAnalyticsOptOut(true)
    await expect(whenAnalyticsSettled()).resolves.toEqual({
      distinctId: 'user-1',
      capturing: false,
      identified: false,
    })
  })

  it('says identified only while capture is on and the facade identified that distinct id', async () => {
    initAnalytics()
    const anonymous = await whenAnalyticsSettled()
    expect(anonymous.distinctId).not.toBeNull()
    expect(anonymous).toMatchObject({ capturing: true, identified: false })
    identifyUser('user-1')
    await expect(whenAnalyticsSettled()).resolves.toEqual({
      distinctId: 'user-1',
      capturing: true,
      identified: true,
    })
    resetAnalytics()
    await expect(whenAnalyticsSettled()).resolves.toMatchObject({ identified: false })
  })

  it('reads the same state synchronously, for a fatal crash that cannot wait', () => {
    expect(analyticsSettledNow()).toEqual({ distinctId: null, capturing: false, identified: false })
    initAnalytics()
    identifyUser('user-1')
    expect(analyticsSettledNow()).toEqual({
      distinctId: 'user-1',
      capturing: true,
      identified: true,
    })
    setAnalyticsOptOut(true)
    expect(analyticsSettledNow()).toMatchObject({ capturing: false, identified: false })
  })
})
