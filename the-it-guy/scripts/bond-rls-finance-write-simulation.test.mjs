import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const now = new Date().toISOString()
const ORG_COMPANY = 'ws-phase5c-company'
const ORG_PERSONAL = 'ws-phase5c-personal'
const REGION_NORTH = 'region-north'
const REGION_SOUTH = 'region-south'
const UNIT_ALPHA = 'unit-alpha'
const UNIT_BETA = 'unit-beta'

const organisations = [
  { id: ORG_COMPANY, workspace_kind: 'bond_company', type: 'bond_originator' },
  { id: ORG_PERSONAL, workspace_kind: 'personal_originator', type: 'bond_originator' },
]

const authUsers = [
  { id: 'user-consultant', email: 'consultant@example.test', created_at: now, updated_at: now },
  { id: 'user-processor', email: 'processor@example.test', created_at: now, updated_at: now },
  { id: 'user-processor-scope', email: 'processor-scope@example.test', created_at: now, updated_at: now },
  { id: 'user-processor-out', email: 'processor-out@example.test', created_at: now, updated_at: now },
  { id: 'user-compliance', email: 'compliance@example.test', created_at: now, updated_at: now },
  { id: 'user-branch-manager', email: 'branch-manager@example.test', created_at: now, updated_at: now },
  { id: 'user-regional-manager', email: 'regional-manager@example.test', created_at: now, updated_at: now },
  { id: 'user-hq-manager', email: 'hq-manager@example.test', created_at: now, updated_at: now },
  { id: 'user-participant', email: 'participant@example.test', created_at: now, updated_at: now },
  { id: 'user-personal-owner', email: 'personal-owner@example.test', created_at: now, updated_at: now },
  { id: 'user-unrelated', email: 'unrelated-user@example.test', created_at: now, updated_at: now },
]

const memberships = [
  {
    id: 'ou-consultant',
    organisation_id: ORG_COMPANY,
    user_id: 'user-consultant',
    workspace_role: 'consultant',
    scope_level: 'assigned',
    email: 'consultant@example.test',
    status: 'active',
  },
  {
    id: 'ou-processor',
    organisation_id: ORG_COMPANY,
    user_id: 'user-processor',
    workspace_role: 'processor',
    scope_level: 'assigned',
    email: 'processor@example.test',
    status: 'active',
  },
  {
    id: 'ou-processor-scope',
    organisation_id: ORG_COMPANY,
    user_id: 'user-processor-scope',
    workspace_role: 'processor',
    scope_level: 'team',
    workspace_unit_id: UNIT_ALPHA,
    email: 'processor-scope@example.test',
    status: 'active',
  },
  {
    id: 'ou-processor-out',
    organisation_id: ORG_COMPANY,
    user_id: 'user-processor-out',
    workspace_role: 'processor',
    scope_level: 'team',
    workspace_unit_id: UNIT_BETA,
    email: 'processor-out@example.test',
    status: 'active',
  },
  {
    id: 'ou-compliance',
    organisation_id: ORG_COMPANY,
    user_id: 'user-compliance',
    workspace_role: 'compliance',
    scope_level: 'workspace_hq',
    email: 'compliance@example.test',
    status: 'active',
  },
  {
    id: 'ou-branch-manager',
    organisation_id: ORG_COMPANY,
    user_id: 'user-branch-manager',
    workspace_role: 'branch_manager',
    scope_level: 'branch',
    workspace_unit_id: UNIT_ALPHA,
    email: 'branch-manager@example.test',
    status: 'active',
  },
  {
    id: 'ou-regional-manager',
    organisation_id: ORG_COMPANY,
    user_id: 'user-regional-manager',
    workspace_role: 'regional_manager',
    scope_level: 'region',
    region_id: REGION_NORTH,
    email: 'regional-manager@example.test',
    status: 'active',
  },
  {
    id: 'ou-hq-manager',
    organisation_id: ORG_COMPANY,
    user_id: 'user-hq-manager',
    workspace_role: 'hq_manager',
    scope_level: 'workspace_hq',
    email: 'hq-manager@example.test',
    status: 'active',
  },
  {
    id: 'ou-personal-owner',
    organisation_id: ORG_PERSONAL,
    user_id: 'user-personal-owner',
    workspace_role: 'owner',
    scope_level: 'workspace_hq',
    email: 'personal-owner@example.test',
    status: 'active',
  },
]

