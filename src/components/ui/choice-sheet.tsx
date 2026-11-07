import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/button'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'

/** One choice of a `ChoiceSheet`. */
interface ChoiceOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

/** Props of `ChoiceSheet`. */
interface ChoiceSheetProps<T extends string> {
  title: string
  options: ChoiceOption<T>[]
  /** The chosen option's value. */
  value: T
  onChoose: (value: T) => void
  onClose: () => void
  visible: boolean
}

/**
 * A pick-one list in a bottom sheet (React Native `Modal`), for where the kit
 * has no select. The title is the sheet's one header. Choosing an option calls
 * `onChoose`, then `onClose`. Cancel and Android back call `onClose` only.
 * @param props - The title, options, chosen value and handlers.
 * @param props.title - The sheet's heading.
 * @param props.options - The choices. A disabled one ignores presses.
 * @param props.value - The chosen option's value.
 * @param props.onChoose - Called with the pressed option's value.
 * @param props.onClose - Called after a choice, on Cancel and on Android back.
 * @param props.visible - True to show the sheet.
 * @returns The sheet.
 */
export function ChoiceSheet<T extends string>({
  title,
  options,
  value,
  onChoose,
  onClose,
  visible,
}: ChoiceSheetProps<T>) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-foreground/40">
        <ScrollView
          className="max-h-[80%] rounded-t-2xl bg-background"
          contentContainerClassName="gap-2 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        >
          <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
            {title}
          </Text>
          {options.map((option) => {
            const checked = option.value === value
            const disabled = option.disabled === true
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked, disabled }}
                disabled={disabled}
                onPress={() => {
                  onChoose(option.value)
                  onClose()
                }}
                className={cn(
                  TOUCH_TARGET,
                  'flex-row items-center justify-between rounded-md border border-input px-3 py-2',
                  checked && 'border-primary',
                  disabled && 'opacity-60'
                )}
              >
                <Text className="text-base text-foreground">{option.label}</Text>
                {checked ? <Text className="text-base text-primary">✓</Text> : null}
              </Pressable>
            )
          })}
          <Button variant="ghost" label="Cancel" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  )
}
