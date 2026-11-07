import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import General from '@/app/(app)/settings/workspace/[slug]/general'
import { formatDate } from '@/lib/format'
import { ROLE_ERROR } from '@/lib/role-error'
import { tenantKeys } from '@/queries/tenant.queries'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { bodyOf, renderScreen, restoreApi, screenTree, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { acme, envelope, serveWorkspace } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'acme' }),
}))

/** The stored settings. */
const SETTINGS = {
  tenantId: 't-acme',
  timezone: 'Europe/London',
  locale: 'en-GB',
  metadata: { plan: 'x' },
  updatedAt: '2026-01-05T00:00:00.000Z',
}

/** The stored workspace, with details to edit. */
const DETAILED = acme({
  description: 'Makes things',
  website: 'https://acme.example',
  logo: 'https://acme.example/logo.png',
})

beforeEach(() => {
  useToastQueueStore.getState().remove()
})

afterEach(() => {
  restoreApi()
})

/**
 * Serves the workspace and its settings; PATCHes echo the merged body.
 * @param overrides - Answers by `"METHOD /path"`, or a patch handler.
 * @param tenant - The `GET /tenants/acme` body.
 * @returns The requests the adapter saw.
 */
function serveGeneral(
  overrides: Parameters<typeof serveWorkspace>[0] = {},
  tenant: Record<string, unknown> = DETAILED
) {
  return serveWorkspace({
    'GET /tenants/acme': envelope(tenant),
    'GET /tenants/acme/settings': envelope(SETTINGS),
    ...overrides,
  })
}

/**
 * Serves a server that keeps what a PATCH stores, so a refetch agrees with it.
 * @param tenant - The `GET /tenants/acme` body.
 * @returns The requests the adapter saw.
 */
function serveEcho(tenant: Record<string, unknown> = DETAILED) {
  let storedTenant = tenant
  let storedSettings: Record<string, unknown> = SETTINGS
  return serve((config) => {
    const method = (config.method ?? 'get').toUpperCase()
    const isSettings = config.url === '/tenants/acme/settings'
    if (method === 'PATCH') {
      const body = bodyOf(config) as Record<string, unknown>
      if (isSettings) storedSettings = { ...storedSettings, ...body }
      else storedTenant = { ...storedTenant, ...body }
      return envelope(isSettings ? storedSettings : storedTenant)
    }
    if (config.url === '/tenants/acme') return envelope(storedTenant)
    if (isSettings) return envelope(storedSettings)
    return { status: 404, data: { success: false, message: 'Not found' } }
  })
}

/**
 * The PATCH requests to a URL.
 * @param sent - Every request.
 * @param url - The path.
 * @returns The patches.
 */
function patches(sent: ReturnType<typeof serve>, url: string) {
  return sent.filter((config) => config.method === 'patch' && config.url === url)
}

/**
 * The titles of the toasts shown.
 * @returns The titles.
 */
function toasts() {
  return useToastQueueStore.getState().toasts.map((toast) => toast.title)
}

