import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../..')
const migrationPath = path.join(
  workspaceRoot,
  'supabase/migrations/202607310007_notification_automation_reminder_health_controls.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')

const reminderKeys = [
  'attorney_client_financial_document_reminder',
  'attorney_lead_follow_up_due',
  'attorney_lead_first_contact_overdue',
  'attorney_lead_first_contact_escalated',
  'legal_document_signing_reminder',
  'legal_role_coordination_reminder',
]

for (const key of reminderKeys) {
  assert.ok(migration.includes(`'${key}'`), `health-controls migration should reference ${key}`)
}

assert.equal((migration.match(/'cadenceDays'/g) || []).length, reminderKeys.length)
assert.equal((migration.match(/'quietHours'/g) || []).length, reminderKeys.length)
assert.equal((migration.match(/'escalation'/g) || []).length, reminderKeys.length)
assert.match(migration, /'timezone', 'Africa\/Johannesburg'/)
assert.match(migration, /'phase', 'phase_7_reminder_health_controls'/)
assert.match(migration, /'dynamicCadence', true/)
assert.match(migration, /'quietHoursAware', true/)
assert.match(migration, /'escalationPolicy', true/)
assert.match(migration, /where automation_key in \(/)
assert.match(migration, /commit;/)

console.log('notification automation reminder health controls checks passed')
