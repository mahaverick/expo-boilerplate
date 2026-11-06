import { jest } from '@jest/globals'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { assignLocation } from '@/ports/navigation'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

describe('assignLocation', () => {
  it('replaces the route for an app path, as sign-out sends', () => {
    const replace = jest.spyOn(router, 'replace')
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    assignLocation('/login')
    expect(replace).toHaveBeenCalledWith('/login')
    expect(openURL).not.toHaveBeenCalled()
  })

  it('opens an absolute URL', () => {
    const replace = jest.spyOn(router, 'replace')
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    assignLocation('https://example.test/done')
    expect(openURL).toHaveBeenCalledWith('https://example.test/done')
    expect(replace).not.toHaveBeenCalled()
  })

  it('leaves no unhandled rejection when nothing opens the URL', async () => {
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const openURL = jest
        .spyOn(Linking, 'openURL')
        .mockImplementation(() => Promise.reject(new Error('No app handles this URL.')))
      assignLocation('https://example.test/nowhere')
      expect(openURL).toHaveBeenCalled()
      // Node reports an unhandled rejection after the microtask queue drains; one macrotask later it has.
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
