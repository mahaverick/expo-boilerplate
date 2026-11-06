import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react-native'
import ForgotPassword from '@/app/forgot-password'
import Register from '@/app/register'
import ResetPassword from '@/app/reset-password'
import VerifyEmail from '@/app/verify-email'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return { Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text> }
})

describe('retired password paths', () => {
  it.each([
    ['/register', Register],
    ['/verify-email', VerifyEmail],
    ['/forgot-password', ForgotPassword],
    ['/reset-password', ResetPassword],
  ])('%s replaces to sign-in with a notice and keeps no other query', async (_path, Screen) => {
    await render(<Screen />)
    expect(screen.getByText('redirect:/login?notice=sign-in-link')).toBeTruthy()
  })
})
