#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { simulate as simulatePhase5c } from './bond-rls-phase5c-write-simulation.mjs';

const INPUT_PATH =
  process.env.BOND_ASSIGNMENT_RECONCILIATION_INPUT ||
  process.env.BOND_RLS_SHADOW_INPUT ||
  '/tmp/staging-bond-assignment-export.json';
const MANUAL_MAPPING_PATH =
  process.env.BOND_ASSIGNMENT_MANUAL_MAPPING ||
  fileURLToPath(new URL('./data/bond-workspace-manual-mapping.json', import.meta.url));
const EXCLUSIONS_PATH =
  process.env.BOND_RLS_CUTOVER_EXCLUSIONS ||
  fileURLToPath(new URL('./data/bond-rls-cutover-exclusions.json', import.meta.url));
const OUTPUT_PATH = process.env.BOND_RLS_PHASE5F_MUTATION_OUTPUT || '';
const SAMPLE_LIMIT = Number(process.env.BOND_RLS_SHADOW_SAMPLE_LIMIT || '25');

export const SENSITIVE_MUTATION_ACTIONS = Object.freeze([
  'bond.submit_to_banks',
  'bond.revoke_bank_submission',
  'bond.resubmit_to_banks',
  'bond.assign_workspace',
  'bond.assign_region',
  'bond.assign_unit',
  'bond.assign_consultant',
  'bond.assign_processor',
  'bond.assign_manager',
  'bond.assign_compliance',
  'bond.clear_assignment',
  'bond.transfer_application_workspace',
  'bond.override_assignment_scope',
]);

const HQ_ROLES = new Set(['owner', 'director', 'hq_manager']);
const REGION_ROLES = new Set(['regional_manager']);
const UNIT_ROLES = new Set(['branch_manager', 'team_lead']);
const ASSIGNED_ROLES = new Set(['consultant', 'processor', 'manager', 'compliance', 'personal_originator']);
const DENIED_SENSITIVE_ROLES = new Set(['compliance', 'admin_staff', 'participant', 'transaction_participant', 'unrelated']);
const SUBMIT_ACTIONS = new Set([
  'bond.submit_to_banks',
  'bond.revoke_bank_submission',
  'bond.resubmit_to_banks',
]);
const ASSIGNMENT_ACTIONS = new Set([
  'bond.assign_workspace',
  'bond.assign_region',
  'bond.assign_unit',
  'bond.assign_consultant',
  'bond.assign_processor',
  'bond.assign_manager',
  'bond.assign_compliance',
  'bond.clear_assignment',
  'bond.transfer_application_workspace',
  'bond.override_assignment_scope',
]);

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return readJson(filePath);
}

