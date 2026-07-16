import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS,
  LEGACY_ATTORNEY_FINANCIAL_DOCUMENT_KEYS,
  isLegacyAttorneyFinancialDocumentKey,
  listAttorneyClientFinancialDocumentDefaults,
  resolveAttorneyClientFinancialDocumentSettings,
} from '../src/services/documents/attorneyClientFinancialDocumentConfig.js'
import {
  CROSS_MODULE_DOCUMENT_ALIAS_COLLISIONS,
  getCrossModuleDocumentDefinition,
  resolveCrossModuleDocumentKey,
} from '../src/services/documents/crossModuleDocumentKeyMapService.js'

const defaults = listAttorneyClientFinancialDocumentDefaults()
const keys = Object.values(ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS)

assert.equal(defaults.length, 4)
assert.deepEqual(defaults.map((item) => item.documentDefinitionKey), keys)
assert.equal(new Set(keys).size, 4)
assert.equal(CROSS_MODULE_DOCUMENT_ALIAS_COLLISIONS.length, 0)

for (const item of defaults) {
  assert.equal(item.uploadVisibilityDefault, 'internal')
  assert.equal(item.publicationRequired, true)
  assert.equal(['buyer', 'seller'].includes(item.recipientRole), true)
  assert.equal(getCrossModuleDocumentDefinition(item.documentDefinitionKey)?.packKey, 'attorney_client_financials')
  assert.equal(resolveCrossModuleDocumentKey(item.documentDefinitionKey), item.documentDefinitionKey)
}

assert.equal(defaults.find((item) => item.documentDefinitionKey === 'seller_attorney_invoice')?.requirementLevel, 'optional')
assert.equal(defaults.find((item) => item.documentDefinitionKey === 'buyer_final_statement')?.closeoutBlocking, true)
assert.equal(defaults.find((item) => item.documentDefinitionKey === 'seller_final_statement')?.dueBusinessDays, 2)

const resolved = resolveAttorneyClientFinancialDocumentSettings([
  {
    document_definition_key: 'buyer_transfer_cost_invoice',
    requirement_level: 'optional',
    lodgement_blocking: true,
    due_business_days: null,
    upload_visibility_default: 'client',
  },
])
const buyerInvoice = resolved.find((item) => item.documentDefinitionKey === 'buyer_transfer_cost_invoice')
assert.equal(buyerInvoice.requirementLevel, 'optional')
assert.equal(buyerInvoice.lodgementBlocking, true)
assert.equal(buyerInvoice.dueBusinessDays, null)
assert.equal(buyerInvoice.uploadVisibilityDefault, 'internal', 'Firm overrides must not make uploads client-visible by default.')

assert.deepEqual(LEGACY_ATTORNEY_FINANCIAL_DOCUMENT_KEYS, ['attorney_invoice', 'attorney_statement'])
assert.equal(isLegacyAttorneyFinancialDocumentKey('attorney_invoice'), true)
assert.equal(isLegacyAttorneyFinancialDocumentKey('buyer_transfer_cost_invoice'), false)
assert.equal(resolveCrossModuleDocumentKey('attorney_invoice'), 'attorney_invoice', 'Legacy keys must not auto-classify to a party.')
assert.equal(resolveCrossModuleDocumentKey('attorney_statement'), 'attorney_statement', 'Legacy keys must not auto-classify to a party.')

const migrationPath = path.resolve(process.cwd(), '../supabase/migrations/202607160012_attorney_client_financial_documents_phase1.sql')
const migration = readFileSync(migrationPath, 'utf8')

for (const key of keys) {
  assert.equal(migration.includes(`'${key}'`), true, `Migration must define ${key}.`)
}

assert.equal(migration.includes("upload_visibility_default text not null default 'internal'"), true)
assert.equal(migration.includes("upload_visibility_default = 'internal'"), true)
assert.equal(migration.includes('attorney_user_is_firm_admin(attorney_firm_id)'), true)
assert.equal(migration.includes('bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id'), true)
assert.equal(migration.includes("array['buyer', 'transferring_attorney']"), false, 'Phase 1 definitions must not expose buyer documents by default.')
assert.equal(migration.includes("array['seller', 'transferring_attorney']"), false, 'Phase 1 definitions must not expose seller documents by default.')

console.log('attorney client financial documents phase 1 contract passed')
