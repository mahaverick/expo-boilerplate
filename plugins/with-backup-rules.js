const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins')
const fs = require('node:fs')
const path = require('node:path')

/** With no `include`, everything else stays in the backup. The exclusions: SecureStore's preferences file and MMKV's directory under `files/`. */
const EXCLUDES = [
  '<exclude domain="sharedpref" path="SecureStore.xml"/>',
  '<exclude domain="sharedpref" path="SecureStore"/>',
  '<exclude domain="file" path="mmkv/"/>',
]

/**
 * The rules file for one Android backup mechanism.
 * @param kind - Android 12+ rules or the older full-backup rules.
 * @returns The XML.
 */
function backupRulesXml(kind) {
  /** The exclusion lines, indented. */
  const body = (indent) => EXCLUDES.map((line) => line.replace(/^/gm, indent)).join('\n')
  if (kind === 'full-backup') {
    return `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${body('  ')}\n</full-backup-content>\n`
  }
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n` +
    ['cloud-backup', 'device-transfer']
      .map((section) => `  <${section}>\n${body('    ')}\n  </${section}>`)
      .join('\n') +
    `\n</data-extraction-rules>\n`
  )
}

/**
 * Writes both rules files and points the application at them, so SecureStore
 * and MMKV stay out of cloud backup and device transfer.
 * @param config - The Expo config.
 * @returns The config with both mods added.
 */
function withBackupRules(config) {
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'data_extraction_rules.xml'),
        backupRulesXml('data-extraction')
      )
      fs.writeFileSync(path.join(dir, 'full_backup_content.xml'), backupRulesXml('full-backup'))
      return cfg
    },
  ])
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules'
    app.$['android:fullBackupContent'] = '@xml/full_backup_content'
    return cfg
  })
}

module.exports = withBackupRules
module.exports.backupRulesXml = backupRulesXml
