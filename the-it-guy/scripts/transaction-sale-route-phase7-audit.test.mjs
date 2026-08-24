import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  TRANSACTION_SALE_ROUTE_AUDIT_CODES,
  TRANSACTION_SALE_ROUTE_AUDIT_VERSION,
  buildTransactionSaleRouteAudit,
} from '../src/core/transactions/transactionSaleRouteAudit.js'

const appRoot = resolve(import.meta.dirname, '..')

function getIssueCodes(audit, transactionId) {
  return audit.issues
    .filter((issue) => issue.transactionId === transactionId)
    .map((issue) => issue.code)
}

function assertHasIssue(audit, transactionId, code) {
  assert.equal(
    getIssueCodes(audit, transactionId).includes(code),
    true,
    `${transactionId} should surface ${code}`,
  )
}

function assertNoIssue(audit, transactionId, code) {
  assert.equal(
    getIssueCodes(audit, transactionId).includes(code),
    false,
    `${transactionId} should not surface ${code}`,
  )
}

const audit = buildTransactionSaleRouteAudit({
  transactions: [
    {
      id: 'clean-external',
      transaction_type: 'developer_sale',
      sale_route: 'external_agency_sale',
      lead_owner: 'agency',
      ownership_model: 'agency_introduced',
      source_agency_org_id: '00000000-0000-4000-8000-000000000001',
    },
    {
      id: 'missing-persisted-route',
      transaction_type: 'developer_sale',
      lead_owner: 'agency',
      ownership_model: 'agency_introduced',
      source_agency_org_id: '00000000-0000-4000-8000-000000000002',
    },
    {
      id: 'conflicting-agency-route',
      transaction_type: 'developer_sale',
      sale_route: 'internal_developer_sale',
      source_agency_org_id: '00000000-0000-4000-8000-000000000003',
    },
    {
      id: 'developer-seller-overlap',
      transaction_type: 'developer_sale',
      sale_route: 'internal_developer_sale',
      lead_owner: 'developer',
      ownership_model: 'developer_direct',
    },
    {
      id: 'private-developer-leak',
      transaction_type: 'private_property',
      sale_route: 'private_property_sale',
    },
    {
      id: 'external-missing-agency-docs',
      transaction_type: 'developer_sale',
      sale_route: 'external_agency_sale',
      source_agency_org_id: '00000000-0000-4000-8000-000000000004',
    },
  ],
  requiredDocumentsByTransactionId: {
    'clean-external': [
      { key: 'agency_handover_pack', groupKey: 'agency_documents', requiredFromRole: 'agency' },
      { key: 'buyer_fica', groupKey: 'buyer_fica', requiredFromRole: 'buyer' },
    ],
    'missing-persisted-route': [
      { key: 'agency_handover_pack', groupKey: 'agency_documents', requiredFromRole: 'agency' },
    ],
    'conflicting-agency-route': [
      { key: 'agency_handover_pack', groupKey: 'agency_documents', requiredFromRole: 'agency' },
    ],
    'developer-seller-overlap': [
      { key: 'seller_fica', groupKey: 'seller_documents', requiredFromRole: 'seller' },
    ],
    'private-developer-leak': [
      { key: 'developer_resolution', groupKey: 'developer_documents', requiredFromRole: 'developer' },
    ],
    'external-missing-agency-docs': [
      { key: 'buyer_fica', groupKey: 'buyer_fica', requiredFromRole: 'buyer' },
    ],
  },
  availableActionsByTransactionId: {
    'clean-external': [{ actionKey: 'REQUEST_AGENCY_HANDOVER' }],
    'missing-persisted-route': [{ actionKey: 'REQUEST_AGENCY_HANDOVER' }],
    'conflicting-agency-route': [{ actionKey: 'REQUEST_AGENCY_HANDOVER' }],
    'developer-seller-overlap': [{ actionKey: 'REQUEST_DEVELOPER_DOCUMENTS' }],
    'private-developer-leak': [{ actionKey: 'REQUEST_DEVELOPER_DOCUMENTS' }],
    'external-missing-agency-docs': [{ actionKey: 'REQUEST_DEVELOPER_DOCUMENTS' }],
  },
})

assert.equal(audit.version, TRANSACTION_SALE_ROUTE_AUDIT_VERSION)
assert.equal(audit.total, 6)
assert.equal(audit.healthy, false)
assert.equal(audit.routeCounts.external_agency_sale, 3)
assert.equal(audit.routeCounts.internal_developer_sale, 2)
assert.equal(audit.routeCounts.private_property_sale, 1)

assertNoIssue(audit, 'clean-external', TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_DOCUMENTS_MISSING)
assertNoIssue(audit, 'clean-external', TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_HANDOVER_ACTION_MISSING)

assertHasIssue(audit, 'missing-persisted-route', TRANSACTION_SALE_ROUTE_AUDIT_CODES.SALE_ROUTE_MISSING)
assertHasIssue(audit, 'conflicting-agency-route', TRANSACTION_SALE_ROUTE_AUDIT_CODES.ROUTE_AGENCY_SIGNAL_CONFLICT)
assertHasIssue(audit, 'conflicting-agency-route', TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_DOCUMENTS_ON_NON_EXTERNAL_SALE)
assertHasIssue(audit, 'conflicting-agency-route', TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_HANDOVER_ACTION_ON_NON_EXTERNAL_SALE)
assertHasIssue(audit, 'developer-seller-overlap', TRANSACTION_SALE_ROUTE_AUDIT_CODES.SELLER_DOCUMENTS_ON_DEVELOPER_SALE)
assertHasIssue(audit, 'private-developer-leak', TRANSACTION_SALE_ROUTE_AUDIT_CODES.DEVELOPER_DOCUMENTS_ON_PRIVATE_SALE)
assertHasIssue(audit, 'private-developer-leak', TRANSACTION_SALE_ROUTE_AUDIT_CODES.DEVELOPER_DOCUMENT_ACTION_ON_PRIVATE_SALE)
assertHasIssue(audit, 'external-missing-agency-docs', TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_DOCUMENTS_MISSING)
assertHasIssue(audit, 'external-missing-agency-docs', TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_HANDOVER_ACTION_MISSING)

const auditSource = readFileSync(resolve(appRoot, 'src/core/transactions/transactionSaleRouteAudit.js'), 'utf8')
for (const token of [
  'ROUTE_AGENCY_SIGNAL_CONFLICT',
  'AGENCY_DOCUMENTS_MISSING',
  'SELLER_DOCUMENTS_ON_DEVELOPER_SALE',
  'REQUEST_AGENCY_HANDOVER',
  'REQUEST_DEVELOPER_DOCUMENTS',
]) {
  assert.match(auditSource, new RegExp(token), `Phase 7 audit source should include ${token}`)
}

console.log('transaction sale route phase 7 audit checks passed')