function parseReportOutput(output, label = 'phase5c simulation') {
  const match = output.match(/\{[\s\S]*\}\s*$/)
  if (!match) {
    throw new Error(`Could not parse ${label} output`)
  }
  return JSON.parse(match[0])
}

function runPhase5cSimulation({ payload, actions = [] }) {
  const inputPath = path.join(os.tmpdir(), `bond-phase5c-write-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
  const manualPath = path.join(os.tmpdir(), `bond-phase5c-manual-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
  const exclusionPath = path.join(os.tmpdir(), `bond-phase5c-exclusion-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)

  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2))
  fs.writeFileSync(manualPath, JSON.stringify(payload?.manualMappings || [], null, 2))
  fs.writeFileSync(exclusionPath, JSON.stringify(payload?.exclusions || [], null, 2))

  const command = [
    `BOND_RLS_SHADOW_INPUT=${inputPath}`,
    `BOND_ASSIGNMENT_MANUAL_MAPPING=${manualPath}`,
    `BOND_RLS_CUTOVER_EXCLUSIONS=${exclusionPath}`,
    actions.length ? `BOND_FINANCE_WRITE_ACTIONS=${actions.join(',')}` : '',
    'node scripts/bond-rls-finance-write-simulation.mjs',
  ].filter(Boolean).join(' ')

  const output = execSync(command, { cwd: process.cwd(), encoding: 'utf8' })
  return parseReportOutput(output, actions.join(','))
}

const baseUsers = {
  consultant: ['user-consultant'],
  processor: ['user-processor'],
  processorScope: ['user-processor-scope'],
  processorOut: ['user-processor-out'],
  compliance: ['user-compliance'],
  branchManager: ['user-branch-manager'],
  regionalManager: ['user-regional-manager'],
  hqManager: ['user-hq-manager'],
  participant: ['user-participant'],
  personal: ['user-personal-owner'],
  unrelated: ['user-unrelated'],
}

function assertActionSummary(report, action, expectation = {}) {
  const actual = report.actionSummaries?.[action] || {}
  for (const [key, expected] of Object.entries(expectation)) {
    assert.equal(actual[key], expected, `${action} => expected ${key}=${expected}`)
  }
}

const consultantRowPayload = {
  transactions: [
    {
      id: 'tx-consultant-can-request',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
      primary_bond_consultant_user_id: 'user-consultant',
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}

const consultantCanRequest = runPhase5cSimulation({
  payload: consultantRowPayload,
  actions: ['finance.request_documents'],
})
assertActionSummary(consultantCanRequest, 'finance.request_documents', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  allowedByCurrent_deniedByCanonicalModel: 0,
  deniedByCurrent_allowedByCanonicalModel: 0,
  deniedByCurrent_deniedByCanonicalModel: 0,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const consultantCannotReassignProcessor = runPhase5cSimulation({
  payload: consultantRowPayload,
  actions: ['finance.reassign_processor'],
})
assertActionSummary(consultantCannotReassignProcessor, 'finance.reassign_processor', {
  allowedByCurrent_allowedByCanonicalModel: 0,
  deniedByCurrent_deniedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const processorStepPayload = {
  transactions: [
    {
      id: 'tx-processor-step',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
      assigned_bond_processor_user_id: 'user-processor',
      transaction_subprocess_steps: [
        {
          id: 'step-processor',
          transaction_id: 'tx-processor-step',
          process_type: 'finance',
          step_key: 'application_in_progress',
        },
      ],
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}

const processorCanCompleteStep = runPhase5cSimulation({
  payload: processorStepPayload,
  actions: ['finance.complete_step'],
})
assertActionSummary(processorCanCompleteStep, 'finance.complete_step', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const processorBankPayload = {
  transactions: [
    {
      id: 'tx-processor-bank-in-scope',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
      assigned_bond_processor_user_id: 'user-processor-scope',
      transaction_subprocess_steps: [
        {
          id: 'step-1',
          transaction_id: 'tx-processor-bank-in-scope',
          process_type: 'finance',
          step_key: 'bank_feedback_received',
        },
      ],
    },
    {
      id: 'tx-processor-bank-out-of-scope',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_BETA,
      bond_region_id: REGION_SOUTH,
      assigned_bond_processor_user_id: 'user-processor-out',
      transaction_subprocess_steps: [
        {
          id: 'step-2',
          transaction_id: 'tx-processor-bank-out-of-scope',
          process_type: 'finance',
          step_key: 'bank_feedback_received',
        },
      ],
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}
const processorBankManaged = runPhase5cSimulation({
  payload: {
    ...processorBankPayload,
    transactions: processorBankPayload.transactions.filter((row) => row.id === 'tx-processor-bank-in-scope'),
    authUsers,
    organisation_users: memberships,
  },
  actions: ['finance.manage_bank_feedback'],
})
assertActionSummary(processorBankManaged, 'finance.manage_bank_feedback', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  deniedByCurrent_deniedByCanonicalModel: 0,
  unexpectedDeny: 0,
  unexpectedAllow: 0,
})

const processorBankDenied = runPhase5cSimulation({
  payload: {
    ...processorBankPayload,
    transactions: processorBankPayload.transactions.filter((row) => row.id === 'tx-processor-bank-out-of-scope'),
    authUsers,
    organisation_users: memberships,
  },
  actions: ['finance.manage_bank_feedback'],
})
assertActionSummary(processorBankDenied, 'finance.manage_bank_feedback', {
  allowedByCurrent_allowedByCanonicalModel: 0,
  deniedByCurrent_deniedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const compliancePayload = {
  transactions: [
    {
      id: 'tx-compliance-review',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
      assigned_bond_compliance_user_id: 'user-compliance',
      transaction_subprocess_steps: [
        {
          id: 'step-compliance',
          transaction_id: 'tx-compliance-review',
          process_type: 'finance',
          step_key: 'compliance_review_pending',
        },
      ],
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}
const complianceReview = runPhase5cSimulation({
  payload: compliancePayload,
  actions: ['finance.review_compliance'],
})
assertActionSummary(complianceReview, 'finance.review_compliance', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const complianceSubmit = runPhase5cSimulation({
  payload: compliancePayload,
  actions: ['finance.submit_to_banks'],
})
assertActionSummary(complianceSubmit, 'finance.submit_to_banks', {
  allowedByCurrent_allowedByCanonicalModel: 0,
  deniedByCurrent_deniedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const branchPayload = {
  transactions: [
    {
      id: 'tx-branch-reassign',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_SOUTH,
    },
    {
      id: 'tx-branch-no-reassign',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_BETA,
      bond_region_id: REGION_SOUTH,
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}
const branchCanReassign = runPhase5cSimulation({
  payload: {
    ...branchPayload,
    transactions: branchPayload.transactions.filter((row) => row.id === 'tx-branch-reassign'),
  },
  actions: ['finance.reassign_consultant'],
})
assertActionSummary(branchCanReassign, 'finance.reassign_consultant', {
  allowedByCurrent_allowedByCanonicalModel: 1,
})
const branchCannotReassign = runPhase5cSimulation({
  payload: {
    ...branchPayload,
    transactions: branchPayload.transactions.filter((row) => row.id === 'tx-branch-no-reassign'),
  },
  actions: ['finance.reassign_consultant'],
})
assertActionSummary(branchCannotReassign, 'finance.reassign_consultant', {
  deniedByCurrent_deniedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const regionalPayload = {
  transactions: [
    {
      id: 'tx-regional-allowed',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
    },
    {
      id: 'tx-regional-denied',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_SOUTH,
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}
const regionalAllowed = runPhase5cSimulation({
  payload: {
    ...regionalPayload,
    transactions: regionalPayload.transactions.filter((row) => row.id === 'tx-regional-allowed'),
  },
  actions: ['finance.escalate'],
})
assertActionSummary(regionalAllowed, 'finance.escalate', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})
const regionalDenied = runPhase5cSimulation({
  payload: {
    ...regionalPayload,
    transactions: regionalPayload.transactions.filter((row) => row.id === 'tx-regional-denied'),
  },
  actions: ['finance.escalate'],
})
assertActionSummary(regionalDenied, 'finance.escalate', {
  deniedByCurrent_deniedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const hqPayload = {
  transactions: [
    {
      id: 'tx-hq-across-region',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_BETA,
      bond_region_id: REGION_SOUTH,
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}
const hqCanReassign = runPhase5cSimulation({
  payload: hqPayload,
  actions: ['finance.reassign_processor'],
})
assertActionSummary(hqCanReassign, 'finance.reassign_processor', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const participantPayload = {
  transactions: [
    {
      id: 'tx-participant',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
      transaction_participants: [
        {
          id: 'p-1',
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
}
const participantCanView = runPhase5cSimulation({
  payload: participantPayload,
  actions: ['finance.view'],
})
assertActionSummary(participantCanView, 'finance.view', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})
const participantCannotMutate = runPhase5cSimulation({
  payload: participantPayload,
  actions: ['finance.update_step'],
})
assertActionSummary(participantCannotMutate, 'finance.update_step', {
  deniedByCurrent_deniedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const excludedPayload = {
  transactions: [
    {
      id: 'tx-accepted-unresolved',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
      primary_bond_consultant_user_id: 'user-consultant',
    },
    {
      id: 'tx-manual-review',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
      assigned_bond_processor_user_id: 'user-processor',
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
  manualMappings: [
    {
      transactionId: 'tx-accepted-unresolved',
      action: 'accepted_unresolved',
      reason: 'legacy manual review hold',
      reviewedBy: 'qa',
      reviewedAt: now,
      confidence: 'manual_reviewed',
    },
  ],
  exclusions: [
    {
      transaction_id: 'tx-manual-review',
      exclusion_type: 'manual_review',
      reason: 'Requires manual review before strict enforcement',
      active: true,
    },
  ],
}
const excludedCompatibility = runPhase5cSimulation({
  payload: excludedPayload,
  actions: ['finance.complete_step'],
})
assert.equal(excludedCompatibility.categories.excludedLegacyWriteCompat, 2)
assert.equal(excludedCompatibility.categories.manualReviewWriteExcluded, 1)

const unrelatedPayload = {
  transactions: [
    {
      id: 'tx-unrelated',
      bond_workspace_id: ORG_COMPANY,
      bond_workspace_unit_id: UNIT_ALPHA,
      bond_region_id: REGION_NORTH,
    },
  ],
  organisations,
  authUsers,
  organisation_users: [],
}
const unrelatedDenied = runPhase5cSimulation({
  payload: unrelatedPayload,
  actions: ['finance.view', 'finance.submit_to_banks'],
})
assertActionSummary(unrelatedDenied, 'finance.submit_to_banks', {
  deniedByCurrent_deniedByCanonicalModel: 1,
  unexpectedAllow: 0,
  unexpectedDeny: 0,
})

const personalPayload = {
  transactions: [
    {
      id: 'tx-personal-originator',
      bond_workspace_id: ORG_PERSONAL,
      bond_workspace_unit_id: UNIT_ALPHA,
      assigned_bond_originator_email: 'personal-owner@example.test',
    },
  ],
  organisations,
  authUsers,
  organisation_users: memberships,
}
const personalAllows = runPhase5cSimulation({
  payload: personalPayload,
  actions: ['finance.request_documents'],
})
assertActionSummary(personalAllows, 'finance.request_documents', {
  allowedByCurrent_allowedByCanonicalModel: 1,
  deniedByCurrent_deniedByCanonicalModel: 0,
})

console.log('bond rls finance write simulation test passed')
