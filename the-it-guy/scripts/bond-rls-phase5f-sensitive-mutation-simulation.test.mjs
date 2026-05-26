import assert from 'node:assert/strict';
import test from 'node:test';

import { simulate, SENSITIVE_MUTATION_ACTIONS } from './bond-rls-phase5f-sensitive-mutation-simulation.mjs';

const WORKSPACE_ID = 'workspace-1';
const REGION_ID = 'region-1';
const OTHER_REGION_ID = 'region-2';
const UNIT_ID = 'unit-1';
const OTHER_UNIT_ID = 'unit-2';

const USERS = {
  hq: 'user-hq',
  regional: 'user-regional',
  branch: 'user-branch',
  teamLead: 'user-team',
  consultant: 'user-consultant',
  processor: 'user-processor',
  compliance: 'user-compliance',
  admin: 'user-admin',
  participant: 'user-participant',
  personal: 'user-personal',
  unrelated: 'user-unrelated',
};

const TX = {
  canonical: 'tx-canonical',
  manualReview: 'tx-manual-review',
  acceptedLegacy: 'tx-accepted-legacy',
};

function makeOutcome({
  transactionId,
  actorUserId,
  actorRole,
  workspaceRole,
  scopeLevel,
  regionId = null,
  workspaceUnitId = null,
  action,
  currentAllowed,
  canonicalAllowed,
  exclusionType = null,
  canonicalReady = true,
  assignmentSummary = {},
}) {
  return {
    scenarioId: `${transactionId}:${actorUserId}:${action}`,
    transactionId,
    actorUserId,
    actorRole,
    workspaceRole,
    scopeLevel,
    regionId,
    workspaceUnitId,
    action,
    currentAllowed,
    canonicalAllowed,
    canonicalReady,
    currentReason: currentAllowed ? 'current_broad_access' : 'current_denied',
    canonicalReason: canonicalAllowed ? 'canonical_sensitive_allow' : 'canonical_sensitive_deny',
    exclusionStatus: {
      excluded: Boolean(exclusionType),
      exclusionType,
    },
    assignmentSummary: {
      consultantUserId: USERS.consultant,
      processorUserId: USERS.processor,
      managerUserId: USERS.branch,
      complianceUserId: USERS.compliance,
      assignedBondOriginatorEmail: 'consultant@example.test',
      bondOriginator: 'Fixture Consultant',
      bondRegionId: REGION_ID,
      bondWorkspaceUnitId: UNIT_ID,
      ...assignmentSummary,
    },
  };
}

function trio(config) {
  return [
    makeOutcome({ ...config, action: 'finance.workflow_update' }),
    makeOutcome({ ...config, action: 'finance.submit_to_banks' }),
    makeOutcome({ ...config, action: 'finance.reassign_processor' }),
  ];
}

const payload = {
  users: [
    { id: USERS.hq, email: 'hq@example.test' },
    { id: USERS.regional, email: 'regional@example.test' },
    { id: USERS.branch, email: 'branch@example.test' },
    { id: USERS.teamLead, email: 'team@example.test' },
    { id: USERS.consultant, email: 'consultant@example.test' },
    { id: USERS.processor, email: 'processor@example.test' },
    { id: USERS.compliance, email: 'compliance@example.test' },
    { id: USERS.admin, email: 'admin@example.test' },
    { id: USERS.participant, email: 'participant@example.test' },
    { id: USERS.personal, email: 'personal@example.test' },
    { id: USERS.unrelated, email: 'unrelated@example.test' },
  ],
  transactions: [
    {
      id: TX.canonical,
      organisation_id: WORKSPACE_ID,
      bond_workspace_id: WORKSPACE_ID,
      bond_region_id: REGION_ID,
      bond_workspace_unit_id: UNIT_ID,
      primary_bond_consultant_user_id: USERS.consultant,
      assigned_bond_processor_user_id: USERS.processor,
      assigned_bond_manager_user_id: USERS.branch,
      assigned_bond_compliance_user_id: USERS.compliance,
      assigned_bond_originator_email: 'consultant@example.test',
    },
    {
      id: TX.manualReview,
      organisation_id: WORKSPACE_ID,
      bond_workspace_id: WORKSPACE_ID,
      bond_region_id: REGION_ID,
      bond_workspace_unit_id: UNIT_ID,
      primary_bond_consultant_user_id: USERS.consultant,
      assigned_bond_originator_email: 'consultant@example.test',
    },
    {
      id: TX.acceptedLegacy,
      organisation_id: WORKSPACE_ID,
      bond_workspace_id: WORKSPACE_ID,
      bond_region_id: OTHER_REGION_ID,
      bond_workspace_unit_id: OTHER_UNIT_ID,
      primary_bond_consultant_user_id: USERS.personal,
      assigned_bond_originator_email: 'personal@example.test',
    },
  ],
};

