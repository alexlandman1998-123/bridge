import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildTransactionRoutingDiagnostics,
  getTransactionRoutingStatusLabel,
} from '../src/services/transactionRoutingDiagnosticsService.js'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function assertIncludes(values, expected, message) {
  assert.equal(values.includes(expected), true, message)
}

{
  const canonicalProfile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'bond-sectional',
      finance_type: 'bond',
      transaction_type: 'private_sale',
      property_type: 'sectional title apartment',
      purchaser_type: 'company',
      seller_type: 'individual',
      seller_has_existing_bond: true,
      vat_treatment: 'transfer_duty',
    },
    matterProfile: {
      status: 'confirmed',
      confirmedAt: '2026-09-08T09:00:00.000Z',
      confirmedByRole: 'attorney',
      revision: 1,
    },
  })
  const diagnostics = buildTransactionRoutingDiagnostics({
    id: 'bond-sectional',
    finance_type: 'bond',
    transaction_type: 'private_sale',
    property_type: 'sectional title apartment',
    purchaser_type: 'company',
    seller_type: 'individual',
    seller_has_existing_bond: true,
    vat_treatment: 'transfer_duty',
    routing_profile_json: canonicalProfile,
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
    id: 'unconfirmed-route',
    finance_type: 'cash',
    transaction_type: 'resale',
    property_type: 'freehold house',
    purchaser_type: 'individual',
    seller_type: 'individual',
    seller_has_existing_bond: false,
    vat_treatment: 'transfer_duty',
  })

  assert.equal(diagnostics.status, 'needs_confirmation')
  assert.equal(getTransactionRoutingStatusLabel(diagnostics.status), 'Confirm matter profile')
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
  const diagnostics = buildTransactionRoutingDiagnostics(
    {
      id: 'external-agency-missing-action',
      transaction_type: 'developer_sale',
      sale_route: 'external_agency_sale',
      source_agency_org_id: '00000000-0000-4000-8000-000000000010',
    },
    {
      requiredDocuments: [
        { key: 'agency_handover_pack', groupKey: 'agency_documents', requiredFromRole: 'agency' },
      ],
      availableActions: [
        { actionKey: 'REQUEST_DEVELOPER_DOCUMENTS' },
      ],
    },
  )

  assert.equal(diagnostics.saleRouteAudit.resolvedRoute, 'external_agency_sale')
  assert.equal(diagnostics.saleRouteAudit.status, 'blocked')
  assertIncludes(
    diagnostics.saleRouteAudit.issues.map((issue) => issue.code),
    'agency_handover_action_missing',
    'Routing diagnostics should surface sale-route action overlap.',
  )
  assert.equal(diagnostics.saleRouteAuditSummary.healthy, false)
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
  assert.match(pageSource, /buildTransactionRoutingDiagnostics\(transaction,\s*\{/, 'Routing summary should use the enriched diagnostics service.')
  assert.match(pageSource, /SaleRouteAuditSummary/, 'Routing panels should render sale-route audit health.')
  assert.match(pageSource, /availableActions: transactionRollup\?\.availableActions/, 'Routing diagnostics should receive rollup actions.')
}

console.log('transaction-routing-diagnostics tests passed')
