import { jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react-native'
import { ChoiceSheet } from '@/components/ui/choice-sheet'
import { assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

const OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner', disabled: true },
]

/**
 * Renders the sheet with spies.
 * @param visible - Whether the sheet is open.
 * @returns The spies.
 */
async function open(visible = true) {
  const onChoose = jest.fn()
  const onClose = jest.fn()
  await renderWithProviders(
    <ChoiceSheet
      title="Choose a role"
      options={OPTIONS}
      value="member"
      onChoose={onChoose}
      onClose={onClose}
      visible={visible}
    />
  )
  return { onChoose, onClose }
}

describe('ChoiceSheet', () => {
  it('lists the options as radios and marks the chosen one', async () => {
    await open()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Member' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Admin' })).not.toBeChecked()
  })

  it('chooses, then closes', async () => {
    const { onChoose, onClose } = await open()
    await fireEvent.press(screen.getByRole('radio', { name: 'Admin' }))
    expect(onChoose).toHaveBeenCalledWith('admin')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores a disabled option', async () => {
    const { onChoose, onClose } = await open()
    const owner = screen.getByRole('radio', { name: 'Owner' })
    expect(owner).toBeDisabled()
    await fireEvent.press(owner)
    expect(onChoose).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from Cancel', async () => {
    const { onChoose, onClose } = await open()
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('closes on Android back', async () => {
    const { onClose } = await open()
    const [modal] = screen.container.queryAll(
      (node) => typeof (node.props as { onRequestClose?: unknown }).onRequestClose === 'function'
    )
    if (!modal) throw new Error('No modal is rendered')
    ;(modal.props as { onRequestClose: () => void }).onRequestClose()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while closed', async () => {
    await open(false)
    expect(screen.queryByText('Choose a role')).toBeNull()
  })

  it('passes the accessibility harness', async () => {
    await open()
    assertAccessible()
  })
})
