import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const pageSource = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const workflowServiceSource = fs.readFileSync(path.join(root, 'src/services/attorneyWorkflow/attorneyWorkflowLaneService.js'), 'utf8')
const planSyncMigration = fs.readFileSync(
  path.join(root, '..', 'supabase/migrations/20260908065905_publish_attorney_workflow_plan_reconciliation.sql'),
  'utf8',
)
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8')

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message)
}

assertHas(
  apiSource,
  /export async function saveTransactionRoutingProfile/,
  'Phase 5 should expose a routing correction API.',
)
assertHas(
  apiSource,
  /resolveTransactionRoutingProfile\(\{\s*transaction: nextTransaction,/,
  'Routing correction should regenerate the routing profile from corrected facts.',
)
for (const column of [
  'finance_type',
  'transaction_type',
  'property_tenure',
  'seller_type',
  'seller_has_existing_bond',
  'cancellation_required',
  'vat_treatment',
  'routing_profile_version',
  'routing_profile_json',
]) {
  assertHas(apiSource, new RegExp(`\\b${column}\\b`), `Routing correction should persist ${column}.`)
}
assertHas(
  apiSource,
  /eventType: 'RoutingProfileUpdated'/,
  'Routing correction should record a routing update event.',
)
assertHas(
  apiSource,
  /reasonCode: 'routing_profile_updated'/,
  'Routing correction should trigger workflow recompute.',
)
assertHas(
  apiSource,
  /workflowPlanImpact,/,
  'Routing correction should record the plan impact with the canonical update.',
)

assertHas(
  pageSource,
  /saveTransactionRoutingProfile/,
  'Attorney transaction page should call the routing correction API.',
)
assertHas(
  pageSource,
  /title=\{routingDiagnostics\?\.status === 'needs_confirmation' \? 'Confirm Matter Profile' : 'Edit Matter Profile'\}/,
  'Attorney transaction page should make profile confirmation explicit.',
)
assertHas(
  apiSource,
  /matterProfile: \{\s*status: 'confirmed'/,
  'Saving routing facts should confirm the canonical matter profile.',
)
for (const field of [
  'financeType',
  'transactionType',
  'propertyTenure',
  'sellerHasExistingBond',
  'cancellationRequired',
  'vatTreatment',
]) {
  assertHas(pageSource, new RegExp(`routingProfileDraft\\.${field}`), `Routing modal should expose ${field}.`)
}
assertHas(
  pageSource,
  /canEditRoutingProfile/,
  'Routing correction should be role-gated in the UI.',
)
assertHas(
  pageSource,
  /Workflow plan impact/,
  'The confirmation UI should make plan changes visible before saving.',
)
assertHas(
  workflowServiceSource,
  /export async function reconcileAttorneyWorkflowPlanForTransaction/,
  'A confirmed routing profile should have an idempotent workflow-plan application path.',
)
assertHas(
  workflowServiceSource,
  /eventType: 'AttorneyWorkflowPlanReconciled'/,
  'Plan application should leave a durable operational audit event.',
)
assertHas(
  pageSource,
  /reconcileAttorneyWorkflowPlanForTransaction\(transaction\.id\)/,
  'Saving a routing profile should apply the resulting plan before refreshing the matter.',
)
assertHas(
  workflowServiceSource,
  /actionKey: 'ATTORNEY_WORKFLOW_PLAN_RECONCILED'/,
  'Plan application should publish the canonical professional refresh signal.',
)
assertHas(
  planSyncMigration,
  /'ATTORNEY_WORKFLOW_PLAN_RECONCILED'[\s\S]*'professional_shared'[\s\S]*false/,
  'The plan-reconciliation sync contract must remain professional-only and never require a client projection.',
)
assertHas(
  packageSource,
  /"test:transaction-routing-correction": "node scripts\/transaction-routing-correction\.test\.mjs"/,
  'Package scripts should expose the Phase 5 routing correction guard.',
)

console.log('transaction-routing-correction tests passed')
