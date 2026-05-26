#!/usr/bin/env node
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const INPUT_PATH =
  process.env.BOND_ASSIGNMENT_RECONCILIATION_INPUT ||
  process.env.BOND_RLS_SHADOW_INPUT ||
  '/tmp/staging-bond-assignment-export.json'
const MANUAL_MAPPING_PATH = process.env.BOND_ASSIGNMENT_MANUAL_MAPPING || ''
const EXCLUSIONS_PATH = process.env.BOND_RLS_CUTOVER_EXCLUSIONS || ''
const OUTPUT_PATH = process.env.BOND_RLS_PHASE5C_WRITE_OUTPUT || ''
const SAMPLE_LIMIT = Number(process.env.BOND_RLS_SHADOW_SAMPLE_LIMIT || '25')

const EXCLUDED_TYPES = new Set([
  'accepted_unresolved_legacy',
  'manual_review',
  'archived_or_inactive',
  'not_bond_scoped',
  'legacy_compatibility_required',
])

const ACTION_DEFINITIONS = [
  {
    key: 'finance.update_processing_step',
    aliases: ['finance.update_processing_step', 'update_processing_step'],
    capability: 'workflow_mutation',
  },
  {
    key: 'finance.request_documents',
    aliases: ['finance.request_documents', 'request_documents'],
    capability: 'document_upload',
  },
  {
    key: 'finance.review_compliance',
    aliases: ['finance.review_compliance', 'review_compliance'],
    capability: 'workflow_mutation',
  },
  {
    key: 'finance.submit_to_banks',
    aliases: ['finance.submit_to_banks', 'submit_to_banks', 'bank_submission'],
    capability: 'bank_submission',
  },
  {
    key: 'finance.manage_bank_feedback',
    aliases: ['finance.manage_bank_feedback', 'manage_bank_feedback', 'bank_feedback_capture'],
    capability: 'bank_feedback_capture',
  },
  {
    key: 'finance.reassign_processor',
    aliases: ['finance.reassign_processor', 'reassign_processor', 'assignment_manage'],
    capability: 'assignment_manage',
  },
  {
    key: 'finance.workflow_update',
    aliases: ['finance.workflow_update', 'workflow_update', 'workflow_mutation'],
    capability: 'workflow_mutation',
  },
  {
    key: 'finance.internal_finance_mutation',
    aliases: ['finance.internal_finance_mutation', 'internal_finance_mutation', 'finance_details_edit'],
    capability: 'finance_details_edit',
  },
  {
    key: 'finance.upload_documents',
    aliases: ['finance.upload_documents', 'upload_documents', 'document_upload'],
    capability: 'document_upload',
  },
]

const ACTION_MAP = new Map(
  ACTION_DEFINITIONS.flatMap((definition) =>
    definition.aliases.map((alias) => [normalizeText(alias).toLowerCase(), definition]),
  ),
)

const ROLE_CAPABILITY_MATRIX = {
  consultant: new Set(['finance_details_edit', 'workflow_mutation', 'document_upload']),
  processor: new Set([
    'finance_details_edit',
    'workflow_mutation',
    'document_upload',
    'bank_submission',
    'bank_feedback_capture',
  ]),
  manager: new Set([
    'finance_details_edit',
    'workflow_mutation',
    'document_upload',
    'bank_submission',
    'bank_feedback_capture',
    'assignment_manage',
  ]),
  compliance: new Set(['workflow_mutation', 'document_upload', 'bank_feedback_capture']),
  participant: new Set(['document_upload']),
  role_player: new Set(['document_upload']),
}

