import { Switch as NativeSwitch, Text, View } from 'react-native'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'

/** Props of `Switch`. */
interface SwitchProps {
  label: string
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
}

/**
 * A labelled on/off control. The label shows beside the switch and names it for
 * screen readers, which hear its role and checked state. The track and thumb
 * use the platform's colours: the theme's tokens are not reachable from
 * JavaScript without importing the Tailwind config into the bundle.
 * @param props - The label, value, change handler and disabled flag.
 * @param props.label - The visible label.
 * @param props.value - Whether the switch is on.
 * @param props.onValueChange - Called with the new value.
 * @param props.disabled - True to refuse changes.
 * @returns The switch.
 */
export function Switch({ label, value, onValueChange, disabled = false }: SwitchProps) {
  return (
    <View className={cn(TOUCH_TARGET, 'flex-row items-center justify-between gap-3')}>
      <Text className="flex-1 text-base text-foreground">{label}</Text>
      <NativeSwitch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </View>
  )
}
