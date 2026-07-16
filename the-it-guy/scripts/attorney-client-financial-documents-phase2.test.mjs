import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  addBusinessDays,
  buildAttorneyClientFinancialDocumentRows,
  isRegisteredAttorneyTransaction,
} from '../src/services/documents/attorneyClientFinancialDocumentService.js'

assert.equal(addBusinessDays('2026-07-17', 2), '2026-07-21')
assert.equal(isRegisteredAttorneyTransaction({ stage: 'Registered' }), true)
assert.equal(isRegisteredAttorneyTransaction({ current_main_stage: 'XFER' }), false)

const preRegistration = buildAttorneyClientFinancialDocumentRows({
  transaction: { id: 'transaction-1', stage: 'Transfer in progress' },
  documents: [{ id: 'doc-1', document_type: 'buyer_transfer_cost_invoice', name: 'buyer-invoice.pdf', created_at: '2026-07-16T10:00:00Z', visibility_scope: 'internal' }],
  metadata: [{ documentDefinitionKey: 'buyer_transfer_cost_invoice', paymentDueDate: '2026-07-20' }],
})
assert.equal(preRegistration.length, 4)
assert.equal(preRegistration.find((row) => row.key === 'buyer_transfer_cost_invoice')?.status, 'uploaded')
assert.equal(preRegistration.find((row) => row.key === 'buyer_transfer_cost_invoice')?.dueDate, '2026-07-20')
assert.equal(preRegistration.find((row) => row.key === 'buyer_final_statement')?.status, 'not_available')
assert.equal(preRegistration.find((row) => row.key === 'seller_final_statement')?.available, false)

const firmFiltered = buildAttorneyClientFinancialDocumentRows({
  settings: [{ document_definition_key: 'seller_attorney_invoice', is_enabled: false }],
})
assert.equal(firmFiltered.some((row) => row.key === 'seller_attorney_invoice'), false)

const registered = buildAttorneyClientFinancialDocumentRows({
  transaction: { id: 'transaction-1', stage: 'Registered', registration_date: '2026-07-17' },
  requirements: [{ id: 'requirement-1', document_definition_key: 'seller_final_statement' }],
  settings: [{ document_definition_key: 'seller_final_statement', due_business_days: 2 }],
})
const sellerStatement = registered.find((row) => row.key === 'seller_final_statement')
assert.equal(sellerStatement.available, true)
assert.equal(sellerStatement.status, 'missing')
assert.equal(sellerStatement.dueDate, '2026-07-21')
assert.equal(sellerStatement.canonicalRequirementInstanceId, 'requirement-1')

const component = readFileSync(path.resolve(process.cwd(), 'src/components/attorney/documents/AttorneyClientFinancialDocumentsPanel.jsx'), 'utf8')
assert.equal(component.includes('Internal by default'), true)
assert.equal(component.includes('isClientVisible'), false, 'The Phase 2 panel must not offer client visibility controls.')

const page = readFileSync(path.resolve(process.cwd(), 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
assert.equal(page.includes("visibilityScope: 'internal'"), true)
assert.equal(page.includes("source: 'attorney_client_financials'"), true)

const migration = readFileSync(path.resolve(process.cwd(), '../supabase/migrations/202607160013_attorney_client_financial_documents_phase2.sql'), 'utf8')
assert.equal(migration.includes('transaction_attorney_client_financial_document_metadata'), true)
assert.equal(migration.includes("from public, anon"), true)
assert.equal(migration.includes("member.role in ('firm_admin', 'director_partner', 'transfer_attorney', 'conveyancing_secretary')"), true)

console.log('attorney client financial documents phase 2 contract passed')
