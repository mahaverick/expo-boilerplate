import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import Profile from '@/app/(app)/settings/account/profile'
import { formatDate } from '@/lib/format'
import { profileKeys } from '@/queries/profile.queries'
import { useAuthStore } from '@/states/auth.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { bodyOf, renderScreen, restoreApi, screenTree, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { envelope } from '@/tests/support/workspace-api'

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

beforeEach(() => {
  useAuthStore.getState().login('a', USER)
  useToastQueueStore.getState().remove()
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
})

/**
 * Serves the profile routes.
 * @param patch - What `PATCH /profile` answers; defaults to the saved user.
 * @returns The requests the adapter saw.
 */
function serveProfile(patch?: Parameters<typeof serve>[0]) {
  return serve((config) => {
    if (config.method === 'patch' && patch) return patch(config)
    if (config.method === 'patch') {
      const body = bodyOf(config) as Record<string, string>
      return envelope({ ...USER, ...body })
    }
    return envelope(USER)
  })
}

/**
 * The PATCH requests seen.
 * @param sent - Every request.
 * @returns The patches.
 */
function patches(sent: ReturnType<typeof serve>) {
  return sent.filter((config) => config.method === 'patch')
}

describe('Profile screen', () => {
  it('shows the copy, the names and the read-only rows', async () => {
    serveProfile()
    await renderScreen(<Profile />)
    expect(screen.getByRole('header', { name: 'Profile' })).toBeTruthy()
    expect(
      screen.getByText('Update your name. Your email address can’t be changed here.')
    ).toBeTruthy()
    expect(screen.getByLabelText('First name').props.value).toBe('Ada')
    expect(screen.getByLabelText('Last name').props.value).toBe('Lovelace')
    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByText('Member since')).toBeTruthy()
    expect(screen.getByText(formatDate(USER.createdAt, 'long') ?? '')).toBeTruthy()
  })

  it('sends only the changed name', async () => {
    const sent = serveProfile()
    await renderScreen(<Profile />)
    await fireEvent.changeText(screen.getByLabelText('First name'), '  Grace ')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(patches(sent)).toHaveLength(1)
    })
    expect(bodyOf(patches(sent)[0])).toEqual({ firstName: 'Grace' })
  })

  it('nothing changed shows the notice and posts nothing', async () => {
    const sent = serveProfile()
    await renderScreen(<Profile />)
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a name before saving.')).toBeTruthy()
    expect(patches(sent)).toHaveLength(0)
    await fireEvent.changeText(screen.getByLabelText('Last name'), 'Byron')
    expect(screen.queryByText('Change a name before saving.')).toBeNull()
  })

  it('a refetch after the first edit does not change what is sent', async () => {
    const sent = serveProfile()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = await renderScreen(<Profile />, client)
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Grace')
    client.setQueryData(profileKeys.detail, { ...USER, firstName: 'Grace', lastName: 'King' })
    await view.rerender(screenTree(<Profile />, client))
    await fireEvent.changeText(screen.getByLabelText('Last name'), 'King')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(patches(sent)).toHaveLength(1)
    })
    expect(bodyOf(patches(sent)[0])).toEqual({ firstName: 'Grace', lastName: 'King' })
  })

  it('a refetch before any edit updates the shown name, and Save then posts nothing', async () => {
    const sent = serveProfile()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = await renderScreen(<Profile />, client)
    client.setQueryData(profileKeys.detail, { ...USER, firstName: 'Grace' })
    await view.rerender(screenTree(<Profile />, client))
    await waitFor(() => {
      expect(screen.getByLabelText('First name').props.value).toBe('Grace')
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a name before saving.')).toBeTruthy()
    expect(patches(sent)).toHaveLength(0)
  })

  it('a refetch after an edit changes neither the shown values nor what is sent', async () => {
    const sent = serveProfile()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = await renderScreen(<Profile />, client)
    await fireEvent.changeText(screen.getByLabelText('Last name'), 'Byron')
    client.setQueryData(profileKeys.detail, { ...USER, firstName: 'Grace' })
    await view.rerender(screenTree(<Profile />, client))
    expect(screen.getByLabelText('First name').props.value).toBe('Ada')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(patches(sent)).toHaveLength(1)
    })
    expect(bodyOf(patches(sent)[0])).toEqual({ lastName: 'Byron' })
  })

  it('validates the changed field and posts nothing when it is blank', async () => {
    const sent = serveProfile()
    await renderScreen(<Profile />)
    await fireEvent.changeText(screen.getByLabelText('First name'), '   ')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('First name is required.')).toBeTruthy()
    expect(patches(sent)).toHaveLength(0)
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Grace')
    expect(screen.queryByText('First name is required.')).toBeNull()
  })

  it('shows a 400 field error under its field and clears it on edit', async () => {
    serveProfile(() => ({
      status: 400,
      data: {
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: { lastName: ['Last name is not allowed.'] },
      },
    }))
    await renderScreen(<Profile />)
    await fireEvent.changeText(screen.getByLabelText('Last name'), 'Byron')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Last name is not allowed.')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Last name'), 'Byrone')
    expect(screen.queryByText('Last name is not allowed.')).toBeNull()
  })

  it('toasts on success and rebases, so a second press sends nothing', async () => {
    const sent = serveProfile()
    await renderScreen(<Profile />)
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Grace')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toContain(
        'Profile updated.'
      )
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a name before saving.')).toBeTruthy()
    expect(patches(sent)).toHaveLength(1)
  })

  it('a save shows the stored names from the answer, with another device’s change', async () => {
    serveProfile((config) => {
      const body = bodyOf(config) as Record<string, string>
      return envelope({ ...USER, ...body, lastName: 'King' })
    })
    await renderScreen(<Profile />)
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Grace')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Last name').props.value).toBe('King')
    })
    expect(screen.getByLabelText('First name').props.value).toBe('Grace')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a name before saving.')).toBeTruthy()
  })

  it('shows a failed load with Try again when there is no data', async () => {
    useAuthStore.getState().logout()
    serve(() => ({ status: 500, data: { success: false, message: 'Boom' } }))
    await renderScreen(<Profile />)
    expect(await screen.findByText('Your profile didn’t load. Select Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('shows a labelled spinner while loading with no data', async () => {
    useAuthStore.getState().logout()
    serve(() => new Promise(() => {}))
    await renderScreen(<Profile />)
    expect(screen.getByLabelText('Loading your profile')).toBeTruthy()
  })
})
