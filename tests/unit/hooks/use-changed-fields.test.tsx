import { act, renderHook } from '@testing-library/react-native'
import { useChangedFields } from '@/hooks/use-changed-fields'
import { describe, expect, it } from '@/tests/support/runner'

/** The two-field value the tests diff. */
interface Names extends Record<string, string> {
  firstName: string
  lastName: string
}

/** The stored names. */
const ADA: Names = { firstName: 'Ada', lastName: 'Lovelace' }

describe('useChangedFields', () => {
  it('returns null when nothing differs from the baseline', async () => {
    const { result } = await renderHook(() => useChangedFields(ADA))
    expect(result.current.changed(ADA)).toBeNull()
  })

  it('returns only the keys whose trimmed value differs', async () => {
    const { result } = await renderHook(() => useChangedFields(ADA))
    expect(result.current.changed({ firstName: '  Grace ', lastName: ' Lovelace ' })).toEqual({
      firstName: 'Grace',
    })
  })

  it('keeps the baseline from the first change when the loaded values change', async () => {
    const { result, rerender } = await renderHook(
      (props: { baseline: Names }) => useChangedFields(props.baseline),
      { initialProps: { baseline: ADA } }
    )
    await act(() => {
      result.current.freeze()
    })
    await rerender({ baseline: { firstName: 'Grace', lastName: 'Lovelace' } })
    expect(result.current.changed({ firstName: 'Grace', lastName: 'Lovelace' })).toEqual({
      firstName: 'Grace',
    })
  })

  it('follows the loaded values until the first change', async () => {
    const { result, rerender } = await renderHook(
      (props: { baseline: Names }) => useChangedFields(props.baseline),
      { initialProps: { baseline: ADA } }
    )
    await rerender({ baseline: { firstName: 'Grace', lastName: 'Lovelace' } })
    expect(result.current.changed({ firstName: 'Grace', lastName: 'Lovelace' })).toBeNull()
  })

  it('freezes when changed is called, so a later refetch does not move it', async () => {
    const { result, rerender } = await renderHook(
      (props: { baseline: Names }) => useChangedFields(props.baseline),
      { initialProps: { baseline: ADA } }
    )
    expect(result.current.changed({ firstName: 'Grace', lastName: 'Lovelace' })).toEqual({
      firstName: 'Grace',
    })
    await rerender({ baseline: { firstName: 'Grace', lastName: 'Lovelace' } })
    expect(result.current.changed({ firstName: 'Grace', lastName: 'Lovelace' })).toEqual({
      firstName: 'Grace',
    })
  })

  it('rebases to the saved values', async () => {
    const { result } = await renderHook(() => useChangedFields(ADA))
    result.current.changed({ firstName: 'Grace', lastName: 'Lovelace' })
    result.current.rebase({ firstName: 'Grace', lastName: 'Lovelace' })
    expect(result.current.changed({ firstName: 'Grace', lastName: 'Lovelace' })).toBeNull()
    expect(result.current.changed(ADA)).toEqual({ firstName: 'Ada' })
  })
})