function writeJsonIfRequested(report, outputPath) {
  if (!outputPath) return;
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

function metric(report, key) {
  if (Object.hasOwn(report || {}, key)) return report[key];
  if (report?.categories && Object.hasOwn(report.categories, key)) return report.categories[key];
  return 0;
}

function buildTransactionList(payload = {}) {
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  const participantRows = Array.isArray(payload.transaction_participants)
    ? payload.transaction_participants
    : Array.isArray(payload.transactionParticipants)
      ? payload.transactionParticipants
      : [];
  const rolePlayerRows = Array.isArray(payload.transaction_role_players)
    ? payload.transaction_role_players
    : Array.isArray(payload.transactionRolePlayers)
      ? payload.transactionRolePlayers
      : [];

  const participantsByTransaction = new Map();
  const rolePlayersByTransaction = new Map();

  for (const row of participantRows) {
    const transactionId = normalizeText(row.transaction_id || row.transactionId);
    if (!transactionId) continue;
    if (!participantsByTransaction.has(transactionId)) participantsByTransaction.set(transactionId, []);
    participantsByTransaction.get(transactionId).push(row);
  }

  for (const row of rolePlayerRows) {
    const transactionId = normalizeText(row.transaction_id || row.transactionId);
    if (!transactionId) continue;
    if (!rolePlayersByTransaction.has(transactionId)) rolePlayersByTransaction.set(transactionId, []);
    rolePlayersByTransaction.get(transactionId).push(row);
  }

  return transactions.map((transaction) => {
    const transactionId = normalizeText(transaction.id);
    return {
      ...transaction,
      transaction_participants: Array.isArray(transaction.transaction_participants)
        ? transaction.transaction_participants
        : participantsByTransaction.get(transactionId) || [],
      transaction_role_players: Array.isArray(transaction.transaction_role_players)
        ? transaction.transaction_role_players
        : rolePlayersByTransaction.get(transactionId) || [],
    };
  });
}

function buildTransactionMap(payload = {}) {
  return new Map(buildTransactionList(payload).map((transaction) => [normalizeText(transaction.id), transaction]));
}

function buildUserEmailMap(payload = {}) {
  const users = Array.isArray(payload.users) ? payload.users : [];
  const authUsers = Array.isArray(payload.authUsers) ? payload.authUsers : [];
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
  const map = new Map();

  for (const collection of [users, authUsers, profiles]) {
    for (const row of collection) {
      const userId = normalizeText(row.id || row.user_id || row.userId);
      const email = normalizeEmail(row.email || row.email_address || row.participant_email);
      if (userId && email && !map.has(userId)) {
        map.set(userId, email);
      }
    }
  }

  return map;
}

function buildExclusionMap({ exclusions = [], manualMappings = [] } = {}) {
  const map = new Map();

  for (const row of exclusions) {
    if (!row || row.active === false) continue;
    const transactionId = normalizeText(row.transaction_id || row.transactionId);
    if (!transactionId) continue;
    map.set(transactionId, {
      excluded: true,
      exclusionType: normalizeText(row.exclusion_type || row.exclusionType).toLowerCase(),
      reason: normalizeText(row.reason),
      source: normalizeText(row.source || 'exclusion_file'),
    });
  }

  for (const row of manualMappings) {
    const transactionId = normalizeText(row.transaction_id || row.transactionId);
    if (!transactionId || map.has(transactionId)) continue;
    const action = normalizeText(row.action).toLowerCase();
    if (action !== 'accepted_unresolved') continue;
    map.set(transactionId, {
      excluded: true,
      exclusionType: 'accepted_unresolved_legacy',
      reason: normalizeText(row.reason),
      source: 'manual_mapping',
    });
  }

  return map;
}

function baseScenarioMap(baseReport = {}) {
  const outcomes = Array.isArray(baseReport.scenarioOutcomes) ? baseReport.scenarioOutcomes : [];
  const map = new Map();

  for (const outcome of outcomes) {
    const pairKey = `${normalizeText(outcome.transactionId)}:${normalizeText(outcome.actorUserId)}`;
    if (!map.has(pairKey)) {
      map.set(pairKey, {
        transactionId: normalizeText(outcome.transactionId),
        actorUserId: normalizeText(outcome.actorUserId),
        actorRole: normalizeText(outcome.actorRole || 'unrelated').toLowerCase(),
        workspaceRole: normalizeText(outcome.workspaceRole).toLowerCase(),
        scopeLevel: normalizeText(outcome.scopeLevel).toLowerCase(),
        regionId: normalizeText(outcome.regionId) || null,
        workspaceUnitId: normalizeText(outcome.workspaceUnitId) || null,
        exclusionStatus: outcome.exclusionStatus || { excluded: false, exclusionType: null },
        canonicalReady: Boolean(outcome.canonicalReady),
        assignmentSummary: outcome.assignmentSummary || {},
        outcomes: {},
      });
    }

    const entry = map.get(pairKey);
    entry.outcomes[normalizeText(outcome.action)] = outcome;
    entry.exclusionStatus = outcome.exclusionStatus || entry.exclusionStatus;
    entry.canonicalReady = Boolean(outcome.canonicalReady);
    entry.assignmentSummary = outcome.assignmentSummary || entry.assignmentSummary;
  }

  for (const entry of map.values()) {
    const workflowOutcome =
      entry.outcomes['finance.workflow_update'] ||
      entry.outcomes['finance.internal_finance_mutation'] ||
      Object.values(entry.outcomes)[0] ||
      null;
    const submitOutcome = entry.outcomes['finance.submit_to_banks'] || workflowOutcome;
    const assignmentOutcome = entry.outcomes['finance.reassign_processor'] || workflowOutcome;

    entry.currentBroadAllowed = Boolean(workflowOutcome?.currentAllowed);
    entry.currentBroadReason = workflowOutcome?.currentReason || 'no_current_access_signal';
    entry.currentSubmitAllowed = Boolean(submitOutcome?.currentAllowed);
    entry.currentSubmitReason = submitOutcome?.currentReason || entry.currentBroadReason;
    entry.currentAssignmentAllowed = Boolean(assignmentOutcome?.currentAllowed);
    entry.currentAssignmentReason = assignmentOutcome?.currentReason || entry.currentBroadReason;
    entry.submitCanonicalAllowed = Boolean(submitOutcome?.canonicalAllowed);
    entry.submitCanonicalReason = submitOutcome?.canonicalReason || 'submit_not_modeled';
  }

  return map;
}

function normalizeRole(rawRole = '', rawScopeLevel = '') {
  const role = normalizeText(rawRole).toLowerCase();
  const scopeLevel = normalizeText(rawScopeLevel).toLowerCase();

  if (role === 'principal') return 'owner';
  if (role === 'bond_originator') return 'consultant';
  if (role === 'admin') return 'admin_staff';
  if (role === 'manager') {
    if (scopeLevel === 'region') return 'regional_manager';
    if (scopeLevel === 'branch') return 'branch_manager';
    if (scopeLevel === 'team') return 'team_lead';
    return 'hq_manager';
  }

  return role;
}

function transactionHasParticipantAccess(transaction = {}, actorUserId = '', actorEmail = '') {
  const participantRows = Array.isArray(transaction.transaction_participants) ? transaction.transaction_participants : [];
  const rolePlayerRows = Array.isArray(transaction.transaction_role_players) ? transaction.transaction_role_players : [];
  const userId = normalizeText(actorUserId);
  const email = normalizeEmail(actorEmail);

  return [...participantRows, ...rolePlayerRows].some((row) => {
    const rowUserId = normalizeText(row.user_id || row.userId);
    const rowEmail = normalizeEmail(row.participant_email || row.email || row.email_address);
    return (userId && rowUserId === userId) || (email && rowEmail === email);
  });
}

function fallbackCurrentAccess(base = {}, transaction = {}, actorEmail = '') {
  const role = roleForScenario(base);
  const transactionWorkspaceId = normalizeText(transaction.bond_workspace_id || transaction.organisation_id || transaction.workspace_id);
  const transactionRegionId = normalizeText(transaction.bond_region_id || transaction.region_id);
  const transactionUnitId = normalizeText(
    transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id,
  );
  const directAssignee = isDirectAssignee(base, transaction, {}, new Map([[base.actorUserId, actorEmail]]));
  const participantAccess = transactionHasParticipantAccess(transaction, base.actorUserId, actorEmail);

  if (directAssignee || participantAccess) return true;
  if (HQ_ROLES.has(role)) return Boolean(transactionWorkspaceId);
  if (REGION_ROLES.has(role)) return Boolean(base.regionId && transactionRegionId && base.regionId === transactionRegionId);
  if (UNIT_ROLES.has(role) || role === 'manager' || role === 'processor') {
    return Boolean(base.workspaceUnitId && transactionUnitId && base.workspaceUnitId === transactionUnitId);
  }
  if (role === 'personal_originator') {
    return Boolean(
      normalizeText(transaction.primary_bond_consultant_user_id) === base.actorUserId ||
        normalizeEmail(transaction.assigned_bond_originator_email) === actorEmail,
    );
  }
  return false;
}

function buildFallbackBaseEntries(payload = {}, transactionMap = new Map(), userEmailMap = new Map(), exclusionMap = new Map()) {
  const memberships = [
    ...(Array.isArray(payload.organisation_users) ? payload.organisation_users : []),
    ...(Array.isArray(payload.organisationUsers) ? payload.organisationUsers : []),
  ];
  const entries = [];

  for (const transaction of transactionMap.values()) {
    const workspaceId = normalizeText(transaction.bond_workspace_id || transaction.organisation_id || transaction.workspace_id);
    const membershipCandidates = memberships.filter((row) => {
      const membershipWorkspaceId = normalizeText(row.organisation_id || row.organisationId);
      const workspaceType = normalizeText(row.workspace_type || row.workspaceType).toLowerCase();
      return membershipWorkspaceId === workspaceId && (workspaceType === 'bond_originator' || workspaceType === '');
    });

    const seenActors = new Set();
    const exclusionStatus = exclusionMap.get(normalizeText(transaction.id)) || { excluded: false, exclusionType: null };
    const canonicalReady =
      !exclusionStatus.excluded &&
      Boolean(workspaceId) &&
      !normalizeText(transaction.archived_at || transaction.archive_reason || transaction.archivedAt);

    for (const membership of membershipCandidates) {
      const actorUserId = normalizeText(membership.user_id || membership.userId);
      if (!actorUserId || seenActors.has(actorUserId)) continue;
      seenActors.add(actorUserId);

      const workspaceRole = normalizeRole(
        membership.workspace_role || membership.workspaceRole || membership.organisation_role || membership.organisationRole || membership.role,
        membership.scope_level || membership.scopeLevel,
      );
      const scopeLevel = normalizeText(membership.scope_level || membership.scopeLevel || '').toLowerCase();
      const actorRole = workspaceRole || 'unrelated';
      const actorEmail = userEmailMap.get(actorUserId) || normalizeEmail(membership.email);
      const currentAllowed = fallbackCurrentAccess(
        {
          actorUserId,
          actorRole,
          workspaceRole,
          scopeLevel,
          regionId: normalizeText(membership.region_id || membership.regionId) || null,
          workspaceUnitId: normalizeText(membership.workspace_unit_id || membership.workspaceUnitId || membership.branch_id || membership.branchId || membership.team_id || membership.teamId) || null,
        },
        transaction,
        actorEmail,
      );

      entries.push({
        transactionId: normalizeText(transaction.id),
        actorUserId,
        actorRole,
        workspaceRole,
        scopeLevel,
        regionId: normalizeText(membership.region_id || membership.regionId) || null,
        workspaceUnitId: normalizeText(membership.workspace_unit_id || membership.workspaceUnitId || membership.branch_id || membership.branchId || membership.team_id || membership.teamId) || null,
        exclusionStatus,
        canonicalReady,
        assignmentSummary: {
          consultantUserId: normalizeText(transaction.primary_bond_consultant_user_id),
          processorUserId: normalizeText(transaction.assigned_bond_processor_user_id),
          managerUserId: normalizeText(transaction.assigned_bond_manager_user_id),
          complianceUserId: normalizeText(transaction.assigned_bond_compliance_user_id),
          assignedBondOriginatorEmail: normalizeText(transaction.assigned_bond_originator_email) || null,
          bondOriginator: normalizeText(transaction.bond_originator) || null,
          bondRegionId: normalizeText(transaction.bond_region_id) || null,
          bondWorkspaceUnitId: normalizeText(transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id) || null,
        },
        outcomes: {},
        currentBroadAllowed: currentAllowed,
        currentBroadReason: currentAllowed ? 'fallback_workspace_or_assignment_access' : 'fallback_no_scope_match',
        currentSubmitAllowed: currentAllowed,
        currentSubmitReason: currentAllowed ? 'fallback_workspace_or_assignment_access' : 'fallback_no_scope_match',
        currentAssignmentAllowed: currentAllowed,
        currentAssignmentReason: currentAllowed ? 'fallback_workspace_or_assignment_access' : 'fallback_no_scope_match',
        submitCanonicalAllowed: false,
        submitCanonicalReason: 'submit_requires_explicit_sensitive_permission',
      });
    }

    const participantCandidates = [
      ...(Array.isArray(transaction.transaction_participants) ? transaction.transaction_participants : []),
      ...(Array.isArray(transaction.transaction_role_players) ? transaction.transaction_role_players : []),
    ];

    for (const row of participantCandidates) {
      const actorUserId = normalizeText(row.user_id || row.userId);
      if (!actorUserId || seenActors.has(actorUserId)) continue;
      seenActors.add(actorUserId);
      entries.push({
        transactionId: normalizeText(transaction.id),
        actorUserId,
        actorRole: 'transaction_participant',
        workspaceRole: '',
        scopeLevel: '',
        regionId: null,
        workspaceUnitId: null,
        exclusionStatus,
        canonicalReady,
        assignmentSummary: {
          consultantUserId: normalizeText(transaction.primary_bond_consultant_user_id),
          processorUserId: normalizeText(transaction.assigned_bond_processor_user_id),
          managerUserId: normalizeText(transaction.assigned_bond_manager_user_id),
          complianceUserId: normalizeText(transaction.assigned_bond_compliance_user_id),
          assignedBondOriginatorEmail: normalizeText(transaction.assigned_bond_originator_email) || null,
          bondOriginator: normalizeText(transaction.bond_originator) || null,
          bondRegionId: normalizeText(transaction.bond_region_id) || null,
          bondWorkspaceUnitId: normalizeText(transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id) || null,
        },
        outcomes: {},
        currentBroadAllowed: true,
        currentBroadReason: 'fallback_transaction_participant_access',
        currentSubmitAllowed: true,
        currentSubmitReason: 'fallback_transaction_participant_access',
        currentAssignmentAllowed: true,
        currentAssignmentReason: 'fallback_transaction_participant_access',
        submitCanonicalAllowed: false,
        submitCanonicalReason: 'submit_requires_explicit_sensitive_permission',
      });
    }
  }

  return entries;
}

function defaultTargetScope(base = {}, transaction = {}) {
  if (normalizeText(base.scopeLevel)) return normalizeText(base.scopeLevel);
  if (normalizeText(transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id)) return 'branch';
  if (normalizeText(transaction.bond_region_id || transaction.region_id)) return 'region';
  return 'workspace_hq';
}

function defaultScenarios(baseEntries = [], transactionMap = new Map(), userEmailMap = new Map()) {
  const scenarios = [];

  for (const base of baseEntries) {
    const transaction = transactionMap.get(base.transactionId);
    if (!transaction) continue;

    const targetWorkspaceId = normalizeText(transaction.bond_workspace_id || transaction.organisation_id || transaction.workspace_id);
    const targetRegionId = normalizeText(transaction.bond_region_id || transaction.region_id);
    const targetWorkspaceUnitId = normalizeText(
      transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id,
    );
    const actorEmail = userEmailMap.get(base.actorUserId) || '';
    const personalOriginatorOwnsTransaction =
      base.actorRole === 'personal_originator' &&
      (normalizeText(transaction.primary_bond_consultant_user_id) === base.actorUserId ||
        normalizeEmail(transaction.assigned_bond_originator_email) === actorEmail);

    for (const action of SENSITIVE_MUTATION_ACTIONS) {
      scenarios.push({
        id: `${base.transactionId}:${base.actorUserId}:${action}`,
        transactionId: base.transactionId,
        actorUserId: base.actorUserId,
        action,
        targetWorkspaceId,
        targetRegionId,
        targetWorkspaceUnitId,
        targetScopeLevel: defaultTargetScope(base, transaction),
        targetAssigneeUserId:
          normalizeText(transaction.primary_bond_consultant_user_id) ||
          normalizeText(transaction.assigned_bond_processor_user_id) ||
          normalizeText(transaction.assigned_bond_manager_user_id) ||
          normalizeText(transaction.assigned_bond_compliance_user_id) ||
          null,
        explicitSubmitPermission: base.submitCanonicalAllowed || HQ_ROLES.has(base.workspaceRole),
        explicitTransferPermission: false,
        personalOriginatorOwnsTransaction,
      });
    }
  }

  return scenarios;
}

function normalizeScenario(rawScenario = {}, transaction = {}) {
  return {
    id: normalizeText(rawScenario.id),
    transactionId: normalizeText(rawScenario.transactionId || rawScenario.transaction_id || transaction?.id),
    actorUserId: normalizeText(rawScenario.actorUserId || rawScenario.actor_user_id),
    action: normalizeText(rawScenario.action),
    targetWorkspaceId: normalizeText(
      rawScenario.targetWorkspaceId ||
        rawScenario.target_workspace_id ||
        transaction?.bond_workspace_id ||
        transaction?.organisation_id ||
        transaction?.workspace_id,
    ),
    targetRegionId: normalizeText(
      rawScenario.targetRegionId || rawScenario.target_region_id || transaction?.bond_region_id || transaction?.region_id,
    ),
    targetWorkspaceUnitId: normalizeText(
      rawScenario.targetWorkspaceUnitId ||
        rawScenario.target_workspace_unit_id ||
        transaction?.bond_workspace_unit_id ||
        transaction?.workspace_unit_id ||
        transaction?.branch_id ||
        transaction?.team_id,
    ),
    targetScopeLevel: normalizeText(rawScenario.targetScopeLevel || rawScenario.target_scope_level || defaultTargetScope({}, transaction)).toLowerCase(),
    targetAssigneeUserId: normalizeText(rawScenario.targetAssigneeUserId || rawScenario.target_assignee_user_id),
    explicitSubmitPermission: Boolean(rawScenario.explicitSubmitPermission),
    explicitTransferPermission: Boolean(rawScenario.explicitTransferPermission),
    personalOriginatorOwnsTransaction: Boolean(rawScenario.personalOriginatorOwnsTransaction),
  };
}

function isExcluded(base = {}) {
  return Boolean(base.exclusionStatus?.excluded);
}

function isManualReview(base = {}) {
  return normalizeText(base.exclusionStatus?.exclusionType).toLowerCase() === 'manual_review';
}

function isCanonicalReady(base = {}) {
  return Boolean(base.canonicalReady) && !isExcluded(base);
}

function roleForScenario(base = {}) {
  return normalizeText(base.workspaceRole || base.actorRole).toLowerCase();
}

function isDirectAssignee(base = {}, transaction = {}, scenario = {}, userEmailMap = new Map()) {
  const actorUserId = normalizeText(base.actorUserId);
  const actorEmail = userEmailMap.get(actorUserId) || '';
  if (!actorUserId && !actorEmail) return false;

  const ids = [
    transaction.primary_bond_consultant_user_id,
    transaction.assigned_bond_processor_user_id,
    transaction.assigned_bond_manager_user_id,
    transaction.assigned_bond_compliance_user_id,
    scenario.targetAssigneeUserId,
  ].map((value) => normalizeText(value));

  if (actorUserId && ids.includes(actorUserId)) return true;
  if (actorEmail && normalizeEmail(transaction.assigned_bond_originator_email) === actorEmail) return true;
  return false;
}

function matchesWorkspace(base = {}, scenario = {}, transaction = {}) {
  const transactionWorkspaceId = normalizeText(transaction.bond_workspace_id || transaction.organisation_id || transaction.workspace_id);
  if (!scenario.targetWorkspaceId || !transactionWorkspaceId) return false;
  if (scenario.targetWorkspaceId !== transactionWorkspaceId) return false;
  return true;
}

function matchesRegion(base = {}, scenario = {}, transaction = {}) {
  const targetRegionId = normalizeText(scenario.targetRegionId || transaction.bond_region_id || transaction.region_id);
  const transactionRegionId = normalizeText(transaction.bond_region_id || transaction.region_id);
  if (!targetRegionId || !transactionRegionId) return false;
  if (targetRegionId !== transactionRegionId) return false;
  return Boolean(base.regionId && base.regionId === targetRegionId);
}

function matchesUnit(base = {}, scenario = {}, transaction = {}) {
  const targetUnitId = normalizeText(
    scenario.targetWorkspaceUnitId || transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id,
  );
  const transactionUnitId = normalizeText(
    transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id,
  );
  if (!targetUnitId || !transactionUnitId) return false;
  if (targetUnitId !== transactionUnitId) return false;
  return Boolean(base.workspaceUnitId && base.workspaceUnitId === targetUnitId);
}

function canSubmitCanonical(base = {}, transaction = {}, scenario = {}, userEmailMap = new Map()) {
  const role = roleForScenario(base);

  if (DENIED_SENSITIVE_ROLES.has(role)) {
    return {
      allow: false,
      reason: `${role || 'unrelated'} users do not receive submit-to-bank rights by default.`,
    };
  }

  if (HQ_ROLES.has(role)) {
    return {
      allow: true,
      reason: 'Workspace HQ roles may submit canonical-ready Bond applications to banks.',
    };
  }

  if (role === 'personal_originator') {
    return {
      allow: Boolean(scenario.personalOriginatorOwnsTransaction && scenario.explicitSubmitPermission),
      reason: scenario.personalOriginatorOwnsTransaction && scenario.explicitSubmitPermission
        ? 'Personal originator owners may submit their own canonical-ready applications when explicitly permitted.'
        : 'Personal originator submit-to-bank access remains gated to own applications with explicit permission.',
    };
  }

  if (role === 'consultant') {
    const allow = scenario.explicitSubmitPermission && isDirectAssignee(base, transaction, scenario, userEmailMap);
    return {
      allow,
      reason: allow
        ? 'Assigned consultants may submit to banks only when explicit submit permission exists.'
        : 'Consultants require explicit submit permission and direct assignment before submitting to banks.',
    };
  }

  if (role === 'processor') {
    const allow = scenario.explicitSubmitPermission && (isDirectAssignee(base, transaction, scenario, userEmailMap) || matchesUnit(base, scenario, transaction));
    return {
      allow,
      reason: allow
        ? 'Assigned or team-scoped processors may submit to banks only when explicit submit permission exists.'
        : 'Processors require explicit submit permission plus assigned or team-scoped access before submitting to banks.',
    };
  }

  if (role === 'regional_manager') {
    const allow = scenario.explicitSubmitPermission && matchesRegion(base, scenario, transaction);
    return {
      allow,
      reason: allow
        ? 'Regional managers may submit within their own region when explicit submit permission exists.'
        : 'Regional submit-to-bank access stays limited to in-region records with explicit permission.',
    };
  }

  if (role === 'branch_manager' || role === 'team_lead' || role === 'manager') {
    const allow = scenario.explicitSubmitPermission && matchesUnit(base, scenario, transaction);
    return {
      allow,
      reason: allow
        ? 'Branch or team operational leads may submit within their own unit when explicit submit permission exists.'
        : 'Branch and team submit-to-bank access stays limited to in-unit records with explicit permission.',
    };
  }

  return {
    allow: false,
    reason: 'No canonical submit-to-bank grant exists for this role.',
  };
}

function canAssignmentMutation(base = {}, transaction = {}, scenario = {}) {
  const role = roleForScenario(base);

  if (!matchesWorkspace(base, scenario, transaction)) {
    return {
      allow: false,
      reason: 'Sensitive assignment mutation never crosses workspace boundaries.',
    };
  }

  if (scenario.action === 'bond.transfer_application_workspace') {
    const allow = HQ_ROLES.has(role) && scenario.explicitTransferPermission;
    return {
      allow,
      reason: allow
        ? 'Workspace transfer remains reserved for HQ operators with explicit transfer approval.'
        : 'Application workspace transfer stays denied until a later enforcement phase unless explicitly approved for HQ operators.',
    };
  }

  if (scenario.action === 'bond.override_assignment_scope') {
    return {
      allow: HQ_ROLES.has(role),
      reason: HQ_ROLES.has(role)
        ? 'Assignment scope overrides remain limited to workspace HQ operators.'
        : 'Assignment scope overrides are limited to workspace HQ operators.',
    };
  }

  if (scenario.action === 'bond.assign_workspace') {
    return {
      allow: HQ_ROLES.has(role),
      reason: HQ_ROLES.has(role)
        ? 'Workspace assignment is limited to workspace HQ operators.'
        : 'Workspace assignment is limited to workspace HQ operators.',
    };
  }

  if (scenario.action === 'bond.assign_region') {
    const allow = HQ_ROLES.has(role) || (REGION_ROLES.has(role) && matchesRegion(base, scenario, transaction));
    return {
      allow,
      reason: allow
        ? 'Region assignment is limited to workspace HQ or in-region regional managers.'
        : 'Region assignment is limited to workspace HQ or in-region regional managers.',
    };
  }

  if (scenario.action === 'bond.assign_unit') {
    const allow =
      HQ_ROLES.has(role) ||
      (REGION_ROLES.has(role) && matchesRegion(base, scenario, transaction)) ||
      ((UNIT_ROLES.has(role) || role === 'manager') && matchesUnit(base, scenario, transaction));
    return {
      allow,
      reason: allow
        ? 'Unit assignment is limited to workspace HQ or managers operating inside their own region or unit.'
        : 'Unit assignment stays limited to workspace HQ or managers operating inside their own region or unit.',
    };
  }

  if (scenario.action === 'bond.assign_consultant' ||
      scenario.action === 'bond.assign_processor' ||
      scenario.action === 'bond.assign_manager' ||
      scenario.action === 'bond.assign_compliance' ||
      scenario.action === 'bond.clear_assignment') {
    if (role === 'personal_originator') {
      return {
        allow: Boolean(scenario.personalOriginatorOwnsTransaction),
        reason: scenario.personalOriginatorOwnsTransaction
          ? 'Personal originator owners may safely manage assignment on their own workflow without branch or region requirements.'
          : 'Personal originator assignment mutation stays limited to owned workflows.',
      };
    }

    if (HQ_ROLES.has(role)) {
      return {
        allow: true,
        reason: 'Workspace HQ operators may mutate assignment inside their workspace.',
      };
    }

    if (REGION_ROLES.has(role)) {
      const allow = matchesRegion(base, scenario, transaction);
      return {
        allow,
        reason: allow
          ? 'Regional managers may mutate assignment inside their own region.'
          : 'Regional managers may not mutate assignment outside their own region.',
      };
    }

    if (UNIT_ROLES.has(role) || role === 'manager') {
      const allow = matchesUnit(base, scenario, transaction);
      return {
        allow,
        reason: allow
          ? 'Branch and team managers may mutate assignment inside their own unit.'
          : 'Branch and team managers may not mutate assignment outside their own unit.',
      };
    }

    if (ASSIGNED_ROLES.has(role)) {
      return {
        allow: false,
        reason: `${role} users may not perform sensitive assignment mutation by default.`,
      };
    }

    return {
      allow: false,
      reason: 'No sensitive assignment mutation grant exists for this role.',
    };
  }

  return {
    allow: false,
    reason: 'Unknown sensitive mutation action.',
  };
}

function createCategories() {
  return {
    currentAllows_phase5fAllows: 0,
    currentAllows_phase5fDenies: 0,
    currentDenies_phase5fAllows: 0,
    currentDenies_phase5fDenies: 0,
    expectedSensitiveTightening: 0,
    expectedCanonicalExpansion: 0,
    unexpectedAllow: 0,
    unexpectedDeny: 0,
    excludedLegacyMutationCompat: 0,
    manualReviewMutationExcluded: 0,
    canonicalReadyMutationAllowed: 0,
    canonicalReadyMutationDenied: 0,
  };
}

function createMismatchReporting() {
  return {
    unexpectedAllowSamples: [],
    unexpectedDenySamples: [],
    expectedSensitiveTighteningSamples: [],
    expectedCanonicalExpansionSamples: [],
  };
}

function pushSample(target = [], sample = {}, sampleLimit = SAMPLE_LIMIT) {
  if (sampleLimit >= 0 && target.length >= sampleLimit) return;
  target.push(sample);
}

function incrementGroup(group = {}, key = '') {
  const normalized = normalizeText(key) || 'unknown';
  group[normalized] = (group[normalized] || 0) + 1;
}

function buildSample(outcome = {}) {
  return {
    scenarioId: outcome.scenarioId,
    transactionId: outcome.transactionId,
    actorUserId: outcome.actorUserId,
    actorRole: outcome.actorRole,
    workspaceRole: outcome.workspaceRole,
    scopeLevel: outcome.scopeLevel,
    regionId: outcome.regionId,
    workspaceUnitId: outcome.workspaceUnitId,
    action: outcome.action,
    currentAllowed: outcome.currentAllowed,
    canonicalAllowed: outcome.canonicalAllowed,
    phase5fAllowed: outcome.phase5fAllowed,
    expectedPhase5f: outcome.expectedPhase5f,
    expectedDifference: outcome.expectedDifference,
    finalClassification: outcome.finalClassification,
    reason: outcome.reason,
    canonicalReason: outcome.canonicalReason,
    currentReason: outcome.currentReason,
    exclusionStatus: outcome.exclusionStatus,
    assignmentSummary: outcome.assignmentSummary,
    targetWorkspaceId: outcome.targetWorkspaceId,
    targetRegionId: outcome.targetRegionId,
    targetWorkspaceUnitId: outcome.targetWorkspaceUnitId,
    targetScopeLevel: outcome.targetScopeLevel,
    explicitSubmitPermission: outcome.explicitSubmitPermission,
  };
}

function groupedSummary(samples = []) {
  const byAction = {};
  const byRole = {};
  const byScope = {};

  for (const sample of samples) {
    incrementGroup(byAction, sample.action);
    incrementGroup(byRole, sample.actorRole);
    incrementGroup(byScope, sample.scopeLevel || 'none');
  }

  return { byAction, byRole, byScope };
}

function classificationForOutcome(outcome = {}) {
  if (outcome.forcedClassification) return outcome.forcedClassification;
  if (outcome.phase5fAllowed !== outcome.expectedPhase5f) {
    return outcome.phase5fAllowed ? 'unexpectedAllow' : 'unexpectedDeny';
  }
  if (outcome.expectedDifference === 'expectedSensitiveTightening') return 'expectedSensitiveTightening';
  if (outcome.expectedDifference === 'expectedCanonicalExpansion') return 'expectedCanonicalExpansion';
  return null;
}

function actionBreakdownTemplate() {
  return Object.fromEntries(
    SENSITIVE_MUTATION_ACTIONS.map((action) => [
      action,
      {
        evaluations: 0,
        currentAllows: 0,
        phase5fAllows: 0,
        phase5fDenies: 0,
      },
    ]),
  );
}

function currentAllowedForAction(base = {}, action = '') {
  if (SUBMIT_ACTIONS.has(action)) {
    return {
      allowed: Boolean(base.currentSubmitAllowed),
      reason: base.currentSubmitReason || base.currentBroadReason,
    };
  }

  if (ASSIGNMENT_ACTIONS.has(action)) {
    return {
      allowed: Boolean(base.currentAssignmentAllowed),
      reason: base.currentAssignmentReason || base.currentBroadReason,
    };
  }

  return {
    allowed: Boolean(base.currentBroadAllowed),
    reason: base.currentBroadReason,
  };
}

export function simulate(options = {}) {
  const payload = options.inputPayload || readJson(options.inputPath || INPUT_PATH);
  const exclusionMap = buildExclusionMap({
    exclusions: readOptionalJson(options.exclusionsPath || EXCLUSIONS_PATH),
    manualMappings: readOptionalJson(options.manualMappingPath || MANUAL_MAPPING_PATH),
  });
  const baseReport =
    options.baseReport ||
    simulatePhase5c({
      inputPath: options.inputPath || INPUT_PATH,
      sampleLimit: 0,
    });

  const transactionMap = buildTransactionMap(payload);
  const userEmailMap = buildUserEmailMap(payload);
  const baseMap = baseScenarioMap(baseReport);
  const baseEntries = baseMap.size
    ? Array.from(baseMap.values())
    : buildFallbackBaseEntries(payload, transactionMap, userEmailMap, exclusionMap);
  const effectiveBaseMap = new Map(
    baseEntries.map((entry) => [`${normalizeText(entry.transactionId)}:${normalizeText(entry.actorUserId)}`, entry]),
  );
  const rawScenarios =
    options.scenarios ||
    payload.phase5f_sensitive_mutation_scenarios ||
    payload.sensitive_mutation_scenarios ||
    defaultScenarios(baseEntries, transactionMap, userEmailMap);

  const categories = createCategories();
  const mismatchReporting = createMismatchReporting();
  const actionBreakdown = actionBreakdownTemplate();
  const scenarioOutcomes = [];

  for (const rawScenario of rawScenarios) {
    const transaction = transactionMap.get(normalizeText(rawScenario.transactionId || rawScenario.transaction_id));
    if (!transaction) continue;

    const scenario = normalizeScenario(rawScenario, transaction);
    const pairKey = `${scenario.transactionId}:${scenario.actorUserId}`;
    const base = effectiveBaseMap.get(pairKey);
    if (!base) continue;

    const current = currentAllowedForAction(base, scenario.action);
    const exclusionStatus = base.exclusionStatus || { excluded: false, exclusionType: null };
    let canonicalDecision;

    if (SUBMIT_ACTIONS.has(scenario.action)) {
      canonicalDecision = canSubmitCanonical(base, transaction, scenario, userEmailMap);
    } else {
      canonicalDecision = canAssignmentMutation(base, transaction, scenario);
    }

    let forcedClassification = null;
    let phase5fAllowed = canonicalDecision.allow;
    let reason = canonicalDecision.reason;

    if (isManualReview(base)) {
      forcedClassification = 'manualReviewMutationExcluded';
      phase5fAllowed = false;
      reason = 'Manual review rows remain excluded from sensitive mutation enforcement.';
    } else if (!base.canonicalReady || isExcluded(base)) {
      forcedClassification = 'excludedLegacyMutationCompat';
      phase5fAllowed = false;
      reason = 'Excluded and non-canonical-ready rows remain on the legacy compatibility path for sensitive mutations.';
    }

    let expectedDifference = null;
    if (!forcedClassification && current.allowed && !phase5fAllowed) {
      expectedDifference = 'expectedSensitiveTightening';
    } else if (!forcedClassification && !current.allowed && phase5fAllowed) {
      expectedDifference = 'expectedCanonicalExpansion';
    }

    const outcome = {
      scenarioId: scenario.id || `${scenario.transactionId}:${scenario.actorUserId}:${scenario.action}`,
      transactionId: scenario.transactionId,
      actorUserId: scenario.actorUserId,
      actorRole: base.actorRole,
      workspaceRole: base.workspaceRole,
      scopeLevel: base.scopeLevel,
      regionId: base.regionId,
      workspaceUnitId: base.workspaceUnitId,
      action: scenario.action,
      currentAllowed: current.allowed,
      canonicalAllowed: canonicalDecision.allow,
      phase5fAllowed,
      expectedPhase5f: phase5fAllowed,
      expectedDifference,
      currentReason: current.reason,
      canonicalReason: canonicalDecision.reason,
      reason,
      exclusionStatus,
      assignmentSummary: base.assignmentSummary,
      forcedClassification,
      canonicalReady: Boolean(base.canonicalReady),
      targetWorkspaceId: scenario.targetWorkspaceId,
      targetRegionId: scenario.targetRegionId,
      targetWorkspaceUnitId: scenario.targetWorkspaceUnitId,
      targetScopeLevel: scenario.targetScopeLevel,
      explicitSubmitPermission: scenario.explicitSubmitPermission,
    };

    outcome.finalClassification = classificationForOutcome(outcome);
    scenarioOutcomes.push(outcome);

    if (current.allowed && phase5fAllowed) categories.currentAllows_phase5fAllows += 1;
    else if (current.allowed && !phase5fAllowed) categories.currentAllows_phase5fDenies += 1;
    else if (!current.allowed && phase5fAllowed) categories.currentDenies_phase5fAllows += 1;
    else categories.currentDenies_phase5fDenies += 1;

    if (forcedClassification === 'manualReviewMutationExcluded') {
      categories.manualReviewMutationExcluded += 1;
    } else if (forcedClassification === 'excludedLegacyMutationCompat') {
      categories.excludedLegacyMutationCompat += 1;
    } else if (base.canonicalReady) {
      if (phase5fAllowed) categories.canonicalReadyMutationAllowed += 1;
      else categories.canonicalReadyMutationDenied += 1;
    }

    if (outcome.finalClassification === 'expectedSensitiveTightening') {
      categories.expectedSensitiveTightening += 1;
      pushSample(mismatchReporting.expectedSensitiveTighteningSamples, buildSample(outcome), options.sampleLimit ?? SAMPLE_LIMIT);
    } else if (outcome.finalClassification === 'expectedCanonicalExpansion') {
      categories.expectedCanonicalExpansion += 1;
      pushSample(mismatchReporting.expectedCanonicalExpansionSamples, buildSample(outcome), options.sampleLimit ?? SAMPLE_LIMIT);
    } else if (outcome.finalClassification === 'unexpectedAllow') {
      categories.unexpectedAllow += 1;
      pushSample(mismatchReporting.unexpectedAllowSamples, buildSample(outcome), options.sampleLimit ?? SAMPLE_LIMIT);
    } else if (outcome.finalClassification === 'unexpectedDeny') {
      categories.unexpectedDeny += 1;
      pushSample(mismatchReporting.unexpectedDenySamples, buildSample(outcome), options.sampleLimit ?? SAMPLE_LIMIT);
    }

    const breakdown = actionBreakdown[scenario.action];
    breakdown.evaluations += 1;
    if (current.allowed) breakdown.currentAllows += 1;
    if (phase5fAllowed) breakdown.phase5fAllows += 1;
    else breakdown.phase5fDenies += 1;
  }

  const unexpectedAllowGroups = groupedSummary(mismatchReporting.unexpectedAllowSamples);
  const unexpectedDenyGroups = groupedSummary(mismatchReporting.unexpectedDenySamples);

  return {
    input: {
      transactions: transactionMap.size,
      users: baseEntries.length,
      actions: [...SENSITIVE_MUTATION_ACTIONS],
      scenariosEvaluated: scenarioOutcomes.length,
    },
    categories,
    actionBreakdown,
    mismatchReporting: {
      ...mismatchReporting,
      unexpectedAllowByAction: unexpectedAllowGroups.byAction,
      unexpectedAllowByRole: unexpectedAllowGroups.byRole,
      unexpectedAllowByScope: unexpectedAllowGroups.byScope,
      unexpectedDenyByAction: unexpectedDenyGroups.byAction,
      unexpectedDenyByRole: unexpectedDenyGroups.byRole,
      unexpectedDenyByScope: unexpectedDenyGroups.byScope,
    },
    scenarioOutcomes,
  };
}

function main() {
  const report = simulate();
  writeJsonIfRequested(report, OUTPUT_PATH);
  console.log(JSON.stringify(report, null, 2));
}

const isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMainModule) {
  main();
}