const UNIT_SCOPE_ROLES = new Set(['branch_manager', 'team_lead', 'manager'])
const REGION_SCOPE_ROLES = new Set(['regional_manager', 'manager'])
const HQ_SCOPE_ROLES = new Set(['owner', 'director', 'hq_manager', 'personal_originator'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function isActive(item = {}) {
  return !item || !item.status || String(item.status).toLowerCase() === 'active'
}

function rowId(row = {}) {
  return normalizeText(row.id || row.transaction_id || row.transactionId)
}

function rowWorkspaceId(row = {}) {
  return normalizeText(row.bond_workspace_id || row.organisation_id || row.workspace_id)
}

function isArchivedOrInactive(row = {}) {
  const lifecycleState = normalizeText(row.lifecycle_state).toLowerCase()
  const operationalState = normalizeText(row.operational_state).toLowerCase()
  return Boolean(
    row.archived_at ||
      row.deleted_at ||
      row.cancelled_at ||
      lifecycleState === 'archived' ||
      lifecycleState === 'inactive' ||
      lifecycleState === 'cancelled' ||
      operationalState === 'archived' ||
      row.is_active === false,
  )
}

function readJsonFromPath(filePath, label) {
  if (!filePath) return null
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function rowsFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.transactions)) return payload.transactions
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function attachRelations(payload = {}) {
  const transactions = rowsFromPayload(payload)
  const participants = Array.isArray(payload.transaction_participants)
    ? payload.transaction_participants
    : Array.isArray(payload.transactionParticipants)
      ? payload.transactionParticipants
      : []
  const rolePlayers = Array.isArray(payload.transaction_role_players)
    ? payload.transaction_role_players
    : Array.isArray(payload.transactionRolePlayers)
      ? payload.transactionRolePlayers
      : []

  const participantMap = new Map()
  const rolePlayerMap = new Map()

  for (const participant of participants) {
    const transactionId = normalizeText(participant.transaction_id || participant.transactionId)
    if (!transactionId) continue
    if (!participantMap.has(transactionId)) participantMap.set(transactionId, [])
    participantMap.get(transactionId).push(participant)
  }

  for (const rolePlayer of rolePlayers) {
    const transactionId = normalizeText(rolePlayer.transaction_id || rolePlayer.transactionId)
    if (!transactionId) continue
    if (!rolePlayerMap.has(transactionId)) rolePlayerMap.set(transactionId, [])
    rolePlayerMap.get(transactionId).push(rolePlayer)
  }

  return transactions.map((transaction) => {
    const transactionId = rowId(transaction)
    return {
      ...transaction,
      transaction_participants: Array.isArray(transaction.transaction_participants)
        ? transaction.transaction_participants
        : participantMap.get(transactionId) || [],
      transaction_role_players: Array.isArray(transaction.transaction_role_players)
        ? transaction.transaction_role_players
        : rolePlayerMap.get(transactionId) || [],
    }
  })
}

function loadManualMappingEntries() {
  if (!MANUAL_MAPPING_PATH) return []
  const entries = readJsonFromPath(MANUAL_MAPPING_PATH, 'manual mapping')
  if (!Array.isArray(entries)) throw new Error('Manual mapping payload must be an array.')
  return entries
}

function loadExclusionEntries() {
  if (!EXCLUSIONS_PATH) return []
  const entries = readJsonFromPath(EXCLUSIONS_PATH, 'cutover exclusions')
  if (!Array.isArray(entries)) throw new Error('Cutover exclusions payload must be an array.')
  return entries
}

function buildExclusionIndex(manualMappings = [], exclusions = []) {
  const index = new Map()

  for (const entry of exclusions) {
    const transactionId = normalizeText(entry.transaction_id || entry.transactionId)
    if (!transactionId || entry.active === false) continue
    index.set(transactionId, {
      exclusionType: normalizeText(
        entry.exclusion_type || entry.exclusionType || 'legacy_compatibility_required',
      ).toLowerCase(),
      source: 'exclusion_file',
      reason: normalizeText(entry.reason),
    })
  }

  for (const entry of manualMappings) {
    const transactionId = normalizeText(entry.transactionId || entry.transaction_id)
    if (!transactionId) continue
    const action = normalizeText(entry.action).toLowerCase()
    if (action === 'accepted_unresolved') {
      index.set(transactionId, {
        exclusionType: 'accepted_unresolved_legacy',
        source: 'manual_mapping',
        reason: normalizeText(entry.reason),
      })
    }
    if (action === 'manual_review') {
      index.set(transactionId, {
        exclusionType: 'manual_review',
        source: 'manual_mapping',
        reason: normalizeText(entry.reason),
      })
    }
  }

  return index
}

function extractParticipantSignals(row = {}) {
  const participants = Array.isArray(row.transaction_participants) ? row.transaction_participants : []
  const rolePlayers = Array.isArray(row.transaction_role_players) ? row.transaction_role_players : []

  return {
    participantRows: participants.filter((item) => isActive(item)),
    rolePlayerRows: rolePlayers.filter((item) => isActive(item)),
  }
}

function userMatchesByIdOrEmail(user = {}, candidateUserId = '', candidateEmail = '') {
  const userId = normalizeText(user.id || user.userId)
  const userEmail = normalizeEmail(user.email)
  if (userId && candidateUserId && userId === normalizeText(candidateUserId)) return true
  if (userEmail && candidateEmail && userEmail === normalizeEmail(candidateEmail)) return true
  return false
}

function buildUsers(payload = {}) {
  const authUsers = Array.isArray(payload.authUsers)
    ? payload.authUsers
    : Array.isArray(payload.auth_users)
      ? payload.auth_users
      : []
  const organisationUsers = Array.isArray(payload.organisation_users)
    ? payload.organisation_users
    : Array.isArray(payload.organisationUsers)
      ? payload.organisationUsers
      : []

  const usersById = new Map()

  for (const authUser of authUsers) {
    const id = normalizeText(authUser.id || authUser.userId)
    if (!id) continue
    usersById.set(id, {
      id,
      email: normalizeEmail(authUser.email),
      name: normalizeText(authUser.name),
      memberships: [],
    })
  }

  for (const membership of organisationUsers) {
    const userId = normalizeText(membership.user_id || membership.userId)
    if (!userId) continue
    if (!usersById.has(userId)) {
      usersById.set(userId, {
        id: userId,
        email: normalizeEmail(membership.email),
        name: normalizeText(membership.name),
        memberships: [],
      })
    }
    usersById.get(userId).memberships.push(membership)
  }

  return [...usersById.values()]
}

function resolveActionDefinition(action = '', capability = '') {
  const actionKey = normalizeText(action).toLowerCase()
  const capabilityKey = normalizeText(capability).toLowerCase()
  if (actionKey && ACTION_MAP.has(actionKey)) {
    return ACTION_MAP.get(actionKey)
  }
  if (capabilityKey) {
    const fallback = ACTION_DEFINITIONS.find((definition) => definition.capability === capabilityKey)
    if (fallback) return fallback
  }
  return null
}

function activeWorkspaceMemberships(user = {}, row = {}) {
  const workspaceId = rowWorkspaceId(row)
  if (!workspaceId) return []
  return (Array.isArray(user.memberships) ? user.memberships : []).filter((membership) => {
    if (!isActive(membership)) return false
    return normalizeText(membership.organisation_id || membership.workspaceId) === workspaceId
  })
}

function sortMemberships(memberships = []) {
  return [...memberships].sort((left, right) => {
    const leftScore = membershipPriority(left)
    const rightScore = membershipPriority(right)
    return rightScore - leftScore
  })
}

function membershipPriority(membership = {}) {
  const scopeLevel = normalizeText(membership.scopeLevel || membership.scope_level).toLowerCase()
  const workspaceRole = normalizeText(membership.workspaceRole || membership.workspace_role || membership.role).toLowerCase()
  if (scopeLevel === 'workspace_hq' || HQ_SCOPE_ROLES.has(workspaceRole)) return 400
  if (scopeLevel === 'region') return 300
  if (scopeLevel === 'branch') return 200
  if (scopeLevel === 'team') return 150
  if (scopeLevel === 'assigned') return 100
  return 0
}

function hasParticipantMatch(user = {}, row = {}) {
  const { participantRows } = extractParticipantSignals(row)
  return participantRows.some((participant) =>
    userMatchesByIdOrEmail(
      user,
      participant.user_id || participant.userId,
      participant.participant_email || participant.email,
    ),
  )
}

function hasRolePlayerMatch(user = {}, row = {}) {
  const { rolePlayerRows } = extractParticipantSignals(row)
  return rolePlayerRows.some((rolePlayer) =>
    userMatchesByIdOrEmail(
      user,
      rolePlayer.user_id || rolePlayer.userId,
      rolePlayer.email_address || rolePlayer.participant_email || rolePlayer.email,
    ),
  )
}

function resolveActorContext(user = {}, row = {}) {
  const userId = normalizeText(user.id || user.userId)
  const memberships = sortMemberships(activeWorkspaceMemberships(user, row))
  const primaryMembership = memberships[0] || null
  const workspaceRole = normalizeText(
    primaryMembership?.workspaceRole || primaryMembership?.workspace_role || primaryMembership?.role,
  ).toLowerCase()
  const scopeLevel = normalizeText(primaryMembership?.scopeLevel || primaryMembership?.scope_level).toLowerCase()
  const regionId = normalizeText(primaryMembership?.region_id)
  const workspaceUnitId = normalizeText(primaryMembership?.workspace_unit_id)

  let assignmentRole = null
  if (userId && userId === normalizeText(row.primary_bond_consultant_user_id)) assignmentRole = 'consultant'
  if (userId && userId === normalizeText(row.assigned_bond_processor_user_id)) assignmentRole = 'processor'
  if (userId && userId === normalizeText(row.assigned_bond_manager_user_id)) assignmentRole = 'manager'
  if (userId && userId === normalizeText(row.assigned_bond_compliance_user_id)) assignmentRole = 'compliance'

  const participantMatch = hasParticipantMatch(user, row)
  const rolePlayerMatch = hasRolePlayerMatch(user, row)

  const actorRole =
    assignmentRole ||
    (participantMatch ? 'participant' : null) ||
    (rolePlayerMatch ? 'role_player' : null) ||
    workspaceRole ||
    'unrelated'

  return {
    actorRole,
    assignmentRole,
    workspaceRole: workspaceRole || null,
    scopeLevel: scopeLevel || null,
    regionId: regionId || null,
    workspaceUnitId: workspaceUnitId || null,
    participantMatch,
    rolePlayerMatch,
    memberships,
  }
}

function membershipAllowsCurrent(actorContext = {}, row = {}) {
  if (!actorContext.workspaceRole && !actorContext.scopeLevel) {
    return { allow: false, reason: 'no_workspace_membership_match' }
  }

  if (actorContext.scopeLevel === 'workspace_hq' || HQ_SCOPE_ROLES.has(actorContext.workspaceRole || '')) {
    return {
      allow: true,
      reason: `workspace_hq_membership:${actorContext.workspaceRole || 'workspace_hq'}`,
    }
  }

  if (
    actorContext.scopeLevel === 'region' &&
    actorContext.regionId &&
    normalizeText(row.bond_region_id) === actorContext.regionId
  ) {
    return { allow: true, reason: `region_membership:${actorContext.regionId}` }
  }

  if (
    ['branch', 'team'].includes(actorContext.scopeLevel || '') &&
    actorContext.workspaceUnitId &&
    normalizeText(row.bond_workspace_unit_id) === actorContext.workspaceUnitId
  ) {
    return { allow: true, reason: `workspace_unit_membership:${actorContext.workspaceUnitId}` }
  }

  if (actorContext.scopeLevel === 'region') {
    return { allow: false, reason: 'region_membership_out_of_scope' }
  }

  if (['branch', 'team'].includes(actorContext.scopeLevel || '')) {
    return { allow: false, reason: 'workspace_unit_membership_out_of_scope' }
  }

  return { allow: false, reason: 'workspace_membership_without_scope_match' }
}

function evaluateCurrentAccess(user = {}, row = {}, actorContext = null) {
  const context = actorContext || resolveActorContext(user, row)
  const userEmail = normalizeEmail(user.email)
  const userName = normalizeText(user.name).toLowerCase()

  if (context.assignmentRole) {
    return { allow: true, reason: `direct_assignment:${context.assignmentRole}` }
  }

  if (context.participantMatch) {
    return { allow: true, reason: 'transaction_participant' }
  }

  if (context.rolePlayerMatch) {
    return { allow: true, reason: 'transaction_role_player' }
  }

  if (userEmail && normalizeEmail(row.assigned_bond_originator_email) === userEmail) {
    return { allow: true, reason: 'legacy_assigned_bond_originator_email' }
  }

  if (userEmail && normalizeEmail(row.bond_originator) === userEmail) {
    return { allow: true, reason: 'legacy_bond_originator_email' }
  }

  if (userName && normalizeText(row.bond_originator).toLowerCase() === userName) {
    return { allow: true, reason: 'legacy_bond_originator_text' }
  }

  return membershipAllowsCurrent(context, row)
}

function scopedWriteEvaluation(actorContext = {}, row = {}) {
  if (!actorContext.workspaceRole && !actorContext.scopeLevel) {
    return { allow: false, reason: 'no_scoped_write_membership' }
  }

  if (actorContext.scopeLevel === 'workspace_hq' || HQ_SCOPE_ROLES.has(actorContext.workspaceRole || '')) {
    return {
      allow: true,
      reason: `scoped_write_workspace_hq:${actorContext.workspaceRole || 'workspace_hq'}`,
    }
  }

  if (
    actorContext.scopeLevel === 'region' &&
    REGION_SCOPE_ROLES.has(actorContext.workspaceRole || '') &&
    actorContext.regionId &&
    normalizeText(row.bond_region_id) === actorContext.regionId
  ) {
    return { allow: true, reason: `scoped_write_region:${actorContext.workspaceRole}:${actorContext.regionId}` }
  }

  if (
    ['branch', 'team'].includes(actorContext.scopeLevel || '') &&
    UNIT_SCOPE_ROLES.has(actorContext.workspaceRole || '') &&
    actorContext.workspaceUnitId &&
    normalizeText(row.bond_workspace_unit_id) === actorContext.workspaceUnitId
  ) {
    return {
      allow: true,
      reason: `scoped_write_workspace_unit:${actorContext.workspaceRole}:${actorContext.workspaceUnitId}`,
    }
  }

  if (actorContext.scopeLevel === 'region') {
    return { allow: false, reason: 'scoped_write_region_out_of_scope' }
  }

  if (['branch', 'team'].includes(actorContext.scopeLevel || '')) {
    return { allow: false, reason: 'scoped_write_workspace_unit_out_of_scope' }
  }

  return { allow: false, reason: 'no_scoped_write_path' }
}

function roleCapabilityAllows(actorContext = {}, actionDefinition = null) {
  if (!actionDefinition || !actorContext.assignmentRole) {
    return { allow: false, reason: 'no_assignment_write_path' }
  }

  const capabilitySet = ROLE_CAPABILITY_MATRIX[actorContext.assignmentRole] || new Set()
  if (capabilitySet.has(actionDefinition.capability)) {
    return {
      allow: true,
      reason: `assignment_capability:${actorContext.assignmentRole}:${actionDefinition.capability}`,
    }
  }

  return {
    allow: false,
    reason: `assignment_capability_denied:${actorContext.assignmentRole}:${actionDefinition.capability}`,
  }
}

function participantWriteAllows(actorContext = {}, actionDefinition = null) {
  if (!actionDefinition) {
    return { allow: false, reason: 'no_participant_write_path' }
  }

  if (actorContext.participantMatch && actionDefinition.key === 'finance.upload_documents') {
    return { allow: true, reason: 'participant_document_upload' }
  }

  if (actorContext.rolePlayerMatch && actionDefinition.key === 'finance.upload_documents') {
    return { allow: true, reason: 'role_player_document_upload' }
  }

  if (actorContext.participantMatch) {
    return { allow: false, reason: 'participant_write_restricted_to_document_upload' }
  }

  if (actorContext.rolePlayerMatch) {
    return { allow: false, reason: 'role_player_write_restricted_to_document_upload' }
  }

  return { allow: false, reason: 'no_participant_write_path' }
}

function canonicalReady(row = {}, exclusion = null) {
  const exclusionType = exclusion?.exclusionType || null
  if (!rowId(row)) return false
  if (!rowWorkspaceId(row)) return false
  if (EXCLUDED_TYPES.has(exclusionType)) return false
  if (isArchivedOrInactive(row)) return false
  return true
}

function evaluateCanonicalWrite(user = {}, row = {}, actionDefinition = null, exclusion = null, currentAccess = false) {
  const actorContext = resolveActorContext(user, row)

  if (!actionDefinition) {
    return {
      allow: false,
      canonicalReady: false,
      excluded: false,
      exclusionType: exclusion?.exclusionType || null,
      reason: 'unknown_action_definition',
      actorContext,
    }
  }

  if (!canonicalReady(row, exclusion)) {
    return {
      allow: currentAccess,
      canonicalReady: false,
      excluded: true,
      exclusionType: exclusion?.exclusionType || (isArchivedOrInactive(row) ? 'archived_or_inactive' : null),
      reason: `legacy_compat_exclusion:${exclusion?.exclusionType || 'archived_or_inactive_or_not_ready'}`,
      actorContext,
    }
  }

  const scopedEvaluation = scopedWriteEvaluation(actorContext, row)
  if (scopedEvaluation.allow) {
    return {
      allow: true,
      canonicalReady: true,
      excluded: false,
      exclusionType: null,
      reason: scopedEvaluation.reason,
      actorContext,
    }
  }

  const assignmentEvaluation = roleCapabilityAllows(actorContext, actionDefinition)
  if (assignmentEvaluation.allow) {
    return {
      allow: true,
      canonicalReady: true,
      excluded: false,
      exclusionType: null,
      reason: assignmentEvaluation.reason,
      actorContext,
    }
  }

  const participantEvaluation = participantWriteAllows(actorContext, actionDefinition)
  if (participantEvaluation.allow) {
    return {
      allow: true,
      canonicalReady: true,
      excluded: false,
      exclusionType: null,
      reason: participantEvaluation.reason,
      actorContext,
    }
  }

  return {
    allow: false,
    canonicalReady: true,
    excluded: false,
    exclusionType: null,
    reason: [scopedEvaluation.reason, assignmentEvaluation.reason, participantEvaluation.reason]
      .filter(Boolean)
      .join(' | '),
    actorContext,
  }
}

function expectedCanonicalForActor(actorContext = {}, row = {}, actionDefinition = null) {
  if (!actionDefinition) {
    return { allow: false, reason: 'Unknown action definition.' }
  }

  const scopedEvaluation = scopedWriteEvaluation(actorContext, row)
  if (scopedEvaluation.allow) {
    return {
      allow: true,
      reason: 'Scoped managers, HQ members, and personal-originator owners may mutate in-scope workflows.',
    }
  }

  const assignmentEvaluation = roleCapabilityAllows(actorContext, actionDefinition)
  if (assignmentEvaluation.allow) {
    return {
      allow: true,
      reason: expectedAllowReason(actorContext.assignmentRole, actionDefinition),
    }
  }

  const participantEvaluation = participantWriteAllows(actorContext, actionDefinition)
  if (participantEvaluation.allow) {
    return {
      allow: true,
      reason: 'Participants and role players may upload requested documents when explicitly involved.',
    }
  }

  return {
    allow: false,
    reason: expectedDenyReason(actorContext, actionDefinition),
  }
}

function expectedAllowReason(role = '', actionDefinition = null) {
  switch (role) {
    case 'consultant':
      if (actionDefinition?.key === 'finance.request_documents') {
        return 'Assigned consultants should request documents in their own workflow.'
      }
      return 'Assigned consultants may edit finance details and workflow steps within their own assignments.'
    case 'processor':
      if (actionDefinition?.key === 'finance.manage_bank_feedback') {
        return 'Assigned processors should manage bank feedback under the finance-operations model.'
      }
      if (actionDefinition?.key === 'finance.update_processing_step') {
        return 'Assigned processors should update their own processing steps.'
      }
      return 'Assigned processors may mutate their own operational workflow actions.'
    case 'compliance':
      if (actionDefinition?.key === 'finance.review_compliance') {
        return 'Assigned compliance users should review compliance workflow steps.'
      }
      return 'Assigned compliance users may mutate compliance-owned workflow actions.'
    case 'manager':
      return 'Assigned bond managers may perform assignment and workflow mutations on their own cases.'
    default:
      return 'Canonical write access is allowed for this role and action.'
  }
}

function expectedDenyReason(actorContext = {}, actionDefinition = null) {
  if (actorContext.participantMatch || actorContext.rolePlayerMatch) {
    return actionDefinition?.key === 'finance.upload_documents'
      ? 'Participants and role players may upload documents only when explicitly allowed.'
      : 'Participants and role players should not perform internal finance mutations by default.'
  }

  switch (actorContext.assignmentRole) {
    case 'consultant':
      if (actionDefinition?.key === 'finance.reassign_processor') {
        return 'Consultants may view and coordinate work but should not reassign processors by default.'
      }
      return 'Assigned consultants should not perform this sensitive mutation by default.'
    case 'processor':
      if (actionDefinition?.key === 'finance.reassign_processor') {
        return 'Processors should not reassign processors or managers by default.'
      }
      return 'Assigned processors should not perform this mutation without a matching operational grant.'
    case 'compliance':
      if (actionDefinition?.key === 'finance.submit_to_banks') {
        return 'Compliance may review compliance work but should not submit to banks by default.'
      }
      return 'Assigned compliance users should not perform this mutation without a matching compliance grant.'
    case 'manager':
      return 'Managers should not mutate outside the write capability matrix or outside scope.'
    default:
      break
  }

  if (actorContext.scopeLevel === 'region') {
    return 'Regional managers should not mutate outside their region.'
  }

  if (['branch', 'team'].includes(actorContext.scopeLevel || '')) {
    return 'Branch and team managers should not mutate outside their branch or team.'
  }

  if (actorContext.actorRole === 'personal_originator') {
    return 'Personal-originator owners may mutate only their own workspace workflow.'
  }

  return 'No canonical write grant exists for this role, scope, and action.'
}

function deriveExpectedOutcome(actorContext = {}, row = {}, actionDefinition = null, currentEvaluation = {}, exclusion = null) {
  if (exclusion?.exclusionType === 'manual_review') {
    return {
      expectedCanonical: currentEvaluation.allow,
      expectedDifference: null,
      reason: 'Manual review rows remain excluded from strict canonical write enforcement.',
      forcedClassification: 'manualReviewWriteExcluded',
    }
  }

  if (exclusion?.exclusionType && EXCLUDED_TYPES.has(exclusion.exclusionType)) {
    return {
      expectedCanonical: currentEvaluation.allow,
      expectedDifference: null,
      reason: 'Excluded legacy rows remain legacy-compatible during write simulation.',
      forcedClassification: 'excludedLegacyWriteCompat',
    }
  }

  const expected = expectedCanonicalForActor(actorContext, row, actionDefinition)
  let expectedDifference = null

  if (currentEvaluation.allow && !expected.allow) {
    expectedDifference = 'expectedWriteTightening'
  }
  if (!currentEvaluation.allow && expected.allow) {
    expectedDifference = 'expectedCanonicalExpansion'
  }

  return {
    expectedCanonical: expected.allow,
    expectedDifference,
    reason: expected.reason,
    forcedClassification: null,
  }
}

function createCategories() {
  return {
    allowedByCurrent_allowedByCanonical: 0,
    allowedByCurrent_deniedByCanonical: 0,
    deniedByCurrent_allowedByCanonical: 0,
    deniedByCurrent_deniedByCanonical: 0,
    expectedWriteTightening: 0,
    expectedCanonicalExpansion: 0,
    unexpectedAllow: 0,
    unexpectedDeny: 0,
    intentionalChanges: 0,
    excludedLegacyWriteCompat: 0,
    manualReviewWriteExcluded: 0,
    canonicalReadyWriteAllowed: 0,
    canonicalReadyWriteDenied: 0,
  }
}

function createActionBreakdown() {
  return Object.fromEntries(
    ACTION_DEFINITIONS.map((definition) => [
      definition.key,
      {
        evaluations: 0,
        allows: 0,
        denies: 0,
      },
    ]),
  )
}

function createMismatchReport() {
  return {
    unexpectedAllow: [],
    unexpectedDeny: [],
    expectedWriteTightening: [],
    expectedCanonicalExpansion: [],
  }
}

function buildAssignmentSummary(row = {}) {
  return {
    consultantUserId: normalizeText(row.primary_bond_consultant_user_id) || null,
    processorUserId: normalizeText(row.assigned_bond_processor_user_id) || null,
    managerUserId: normalizeText(row.assigned_bond_manager_user_id) || null,
    complianceUserId: normalizeText(row.assigned_bond_compliance_user_id) || null,
    assignedBondOriginatorEmail: normalizeText(row.assigned_bond_originator_email) || null,
    bondOriginator: normalizeText(row.bond_originator) || null,
    bondRegionId: normalizeText(row.bond_region_id) || null,
    bondWorkspaceUnitId: normalizeText(row.bond_workspace_unit_id) || null,
  }
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
    expectedCanonical: outcome.expectedCanonical,
    expectedDifference: outcome.expectedDifference,
    finalClassification: outcome.finalClassification,
    reason: outcome.reason,
    canonicalReason: outcome.canonicalReason,
    currentReason: outcome.currentReason,
    exclusionStatus: outcome.exclusionStatus,
    assignmentSummary: outcome.assignmentSummary,
  }
}

