import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Text } from 'react-native'
import Tenants from '@/app/(app)/tenants/index'
import { markLeft } from '@/lib/left-workspaces'
import { tenantKeys, useTenants } from '@/queries/tenant.queries'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react')
    useEffect(effect, [effect])
  },
}))

/** A tenants page in express's envelope. */
const page = (items: unknown[]) => ({
  status: 200,
  data: { success: true, data: { items, page: { hasNext: false, nextCursor: null } } },
})

/** A membership row. */
const row = (id: string, name: string, lifecycleState = 'active', isPlatform = false) => ({
  tenant: { id, name, slug: id, lifecycleState },
  role: 'owner',
  joinedAt: '2026-01-01',
  isPlatform,
})

beforeEach(() => {
  useToastQueueStore.setState({ toasts: [] } as never)
})

afterEach(() => {
  restoreApi()
  jest.clearAllMocks()
})

describe('Workspaces list', () => {
  it('drops the cache of a workspace the person left when it gains focus, once', async () => {
    serve(() => page([row('other', 'Other')]))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(tenantKeys.detail('acme'), { slug: 'acme' })
    client.setQueryData(tenantKeys.detail('other'), { slug: 'other' })
    markLeft('acme')
    await renderScreen(<Tenants />, client)
    await screen.findByText('Other')
    expect(client.getQueryData(tenantKeys.detail('acme'))).toBeUndefined()
    expect(client.getQueryData(tenantKeys.detail('other'))).toEqual({ slug: 'other' })
    // The record is cleared: a second focus drops nothing more.
    client.setQueryData(tenantKeys.detail('acme'), { slug: 'acme' })
    await renderScreen(<Tenants />, client)
    expect(client.getQueryData(tenantKeys.detail('acme'))).toEqual({ slug: 'acme' })
  })

  it('keeps the loaded list when a background read fails', async () => {
    let fail = false
    serve(() => (fail ? 'network-error' : page([row('acme', 'Acme')])))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    /** Shows the list read's status, rendered in the same pass as the screen. */
    function Status() {
      return <Text>{`read:${useTenants().status}`}</Text>
    }
    await renderScreen(
      <>
        <Tenants />
        <Status />
      </>,
      client
    )
    expect(await screen.findByText('Acme')).toBeTruthy()
    fail = true
    await act(async () => {
      await client.refetchQueries()
    })
    expect(await screen.findByText('read:error')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('lists each membership, tags a suspended one and hides the platform workspace', async () => {
    serve(() =>
      page([
        row('acme', 'Acme'),
        row('frozen', 'Frozen', 'suspended'),
        row('platform', 'Platform', 'active', true),
      ])
    )
    await renderScreen(<Tenants />)
    expect(await screen.findByText('Acme')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Workspaces' })).toBeTruthy()
    expect(screen.getByText('Every workspace this account belongs to.')).toBeTruthy()
    expect(screen.getByText('/acme')).toBeTruthy()
    expect(screen.getByText('Frozen')).toBeTruthy()
    expect(screen.getByText('Suspended')).toBeTruthy()
    expect(screen.queryByText('Platform')).toBeNull()
    expect(screen.getByText('Create a workspace')).toBeTruthy()
    expect(
      screen.getByText(
        'You become its owner. You can’t change the web address after you create the workspace.'
      )
    ).toBeTruthy()
  })

  it('opens a workspace when its row is pressed, but not a suspended one', async () => {
    serve(() => page([row('acme', 'Acme'), row('frozen', 'Frozen', 'suspended')]))
    await renderScreen(<Tenants />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Acme, /acme' }))
    expect(router.push).toHaveBeenCalledWith('/tenants/acme')
    expect(screen.queryByRole('button', { name: /Frozen/ })).toBeNull()
  })

  it('shows the empty state for an account with no workspaces', async () => {
    serve(() => page([]))
    await renderScreen(<Tenants />)
    expect(await screen.findByText('This account isn’t a member of any workspace.')).toBeTruthy()
    expect(screen.getByText('Create one below.')).toBeTruthy()
  })

  it('a failed list shows the error, not the empty state', async () => {
    let calls = 0
    serve(() => {
      calls += 1
      return calls === 1 ? { status: 500, data: { success: false, message: 'Boom.' } } : page([])
    })
    await renderScreen(<Tenants />)
    expect(
      await screen.findByText(
        'We couldn’t load your workspaces, so none are listed. Select Try again to load them.'
      )
    ).toBeTruthy()
    expect(screen.queryByText('This account isn’t a member of any workspace.')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('This account isn’t a member of any workspace.')).toBeTruthy()
  })

  it('shows a labelled spinner while the list loads', async () => {
    serve(() => new Promise(() => {}))
    await renderScreen(<Tenants />)
    expect(screen.getByLabelText('Loading your workspaces')).toBeTruthy()
  })

  it('toasts and opens a workspace created here', async () => {
    serve((config) =>
      config.method === 'post'
        ? { status: 201, data: { success: true, data: { id: 't', name: 'Acme', slug: 'acme' } } }
        : page([])
    )
    await renderScreen(<Tenants />)
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Acme')
    await fireEvent.changeText(screen.getByLabelText('Web address'), 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/tenants/acme')
    })
    expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toContain(
      'Acme created.'
    )
  })
})
