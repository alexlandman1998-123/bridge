import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getAttorneyClientFinancialDocumentReminderState } from '../src/services/documents/attorneyClientFinancialDocumentService.js'

const now = new Date('2026-07-16T12:00:00Z')
assert.equal(getAttorneyClientFinancialDocumentReminderState({ published: false, now }).status, 'inactive')
assert.equal(getAttorneyClientFinancialDocumentReminderState({
  published: true,
  publishedAt: '2026-07-14T12:00:00Z',
  now,
}).status, 'waiting')
assert.equal(getAttorneyClientFinancialDocumentReminderState({
  published: true,
  publishedAt: '2026-07-12T12:00:00Z',
  now,
}).status, 'due')
assert.equal(getAttorneyClientFinancialDocumentReminderState({
  published: true,
  publishedAt: '2026-07-12T12:00:00Z',
  reminderEvents: [{ deliveryStatus: 'delivered', createdAt: '2026-07-16T08:00:00Z' }],
  now,
}).canSend, false)
assert.equal(getAttorneyClientFinancialDocumentReminderState({
  published: true,
  publishedAt: '2026-07-01T12:00:00Z',
  now,
}).status, 'escalated')
assert.equal(getAttorneyClientFinancialDocumentReminderState({
  published: true,
  publishedAt: '2026-07-01T12:00:00Z',
  viewReceipt: { id: 'receipt-1' },
  now,
}).status, 'completed')

const migration = readFileSync(path.resolve(process.cwd(), '../supabase/migrations/202607160017_attorney_client_financial_documents_phase6.sql'), 'utf8')
assert.equal(migration.includes('attorney_client_financial_document_reminder_events'), true)
assert.equal(migration.includes('bridge_send_attorney_client_financial_document_reminder'), true)
assert.equal(migration.includes('bridge_queue_attorney_client_financial_document_reminders'), true)
assert.equal(migration.includes("'cadenceDays':[3,7]"), false)
assert.equal(migration.includes('"cadenceDays":[3,7]'), true)
assert.equal(migration.includes("access_event.event_type = 'viewed'"), true)
assert.equal(migration.includes("interval '24 hours'"), true)
assert.equal(migration.includes("cross join (values (1, 3), (2, 7))"), true)
assert.equal(migration.includes('p_dry_run boolean default false'), true)
assert.equal(migration.includes('to service_role'), true)

const panel = readFileSync(path.resolve(process.cwd(), 'src/components/attorney/documents/AttorneyClientFinancialDocumentsPanel.jsx'), 'utf8')
assert.equal(panel.includes('Send view reminder'), true)
assert.equal(panel.includes('Reminder history'), true)
assert.equal(panel.includes('follow-ups due'), true)

const dispatcher = readFileSync(path.resolve(process.cwd(), '../supabase/functions/send-email/handlers/notificationReminderDispatch.ts'), 'utf8')
assert.equal(dispatcher.includes('bridge_queue_attorney_client_financial_document_reminders'), true)
assert.equal(dispatcher.includes('financialDocumentQueueAvailable'), true)

console.log('attorney client financial documents phase 6 contract passed')
