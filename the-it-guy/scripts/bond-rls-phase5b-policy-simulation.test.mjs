import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const now = new Date().toISOString()
const ORG_COMPANY = 'ws-company'
const ORG_PERSONAL = 'ws-personal'
const REGION_NORTH = 'region-north'
const REGION_SOUTH = 'region-south'
const UNIT_ALPHA = 'unit-alpha'
const UNIT_BETA = 'unit-beta'
const UNIT_BRANCH = 'unit-branch'

function tempFile(prefix) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return path.join(os.tmpdir(), `${prefix}-${unique}.json`)
}

function parseReportOutput(output, label = 'phase5b simulation') {
  const match = output.match(/\{[\s\S]*\}\s*$/)
  if (!match) {
    throw new Error(`${label}: missing JSON output`)
  }
  return JSON.parse(match[0])
}

function runPhase5bSimulation({ payload, manualMappings = [], exclusions = [] }) {
  const inputPath = tempFile('bond-phase5b-input')
  const mappingPath = tempFile('bond-phase5b-manual')
  const exclusionPath = tempFile('bond-phase5b-exclusions')

  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2))
  fs.writeFileSync(mappingPath, JSON.stringify(manualMappings, null, 2))
  fs.writeFileSync(exclusionPath, JSON.stringify(exclusions, null, 2))

  const command = [
    `BOND_RLS_SHADOW_INPUT=${inputPath}`,
    `BOND_ASSIGNMENT_MANUAL_MAPPING=${mappingPath}`,
    `BOND_RLS_CUTOVER_EXCLUSIONS=${exclusionPath}`,
    'node scripts/bond-rls-phase5b-policy-simulation.mjs',
  ].join(' ')

  const output = execSync(command, { cwd: process.cwd(), encoding: 'utf8' })
  return parseReportOutput(output, 'phase5b policy simulation')
}

function assertNoUnexpected(report, message) {
  assert.equal(report.categories.unexpectedAllow, 0, `${message}: expected unexpectedAllow = 0`)
  assert.equal(report.categories.unexpectedDeny, 0, `${message}: expected unexpectedDeny = 0`)
}

const authUsers = [
  { id: 'user-consultant', email: 'consultant@example.test', created_at: now, updated_at: now },
  { id: 'user-processor', email: 'processor@example.test', created_at: now, updated_at: now },
  { id: 'user-branch', email: 'branch-manager@example.test', created_at: now, updated_at: now },
  { id: 'user-regional', email: 'regional@example.test', created_at: now, updated_at: now },
  { id: 'user-hq', email: 'hq@example.test', created_at: now, updated_at: now },
  { id: 'user-compliance', email: 'compliance@example.test', created_at: now, updated_at: now },
  { id: 'user-participant', email: 'participant@example.test', created_at: now, updated_at: now },
  { id: 'user-personal', email: 'personal@example.test', created_at: now, updated_at: now },
  { id: 'user-legacy', email: 'legacy@example.test', created_at: now, updated_at: now },
]

const organisations = [
  { id: ORG_COMPANY, workspace_kind: 'bond_company', type: 'bond_originator' },
  { id: ORG_PERSONAL, workspace_kind: 'personal_originator', type: 'bond_originator' },
]

const consultantMembership = {
  id: 'ou-consultant',
  organisation_id: ORG_COMPANY,
  user_id: 'user-consultant',
  workspace_role: 'consultant',
  scope_level: 'assigned',
  email: 'consultant@example.test',
  status: 'active',
}

const processorMembership = {
  id: 'ou-processor',
  organisation_id: ORG_COMPANY,
  user_id: 'user-processor',
  workspace_role: 'processor',
  scope_level: 'assigned',
  email: 'processor@example.test',
  status: 'active',
}

const branchMembership = {
  id: 'ou-branch',
  organisation_id: ORG_COMPANY,
  user_id: 'user-branch',
  workspace_role: 'branch_manager',
  scope_level: 'branch',
  workspace_unit_id: UNIT_BRANCH,
  email: 'branch-manager@example.test',
  status: 'active',
}