function incrementGroup(group = {}, key = '') {
  const normalizedKey = normalizeText(key) || 'unknown'
  group[normalizedKey] = (group[normalizedKey] || 0) + 1
}

function groupedSummary(samples = []) {
  const byAction = {}
  const byRole = {}
  const byScope = {}

  for (const sample of samples) {
    incrementGroup(byAction, sample.action)
    incrementGroup(byRole, sample.actorRole)
    incrementGroup(byScope, sample.scopeLevel || 'none')
  }

  return { byAction, byRole, byScope }
}

function finalClassification(outcome = {}) {
  if (outcome.forcedClassification) return outcome.forcedClassification
  if (outcome.exclusionStatus?.excluded) {
    return outcome.exclusionStatus.exclusionType === 'manual_review'
      ? 'manualReviewWriteExcluded'
      : 'excludedLegacyWriteCompat'
  }
  if (outcome.canonicalAllowed !== outcome.expectedCanonical) {
    return outcome.canonicalAllowed ? 'unexpectedAllow' : 'unexpectedDeny'
  }
  if (outcome.expectedDifference === 'expectedWriteTightening') return 'expectedWriteTightening'
  if (outcome.expectedDifference === 'expectedCanonicalExpansion') return 'expectedCanonicalExpansion'
  if (outcome.canonicalReady && outcome.canonicalAllowed) return 'canonicalReadyWriteAllowed'
  if (outcome.canonicalReady && !outcome.canonicalAllowed) return 'canonicalReadyWriteDenied'
  return 'matchedExpectation'
}

