import { jest } from '@jest/globals'
import { onlineManager } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form'
import { queryClient } from '@/lib/query-client'
import { renderScreen, restoreApi, serve, bodyOf } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

/** A created workspace in express's envelope. */
const created = {
  status: 201,
  data: { success: true, data: { id: 't1', name: 'Acme', slug: 'acme' } },
}

/**
 * Fills the three fields.
 * @param name - The name.
 * @param slug - The web address.
 * @param description - The description.
 */
async function fill(name: string, slug: string, description = '') {
  await fireEvent.changeText(screen.getByLabelText('Name'), name)
  await fireEvent.changeText(screen.getByLabelText('Web address'), slug)
  if (description) await fireEvent.changeText(screen.getByLabelText('Description'), description)
}

afterEach(() => {
  restoreApi()
})

describe('CreateWorkspaceForm', () => {
  it('shows the fields with their hints', async () => {
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByText('Web address')).toBeTruthy()
    expect(
      screen.getByText(
        'Your workspace’s address: /tenants/your-name. Use 3 to 100 lowercase letters, digits and hyphens. Capitals are refused, not converted.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Optional.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeTruthy()
  })

  it('validates only the web address as the person types', async () => {
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fireEvent.changeText(screen.getByLabelText('Name'), '')
    expect(screen.queryByText('Name is required.')).toBeNull()
    await fireEvent.changeText(screen.getByLabelText('Web address'), 'Ab')
    expect(await screen.findByText(/The web address must be at least 3 characters/)).toBeTruthy()
  })

  it('parses with the schema, posts the parsed value and drops a blank description', async () => {
    const sent = serve(() => created)
    const onCreated = jest.fn<() => void>()
    await renderScreen(<CreateWorkspaceForm onCreated={onCreated} />)
    await fill('  Acme  ', 'acme', '   ')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    const post = sent.find((config) => config.method === 'post')
    expect(bodyOf(post)).toEqual({ name: 'Acme', slug: 'acme' })
  })

  it('sends a description that has text', async () => {
    const sent = serve(() => created)
    const onCreated = jest.fn<() => void>()
    await renderScreen(<CreateWorkspaceForm onCreated={onCreated} />)
    await fill('Acme', 'acme', 'Roadrunner supplies')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled()
    })
    expect(bodyOf(sent.find((config) => config.method === 'post'))).toEqual({
      name: 'Acme',
      slug: 'acme',
      description: 'Roadrunner supplies',
    })
  })

  it('does not post an invalid form and shows each field error', async () => {
    const sent = serve(() => created)
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText('Name is required.')).toBeTruthy()
    expect(sent.filter((config) => config.method === 'post')).toHaveLength(0)
  })

  it('posts once however many presses arrive, and is busy until onCreated resolves', async () => {
    const sent = serve(() => created)
    let finish: (() => void) | undefined
    const onCreated = jest.fn(
      () =>
        /** Holds the landing open until the test calls `finish`. */
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    await renderScreen(<CreateWorkspaceForm onCreated={onCreated} />)
    await fill('Acme', 'acme')
    const button = screen.getByRole('button', { name: 'Create workspace' })
    await fireEvent.press(button)
    await fireEvent.press(button)
    await fireEvent.press(button)
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(
      screen.getByRole('button', { name: 'Create workspace' }).props.accessibilityState
    ).toEqual(expect.objectContaining({ busy: true }))
    expect(sent.filter((config) => config.method === 'post')).toHaveLength(1)
    finish?.()
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create workspace' }).props.accessibilityState
      ).toEqual(expect.objectContaining({ busy: false }))
    })
    expect(sent.filter((config) => config.method === 'post')).toHaveLength(1)
  })

  it('puts a 409 slug_taken message under the web address', async () => {
    serve(() => ({
      status: 409,
      data: {
        success: false,
        code: 'slug_taken',
        message: 'Another workspace uses this web address. Choose a different one.',
      },
    }))
    const onCreated = jest.fn<() => void>()
    await renderScreen(<CreateWorkspaceForm onCreated={onCreated} />)
    await fill('Acme', 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(
      await screen.findByText('Another workspace uses this web address. Choose a different one.')
    ).toBeTruthy()
    expect(screen.getByLabelText('Web address').props.accessibilityHint).toBe(
      'Another workspace uses this web address. Choose a different one.'
    )
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('maps a 400 with errors onto the fields', async () => {
    serve(() => ({
      status: 400,
      data: {
        success: false,
        code: 'validation_error',
        message: 'Invalid.',
        errors: { name: ['The server dislikes this name.'] },
      },
    }))
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fill('Acme', 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText('The server dislikes this name.')).toBeTruthy()
    expect(screen.getByLabelText('Name').props.accessibilityHint).toBe(
      'The server dislikes this name.'
    )
  })

  it('shows the maintenance message inline on a read-only refusal', async () => {
    serve(() => ({
      status: 503,
      data: { success: false, code: 'READ_ONLY_MODE', message: 'Owner notice.' },
    }))
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fill('Acme', 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText('Changes are paused during maintenance.')).toBeTruthy()
  })

  it('shows any other failure inline above the button', async () => {
    serve(() => ({
      status: 429,
      data: { success: false, code: 'rate_limited', message: 'Slow down.' },
    }))
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fill('Acme', 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText('Slow down.')).toBeTruthy()
  })

  it('offline, the create fails at once and shows the inline error', async () => {
    onlineManager.setOnline(false)
    try {
      serve(() => 'network-error')
      await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />, queryClient)
      await fill('Acme', 'acme')
      await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
      expect(
        await screen.findByText(
          'We couldn’t reach the server. Check your connection, then try again.'
        )
      ).toBeTruthy()
    } finally {
      onlineManager.setOnline(true)
      queryClient.clear()
    }
  })

  it('shows a connection prompt on a network failure', async () => {
    serve(() => 'network-error')
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fill('Acme', 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(
      await screen.findByText(
        'We couldn’t reach the server. Check your connection, then try again.'
      )
    ).toBeTruthy()
  })

  it('clears the taken-address message when the web address changes', async () => {
    serve(() => ({
      status: 409,
      data: { success: false, code: 'slug_taken', message: 'Taken.' },
    }))
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fill('Acme', 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText('Taken.')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Web address'), 'acme-2')
    expect(screen.queryByText('Taken.')).toBeNull()
  })

  it('clears a 400 field error on Name when the name changes', async () => {
    serve(() => ({
      status: 400,
      data: { success: false, message: 'Invalid.', errors: { name: ['Bad name.'] } },
    }))
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fill('Acme', 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText('Bad name.')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Acme Inc')
    expect(screen.queryByText('Bad name.')).toBeNull()
  })

  it('updates a submit-time schema error on Name once the person types', async () => {
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText('Name is required.')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Acme')
    await waitFor(() => {
      expect(screen.queryByText('Name is required.')).toBeNull()
    })
  })

  it('updates a Description length error once the person shortens it', async () => {
    await renderScreen(<CreateWorkspaceForm onCreated={() => {}} />)
    await fill('Acme', 'acme', 'x'.repeat(1001))
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByText(/Description must be at most 1000/)).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Description'), 'short')
    await waitFor(() => {
      expect(screen.queryByText(/Description must be at most 1000/)).toBeNull()
    })
  })
})
