import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const now = new Date().toISOString()
const payload = {
  transactions: [
    {
      id: 'tx-1',
      bond_workspace_id: 'ws-company',
      bond_region_id: 'region-1',
      bond_workspace_unit_id: 'unit-1',
      primary_bond_consultant_user_id: 'user-consultant',
    },
    {
      id: 'tx-2',
      assigned_bond_originator_email: 'consultant@example.test',
    },
    {
      id: 'tx-3',
    },
    {
      id: 'tx-4',
    },
    {
      id: 'tx-5',
      lifecycle_state: 'active',
      stage: 'Finance Pending',
    },
    {
      id: 'tx-6',
      assigned_bond_originator_email: 'branch-manager@example.test',
    },
    {
      id: 'tx-7',
      bond_workspace_id: 'ws-company',
      primary_bond_consultant_user_id: 'user-consultant',
      assigned_bond_originator_email: 'processor@example.test',
      bond_originator: 'Mismatched Legacy Consultant',
    },
  ],
  transaction_participants: [
    {
      id: 'tp-1',
      transaction_id: 'tx-3',
      role_type: 'processor',
      user_id: 'user-processor',
      participant_email: 'processor@example.test',
      status: 'active',
    },
    {
      id: 'tp-2',
      transaction_id: 'tx-5',
      role_type: 'bond_originator',
      participant_email: 'legacy-no-workspace@example.test',
      status: 'active',
    },
  ],
  transaction_role_players: [
    {
      id: 'trp-1',
      transaction_id: 'tx-4',
      role_type: 'bond_originator',
      user_id: 'user-compliance',
      participant_email: 'compliance@example.test',
      status: 'active',
    },
  ],
  organisations: [
    { id: 'ws-company', workspace_kind: 'bond_company', type: 'bond_originator' },
    { id: 'ws-personal', workspace_kind: 'personal_originator', type: 'bond_originator' },
  ],
  organisation_users: [
    { id: 'ou-owner', organisation_id: 'ws-company', user_id: 'user-owner', workspace_role: 'owner', scope_level: 'workspace_hq', email: 'owner@example.test', status: 'active' },
    { id: 'ou-director', organisation_id: 'ws-company', user_id: 'user-director', workspace_role: 'director', scope_level: 'workspace_hq', email: 'director@example.test', status: 'active' },
    { id: 'ou-hq', organisation_id: 'ws-company', user_id: 'user-hq', workspace_role: 'hq_manager', scope_level: 'workspace_hq', email: 'hq@example.test', status: 'active' },
    { id: 'ou-regional', organisation_id: 'ws-company', user_id: 'user-regional', workspace_role: 'regional_manager', scope_level: 'region', region_id: 'region-1', email: 'regional@example.test', status: 'active' },
    { id: 'ou-branch', organisation_id: 'ws-company', user_id: 'user-branch', workspace_role: 'branch_manager', scope_level: 'branch', workspace_unit_id: 'unit-1', email: 'branch-manager@example.test', status: 'active' },
    { id: 'ou-team', organisation_id: 'ws-company', user_id: 'user-team', workspace_role: 'team_lead', scope_level: 'team', workspace_unit_id: 'unit-1', email: 'team@example.test', status: 'active' },
    { id: 'ou-consultant', organisation_id: 'ws-company', user_id: 'user-consultant', workspace_role: 'consultant', scope_level: 'assigned', email: 'consultant@example.test', status: 'active' },
    { id: 'ou-processor', organisation_id: 'ws-company', user_id: 'user-processor', workspace_role: 'processor', scope_level: 'assigned', email: 'processor@example.test', status: 'active' },
    { id: 'ou-compliance', organisation_id: 'ws-company', user_id: 'user-compliance', workspace_role: 'compliance', scope_level: 'assigned', email: 'compliance@example.test', status: 'active' },
    { id: 'ou-personal', organisation_id: 'ws-personal', user_id: 'user-personal', workspace_role: 'owner', scope_level: 'workspace_hq', email: 'personal@example.test', status: 'active' },
  ],
  authUsers: [
    { id: 'user-owner', email: 'owner@example.test', created_at: now, updated_at: now },
    { id: 'user-director', email: 'director@example.test', created_at: now, updated_at: now },
    { id: 'user-hq', email: 'hq@example.test', created_at: now, updated_at: now },
    { id: 'user-regional', email: 'regional@example.test', created_at: now, updated_at: now },
    { id: 'user-branch', email: 'branch-manager@example.test', created_at: now, updated_at: now },
    { id: 'user-team', email: 'team@example.test', created_at: now, updated_at: now },
    { id: 'user-consultant', email: 'consultant@example.test', created_at: now, updated_at: now },
    { id: 'user-processor', email: 'processor@example.test', created_at: now, updated_at: now },
    { id: 'user-compliance', email: 'compliance@example.test', created_at: now, updated_at: now },
    { id: 'user-personal', email: 'personal@example.test', created_at: now, updated_at: now },
  ],
}

