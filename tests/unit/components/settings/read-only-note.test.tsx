import { render, screen } from '@testing-library/react-native'
import { ReadOnlyNote } from '@/components/settings/read-only-note'
import { describe, expect, it } from '@/tests/support/runner'

describe('ReadOnlyNote', () => {
  it('shows its text', async () => {
    await render(
      <ReadOnlyNote text="You can view these settings. Owners and admins can change them." />
    )
    expect(
      screen.getByText('You can view these settings. Owners and admins can change them.')
    ).toBeTruthy()
  })
})
