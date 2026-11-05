import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { describe, expect, it } from '@/tests/support/runner'

describe('useMaintenanceModeStore', () => {
  it('starts off and follows a known header', () => {
    expect(useMaintenanceModeStore.getState().mode).toBe('off')
    useMaintenanceModeStore.getState().setFromHeader('read_only')
    expect(useMaintenanceModeStore.getState().mode).toBe('read_only')
  })
})
