/**
 * @file The accessibility harness. `assertAccessible` checks a rendered
 * screen; `A11Y_SCREENS` lists the screens it runs on, and every screen task
 * appends its screen there.
 */
import { render, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { expect } from '@/tests/support/runner'

/** A screen the harness renders: a name for the report and the element. */
export interface A11yScreen {
  name: string
  element: ReactElement
}

/** The screens the harness checks. Later tasks append to this list. */
export const A11Y_SCREENS: A11yScreen[] = []

/** Window metrics for `SafeAreaProvider`, with insets so safe-area code runs. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

/**
 * Renders an element inside the providers every screen needs.
 * @param element - The screen or component to render.
 * @returns The promise `render` returns.
 */
export async function renderWithProviders(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>)
}

/** The props the harness reads from a host element. */
interface A11yProps {
  onClick?: unknown
  onChangeText?: unknown
  accessibilityLabel?: unknown
  'aria-label'?: unknown
  accessibilityRole?: unknown
  role?: unknown
  testID?: string
}

/**
 * Fails when the rendered screen breaks a rule of the accessibility contract:
 * exactly one `header`, a role and a label on every pressable, and a label on
 * every text input.
 * @throws When a rule fails.
 */
export function assertAccessible(): void {
  expect(screen.queryAllByRole('header')).toHaveLength(1)
  const flagged = screen.container
    .queryAll((node) => {
      const props = node.props as A11yProps
      return typeof props.onClick === 'function' || typeof props.onChangeText === 'function'
    })
    .filter((node) => {
      const props = node.props as A11yProps
      const hasLabel = Boolean(props.accessibilityLabel ?? props['aria-label'])
      const hasRole = Boolean(props.accessibilityRole ?? props.role)
      const isInput = typeof props.onChangeText === 'function'
      return !hasLabel || (!isInput && !hasRole)
    })
    .map((node) => (node.props as A11yProps).testID ?? node.type)
  expect(flagged).toEqual([])
}