const baseReport = {
  scenarioOutcomes: [
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.hq,
      actorRole: 'hq_manager',
      workspaceRole: 'hq_manager',
      scopeLevel: 'workspace_hq',
      currentAllowed: true,
      canonicalAllowed: true,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.regional,
      actorRole: 'regional_manager',
      workspaceRole: 'regional_manager',
      scopeLevel: 'region',
      regionId: REGION_ID,
      currentAllowed: true,
      canonicalAllowed: true,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.branch,
      actorRole: 'branch_manager',
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      workspaceUnitId: UNIT_ID,
      currentAllowed: true,
      canonicalAllowed: true,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.teamLead,
      actorRole: 'team_lead',
      workspaceRole: 'team_lead',
      scopeLevel: 'team',
      workspaceUnitId: UNIT_ID,
      currentAllowed: true,
      canonicalAllowed: true,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.consultant,
      actorRole: 'consultant',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      currentAllowed: true,
      canonicalAllowed: false,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.processor,
      actorRole: 'processor',
      workspaceRole: 'processor',
      scopeLevel: 'team',
      workspaceUnitId: UNIT_ID,
      currentAllowed: true,
      canonicalAllowed: false,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.compliance,
      actorRole: 'compliance',
      workspaceRole: 'compliance',
      scopeLevel: 'workspace_hq',
      currentAllowed: true,
      canonicalAllowed: false,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.admin,
      actorRole: 'admin_staff',
      workspaceRole: 'admin_staff',
      scopeLevel: 'workspace_hq',
      currentAllowed: true,
      canonicalAllowed: false,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.participant,
      actorRole: 'transaction_participant',
      workspaceRole: '',
      scopeLevel: '',
      currentAllowed: true,
      canonicalAllowed: false,
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.personal,
      actorRole: 'personal_originator',
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
      currentAllowed: true,
      canonicalAllowed: false,
      assignmentSummary: {
        consultantUserId: USERS.personal,
      },
    }),
    ...trio({
      transactionId: TX.canonical,
      actorUserId: USERS.unrelated,
      actorRole: 'unrelated',
      workspaceRole: '',
      scopeLevel: '',
      currentAllowed: false,
      canonicalAllowed: false,
    }),
    ...trio({
      transactionId: TX.manualReview,
      actorUserId: USERS.hq,
      actorRole: 'hq_manager',
      workspaceRole: 'hq_manager',
      scopeLevel: 'workspace_hq',
      currentAllowed: true,
      canonicalAllowed: true,
      exclusionType: 'manual_review',
    }),
    ...trio({
      transactionId: TX.acceptedLegacy,
      actorUserId: USERS.personal,
      actorRole: 'personal_originator',
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
      currentAllowed: true,
      canonicalAllowed: true,
      exclusionType: 'accepted_unresolved_legacy',
      canonicalReady: false,
      assignmentSummary: {
        consultantUserId: USERS.personal,
      },
    }),
  ],
};

