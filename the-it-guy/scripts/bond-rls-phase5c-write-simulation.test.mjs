import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ORG_COMPANY = 'ws-company'
const ORG_PERSONAL = 'ws-personal'
const REGION_NORTH = 'region-north'
const REGION_SOUTH = 'region-south'
const UNIT_ALPHA = 'unit-alpha'
const UNIT_BETA = 'unit-beta'

function tempFile(prefix) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return path.join(os.tmpdir(), `${prefix}-${unique}.json`)
}

function parseReportOutput(output, label = 'phase5c write simulation') {
  const match = output.match(/\{[\s\S]*\}\s*$/)
  if (!match) {
    throw new Error(`${label}: missing JSON output`)
  }
  return JSON.parse(match[0])
}

function runPhase5cSimulation({ payload, manualMappings = [], exclusions = [] }) {
  const inputPath = tempFile('bond-phase5c-input')
  const mappingPath = tempFile('bond-phase5c-manual')
  const exclusionPath = tempFile('bond-phase5c-exclusions')

  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2))
  fs.writeFileSync(mappingPath, JSON.stringify(manualMappings, null, 2))
  fs.writeFileSync(exclusionPath, JSON.stringify(exclusions, null, 2))

  const command = [
    `BOND_RLS_SHADOW_INPUT=${inputPath}`,
    `BOND_ASSIGNMENT_MANUAL_MAPPING=${mappingPath}`,
    `BOND_RLS_CUTOVER_EXCLUSIONS=${exclusionPath}`,
    'node scripts/bond-rls-phase5c-write-simulation.mjs',
  ].join(' ')

  const output = execSync(command, { cwd: process.cwd(), encoding: 'utf8' })
  return parseReportOutput(output)
}

function outcomeById(report, id) {
  const outcome = report.scenarioOutcomes.find((entry) => entry.scenarioId === id)
  assert.ok(outcome, `Missing scenario outcome for ${id}`)
  return outcome
}

