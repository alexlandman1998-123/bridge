import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildTransactionRoutingDiagnostics,
  getTransactionRoutingStatusLabel,
} from '../src/services/transactionRoutingDiagnosticsService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function assertIncludes(values, expected, message) {
  assert.equal(values.includes(expected), true, message)
}

{
  const diagnostics = buildTransactionRoutingDiagnostics({
    id: 'bond-sectional',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    property_type: 'freehold',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    routing_profile_json: {
      version: 'transaction_routing_profile_v1',
      financeType: 'bond',
      transactionType: 'private_sale',
      propertyTenure: 'sectional_title',
      buyerEntityType: 'company',
      sellerEntityType: 'individual',
      sellerHasExistingBond: true,
      cancellationRequired: true,
      requiresTransferAttorney: true,
      requiresBondAttorney: true,
      requiresCancellationAttorney: true,
      workflowTemplateKey: 'bond_sectional_title',
      requiredWorkflowKeys: ['sales_otp', 'finance_bond', 'attorney_transfer', 'attorney_bond', 'seller_bond_cancellation', 'registration'],
      requiredDocumentGroups: ['buyer_identity_fica', 'sectional_title_body_corporate', 'bond_originator', 'property_finance_existing_bond'],
      missingFields: [],
    },
  })

  assert.equal(diagnostics.source, 'persisted')
  assert.equal(diagnostics.status, 'ready')
  assert.equal(diagnostics.facts.financeType, 'bond')
  assert.equal(diagnostics.facts.propertyTenure, 'sectional_title')
  assert.equal(diagnostics.facts.requiresCancellationAttorney, true)
  assertIncludes(diagnostics.requiredWorkflowKeys, 'attorney_bond', 'Persisted bond route should surface attorney bond workflow.')
  assertIncludes(diagnostics.requiredWorkflowLabels, 'Seller bond cancellation', 'Cancellation route should have a human workflow label.')
}

{
  const diagnostics = buildTransactionRoutingDiagnostics({
    id: 'missing-route',
    property_type: 'house',
  })

  assert.equal(diagnostics.source, 'computed')
  assert.equal(diagnostics.status, 'needs_attention')
  assertIncludes(diagnostics.missingFields, 'finance_type', 'Missing finance type should be diagnosed.')
  assertIncludes(diagnostics.missingFieldLabels, 'Finance type', 'Missing fields should be human-readable.')
  assert.equal(getTransactionRoutingStatusLabel(diagnostics.status), 'Needs routing facts')
}

{
  const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
  for (const column of [
    'property_tenure',
    'seller_has_existing_bond',
    'cancellation_required',
    'vat_treatment',
    'routing_profile_version',
    'routing_profile_json',
  ]) {
    assert.match(apiSource, new RegExp(`\\b${column}\\b`), `fetchTransactionById should hydrate ${column}`)
  }
}

{
  const pageSource = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
  assert.match(pageSource, /TransactionRoutingSummaryCard/, 'Attorney transaction overview should render the routing summary card.')
  assert.match(pageSource, /buildTransactionRoutingDiagnostics\(transaction\)/, 'Routing summary should use the diagnostics service.')
}

console.log('transaction-routing-diagnostics tests passed')