function buildScenarioList(payload = {}, rows = [], users = [], exclusionIndex = new Map()) {
  const explicitScenarios = Array.isArray(payload.simulation_scenarios)
    ? payload.simulation_scenarios
    : Array.isArray(payload.simulationScenarios)
      ? payload.simulationScenarios
      : null

  if (explicitScenarios) {
    return explicitScenarios.map((scenario, index) => ({
      id: normalizeText(scenario.id || `scenario-${index + 1}`),
      transactionId: normalizeText(scenario.transactionId || scenario.transaction_id),
      actorUserId: normalizeText(scenario.actorUserId || scenario.userId || scenario.user_id),
      action: normalizeText(scenario.action),
      capability: normalizeText(scenario.capability),
      expectedCanonical:
        typeof scenario.expectedCanonical === 'boolean' ? scenario.expectedCanonical : undefined,
      expectedDifference: normalizeText(scenario.expectedDifference || scenario.expected_difference) || null,
      reason: normalizeText(scenario.reason),
    }))
  }

  const scenarios = []
  for (const row of rows) {
    const exclusion = exclusionIndex.get(rowId(row)) || null
    for (const user of users) {
      const actorContext = resolveActorContext(user, row)
      const currentEvaluation = evaluateCurrentAccess(user, row, actorContext)
      for (const actionDefinition of ACTION_DEFINITIONS) {
        const expected = deriveExpectedOutcome(actorContext, row, actionDefinition, currentEvaluation, exclusion)
        scenarios.push({
          id: `${rowId(row)}:${normalizeText(user.id)}:${actionDefinition.key}`,
          transactionId: rowId(row),
          actorUserId: normalizeText(user.id),
          action: actionDefinition.key,
          capability: actionDefinition.capability,
          expectedCanonical: expected.expectedCanonical,
          expectedDifference: expected.expectedDifference,
          reason: expected.reason,
        })
      }
    }
  }
  return scenarios
}

