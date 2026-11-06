import type { ConfigPlugin } from 'expo/config-plugins'

/** The config plugin that keeps SecureStore and MMKV out of Android backups. */
declare function withBackupRules(...args: Parameters<ConfigPlugin>): ReturnType<ConfigPlugin>

declare namespace withBackupRules {
  /** The rules file for one Android backup mechanism. */
  function backupRulesXml(kind: 'data-extraction' | 'full-backup'): string
}

export = withBackupRules
