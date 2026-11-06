import { Pressable, Text, TextInput } from 'react-native'
import { A11Y_SCREENS, assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

describe('the accessibility harness', () => {
  it('accepts a screen with one header and a labelled pressable', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Go" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).not.toThrow()
  })

  it('rejects a pressable with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a pressable with no role', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityLabel="Go" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a screen with two headers', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">One</Text>
        <Text accessibilityRole="header">Two</Text>
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a screen with no header', async () => {
    await renderWithProviders(<Text>Plain</Text>)
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a text input with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <TextInput onChangeText={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })
})

describe('A11Y_SCREENS', () => {
  for (const { name, element } of A11Y_SCREENS) {
    it(`${name} is accessible`, async () => {
      await renderWithProviders(element)
      assertAccessible()
    })
  }

  it('is a list', () => {
    expect(Array.isArray(A11Y_SCREENS)).toBe(true)
  })
})
