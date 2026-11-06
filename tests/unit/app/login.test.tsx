import { jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import Login from '@/app/login'
import { useSessionStatus } from '@/http/session-lifecycle'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { bodyOf, renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))
jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: jest.fn(() => 'signed-out') }))

beforeEach(() => {
  jest.mocked(useSessionStatus).mockReturnValue('signed-out')
  useMaintenanceModeStore.setState({ mode: 'off', message: null, since: null })
})

afterEach(() => {
  restoreApi()
  jest.clearAllMocks()
})

/**
 * Types an address and presses the send button.
 * @param email - The text to type.
 */
async function submit(email: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Email'), email)
  await fireEvent.press(screen.getByRole('button', { name: 'Email me a link' }))
}

describe('Login', () => {
  it('shows Sign in as its one header, with the send button', async () => {
    await renderScreen(<Login />)
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeTruthy()
  })

  it('checks the address with signInLinkRequestSchema before posting', async () => {
    const sent = serve(() => ({ status: 200, data: { success: true, data: null } }))
    await renderScreen(<Login />)
    await submit('not an address')
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(sent).toHaveLength(0)
  })

  it('shows Check your inbox with the address', async () => {
    const sent = serve(() => ({ status: 200, data: { success: true, data: null } }))
    await renderScreen(<Login />)
    await submit('  Ada@Example.com ')
    expect(await screen.findByRole('header', { name: 'Check your inbox' })).toBeTruthy()
    expect(
      screen.getByText(
        'We sent a sign-in link to ada@example.com. Open it on this phone. Each link works once.'
      )
    ).toBeTruthy()
    expect(bodyOf(sent[0])).toMatchObject({ email: 'ada@example.com' })
  })

  it('Use a different email returns to an empty form', async () => {
    serve(() => ({ status: 200, data: { success: true, data: null } }))
    await renderScreen(<Login />)
    await submit('ada@example.com')
    await fireEvent.press(await screen.findByRole('button', { name: 'Use a different email' }))
    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByLabelText('Email').props.value).toBe('')
  })

  it('a request failure shows an inline error, and keeps the address', async () => {
    serve(() => 'network-error')
    await renderScreen(<Login />)
    await submit('ada@example.com')
    expect(
      await screen.findByText('We couldn’t send the link. Check your connection and try again.')
    ).toBeTruthy()
    expect(screen.getByLabelText('Email').props.value).toBe('ada@example.com')
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeTruthy()
  })

  it('goes Home when the session is signed in', async () => {
    jest.mocked(useSessionStatus).mockReturnValue('signed-in')
    await renderScreen(<Login />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/')
    })
  })

  it('stays when signed out', async () => {
    await renderScreen(<Login />)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('goes Home when signed in, but not during full maintenance', async () => {
    jest.mocked(useSessionStatus).mockReturnValue('signed-in')
    useMaintenanceModeStore.setState({ mode: 'full' })
    await renderScreen(<Login />)
    expect(router.replace).not.toHaveBeenCalled()
    await act(() => {
      useMaintenanceModeStore.setState({ mode: 'off' })
    })
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
