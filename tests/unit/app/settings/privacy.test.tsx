import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import Constants from 'expo-constants'
import * as WebBrowser from 'expo-web-browser'
import Privacy from '@/app/(app)/settings/account/privacy'
import { useAuthStore } from '@/states/auth.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { bodyOf, renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { envelope } from '@/tests/support/workspace-api'

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }))

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }))

/** The signed-in user. */
const USER = {
  id: 'u1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: '2026-01-05T00:00:00.000Z',
  platformRole: null,
  analyticsOptOut: false,
}

const POLICY = 'https://example.com/privacy'
const savedKey = process.env.EXPO_PUBLIC_POSTHOG_KEY

/**
 * Sets the `extra.privacyPolicyUrl` the screen reads.
 * @param url - The URL, or undefined for none.
 */
function setPolicyUrl(url: string | undefined): void {
  Constants.expoConfig = { extra: url ? { privacyPolicyUrl: url } : {} } as never
}

/**
 * A promise and the function that settles it.
 * @returns The promise and its release.
 */
function deferred() {
  const holder: { release?: () => void } = {}
  const promise = new Promise<void>(
    /** Hands the resolver out. */
    (resolve) => {
      holder.release = resolve
    }
  )
  return { promise, release: () => holder.release?.() }
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key_not_real'
  setPolicyUrl(POLICY)
  useAuthStore.getState().login('a', USER)
  useToastQueueStore.getState().remove()
  jest.clearAllMocks()
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  if (savedKey === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  else process.env.EXPO_PUBLIC_POSTHOG_KEY = savedKey
})

/**
 * Serves `PATCH /profile` by merging the body into the user.
 * @returns The requests the adapter saw.
 */
function serveProfile() {
  return serve((config) => envelope({ ...USER, ...(bodyOf(config) as Record<string, unknown>) }))
}

describe('Privacy screen', () => {
  it('shows the copy, the switch on for a person who has not opted out, and the link', async () => {
    serveProfile()
    await renderScreen(<Privacy />)
    expect(screen.getByRole('header', { name: 'Privacy' })).toBeTruthy()
    expect(screen.getByLabelText('Share usage analytics').props.value).toBe(true)
    expect(
      screen.getByText(
        'Which screens you open and what you tap, with names and email addresses masked, so we can improve this app. Turning it off stops this on this device; the actions you take are still recorded on our servers.'
      )
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Read our privacy policy' })).toBeTruthy()
  })

  it('shows the switch off when the person opted out', async () => {
    useAuthStore.getState().login('a', { ...USER, analyticsOptOut: true })
    serveProfile()
    await renderScreen(<Privacy />)
    expect(screen.getByLabelText('Share usage analytics').props.value).toBe(false)
  })

  it('shows the switch off when the field is missing', async () => {
    const without: Partial<typeof USER> = { ...USER }
    delete without.analyticsOptOut
    useAuthStore.getState().login('a', without as never)
    serveProfile()
    await renderScreen(<Privacy />)
    expect(screen.getByLabelText('Share usage analytics').props.value).toBe(false)
  })

  it('sends analyticsOptOut, toasts, and stores the returned user', async () => {
    const sent = serveProfile()
    await renderScreen(<Privacy />)
    await fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', false)
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.method).toBe('patch')
    expect(sent[0]?.url).toBe('/profile')
    expect(bodyOf(sent[0])).toEqual({ analyticsOptOut: true })
    await waitFor(() =>
      expect(useToastQueueStore.getState().toasts.map((t) => t.title)).toContain(
        'Usage analytics off.'
      )
    )
    expect(useAuthStore.getState().user?.analyticsOptOut).toBe(true)
    await waitFor(() =>
      expect(screen.getByLabelText('Share usage analytics').props.value).toBe(false)
    )
    await fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', true)
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(bodyOf(sent[1])).toEqual({ analyticsOptOut: false })
    await waitFor(() =>
      expect(useToastQueueStore.getState().toasts.map((t) => t.title)).toContain(
        'Usage analytics on.'
      )
    )
  })

  it('disables the switch while the write is pending', async () => {
    const { promise: gate, release } = deferred()
    serve(async (config) => {
      await gate
      return envelope({ ...USER, ...(bodyOf(config) as Record<string, unknown>) })
    })
    await renderScreen(<Privacy />)
    await fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', false)
    await waitFor(() => {
      const pending = screen.getByLabelText('Share usage analytics')
      expect(pending.props.disabled).toBe(true)
      expect(pending.props.value).toBe(false)
    })
    release()
    await waitFor(() =>
      expect(screen.getByLabelText('Share usage analytics').props.disabled).toBeFalsy()
    )
  })

  it('a failed write toasts the message and the switch returns to the stored value', async () => {
    serve(() => ({
      status: 500,
      data: { success: false, message: 'Server broke', code: 'INTERNAL' },
    }))
    await renderScreen(<Privacy />)
    await fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', false)
    await waitFor(() =>
      expect(useToastQueueStore.getState().toasts.map((t) => t.title)).toContain('Server broke')
    )
    await waitFor(() => {
      const row = screen.getByLabelText('Share usage analytics')
      expect(row.props.value).toBe(true)
      expect(row.props.disabled).toBeFalsy()
    })
    expect(useAuthStore.getState().user?.analyticsOptOut).toBe(false)
  })

  it('hides the switch and its description when analytics are unavailable, keeping the link', async () => {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY
    serveProfile()
    await renderScreen(<Privacy />)
    expect(screen.queryByLabelText('Share usage analytics')).toBeNull()
    expect(screen.queryByText(/Which screens you open/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Read our privacy policy' })).toBeTruthy()
  })

  it('opens the policy in the in-app browser', async () => {
    serveProfile()
    await renderScreen(<Privacy />)
    await fireEvent.press(screen.getByRole('link', { name: 'Read our privacy policy' }))
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(POLICY)
  })

  it('hides the link when no policy URL is set, keeping the switch', async () => {
    setPolicyUrl(undefined)
    serveProfile()
    await renderScreen(<Privacy />)
    expect(screen.queryByRole('link', { name: 'Read our privacy policy' })).toBeNull()
    expect(screen.getByLabelText('Share usage analytics')).toBeTruthy()
  })
})
