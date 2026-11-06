import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

/** Props of `EmptyState`. */
interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

/**
 * What a list shows when it loaded and holds nothing. The title is plain
 * text, not a header: a screen has one header.
 * @param props - The title, an optional description and an optional action.
 * @param props.title - The one-line statement.
 * @param props.description - A line under the title.
 * @param props.action - A control under the text.
 * @returns The empty state.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View className="gap-2">
      <Text className="text-base font-medium text-foreground">{title}</Text>
      {description ? <Text className="text-base text-muted-foreground">{description}</Text> : null}
      {action}
    </View>
  )
}