describe('Workspace General screen', () => {
  it('shows the copy and the stored values to a manager', async () => {
    serveEcho()
    await renderScreen(<General />)
    expect(await screen.findByLabelText('Name')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'General' })).toBeTruthy()
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(
      screen.getByText('Update this workspace. Its web address is fixed and can’t be changed.')
    ).toBeTruthy()
    expect(screen.getByLabelText('Name').props.value).toBe('Acme')
    expect(screen.getByLabelText('Description').props.value).toBe('Makes things')
    expect(screen.getByText('Leave empty to clear it.')).toBeTruthy()
    expect(screen.getByLabelText('Logo URL').props.value).toBe('https://acme.example/logo.png')
    expect(await screen.findByLabelText('Time zone')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByLabelText('Custom data (for developers)').props.value).toBe(
      JSON.stringify({ plan: 'x' }, null, 2)
    )
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeTruthy()
  })

  it('sends only the changed details', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    await fireEvent.changeText(await screen.findByLabelText('Name'), '  Acme Ltd ')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(patches(sent, '/tenants/acme')).toHaveLength(1)
    })
    expect(bodyOf(patches(sent, '/tenants/acme')[0])).toEqual({ name: 'Acme Ltd' })
    await waitFor(() => {
      expect(toasts()).toContain('Workspace updated.')
    })
  })

  it('sends null, never an empty string, for a cleared optional field', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    await fireEvent.changeText(await screen.findByLabelText('Description'), '')
    await fireEvent.changeText(screen.getByLabelText('Website'), '   ')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(patches(sent, '/tenants/acme')).toHaveLength(1)
    })
    expect(bodyOf(patches(sent, '/tenants/acme')[0])).toEqual({ description: null, website: null })
  })

  it('says to change a field when nothing changed, and posts nothing', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a field before saving.')).toBeTruthy()
    expect(patches(sent, '/tenants/acme')).toHaveLength(0)
  })

  it('checks a changed field with the schema before posting', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    await fireEvent.changeText(await screen.findByLabelText('Name'), '   ')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Name is required.')).toBeTruthy()
    expect(patches(sent, '/tenants/acme')).toHaveLength(0)
  })

  it('shows a 400 field error under its field and clears it on edit', async () => {
    serve((config) => {
      if (config.method === 'patch') {
        return {
          status: 400,
          data: {
            success: false,
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            errors: { website: ['Website is not reachable.'] },
          },
        }
      }
      return config.url === '/tenants/acme' ? envelope(DETAILED) : envelope(SETTINGS)
    })
    await renderScreen(<General />)
    await fireEvent.changeText(await screen.findByLabelText('Website'), 'https://b.example')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Website is not reachable.')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Website'), 'https://c.example')
    expect(screen.queryByText('Website is not reachable.')).toBeNull()
  })

  it('follows the stored details until the first edit', async () => {
    const sent = serveEcho()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = await renderScreen(<General />, client)
    await screen.findByLabelText('Name')
    client.setQueryData(tenantKeys.detail('acme'), { ...DETAILED, name: 'Acme Two' })
    await view.rerender(screenTree(<General />, client))
    await waitFor(() => {
      expect(screen.getByLabelText('Name').props.value).toBe('Acme Two')
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a field before saving.')).toBeTruthy()
    expect(patches(sent, '/tenants/acme')).toHaveLength(0)
  })

  it('keeps an edit when the stored details change after it', async () => {
    const sent = serveEcho()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = await renderScreen(<General />, client)
    await fireEvent.changeText(await screen.findByLabelText('Description'), 'New text')
    client.setQueryData(tenantKeys.detail('acme'), { ...DETAILED, name: 'Acme Two' })
    await view.rerender(screenTree(<General />, client))
    expect(screen.getByLabelText('Name').props.value).toBe('Acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(patches(sent, '/tenants/acme')).toHaveLength(1)
    })
    expect(bodyOf(patches(sent, '/tenants/acme')[0])).toEqual({ description: 'New text' })
  })

  it('saves only the changed setting and toasts', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    await fireEvent.changeText(await screen.findByLabelText('Language and region'), 'en-IN')
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => {
      expect(patches(sent, '/tenants/acme/settings')).toHaveLength(1)
    })
    expect(bodyOf(patches(sent, '/tenants/acme/settings')[0])).toEqual({ locale: 'en-IN' })
    await waitFor(() => {
      expect(toasts()).toContain('Settings updated.')
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Change a field before saving.')).toBeTruthy()
  })

  it('refuses an invalid time zone with the shared schema’s message', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    await fireEvent.changeText(await screen.findByLabelText('Time zone'), 'Mars/Olympus')
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }))
    expect(
      await screen.findByText('Time zone must be a time zone name such as Europe/Paris.')
    ).toBeTruthy()
    expect(patches(sent, '/tenants/acme/settings')).toHaveLength(0)
    await fireEvent.changeText(screen.getByLabelText('Time zone'), '')
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Time zone is required.')).toBeTruthy()
  })

  it('refuses an invalid locale and bad custom data', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    await fireEvent.changeText(await screen.findByLabelText('Language and region'), 'not a tag')
    await fireEvent.changeText(screen.getByLabelText('Custom data (for developers)'), '{oops')
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }))
    expect(
      await screen.findByText(
        'Enter a language code such as en, or a language and region such as en-IN.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Custom data must be valid JSON.')).toBeTruthy()
    expect(patches(sent, '/tenants/acme/settings')).toHaveLength(0)
  })

  it('sends custom data as an object, and null when emptied', async () => {
    const sent = serveEcho()
    await renderScreen(<General />)
    const field = await screen.findByLabelText('Custom data (for developers)')
    await fireEvent.changeText(field, '{"a": 1}')
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => {
      expect(patches(sent, '/tenants/acme/settings')).toHaveLength(1)
    })
    expect(bodyOf(patches(sent, '/tenants/acme/settings')[0])).toEqual({ metadata: { a: 1 } })
    await waitFor(() => {
      expect(screen.getByLabelText('Custom data (for developers)').props.value).toBe(
        JSON.stringify({ a: 1 }, null, 2)
      )
    })
    await fireEvent.changeText(screen.getByLabelText('Custom data (for developers)'), '')
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => {
      expect(patches(sent, '/tenants/acme/settings')).toHaveLength(2)
    })
    expect(bodyOf(patches(sent, '/tenants/acme/settings')[1])).toEqual({ metadata: null })
  })

  it('follows the stored settings until the first edit', async () => {
    serveEcho()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = await renderScreen(<General />, client)
    await screen.findByLabelText('Time zone')
    client.setQueryData(tenantKeys.settings('acme'), { ...SETTINGS, timezone: 'Asia/Kolkata' })
    await view.rerender(screenTree(<General />, client))
    await waitFor(() => {
      expect(screen.getByLabelText('Time zone').props.value).toBe('Asia/Kolkata')
    })
  })

  it('shows the settings load error with Try again, and the details still show', async () => {
    let attempts = 0
    serve((config) => {
      if (config.url === '/tenants/acme') return envelope(DETAILED)
      attempts += 1
      return attempts === 1
        ? { status: 500, data: { success: false, message: 'Boom' } }
        : envelope(SETTINGS)
    })
    await renderScreen(<General />)
    expect(
      await screen.findByText(
        'We couldn’t load this workspace’s settings, so none are shown. Select Try again to load them.'
      )
    ).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Time zone')).toBeTruthy()
  })

  it('shows a spinner, never the read-only view, while the role is pending', async () => {
    serve(() => new Promise(() => {}))
    await renderScreen(<General />)
    expect(screen.getByLabelText('Loading workspace')).toBeTruthy()
    expect(screen.queryByText(/Only this workspace’s owners and admins/)).toBeNull()
    expect(screen.queryByText('Overview')).toBeNull()
  })

  it('shows ROLE_ERROR with Try again when the role fails, then recovers', async () => {
    let attempts = 0
    serve((config) => {
      if (config.url === '/tenants/acme') {
        attempts += 1
        return attempts === 1
          ? { status: 500, data: { success: false, message: 'Boom' } }
          : envelope(DETAILED)
      }
      return envelope(SETTINGS)
    })
    await renderScreen(<General />)
    expect(await screen.findByText(ROLE_ERROR)).toBeTruthy()
    expect(ROLE_ERROR).toBe(
      'We couldn’t load your role in this workspace, so its controls are hidden. Select Try again to show them.'
    )
    expect(screen.queryByText('Overview')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Name')).toBeTruthy()
  })

  it('keeps the forms and their edits when a background refetch fails', async () => {
    serveEcho()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = await renderScreen(<General />, client)
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Acme Ltd')
    serve(() => ({ status: 500, data: { success: false, message: 'Boom' } }))
    await act(async () => {
      await client.refetchQueries({ queryKey: tenantKeys.detail('acme'), exact: true })
    })
    await view.rerender(screenTree(<General />, client))
    expect(client.getQueryState(tenantKeys.detail('acme'))?.status).toBe('error')
    expect(screen.queryByText(ROLE_ERROR)).toBeNull()
    expect(screen.getByLabelText('Name').props.value).toBe('Acme Ltd')
    expect(screen.getByLabelText('Time zone')).toBeTruthy()
  })

  it('shows read-only rows to a viewer, with a dash for an empty value', async () => {
    serveGeneral(
      { 'GET /tenants/acme/settings': envelope({ ...SETTINGS, metadata: null }) },
      acme({ role: 'viewer', description: null, website: 'https://acme.example' })
    )
    await renderScreen(<General />)
    expect(await screen.findByText('Web address')).toBeTruthy()
    expect(screen.getByText('/acme')).toBeTruthy()
    expect(screen.getByText('https://acme.example')).toBeTruthy()
    expect(screen.getByText(formatDate('2026-01-05T00:00:00.000Z', 'long') ?? '')).toBeTruthy()
    expect(
      screen.getByText('Only this workspace’s owners and admins can change these details.')
    ).toBeTruthy()
    expect(
      screen.getByText('Only this workspace’s owners and admins can change these settings.')
    ).toBeTruthy()
    expect(await screen.findByText('Europe/London')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('shows read-only rows to staff with platform access, even as owner', async () => {
    serveGeneral({}, acme({ role: 'owner', access: 'platform' }))
    await renderScreen(<General />)
    expect(await screen.findByText('Web address')).toBeTruthy()
    expect(await screen.findByText('Europe/London')).toBeTruthy()
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
  })
})