function simulate(payload = {}, manualMappings = [], exclusions = [], options = {}) {
  const rows = attachRelations(payload)
  const rowIndex = new Map(rows.map((row) => [rowId(row), row]))
  const users = buildUsers(payload)
  const userIndex = new Map(users.map((user) => [normalizeText(user.id), user]))
  const exclusionIndex = buildExclusionIndex(manualMappings, exclusions)
  const scenarios = buildScenarioList(payload, rows, users, exclusionIndex)
  const categories = createCategories()
  const actionBreakdown = createActionBreakdown()
  const mismatchReporting = createMismatchReport()
  const scenarioOutcomes = []

  for (const scenario of scenarios) {
    const row = rowIndex.get(scenario.transactionId)
    const user = userIndex.get(scenario.actorUserId)
    if (!row || !user) continue

    const exclusion = exclusionIndex.get(scenario.transactionId) || null
    const actionDefinition = resolveActionDefinition(scenario.action, scenario.capability)
    if (!actionDefinition) continue

    const actorContext = resolveActorContext(user, row)
    const currentEvaluation = evaluateCurrentAccess(user, row, actorContext)
    const canonicalEvaluation = evaluateCanonicalWrite(
      user,
      row,
      actionDefinition,
      exclusion,
      currentEvaluation.allow,
    )
    const expectation = deriveExpectedOutcome(actorContext, row, actionDefinition, currentEvaluation, exclusion)
    const expectedCanonical =
      typeof scenario.expectedCanonical === 'boolean'
        ? scenario.expectedCanonical
        : expectation.expectedCanonical
    const expectedDifference = scenario.expectedDifference || expectation.expectedDifference
    const reason = scenario.reason || expectation.reason

    if (currentEvaluation.allow && canonicalEvaluation.allow) {
      categories.allowedByCurrent_allowedByCanonical += 1
    } else if (currentEvaluation.allow && !canonicalEvaluation.allow) {
      categories.allowedByCurrent_deniedByCanonical += 1
    } else if (!currentEvaluation.allow && canonicalEvaluation.allow) {
      categories.deniedByCurrent_allowedByCanonical += 1
    } else {
      categories.deniedByCurrent_deniedByCanonical += 1
    }

    if (canonicalEvaluation.allow) {
      actionBreakdown[actionDefinition.key].allows += 1
    } else {
      actionBreakdown[actionDefinition.key].denies += 1
    }
    actionBreakdown[actionDefinition.key].evaluations += 1

    const canonicalReadyForMetrics = Boolean(canonicalEvaluation.canonicalReady && !canonicalEvaluation.excluded)
    if (canonicalReadyForMetrics && canonicalEvaluation.allow) categories.canonicalReadyWriteAllowed += 1
    if (canonicalReadyForMetrics && !canonicalEvaluation.allow) categories.canonicalReadyWriteDenied += 1

    const outcome = {
      scenarioId: scenario.id,
      transactionId: scenario.transactionId,
      actorUserId: scenario.actorUserId,
      actorRole: actorContext.actorRole,
      workspaceRole: actorContext.workspaceRole,
      scopeLevel: actorContext.scopeLevel,
      regionId: actorContext.regionId,
      workspaceUnitId: actorContext.workspaceUnitId,
      action: actionDefinition.key,
      currentAllowed: currentEvaluation.allow,
      canonicalAllowed: canonicalEvaluation.allow,
      expectedCanonical,
      expectedDifference,
      reason,
      canonicalReason: canonicalEvaluation.reason,
      currentReason: currentEvaluation.reason,
      exclusionStatus: {
        excluded: Boolean(canonicalEvaluation.excluded),
        exclusionType: canonicalEvaluation.exclusionType,
      },
      assignmentSummary: buildAssignmentSummary(row),
      canonicalReady: canonicalReadyForMetrics,
      forcedClassification: expectation.forcedClassification,
    }

    outcome.finalClassification = finalClassification(outcome)

    if (outcome.finalClassification === 'expectedWriteTightening') categories.expectedWriteTightening += 1
    if (outcome.finalClassification === 'expectedCanonicalExpansion') categories.expectedCanonicalExpansion += 1
    if (outcome.finalClassification === 'unexpectedAllow') categories.unexpectedAllow += 1
    if (outcome.finalClassification === 'unexpectedDeny') categories.unexpectedDeny += 1
    if (outcome.finalClassification === 'excludedLegacyWriteCompat') categories.excludedLegacyWriteCompat += 1
    if (outcome.finalClassification === 'manualReviewWriteExcluded') categories.manualReviewWriteExcluded += 1

    if (mismatchReporting[outcome.finalClassification]) {
      mismatchReporting[outcome.finalClassification].push(buildSample(outcome))
    }

    scenarioOutcomes.push(outcome)
  }

  categories.intentionalChanges =
    categories.expectedWriteTightening + categories.expectedCanonicalExpansion

  return {
    input: {
      transactions: rows.length,
      users: users.length,
      actions: ACTION_DEFINITIONS.map((definition) => definition.key),
      scenariosEvaluated: scenarioOutcomes.length,
    },
    categories,
    actionBreakdown,
    mismatchReporting: {
      unexpectedAllowSamples: mismatchReporting.unexpectedAllow.slice(0, SAMPLE_LIMIT),
      unexpectedDenySamples: mismatchReporting.unexpectedDeny.slice(0, SAMPLE_LIMIT),
      expectedWriteTighteningSamples: mismatchReporting.expectedWriteTightening.slice(0, SAMPLE_LIMIT),
      expectedCanonicalExpansionSamples: mismatchReporting.expectedCanonicalExpansion.slice(0, SAMPLE_LIMIT),
      unexpectedAllowByAction: groupedSummary(mismatchReporting.unexpectedAllow).byAction,
      unexpectedAllowByRole: groupedSummary(mismatchReporting.unexpectedAllow).byRole,
      unexpectedAllowByScope: groupedSummary(mismatchReporting.unexpectedAllow).byScope,
      unexpectedDenyByAction: groupedSummary(mismatchReporting.unexpectedDeny).byAction,
      unexpectedDenyByRole: groupedSummary(mismatchReporting.unexpectedDeny).byRole,
      unexpectedDenyByScope: groupedSummary(mismatchReporting.unexpectedDeny).byScope,
    },
    scenarioOutcomes:
      options.includeAllOutcomes ||
      Array.isArray(payload.simulation_scenarios) ||
      Array.isArray(payload.simulationScenarios)
      ? scenarioOutcomes
      : scenarioOutcomes.filter((outcome) => outcome.finalClassification !== 'matchedExpectation').slice(0, SAMPLE_LIMIT),
  }
}

function main() {
  const payload = readJsonFromPath(INPUT_PATH, 'input payload')
  if (!payload) {
    throw new Error(`Input payload file not found: ${INPUT_PATH}`)
  }

  const report = simulate(payload, loadManualMappingEntries(), loadExclusionEntries())
  const output = JSON.stringify(report, null, 2)

  if (OUTPUT_PATH) {
    fs.writeFileSync(OUTPUT_PATH, `${output}\n`)
  }

  console.log(output)
}

export { simulate }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
