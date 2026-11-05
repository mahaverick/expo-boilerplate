import { useAuthStore } from '@/states/auth.store'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

/** A user with only the field these cases read. */
const user = { id: 'user-1' } as User

afterEach(() => {
  useAuthStore.getState().logout()
})

describe('useAuthStore', () => {
  it('signs in and out', () => {
    useAuthStore.getState().login('token', user)
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'token',
      user,
      isAuthenticated: true,
    })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      user: null,
      isAuthenticated: false,
    })
  })

  it('swaps the token and keeps the user', () => {
    useAuthStore.getState().login('token', user)
    useAuthStore.getState().setToken('next')
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'next', user })
  })

  it('marks the session restore settled', () => {
    useAuthStore.getState().setBootstrapped()
    expect(useAuthStore.getState().isBootstrapped).toBe(true)
  })

  it('keeps the session in memory only', () => {
    expect('persist' in useAuthStore).toBe(false)
  })
})
