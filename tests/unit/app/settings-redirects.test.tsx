import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react-native'
import Profile from '@/app/(app)/profile'
import AccountIndex from '@/app/(app)/settings/account/index'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return { Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text> }
})

describe('settings redirects', () => {
  it.each([
    ['/settings/account', AccountIndex],
    ['/profile', Profile],
  ])('%s replaces to the profile screen', async (_path, Route) => {
    await render(<Route />)
    expect(screen.getByText('redirect:/settings/account/profile')).toBeTruthy()
  })
})
