import { describe, expect, it } from '@/tests/support/runner'
import withBackupRules from '../../../plugins/with-backup-rules'

describe('backupRulesXml', () => {
  it.each(['data-extraction', 'full-backup'] as const)(
    '%s excludes SecureStore and MMKV',
    (kind) => {
      const xml = withBackupRules.backupRulesXml(kind)
      expect(xml).toContain('<exclude domain="sharedpref" path="SecureStore.xml"/>')
      expect(xml).toContain('<exclude domain="file" path="mmkv/"/>')
    }
  )

  it('covers cloud backup and device transfer in data-extraction', () => {
    const xml = withBackupRules.backupRulesXml('data-extraction')
    for (const section of ['cloud-backup', 'device-transfer']) {
      const body = xml.split(`<${section}>`)[1]?.split(`</${section}>`)[0] ?? ''
      expect(body).toContain('path="SecureStore.xml"')
      expect(body).toContain('path="mmkv/"')
    }
  })

  it('wraps full-backup in full-backup-content', () => {
    expect(withBackupRules.backupRulesXml('full-backup')).toContain('<full-backup-content>')
  })
})
