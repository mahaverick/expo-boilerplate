import { jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import NotFound from '@/app/+not-found'
import { renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

describe('NotFound', () => {
  it('shows Page not found as its one header', async () => {
    await renderWithProviders(<NotFound />)
    expect(screen.getByRole('header', { name: 'Page not found' })).toBeTruthy()
  })

  it('Go to Home replaces the route with /', async () => {
    await renderWithProviders(<NotFound />)
    await fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }))
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
