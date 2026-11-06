import { CLIENT_FLAGS } from '@/observability/flags/flag-keys'
import { describe, expect, it } from '@/tests/support/runner'

describe('CLIENT_FLAGS', () => {
  it('is react’s slice of the flag registry', () => {
    expect(CLIENT_FLAGS).toEqual({
      example_beta_page: { kind: 'boolean', fallback: false, experiment: false },
      example_cta_experiment: {
        kind: 'multivariate',
        variants: ['control', 'bold'],
        fallback: 'control',
        experiment: true,
      },
    })
  })
})