const report = runPhase5cSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-consultant',
        bond_workspace_id: ORG_COMPANY,
        primary_bond_consultant_user_id: 'user-consultant',
      },
      {
        id: 'tx-compliance',
        bond_workspace_id: ORG_COMPANY,
        assigned_bond_compliance_user_id: 'user-compliance',
      },
      {
        id: 'tx-processor',
        bond_workspace_id: ORG_COMPANY,
        assigned_bond_processor_user_id: 'user-processor',
      },
      {
        id: 'tx-branch-home',
        bond_workspace_id: ORG_COMPANY,
        bond_workspace_unit_id: UNIT_ALPHA,
      },
      {
        id: 'tx-branch-other',
        bond_workspace_id: ORG_COMPANY,
        bond_workspace_unit_id: UNIT_BETA,
      },
      {
        id: 'tx-region-home',
        bond_workspace_id: ORG_COMPANY,
        bond_region_id: REGION_NORTH,
      },
      {
        id: 'tx-region-other',
        bond_workspace_id: ORG_COMPANY,
        bond_region_id: REGION_SOUTH,
      },
      {
        id: 'tx-personal',
        bond_workspace_id: ORG_PERSONAL,
      },
      {
        id: 'tx-participant',
        bond_workspace_id: ORG_COMPANY,
        transaction_participants: [
          {
            id: 'tp-1',
            transaction_id: 'tx-participant',
            role_type: 'participant',
            user_id: 'user-participant',
            participant_email: 'participant@example.test',
            status: 'active',
          },
        ],
      },
      {
        id: 'tx-legacy-excluded',
        bond_workspace_id: ORG_COMPANY,
        assigned_bond_originator_email: 'legacy@example.test',
      },
      {
        id: 'tx-manual-review',
        bond_workspace_id: ORG_COMPANY,
        assigned_bond_originator_email: 'manual@example.test',
      },
    ],
    authUsers: [
      { id: 'user-consultant', email: 'consultant@example.test' },
      { id: 'user-compliance', email: 'compliance@example.test' },
      { id: 'user-processor', email: 'processor@example.test' },
      { id: 'user-branch-manager', email: 'branch@example.test' },
      { id: 'user-regional-manager', email: 'regional@example.test' },
      { id: 'user-personal', email: 'personal@example.test' },
      { id: 'user-participant', email: 'participant@example.test' },
      { id: 'user-legacy', email: 'legacy@example.test' },
      { id: 'user-manual', email: 'manual@example.test' },
    ],
    organisation_users: [
      {
        id: 'ou-consultant',
        organisation_id: ORG_COMPANY,
        user_id: 'user-consultant',
        workspace_role: 'consultant',
        scope_level: 'assigned',
        status: 'active',
      },
      {
        id: 'ou-compliance',
        organisation_id: ORG_COMPANY,
        user_id: 'user-compliance',
        workspace_role: 'compliance',
        scope_level: 'assigned',
        status: 'active',
      },
      {
        id: 'ou-processor',
        organisation_id: ORG_COMPANY,
        user_id: 'user-processor',
        workspace_role: 'processor',
        scope_level: 'assigned',
        status: 'active',
      },
      {
        id: 'ou-branch-manager',
        organisation_id: ORG_COMPANY,
        user_id: 'user-branch-manager',
        workspace_role: 'branch_manager',
        scope_level: 'branch',
        workspace_unit_id: UNIT_ALPHA,
        region_id: REGION_NORTH,
        status: 'active',
      },
      {
        id: 'ou-regional-manager',
        organisation_id: ORG_COMPANY,
        user_id: 'user-regional-manager',
        workspace_role: 'regional_manager',
        scope_level: 'region',
        region_id: REGION_NORTH,
        status: 'active',
      },
      {
        id: 'ou-personal',
        organisation_id: ORG_PERSONAL,
        user_id: 'user-personal',
        workspace_role: 'personal_originator',
        scope_level: 'workspace_hq',
        status: 'active',
      },
    ],
    simulation_scenarios: [
      {
        id: 'consultant-reassign',
        transactionId: 'tx-consultant',
        actorUserId: 'user-consultant',
        action: 'finance.reassign_processor',
      },
      {
        id: 'consultant-request-documents',
        transactionId: 'tx-consultant',
        actorUserId: 'user-consultant',
        action: 'finance.request_documents',
      },
      {
        id: 'compliance-submit',
        transactionId: 'tx-compliance',
        actorUserId: 'user-compliance',
        action: 'finance.submit_to_banks',
      },
      {
        id: 'compliance-review',
        transactionId: 'tx-compliance',
        actorUserId: 'user-compliance',
        action: 'finance.review_compliance',
      },
      {
        id: 'participant-internal-finance',
        transactionId: 'tx-participant',
        actorUserId: 'user-participant',
        action: 'finance.internal_finance_mutation',
      },
      {
        id: 'participant-upload-documents',
        transactionId: 'tx-participant',
        actorUserId: 'user-participant',
        action: 'finance.upload_documents',
      },
      {
        id: 'processor-bank-feedback',
        transactionId: 'tx-processor',
        actorUserId: 'user-processor',
        action: 'finance.manage_bank_feedback',
      },
      {
        id: 'processor-update-step',
        transactionId: 'tx-processor',
        actorUserId: 'user-processor',
        action: 'finance.update_processing_step',
      },
      {
        id: 'branch-in-branch-reassign',
        transactionId: 'tx-branch-home',
        actorUserId: 'user-branch-manager',
        action: 'finance.reassign_processor',
      },
      {
        id: 'branch-outside-branch-reassign',
        transactionId: 'tx-branch-other',
        actorUserId: 'user-branch-manager',
        action: 'finance.reassign_processor',
      },
      {
        id: 'regional-in-region-action',
        transactionId: 'tx-region-home',
        actorUserId: 'user-regional-manager',
        action: 'finance.submit_to_banks',
      },
      {
        id: 'regional-outside-region-action',
        transactionId: 'tx-region-other',
        actorUserId: 'user-regional-manager',
        action: 'finance.submit_to_banks',
      },
      {
        id: 'personal-owner-workflow',
        transactionId: 'tx-personal',
        actorUserId: 'user-personal',
        action: 'finance.workflow_update',
      },
      {
        id: 'processor-unrelated-branch-mutation',
        transactionId: 'tx-branch-other',
        actorUserId: 'user-processor',
        action: 'finance.manage_bank_feedback',
      },
      {
        id: 'legacy-excluded',
        transactionId: 'tx-legacy-excluded',
        actorUserId: 'user-legacy',
        action: 'finance.upload_documents',
      },
      {
        id: 'manual-review-excluded',
        transactionId: 'tx-manual-review',
        actorUserId: 'user-manual',
        action: 'finance.upload_documents',
      },
    ],
  },
  manualMappings: [
    {
      transactionId: 'tx-legacy-excluded',
      action: 'accepted_unresolved',
      reason: 'Legacy compatibility hold',
    },
    {
      transactionId: 'tx-manual-review',
      action: 'manual_review',
      reason: 'Manual review hold',
    },
  ],
})

