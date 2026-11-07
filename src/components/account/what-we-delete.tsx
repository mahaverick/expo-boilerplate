import { Text, View } from 'react-native'

/**
 * What we delete and what we keep when a request is carried out. The words
 * come from express's SECURITY.md "Account deletion" and "Purge" sections. The
 * title is not a header: the screen has one.
 * @returns The block.
 */
export function WhatWeDelete() {
  return (
    <View className="gap-2">
      <Text className="text-lg font-semibold text-foreground">What we delete</Text>
      <Text className="text-sm text-foreground">
        Within 30 days of your request, we delete your account and sign you out everywhere. You
        can’t sign in to it again, and we remove its Google sign-in link.
      </Text>
      <Text className="text-sm text-foreground">
        We can’t delete it while you’re the only owner of a workspace, even one with no other
        members, or while you pay for a running subscription. Your request then stays open. Our
        staff help hand the workspace over or delete it, or move the subscription to a co-owner or
        cancel it. Then we delete your account.
      </Text>
      <Text className="text-sm text-foreground">
        When our staff purge your account, we permanently erase your name, your email address and
        the emails we sent you. We set no date for the purge. At the purge, we also ask our
        analytics provider to delete your profile, events and recordings.
      </Text>
      <Text className="text-sm text-foreground">
        We keep our audit log, which records actions taken in your account and workspaces. At the
        purge, entries for actions you took lose your user ID, IP address and browser details.
        Entries about your account keep the account’s ID. We keep audit entries with no end date,
        unless we set a retention period for the audit log.
      </Text>
    </View>
  )
}