const regionalMembership = {
  id: 'ou-regional',
  organisation_id: ORG_COMPANY,
  user_id: 'user-regional',
  workspace_role: 'regional_manager',
  scope_level: 'region',
  region_id: REGION_NORTH,
  email: 'regional@example.test',
  status: 'active',
}

const hqMembership = {
  id: 'ou-hq',
  organisation_id: ORG_COMPANY,
  user_id: 'user-hq',
  workspace_role: 'hq_manager',
  scope_level: 'workspace_hq',
  email: 'hq@example.test',
  status: 'active',
}

const complianceMembership = {
  id: 'ou-compliance',
  organisation_id: ORG_COMPANY,
  user_id: 'user-compliance',
  workspace_role: 'compliance',
  scope_level: 'assigned',
  email: 'compliance@example.test',
  status: 'active',
}

const personalMembership = {
  id: 'ou-personal',
  organisation_id: ORG_PERSONAL,
  user_id: 'user-personal',
  workspace_role: 'personal_originator',
  scope_level: 'workspace_hq',
  email: 'personal@example.test',
  status: 'active',
}

const consultantAccessReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-consultant',
        bond_workspace_id: ORG_COMPANY,
        primary_bond_consultant_user_id: 'user-consultant',
      },
    ],
    transaction_participants: [],
    transaction_role_players: [],
    organisations,
    authUsers,
    organisation_users: [consultantMembership],
  },
})

assertNoUnexpected(consultantAccessReport, 'Consultant canonical assignment parity')
assert.equal(consultantAccessReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(consultantAccessReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(consultantAccessReport.categories.currentAllows_phase5bDenies, 0)
assert.equal(consultantAccessReport.categories.currentDenies_phase5bAllows, 0)
assert.equal(consultantAccessReport.scenarioCoverage.consultant, true)

const processorAccessReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-processor',
        bond_workspace_id: ORG_COMPANY,
        assigned_bond_processor_user_id: 'user-processor',
      },
    ],
    organisations,
    authUsers,
    organisation_users: [processorMembership],
  },
})

assertNoUnexpected(processorAccessReport, 'Processor canonical assignment parity')
assert.equal(processorAccessReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(processorAccessReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(processorAccessReport.scenarioCoverage.processor, true)

const branchManagerAccessReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-branch-scope',
        bond_workspace_id: ORG_COMPANY,
        bond_workspace_unit_id: UNIT_BRANCH,
      },
    ],
    organisations,
    authUsers,
    organisation_users: [branchMembership],
  },
})

assertNoUnexpected(branchManagerAccessReport, 'Branch manager scoped workflow access parity')
assert.equal(branchManagerAccessReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(branchManagerAccessReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(branchManagerAccessReport.scenarioCoverage.branch_manager, true)

const regionalManagerReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-regional-home',
        bond_workspace_id: ORG_COMPANY,
        bond_region_id: REGION_NORTH,
      },
      {
        id: 'tx-regional-other',
        bond_workspace_id: ORG_COMPANY,
        bond_region_id: REGION_SOUTH,
      },
    ],
    organisations,
    authUsers,
    organisation_users: [regionalMembership],
  },
})

assertNoUnexpected(regionalManagerReport, 'Regional manager scope parity')
assert.equal(regionalManagerReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(regionalManagerReport.categories.currentDenies_phase5bDenies, 3)
assert.equal(regionalManagerReport.scenarioCoverage.regional_manager, true)

const hqAccessReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-hq',
        bond_workspace_id: ORG_COMPANY,
      },
    ],
    organisations,
    authUsers,
    organisation_users: [hqMembership],
  },
})

assertNoUnexpected(hqAccessReport, 'HQ workspace parity')
assert.equal(hqAccessReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(hqAccessReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(hqAccessReport.scenarioCoverage.hq_manager, true)

const complianceAccessReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-compliance',
        bond_workspace_id: ORG_COMPANY,
        assigned_bond_compliance_user_id: 'user-compliance',
      },
    ],
    organisations,
    authUsers,
    organisation_users: [complianceMembership],
  },
})

