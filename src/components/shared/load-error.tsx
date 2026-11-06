import { View } from 'react-native'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'

/** Props of `LoadError`. */
interface LoadErrorProps {
  message: string
  onRetry: () => void
}

/**
 * What a failed load shows: the message as an alert, and a Try again button.
 * A failed load never renders as an empty state.
 * @param props - The message and the retry handler.
 * @param props.message - What went wrong, as a claim about the request.
 * @param props.onRetry - Called when the person selects Try again.
 * @returns The error block.
 */
export function LoadError({ message, onRetry }: LoadErrorProps) {
  return (
    <View className="gap-3">
      <InlineError message={message} />
      <Button variant="secondary" label="Try again" onPress={onRetry} />
    </View>
  )
}
