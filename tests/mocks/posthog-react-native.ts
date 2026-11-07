/**
 * @file An in-memory stand-in for `posthog-react-native`. Registered in
 * `jest.config.ts`. Each client records its options, and each method is a
 * `jest.fn`, so a test can assert on the calls or make one throw. A capture
 * runs the options' `before_send` over the registered properties and the
 * event's own, as the SDK does, and lands in `sent` unless the client is
 * opted out or the hook drops it. `reset()` clears the opt-out, as the SDK's
 * does.
 */
import { jest } from '@jest/globals'
import type { BeforeSendFn, CaptureEvent } from '@posthog/core'

/** The persisted-property keys the facade reads, with the SDK's own values. */
export const PostHogPersistedProperty = {
  PersonMode: 'person_mode',
  OptedOut: 'opted_out',
} as const

/** The options the facade passes, as far as the mock reads them. */
interface MockOptions {
  before_send?: BeforeSendFn | BeforeSendFn[]
  [option: string]: unknown
}

/** Every client constructed since the last `resetPostHogMock`. */
export const clients: PostHog[] = []

/** Switches a test can flip: `throwOnConstruct` makes the next `new PostHog` throw. */
export const mockControl = { throwOnConstruct: false }

/** How many anonymous ids and sessions the mock has handed out. */
let counter = 0

/** A fresh id with a prefix, unique within the run. */
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/** A fake PostHog client. */
export class PostHog {
  readonly apiKey: string
  readonly options: MockOptions
  /** Events that left the client, after `before_send`. */
  readonly sent: CaptureEvent[] = []
  props: Record<string, unknown> = {}
  distinctId = nextId('anon')
  sessionId = nextId('session')
  personMode: 'identified' | undefined = undefined
  isOptedOut = false

  constructor(apiKey: string, options: MockOptions = {}) {
    if (mockControl.throwOnConstruct) throw new Error('construct failed')
    this.apiKey = apiKey
    this.options = options
    clients.push(this)
  }

  /** Whether capture is off. */
  get optedOut(): boolean {
    return this.isOptedOut
  }

  capture = jest.fn((event: string, properties: Record<string, unknown> = {}) => {
    this.emit(event, properties)
  })

  screen = jest.fn((name: string, properties: Record<string, unknown> = {}) => {
    this.emit('$screen', { ...properties, $screen_name: name })
    return Promise.resolve()
  })

  register = jest.fn((properties: Record<string, unknown>) => {
    this.props = { ...this.props, ...properties }
    return Promise.resolve()
  })

  unregister = jest.fn((property: string) => {
    const rest = { ...this.props }
    delete rest[property]
    this.props = rest
    return Promise.resolve()
  })

  identify = jest.fn((distinctId: string) => {
    this.distinctId = distinctId
    this.personMode = 'identified'
  })

  group = jest.fn((groupType: string, groupKey: string) => {
    const groups = (this.props.$groups as Record<string, unknown> | undefined) ?? {}
    this.props = { ...this.props, $groups: { ...groups, [groupType]: groupKey } }
  })

  reset = jest.fn(() => {
    this.props = {}
    this.distinctId = nextId('anon')
    this.sessionId = nextId('session')
    this.personMode = undefined
    this.isOptedOut = false
  })

  optIn = jest.fn(() => {
    this.isOptedOut = false
    return Promise.resolve()
  })

  optOut = jest.fn(() => {
    this.isOptedOut = true
    return Promise.resolve()
  })

  getDistinctId = jest.fn(() => this.distinctId)

  getSessionId = jest.fn(() => this.sessionId)

  getPersistedProperty = jest.fn((key: string): unknown =>
    key === PostHogPersistedProperty.PersonMode ? this.personMode : undefined
  )

  /** Builds the event the SDK would, runs `before_send`, and records what survives. */
  private emit(event: string, properties: Record<string, unknown>): void {
    if (this.isOptedOut) return
    let captured: CaptureEvent | null = {
      event,
      properties: { ...this.props, ...properties, distinct_id: this.distinctId },
    }
    const hooks = this.options.before_send
    for (const hook of Array.isArray(hooks) ? hooks : hooks ? [hooks] : []) {
      if (captured === null) break
      captured = hook(captured)
    }
    if (captured !== null) this.sent.push(captured)
  }
}

/** Forgets every client. */
export function resetPostHogMock(): void {
  clients.length = 0
  mockControl.throwOnConstruct = false
}

export default PostHog