const scenarios = [
  { id: 'hq-within-workspace', transactionId: TX.canonical, actorUserId: USERS.hq, action: 'bond.assign_workspace' },
  { id: 'hq-outside-workspace', transactionId: TX.canonical, actorUserId: USERS.hq, action: 'bond.assign_workspace', targetWorkspaceId: 'workspace-2' },
  { id: 'regional-within-region', transactionId: TX.canonical, actorUserId: USERS.regional, action: 'bond.assign_processor', targetRegionId: REGION_ID },
  { id: 'regional-outside-region', transactionId: TX.canonical, actorUserId: USERS.regional, action: 'bond.assign_processor', targetRegionId: OTHER_REGION_ID },
  { id: 'branch-within-branch', transactionId: TX.canonical, actorUserId: USERS.branch, action: 'bond.assign_consultant', targetWorkspaceUnitId: UNIT_ID },
  { id: 'branch-outside-branch', transactionId: TX.canonical, actorUserId: USERS.branch, action: 'bond.assign_consultant', targetWorkspaceUnitId: OTHER_UNIT_ID },
  { id: 'team-within-team', transactionId: TX.canonical, actorUserId: USERS.teamLead, action: 'bond.assign_processor', targetWorkspaceUnitId: UNIT_ID },
  { id: 'consultant-cannot-assign', transactionId: TX.canonical, actorUserId: USERS.consultant, action: 'bond.assign_processor' },
  { id: 'processor-cannot-assign', transactionId: TX.canonical, actorUserId: USERS.processor, action: 'bond.assign_consultant' },
  { id: 'compliance-cannot-assign', transactionId: TX.canonical, actorUserId: USERS.compliance, action: 'bond.assign_manager' },
  { id: 'admin-cannot-assign', transactionId: TX.canonical, actorUserId: USERS.admin, action: 'bond.assign_compliance' },
  { id: 'consultant-submit-explicit', transactionId: TX.canonical, actorUserId: USERS.consultant, action: 'bond.submit_to_banks', explicitSubmitPermission: true },
  { id: 'processor-submit-explicit', transactionId: TX.canonical, actorUserId: USERS.processor, action: 'bond.submit_to_banks', explicitSubmitPermission: true },
  { id: 'compliance-submit-default-deny', transactionId: TX.canonical, actorUserId: USERS.compliance, action: 'bond.submit_to_banks' },
  { id: 'participant-submit-default-deny', transactionId: TX.canonical, actorUserId: USERS.participant, action: 'bond.submit_to_banks' },
  { id: 'personal-originator-own-assignment', transactionId: TX.canonical, actorUserId: USERS.personal, action: 'bond.assign_consultant', personalOriginatorOwnsTransaction: true },
  { id: 'manual-review-excluded', transactionId: TX.manualReview, actorUserId: USERS.hq, action: 'bond.assign_processor' },
  { id: 'accepted-legacy-excluded', transactionId: TX.acceptedLegacy, actorUserId: USERS.personal, action: 'bond.submit_to_banks', personalOriginatorOwnsTransaction: true, explicitSubmitPermission: true },
  { id: 'unrelated-denied', transactionId: TX.canonical, actorUserId: USERS.unrelated, action: 'bond.assign_processor' },
];

function outcomeById(report, id) {
  return report.scenarioOutcomes.find((outcome) => outcome.scenarioId === id);
}

test('Phase 5F exposes the expected sensitive mutation action catalog', () => {
  assert.equal(SENSITIVE_MUTATION_ACTIONS.length, 13);
  assert.ok(SENSITIVE_MUTATION_ACTIONS.includes('bond.submit_to_banks'));
  assert.ok(SENSITIVE_MUTATION_ACTIONS.includes('bond.assign_processor'));
  assert.ok(SENSITIVE_MUTATION_ACTIONS.includes('bond.override_assignment_scope'));
});

test('Phase 5F simulation keeps unexpected allow/deny at zero while preserving exclusions', () => {
  const report = simulate({ inputPayload: payload, baseReport, scenarios, sampleLimit: 10 });

  assert.equal(report.categories.unexpectedAllow, 0);
  assert.equal(report.categories.unexpectedDeny, 0);
  assert.ok(report.categories.expectedSensitiveTightening > 0);
  assert.equal(report.categories.manualReviewMutationExcluded, 1);
  assert.equal(report.categories.excludedLegacyMutationCompat, 1);
});

test('Phase 5F simulation enforces the required sensitive submit and assignment rules', () => {
  const report = simulate({ inputPayload: payload, baseReport, scenarios, sampleLimit: 10 });

  assert.equal(outcomeById(report, 'hq-within-workspace').phase5fAllowed, true);
  assert.equal(outcomeById(report, 'hq-outside-workspace').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'regional-within-region').phase5fAllowed, true);
  assert.equal(outcomeById(report, 'regional-outside-region').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'branch-within-branch').phase5fAllowed, true);
  assert.equal(outcomeById(report, 'branch-outside-branch').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'team-within-team').phase5fAllowed, true);
  assert.equal(outcomeById(report, 'consultant-cannot-assign').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'processor-cannot-assign').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'compliance-cannot-assign').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'admin-cannot-assign').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'consultant-submit-explicit').phase5fAllowed, true);
  assert.equal(outcomeById(report, 'processor-submit-explicit').phase5fAllowed, true);
  assert.equal(outcomeById(report, 'compliance-submit-default-deny').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'participant-submit-default-deny').phase5fAllowed, false);
  assert.equal(outcomeById(report, 'personal-originator-own-assignment').phase5fAllowed, true);
  assert.equal(outcomeById(report, 'manual-review-excluded').finalClassification, 'manualReviewMutationExcluded');
  assert.equal(outcomeById(report, 'accepted-legacy-excluded').finalClassification, 'excludedLegacyMutationCompat');
  assert.equal(outcomeById(report, 'unrelated-denied').phase5fAllowed, false);
});
