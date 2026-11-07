import { Pressable, Text } from 'react-native'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'

/** Props of `RowButton`. */
interface RowButtonProps {
  label: string
  text?: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
}

/**
 * A compact outlined button for a list row. The accessible label names the
 * row's subject, since a list holds one of these per row.
 * @param props - The label, text and handler.
 * @param props.label - The accessibility label, with the row's subject.
 * @param props.text - The visible text; the label by default.
 * @param props.onPress - Called on a press.
 * @param props.disabled - Ignores presses when true.
 * @param props.destructive - Draws the text in the destructive colour.
 * @returns The button.
 */
export function RowButton({
  label,
  text,
  onPress,
  disabled = false,
  destructive = false,
}: RowButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      className={cn(
        TOUCH_TARGET,
        'items-center justify-center rounded-md border border-input px-3',
        disabled && 'opacity-60'
      )}
    >
      <Text className={cn('text-base', destructive ? 'text-destructive' : 'text-foreground')}>
        {text ?? label}
      </Text>
    </Pressable>
  )
}
