import { jest } from '@jest/globals'
import { forgetFeatureProperties } from '@/observability/flags/feature-property-names'
import { featurePropertyName, syncFeatureProperties } from '@/observability/flags/register'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

const mockRegister = jest.fn()
const mockUnregister = jest.fn()

jest.mock('@/observability/telemetry/telemetry', () => ({
  registerFeatureProperties: (props: unknown) => mockRegister(props),
  unregisterFeatureProperties: (names: unknown) => mockUnregister(names),
}))

const both = { example_beta_page: true, example_cta_experiment: 'bold' } as const

beforeEach(() => {
  forgetFeatureProperties()
  mockRegister.mockClear()
  mockUnregister.mockClear()
})

describe('syncFeatureProperties', () => {
  it('names the property $feature/<key>', () => {
    expect(featurePropertyName('example_cta_experiment')).toBe('$feature/example_cta_experiment')
  })

  it('registers $feature/<key> for each value', () => {
    syncFeatureProperties(both)
    expect(mockRegister).toHaveBeenCalledWith({
      '$feature/example_beta_page': true,
      '$feature/example_cta_experiment': 'bold',
    })
    expect(mockUnregister).not.toHaveBeenCalled()
  })

  it('unregisters a key it registered before and no longer has', () => {
    syncFeatureProperties(both)
    syncFeatureProperties({ example_cta_experiment: 'control' })
    expect(mockUnregister).toHaveBeenCalledWith(['$feature/example_beta_page'])
    expect(mockRegister).toHaveBeenLastCalledWith({ '$feature/example_cta_experiment': 'control' })
  })

  it('skips an unchanged set', () => {
    syncFeatureProperties(both)
    mockRegister.mockClear()
    syncFeatureProperties({ example_cta_experiment: 'bold', example_beta_page: true })
    syncFeatureProperties(null)
    syncFeatureProperties(null)
    expect(mockRegister).not.toHaveBeenCalled()
    expect(mockUnregister).toHaveBeenCalledTimes(1)
  })

  it('registers again when a value changes under the same names', () => {
    syncFeatureProperties(both)
    syncFeatureProperties({ ...both, example_cta_experiment: 'control' })
    expect(mockRegister).toHaveBeenLastCalledWith({
      '$feature/example_beta_page': true,
      '$feature/example_cta_experiment': 'control',
    })
    expect(mockUnregister).not.toHaveBeenCalled()
  })

  it('unregisters everything for null', () => {
    syncFeatureProperties(both)
    mockRegister.mockClear()
    syncFeatureProperties(null)
    expect(mockUnregister).toHaveBeenCalledWith([
      '$feature/example_beta_page',
      '$feature/example_cta_experiment',
    ])
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('after forgetting, registers afresh and unregisters nothing', () => {
    syncFeatureProperties(both)
    forgetFeatureProperties()
    mockRegister.mockClear()
    syncFeatureProperties({ example_cta_experiment: 'control' })
    expect(mockUnregister).not.toHaveBeenCalled()
    expect(mockRegister).toHaveBeenCalledWith({ '$feature/example_cta_experiment': 'control' })
  })
})
