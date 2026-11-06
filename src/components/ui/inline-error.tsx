import { Text } from 'react-native'

/** Props of `InlineError`. */
interface InlineErrorProps {
  message: string
}

/**
 * An error shown in place, announced to screen readers when it appears.
 * @param props - The message to show.
 * @param props.message - The error text.
 * @returns The alert text.
 */
export function InlineError({ message }: InlineErrorProps) {
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="text-sm text-destructive"
    >
      {message}
    </Text>
  )
}