const manualMappings = [
  {
    transactionId: 'tx-5',
    action: 'accepted_unresolved',
    reason: 'Legacy compatibility hold',
    confidence: 'manual_reviewed',
    reviewedBy: 'qa',
    reviewedAt: '2026-05-26',
  },
]

const exclusions = [
  {
    transaction_id: 'tx-6',
    exclusion_type: 'manual_review',
    reason: 'Requires manual scope review',
    active: true,
  },
  {
    transaction_id: 'tx-7',
    exclusion_type: 'legacy_compatibility_required',
    reason: 'Canonical legacy mismatch remains on assignment/originator fallback path.',
    active: true,
  },
]

const tmpInput = path.join(os.tmpdir(), `bond-rls-shadow-input-${Date.now()}.json`)
const tmpManual = path.join(os.tmpdir(), `bond-rls-shadow-manual-${Date.now()}.json`)
const tmpExclusions = path.join(os.tmpdir(), `bond-rls-shadow-exclusions-${Date.now()}.json`)
fs.writeFileSync(tmpInput, JSON.stringify(payload, null, 2))
fs.writeFileSync(tmpManual, JSON.stringify(manualMappings, null, 2))
fs.writeFileSync(tmpExclusions, JSON.stringify(exclusions, null, 2))

const output = execSync(
  [
    `BOND_RLS_SHADOW_INPUT=${tmpInput}`,
    `BOND_ASSIGNMENT_MANUAL_MAPPING=${tmpManual}`,
    `BOND_RLS_CUTOVER_EXCLUSIONS=${tmpExclusions}`,
    'node scripts/bond-rls-shadow-access-report.mjs',
  ].join(' '),
  { cwd: process.cwd(), encoding: 'utf8' },
)

const match = output.match(/\{[\s\S]*\}\s*$/)
if (!match) throw new Error('Could not parse report JSON output.')

const report = JSON.parse(match[0])
assert.equal(report.transactionCount, 7)
assert.ok(report.userScenarioCount >= 10)
assert.ok(report.categories.currentAllows_canonicalAllows > 0)
assert.ok(report.categories.excludedAcceptedLegacy > 0)
assert.ok(report.categories.manualReviewExcluded > 0)
assert.ok(report.categories.excludedLegacyStillAllowed > 0)
assert.equal(report.categories.unexpectedDeny, 0)
assert.equal(report.categories.unexpectedAllow, 0)
assert.equal(report.scenarioCoverage.consultant, true)
assert.equal(report.scenarioCoverage.processor, true)
assert.equal(report.scenarioCoverage.compliance, true)
assert.equal(report.scenarioCoverage.unrelated_user, true)
assert.ok(
  report.samples.excludedLegacyStillAllowed.some(
    (entry) =>
      entry.transactionId === 'tx-7' &&
      entry.actorUserId === 'user-processor' &&
      entry.exclusionStatus?.exclusionType === 'legacy_compatibility_required',
  ),
)

console.log('bond rls shadow access report test passed')
