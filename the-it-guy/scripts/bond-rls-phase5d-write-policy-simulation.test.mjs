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

function parseReportOutput(output, label = 'phase5d write simulation') {
  const match = output.match(/\{[\s\S]*\}\s*$/)
  if (!match) {
    throw new Error(`${label}: missing JSON output`)
  }
  return JSON.parse(match[0])
}

function runPhase5dSimulation({ payload, manualMappings = [], exclusions = [] }) {
  const inputPath = tempFile('bond-phase5d-input')
  const mappingPath = tempFile('bond-phase5d-manual')
  const exclusionPath = tempFile('bond-phase5d-exclusions')

  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2))
  fs.writeFileSync(mappingPath, JSON.stringify(manualMappings, null, 2))
  fs.writeFileSync(exclusionPath, JSON.stringify(exclusions, null, 2))

  const command = [
    `BOND_RLS_SHADOW_INPUT=${inputPath}`,
    `BOND_ASSIGNMENT_MANUAL_MAPPING=${mappingPath}`,
    `BOND_RLS_CUTOVER_EXCLUSIONS=${exclusionPath}`,
    'node scripts/bond-rls-phase5d-write-policy-simulation.mjs',
  ].join(' ')

  const output = execSync(command, { cwd: process.cwd(), encoding: 'utf8' })
  return parseReportOutput(output)
}

function outcomeById(report, id) {
  const outcome = report.scenarioOutcomes.find((entry) => entry.scenarioId === id)
  assert.ok(outcome, `Missing scenario outcome for ${id}`)
  return outcome
}

const report = runPhase5dSimulation({
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
        id: 'tx-hq',
        bond_workspace_id: ORG_COMPANY,
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
      { id: 'user-hq-manager', email: 'hq@example.test' },
      { id: 'user-personal', email: 'personal@example.test' },
      { id: 'user-participant', email: 'participant@example.test' },
      { id: 'user-legacy', email: 'legacy@example.test' },
      { id: 'user-manual', email: 'manual@example.test' },
      { id: 'user-unrelated', email: 'unrelated@example.test' },
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
        id: 'ou-hq',
        organisation_id: ORG_COMPANY,
        user_id: 'user-hq-manager',
        workspace_role: 'hq_manager',
        scope_level: 'workspace_hq',
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
        id: 'consultant-request-documents',
        transactionId: 'tx-consultant',
        actorUserId: 'user-consultant',
        action: 'finance.request_documents',
      },
      {
        id: 'consultant-reassign',
        transactionId: 'tx-consultant',
        actorUserId: 'user-consultant',
        action: 'finance.reassign_processor',
      },
      {
        id: 'processor-update-step',
        transactionId: 'tx-processor',
        actorUserId: 'user-processor',
        action: 'finance.update_processing_step',
        stepKey: 'bank_application_pack',
      },
      {
        id: 'processor-bank-feedback',
        transactionId: 'tx-processor',
        actorUserId: 'user-processor',
        action: 'finance.manage_bank_feedback',
      },
      {
        id: 'processor-unrelated-branch',
        transactionId: 'tx-branch-other',
        actorUserId: 'user-processor',
        action: 'finance.workflow_update',
      },
      {
        id: 'compliance-review',
        transactionId: 'tx-compliance',
        actorUserId: 'user-compliance',
        action: 'finance.review_compliance',
        stepKey: 'compliance_final_review',
      },
      {
        id: 'compliance-submit',
        transactionId: 'tx-compliance',
        actorUserId: 'user-compliance',
        action: 'finance.submit_to_banks',
      },
      {
        id: 'branch-in-branch',
        transactionId: 'tx-branch-home',
        actorUserId: 'user-branch-manager',
        action: 'finance.workflow_update',
      },
      {
        id: 'branch-outside-branch',
        transactionId: 'tx-branch-other',
        actorUserId: 'user-branch-manager',
        action: 'finance.workflow_update',
      },
      {
        id: 'regional-in-region',
        transactionId: 'tx-region-home',
        actorUserId: 'user-regional-manager',
        action: 'finance.workflow_update',
      },
      {
        id: 'regional-outside-region',
        transactionId: 'tx-region-other',
        actorUserId: 'user-regional-manager',
        action: 'finance.workflow_update',
      },
      {
        id: 'hq-workspace',
        transactionId: 'tx-hq',
        actorUserId: 'user-hq-manager',
        action: 'finance.workflow_update',
      },
      {
        id: 'participant-internal-finance',
        transactionId: 'tx-participant',
        actorUserId: 'user-participant',
        action: 'finance.internal_finance_mutation',
      },
      {
        id: 'personal-owner-workflow',
        transactionId: 'tx-personal',
        actorUserId: 'user-personal',
        action: 'finance.workflow_update',
      },
      {
        id: 'accepted-legacy-excluded',
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
      {
        id: 'unrelated-user-denied',
        transactionId: 'tx-consultant',
        actorUserId: 'user-unrelated',
        action: 'finance.workflow_update',
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

assert.equal(report.categories.unexpectedAllow, 0)
assert.equal(report.categories.unexpectedDeny, 0)
assert.ok(report.categories.expectedWriteTightening > 0)
assert.equal(report.categories.manualReviewWriteExcluded, 1)
assert.equal(report.categories.phase5dLegacyExcluded, 1)

assert.equal(outcomeById(report, 'consultant-request-documents').phase5dAllowed, true)
assert.equal(outcomeById(report, 'consultant-reassign').phase5dAllowed, false)
assert.equal(outcomeById(report, 'processor-update-step').phase5dAllowed, true)
assert.equal(outcomeById(report, 'processor-bank-feedback').phase5dAllowed, true)
assert.equal(outcomeById(report, 'processor-unrelated-branch').phase5dAllowed, false)
assert.equal(outcomeById(report, 'compliance-review').phase5dAllowed, true)
assert.equal(outcomeById(report, 'compliance-submit').phase5dAllowed, false)
assert.equal(outcomeById(report, 'branch-in-branch').phase5dAllowed, true)
assert.equal(outcomeById(report, 'branch-outside-branch').phase5dAllowed, false)
assert.equal(outcomeById(report, 'regional-in-region').phase5dAllowed, true)
assert.equal(outcomeById(report, 'regional-outside-region').phase5dAllowed, false)
assert.equal(outcomeById(report, 'hq-workspace').phase5dAllowed, true)
assert.equal(outcomeById(report, 'participant-internal-finance').phase5dAllowed, false)
assert.equal(outcomeById(report, 'personal-owner-workflow').phase5dAllowed, true)
assert.equal(outcomeById(report, 'accepted-legacy-excluded').finalClassification, 'phase5dLegacyExcluded')
assert.equal(outcomeById(report, 'manual-review-excluded').finalClassification, 'manualReviewWriteExcluded')
assert.equal(outcomeById(report, 'unrelated-user-denied').phase5dAllowed, false)

console.log('Phase 5D bond write policy simulation tests passed')
