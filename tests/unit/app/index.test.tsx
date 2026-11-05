import { render, screen } from '@testing-library/react-native'
import Index from '@/app/index'
import { APP_NAME } from '@/constants/app'
import { describe, expect, it } from '@/tests/support/runner'

describe('Index', () => {
  it("shows one header: the app's name", async () => {
    await render(<Index />)
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(screen.getByRole('header', { name: APP_NAME })).toBeTruthy()
  })
})
