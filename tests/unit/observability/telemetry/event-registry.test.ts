import {
  analyticsKey,
  REGISTRY_HAS_NO_FREE_STRINGS,
  type AppEvent,
  type AppEventProps,
  type TrackArgs,
} from '@/observability/telemetry/event-registry'
import { describe, expect, it } from '@/tests/support/runner'

/** Type-checks a `track` call against the registry, without sending anything. */
function check<E extends AppEvent>(event: E, ...args: TrackArgs<E>): unknown[] {
  return [event, ...args]
}

describe('event registry', () => {
  it('returns the key it is given', () => {
    expect(analyticsKey('members')).toBe('members')
    expect(analyticsKey('onboarding_open_settings')).toBe('onboarding_open_settings')
  })

  it('refuses a key that is not a fixed lowercase literal', () => {
    const typed: string = 'members'
    // @ts-expect-error A space marks a sentence, never a key.
    analyticsKey('bad key')
    // @ts-expect-error An address carries `@` and `.`.
    analyticsKey('a@b.test')
    // @ts-expect-error A URL carries `/`, `:` and `?`.
    analyticsKey('https://x.test/?q=1')
    // @ts-expect-error An uppercase letter is not a key.
    analyticsKey('Members')
    // @ts-expect-error A `string` variable could hold anything.
    analyticsKey(typed)
    expect(typed).toBe('members')
  })

  it('admits no free string property', () => {
    expect(REGISTRY_HAS_NO_FREE_STRINGS).toBe(true)
  })

  it('accepts the shapes the shared call sites send', () => {
    check('sign_in_link_requested')
    check('sign_in_completed', { method: 'link' })
    check('sign_in_completed', { method: 'passkey' })
    check('banner_dismissed', { banner: 'trial_ended' })
    check('tenant_switched')
    check('feature_cta_clicked', { cta: analyticsKey('getting_started') })
    check('maintenance_page_viewed', { mode: 'read_only' })
    check('billing_page_viewed')
    check('trial_explainer_viewed')
    const events: (keyof AppEventProps)[] = ['sign_in_link_requested']
    expect(events).toHaveLength(1)
  })

  it('refuses an unregistered event or property', () => {
    // @ts-expect-error Not an event expo sends.
    check('checkout_opened', { interval: 'month', purpose: 'upgrade' })
    // @ts-expect-error Google sign-in is web-only.
    check('sign_in_completed', { method: 'google' })
    // @ts-expect-error An event with properties needs them.
    check('sign_in_completed')
    // @ts-expect-error An event with none takes none.
    check('tenant_switched', { from: 'a' })
    // @ts-expect-error `cta` is a branded key, not a free string.
    check('feature_cta_clicked', { cta: 'free text' })
    expect(true).toBe(true)
  })
})
