import { Text, View } from 'react-native'

/**
 * One read-only row: a label and its value, or a dash for none.
 * @param props - The label and the value.
 * @param props.label - What the value is.
 * @param props.value - The value, or `null` for none.
 * @param props.mono - True to set the value in a monospaced face.
 * @returns The row.
 */
export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <View className="gap-1">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className={mono ? 'font-mono text-sm text-foreground' : 'text-base text-foreground'}>
        {value ?? '—'}
      </Text>
    </View>
  )
}
