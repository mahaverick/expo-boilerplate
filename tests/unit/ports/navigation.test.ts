import { jest } from '@jest/globals'
import * as Linking from 'expo-linking'
import { assignLocation } from '@/ports/navigation'
import { describe, expect, it } from '@/tests/support/runner'

describe('assignLocation', () => {
  it('opens the URL', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    assignLocation('https://example.test/done')
    expect(openURL).toHaveBeenCalledWith('https://example.test/done')
  })
})
