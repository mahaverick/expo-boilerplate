import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { InlineError } from '@/components/ui/inline-error'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'

/** Props of `TextField`: the `TextInput` props, plus a label and an error. */
interface TextFieldProps extends Omit<TextInputProps, 'accessibilityLabel'> {
  label: string
  value: string
  onChangeText: (text: string) => void
  error?: string
  hint?: string
}

/**
 * A labelled text input. The label shows above the input and names it for
 * screen readers. A hint shows below in muted text. An error shows below and
 * is the input's accessibility hint, ahead of `hint`.
 * @param props - The label, value, change handler, error and any `TextInput` prop.
 * @param props.label - The visible label.
 * @param props.error - The error to show, if any.
 * @param props.hint - Help text under the input.
 * @param props.className - Extra classes for the input.
 * @param props.multiline - True for a text area: about four lines tall, text from the top.
 * @returns The field.
 */
export function TextField({ label, error, hint, className, multiline, ...input }: TextFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        {...input}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : undefined}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        className={cn(
          TOUCH_TARGET,
          'rounded-md border border-input px-3 text-base text-foreground',
          multiline && 'min-h-32 py-2',
          error && 'border-destructive',
          className
        )}
      />
      {hint ? <Text className="text-sm text-muted-foreground">{hint}</Text> : null}
      {error ? <InlineError message={error} /> : null}
    </View>
  )
}