assert.equal(report.categories.allowedByCurrent_allowedByCanonical, 10)
assert.equal(report.categories.allowedByCurrent_deniedByCanonical, 3)
assert.equal(report.categories.deniedByCurrent_allowedByCanonical, 0)
assert.equal(report.categories.deniedByCurrent_deniedByCanonical, 3)
assert.equal(report.categories.expectedWriteTightening, 3)
assert.equal(report.categories.expectedCanonicalExpansion, 0)
assert.equal(report.categories.unexpectedAllow, 0)
assert.equal(report.categories.unexpectedDeny, 0)
assert.equal(report.categories.intentionalChanges, 3)
assert.equal(report.categories.excludedLegacyWriteCompat, 1)
assert.equal(report.categories.manualReviewWriteExcluded, 1)
assert.equal(report.categories.canonicalReadyWriteAllowed, 8)
assert.equal(report.categories.canonicalReadyWriteDenied, 6)

assert.deepEqual(report.mismatchReporting.unexpectedAllowByAction, {})
assert.deepEqual(report.mismatchReporting.unexpectedDenyByAction, {})
assert.equal(report.mismatchReporting.unexpectedAllowSamples.length, 0)
assert.equal(report.mismatchReporting.unexpectedDenySamples.length, 0)
assert.equal(report.mismatchReporting.expectedWriteTighteningSamples.length, 3)

assert.equal(outcomeById(report, 'consultant-reassign').finalClassification, 'expectedWriteTightening')
assert.equal(outcomeById(report, 'consultant-request-documents').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'compliance-submit').finalClassification, 'expectedWriteTightening')
assert.equal(outcomeById(report, 'compliance-review').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'participant-internal-finance').finalClassification, 'expectedWriteTightening')
assert.equal(outcomeById(report, 'participant-upload-documents').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'processor-bank-feedback').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'processor-update-step').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'branch-in-branch-reassign').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'branch-outside-branch-reassign').finalClassification, 'canonicalReadyWriteDenied')
assert.equal(outcomeById(report, 'regional-in-region-action').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'regional-outside-region-action').finalClassification, 'canonicalReadyWriteDenied')
assert.equal(outcomeById(report, 'personal-owner-workflow').finalClassification, 'canonicalReadyWriteAllowed')
assert.equal(outcomeById(report, 'processor-unrelated-branch-mutation').finalClassification, 'canonicalReadyWriteDenied')
assert.equal(outcomeById(report, 'legacy-excluded').finalClassification, 'excludedLegacyWriteCompat')
assert.equal(outcomeById(report, 'manual-review-excluded').finalClassification, 'manualReviewWriteExcluded')

assert.equal(outcomeById(report, 'consultant-reassign').canonicalAllowed, false)
assert.equal(outcomeById(report, 'compliance-submit').canonicalAllowed, false)
assert.equal(outcomeById(report, 'participant-internal-finance').canonicalAllowed, false)
assert.equal(outcomeById(report, 'processor-unrelated-branch-mutation').canonicalAllowed, false)
assert.equal(outcomeById(report, 'regional-outside-region-action').canonicalAllowed, false)
assert.equal(outcomeById(report, 'processor-bank-feedback').canonicalAllowed, true)
assert.equal(outcomeById(report, 'compliance-review').canonicalAllowed, true)
assert.equal(outcomeById(report, 'personal-owner-workflow').canonicalAllowed, true)

console.log('Phase 5C bond write simulation tests passed')
