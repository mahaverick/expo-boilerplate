import { ActivityIndicator, Pressable, Text } from 'react-native'
import { cn } from '@/lib/cn'

/** The looks a button has. */
type ButtonVariant = 'primary' | 'secondary' | 'ghost'

/** Props of `Button`. */
interface ButtonProps {
  label: string
  onPress: () => void
  variant: ButtonVariant
  disabled?: boolean
  loading?: boolean
}

/** The background class of each variant. Ghost has none. */
const BACKGROUND: Record<ButtonVariant, string | undefined> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  ghost: undefined,
}

/** The label class of each variant. */
const TEXT: Record<ButtonVariant, string> = {
  primary: 'text-primary-foreground',
  secondary: 'text-secondary-foreground',
  ghost: 'text-foreground',
}

/**
 * A pressable button with a 44 point target. While `loading` or `disabled` it
 * ignores presses. While `loading` it also shows a spinner and reports busy.
 * @param props - The button's label, handler, variant and state.
 * @param props.label - The text, which is also the accessibility label.
 * @param props.onPress - Called on a press.
 * @param props.variant - The look.
 * @param props.disabled - Ignores presses when true.
 * @param props.loading - Shows a spinner and ignores presses when true.
 * @returns The button.
 */
export function Button({
  label,
  onPress,
  variant,
  disabled = false,
  loading = false,
}: ButtonProps) {
  const inactive = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
      className={cn(
        'min-h-11 flex-row items-center justify-center gap-2 rounded-md px-4',
        BACKGROUND[variant],
        inactive && 'opacity-50'
      )}
    >
      {loading ? (
        <ActivityIndicator accessibilityElementsHidden importantForAccessibility="no" />
      ) : null}
      <Text className={cn('text-base font-medium', TEXT[variant])}>{label}</Text>
    </Pressable>
  )
}
