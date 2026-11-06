import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { InlineError } from '@/components/ui/inline-error'
import { cn } from '@/lib/cn'

/** Props of `TextField`: the `TextInput` props, plus a label and an error. */
interface TextFieldProps extends Omit<TextInputProps, 'accessibilityLabel'> {
  label: string
  value: string
  onChangeText: (text: string) => void
  error?: string
}

/**
 * A labelled text input. The label shows above the input and names it for
 * screen readers. An error shows below and is the input's hint.
 * @param props - The label, value, change handler, error and any `TextInput` prop.
 * @param props.label - The visible label.
 * @param props.error - The error to show, if any.
 * @param props.className - Extra classes for the input.
 * @returns The field.
 */
export function TextField({ label, error, className, ...input }: TextFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={error}
        className={cn(
          'min-h-11 rounded-md border border-input px-3 text-base text-foreground',
          error && 'border-destructive',
          className
        )}
      />
      {error ? <InlineError message={error} /> : null}
    </View>
  )
}
