import { Text } from 'react-native'

/**
 * A quiet line that says why a settings screen has no controls.
 * @param props - The note's words.
 * @param props.text - What to say.
 * @returns The note.
 */
export function ReadOnlyNote({ text }: { text: string }) {
  return <Text className="text-sm text-muted-foreground">{text}</Text>
}
