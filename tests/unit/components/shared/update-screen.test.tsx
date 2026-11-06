import { jest } from '@jest/globals'
import { onlineManager } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { BackHandler, Linking, Text } from 'react-native'
import { UpdateGate, UpdateScreen } from '@/components/shared/update-screen'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0' }))

afterEach(() => {
  restoreApi()
  jest.restoreAllMocks()
})

describe('UpdateScreen', () => {
  it('takes the top inset while the device is offline, since it covers the banners', async () => {
    onlineManager.setOnline(false)
    try {
      await renderScreen(<UpdateScreen url={null} />)
      expect(screen.getByTestId('screen').props.contentContainerStyle).toMatchObject({
        paddingTop: 47,
      })
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('shows the title and the body', async () => {
    await renderScreen(<UpdateScreen url={null} />)
    expect(screen.getByRole('header', { name: 'Update the app' })).toBeTruthy()
    expect(
      screen.getByText('This version of the app is no longer supported. Update it to keep going.')
    ).toBeTruthy()
  })

  it('has no button without a store URL', async () => {
    await renderScreen(<UpdateScreen url={null} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens the store with the URL', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue()
    await renderScreen(<UpdateScreen url="market://details?id=x" />)
    await fireEvent.press(screen.getByRole('button', { name: 'Open the store' }))
    expect(open).toHaveBeenCalledWith('market://details?id=x')
  })

  it('does not crash when the store cannot open', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no store'))
    await renderScreen(<UpdateScreen url="market://details?id=x" />)
    await fireEvent.press(screen.getByRole('button', { name: 'Open the store' }))
    await waitFor(() => {
      expect(open).toHaveBeenCalled()
    })
    expect(screen.getByRole('header', { name: 'Update the app' })).toBeTruthy()
  })

  it('ignores Android back', async () => {
    const add = jest.spyOn(BackHandler, 'addEventListener')
    await renderScreen(<UpdateScreen url={null} />)
    const handler = add.mock.calls.find(([name]) => name === 'hardwareBackPress')?.[1]
    expect(handler?.(undefined as never)).toBe(true)
  })
})

describe('UpdateGate', () => {
  it('covers the children, which stay mounted, when the build is too old', async () => {
    serve(() => ({
      status: 200,
      data: {
        success: true,
        data: {
          signInLinkTtlSeconds: 900,
          stepUpLinkTtlSeconds: 900,
          invitationTtlSeconds: 86400,
          supportEmail: 'help@example.com',
          minimumAppVersion: { ios: '2.0.0', android: '2.0.0' },
        },
      },
    }))
    await renderScreen(
      <UpdateGate>
        <Text>underneath</Text>
      </UpdateGate>
    )
    await waitFor(() => {
      expect(screen.getByRole('header', { name: 'Update the app' })).toBeTruthy()
    })
    expect(screen.getByText('underneath', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('underneath')).toBeNull()
  })

  it('shows only the children otherwise', async () => {
    serve(() => ({ status: 500, data: {} }))
    await renderScreen(
      <UpdateGate>
        <Text>underneath</Text>
      </UpdateGate>
    )
    expect(screen.getByText('underneath')).toBeTruthy()
    expect(screen.queryByText('Update the app')).toBeNull()
  })
})
