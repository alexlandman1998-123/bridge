import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getAttorneyClientFinancialDocumentAssurance } from '../src/services/documents/attorneyClientFinancialDocumentService.js'

const publishedDocument = {
  id: 'document-1',
  is_client_visible: true,
  client_recipient_role: 'buyer',
}
const metadata = {
  documentId: 'document-1',
  recipientRole: 'buyer',
}
const deliveredPublication = { deliveryStatus: 'delivered' }

assert.deepEqual(getAttorneyClientFinancialDocumentAssurance({ published: false }), { status: 'internal', issues: [] })
assert.equal(getAttorneyClientFinancialDocumentAssurance({
  published: true,
  document: publishedDocument,
  metadata,
  publicationEvent: deliveredPublication,
}).status, 'awaiting_view')
assert.equal(getAttorneyClientFinancialDocumentAssurance({
  published: true,
  document: publishedDocument,
  metadata,
  publicationEvent: deliveredPublication,
  viewReceipt: { id: 'receipt-1' },
}).status, 'viewed')
assert.equal(getAttorneyClientFinancialDocumentAssurance({
  published: true,
  document: { ...publishedDocument, client_recipient_role: 'seller' },
  metadata,
  publicationEvent: deliveredPublication,
}).issues.includes('recipient_mismatch'), true)
assert.equal(getAttorneyClientFinancialDocumentAssurance({
  published: true,
  document: publishedDocument,
  metadata,
  publicationEvent: { deliveryStatus: 'failed' },
}).status, 'needs_attention')

const migration = readFileSync(path.resolve(process.cwd(), '../supabase/migrations/202607160016_attorney_client_financial_documents_phase5.sql'), 'utf8')
assert.equal(migration.includes('attorney_client_financial_document_access_events'), true)
assert.equal(migration.includes('bridge_record_attorney_client_financial_document_access'), true)
assert.equal(migration.includes("encode(digest(v_token, 'sha256'), 'hex')"), true)
assert.equal(migration.includes("metadata.publication_status = 'published'"), true)
assert.equal(migration.includes('document_row.client_recipient_role = v_recipient_role'), true)
assert.equal(migration.includes('unique (publication_event_id, recipient_role, event_type)'), true)
assert.equal(migration.includes('grant execute on function public.bridge_record_attorney_client_financial_document_access'), true)

const portal = readFileSync(path.resolve(process.cwd(), 'src/pages/ClientPortal.jsx'), 'utf8')
assert.equal(portal.includes('recordAttorneyClientFinancialDocumentAccessByToken'), true)
assert.equal(portal.includes("document?.publication_status === 'published'"), true)

const attorneyPanel = readFileSync(path.resolve(process.cwd(), 'src/components/attorney/documents/AttorneyClientFinancialDocumentsPanel.jsx'), 'utf8')
assert.equal(attorneyPanel.includes('awaiting view'), true)
assert.equal(attorneyPanel.includes('Client receipt history'), true)
assert.equal(attorneyPanel.includes('assuranceIssues'), true)

console.log('attorney client financial documents phase 5 contract passed')