assertNoUnexpected(complianceAccessReport, 'Compliance assignment parity')
assert.equal(complianceAccessReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(complianceAccessReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(complianceAccessReport.scenarioCoverage.compliance, true)

const participantAccessReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-participant',
        bond_workspace_id: ORG_COMPANY,
        transaction_participants: [
          {
            id: 'tp-1',
            transaction_id: 'tx-participant',
            role_type: 'processor',
            user_id: 'user-participant',
            participant_email: 'participant@example.test',
            status: 'active',
          },
        ],
      },
    ],
    organisations,
    authUsers,
    organisation_users: [],
  },
})

assertNoUnexpected(participantAccessReport, 'Transaction participant parity')
assert.equal(participantAccessReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(participantAccessReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(participantAccessReport.scenarioCoverage.transaction_participant, true)

const legacyAcceptedReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-legacy-accepted',
        bond_workspace_id: ORG_COMPANY,
        primary_bond_consultant_user_id: 'user-consultant',
      },
    ],
    organisations,
    authUsers,
    organisation_users: [consultantMembership],
  },
  manualMappings: [
    {
      transactionId: 'tx-legacy-accepted',
      action: 'accepted_unresolved',
      reason: 'Accepted unresolved legacy hold',
      confidence: 'manual_reviewed',
      reviewedBy: 'qa',
      reviewedAt: '2026-05-26',
    },
  ],
  exclusions: [],
})

assertNoUnexpected(legacyAcceptedReport, 'Accepted unresolved legacy fallback parity')
assert.equal(legacyAcceptedReport.categories.acceptedLegacyExcluded, 2)
assert.equal(legacyAcceptedReport.categories.excludedLegacyStillAllowed, 1)
assert.equal(legacyAcceptedReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(legacyAcceptedReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(legacyAcceptedReport.categories.canonicalReadyEnforced, 0)

const manualReviewReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-manual-review',
        bond_workspace_id: ORG_COMPANY,
        assigned_bond_processor_user_id: 'user-processor',
      },
    ],
    organisations,
    authUsers,
    organisation_users: [processorMembership],
  },
  manualMappings: [],
  exclusions: [
    {
      transaction_id: 'tx-manual-review',
      exclusion_type: 'manual_review',
      reason: 'Requires manual review before canonical',
      active: true,
    },
  ],
})

assertNoUnexpected(manualReviewReport, 'Manual review exclusion fallback parity')
assert.equal(manualReviewReport.categories.manualReviewExcluded, 2)
assert.equal(manualReviewReport.categories.excludedLegacyStillAllowed, 1)
assert.equal(manualReviewReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(manualReviewReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(manualReviewReport.categories.canonicalReadyEnforced, 0)

const unrelatedDeniedReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-unrelated-denied',
        bond_workspace_id: ORG_COMPANY,
      },
    ],
    organisations,
    authUsers,
    organisation_users: [],
  },
})

assertNoUnexpected(unrelatedDeniedReport, 'Unrelated user denial parity')
assert.equal(unrelatedDeniedReport.categories.currentAllows_phase5bAllows, 0)
assert.equal(unrelatedDeniedReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(unrelatedDeniedReport.categories.currentAllows_phase5bDenies, 0)
assert.equal(unrelatedDeniedReport.categories.currentDenies_phase5bAllows, 0)
assert.equal(unrelatedDeniedReport.scenarioCoverage.unrelated_user, true)

const personalOriginatorReport = runPhase5bSimulation({
  payload: {
    transactions: [
      {
        id: 'tx-personal-originator',
        bond_workspace_id: ORG_PERSONAL,
        assigned_bond_originator_email: 'personal@example.test',
      },
    ],
    organisations,
    authUsers,
    organisation_users: [personalMembership],
  },
})

assertNoUnexpected(personalOriginatorReport, 'Personal originator fallback parity')
assert.equal(personalOriginatorReport.categories.currentAllows_phase5bAllows, 1)
assert.equal(personalOriginatorReport.categories.currentDenies_phase5bDenies, 1)
assert.equal(personalOriginatorReport.scenarioCoverage.independent_originator, true)

console.log('bond RLS phase 5b policy simulation test passed')
