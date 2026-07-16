import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getAttorneyClientFinancialDocumentOperationalStatus } from '../src/services/documents/attorneyClientFinancialDocumentService.js'

const today = new Date('2026-07-16T12:00:00Z')
assert.equal(getAttorneyClientFinancialDocumentOperationalStatus({ available: false, today }), 'not_available')
assert.equal(getAttorneyClientFinancialDocumentOperationalStatus({ published: true, today }), 'published')
assert.equal(getAttorneyClientFinancialDocumentOperationalStatus({ document: { id: 'doc-1' }, today }), 'ready_to_publish')
assert.equal(getAttorneyClientFinancialDocumentOperationalStatus({ dueDate: '2026-07-15', today }), 'overdue')
assert.equal(getAttorneyClientFinancialDocumentOperationalStatus({ dueDate: '2026-07-18', today }), 'due_soon')
assert.equal(getAttorneyClientFinancialDocumentOperationalStatus({ dueDate: '2026-07-24', today }), 'outstanding')

const component = readFileSync(path.resolve(process.cwd(), 'src/components/attorney/documents/AttorneyClientFinancialDocumentsPanel.jsx'), 'utf8')
assert.equal(component.includes('Delivery history'), true)
assert.equal(component.includes('ready to publish'), true)
assert.equal(component.includes('operationalSummary.overdue'), true)

const service = readFileSync(path.resolve(process.cwd(), 'src/services/documents/attorneyClientFinancialDocumentService.js'), 'utf8')
assert.equal(service.includes('attorney_client_financial_document_publication_events'), true)
assert.equal(service.includes('client_notification_id'), true)

const migration = readFileSync(path.resolve(process.cwd(), '../supabase/migrations/202607160015_attorney_client_financial_documents_phase4.sql'), 'utf8')
assert.equal(migration.includes('bridge_deliver_attorney_client_financial_document_publication'), true)
assert.equal(migration.includes('client_portal_notifications'), true)
assert.equal(migration.includes('notification_events'), true)
assert.equal(migration.includes("new.recipient_role"), true)
assert.equal(migration.includes("action_route"), true)
assert.equal(migration.includes("delivery_status = 'failed'"), true)
assert.equal(migration.includes('bridge_attorney_client_financial_notifications_by_token'), true)

const portalService = readFileSync(path.resolve(process.cwd(), 'src/services/clientPortalWorkspaceService.js'), 'utf8')
assert.equal(portalService.includes('fetchAttorneyClientFinancialNotificationsByToken'), true)

console.log('attorney client financial documents phase 4 contract passed')
