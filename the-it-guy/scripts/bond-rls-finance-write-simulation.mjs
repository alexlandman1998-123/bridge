#!/usr/bin/env node
import fs from 'node:fs'

const INPUT_PATH = process.env.BOND_ASSIGNMENT_RECONCILIATION_INPUT || process.env.BOND_RLS_SHADOW_INPUT || '/tmp/staging-bond-assignment-export.json'
const MANUAL_MAPPING_PATH = process.env.BOND_ASSIGNMENT_MANUAL_MAPPING || ''
const EXCLUSIONS_PATH = process.env.BOND_RLS_CUTOVER_EXCLUSIONS || ''
const OUTPUT_PATH = process.env.BOND_FINANCE_WRITE_SIM_OUTPUT || ''
const SAMPLE_LIMIT = Number(process.env.BOND_RLS_SHADOW_SAMPLE_LIMIT || '10')
const ACTION_FILTER = process.env.BOND_FINANCE_WRITE_ACTIONS || process.env.BOND_FINANCE_ACTIONS || ''

const PHASE5C_EXCLUSION_TYPES = new Set([
  'accepted_unresolved_legacy',
  'manual_review',
  'archived_or_inactive',
  'not_bond_scoped',
  'legacy_compatibility_required',
])

const ACTION_DEFINITIONS = Object.freeze([
  { key: 'finance.view', label: 'View finance workflow', scope: 'transaction' },
  { key: 'finance.update_step', label: 'Update finance step', scope: 'step' },
  { key: 'finance.complete_step', label: 'Complete finance step', scope: 'step' },
  { key: 'finance.block_step', label: 'Block finance step', scope: 'step' },
  { key: 'finance.unblock_step', label: 'Unblock finance step', scope: 'step' },
  { key: 'finance.request_documents', label: 'Request finance documents', scope: 'transaction' },
  { key: 'finance.upload_documents', label: 'Upload finance documents', scope: 'transaction' },
  { key: 'finance.review_documents', label: 'Review finance documents', scope: 'transaction' },
  { key: 'finance.manage_bank_feedback', label: 'Manage bank feedback', scope: 'transaction' },
  { key: 'finance.submit_to_banks', label: 'Submit to banks', scope: 'transaction' },
  { key: 'finance.mark_submission_ready', label: 'Mark submission ready', scope: 'transaction' },
  { key: 'finance.record_approval', label: 'Record approval', scope: 'transaction' },
  { key: 'finance.record_decline', label: 'Record decline', scope: 'transaction' },
  { key: 'finance.record_grant', label: 'Record grant', scope: 'transaction' },
  { key: 'finance.escalate', label: 'Escalate workflow', scope: 'transaction' },
  { key: 'finance.reassign_consultant', label: 'Reassign consultant', scope: 'transaction' },
  { key: 'finance.reassign_processor', label: 'Reassign processor', scope: 'transaction' },
  { key: 'finance.assign_compliance', label: 'Assign compliance', scope: 'transaction' },
  { key: 'finance.review_compliance', label: 'Review compliance', scope: 'transaction' },
  { key: 'finance.add_internal_note', label: 'Add internal note', scope: 'transaction' },
  { key: 'finance.add_client_visible_note', label: 'Add client visible note', scope: 'transaction' },
])

const ACTION_INDEX = Object.fromEntries(ACTION_DEFINITIONS.map((entry) => [entry.key, entry]))

const ROLE_MANAGERIAL = new Set([
  'owner',
  'director',
  'hq_manager',
  'regional_manager',
  'branch_manager',
  'team_lead',
  'manager',
])

const ROLE_EXPLICIT_BANK_SUBMITTER = new Set([
  'owner',
  'director',
  'hq_manager',
  'regional_manager',
  'branch_manager',
  'manager',
])

const SCOPE_LEVELS = new Set(['workspace_hq', 'region', 'branch', 'team', 'assigned'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeOrgRole(value = '') {
  return normalizeText(value || '').toLowerCase()
}

function normalizeRoleType(value = '') {
  return normalizeText(value || '').toLowerCase()
}

function rowId(row = {}) {
  return normalizeText(row.id || row.transaction_id || row.transactionId)
}

function isBondScopedOrganization(org = {}) {
  const kind = normalizeText(org.workspace_kind || org.workspaceKind)
  const type = normalizeText(org.type || org.workspace_type || org.workspaceType)
  return kind === 'bond_company' || kind === 'personal_originator' || type === 'bond_originator'
}

function isActive(value = '') {
  if (value === null || value === undefined) return true
  return normalizeText(value).toLowerCase() === 'active'
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
  const steps = Array.isArray(payload.transaction_subprocess_steps)
    ? payload.transaction_subprocess_steps
    : Array.isArray(payload.transactionSubprocessSteps)
      ? payload.transactionSubprocessSteps
      : []
  const financeDetails = Array.isArray(payload.transaction_finance_details)
    ? payload.transaction_finance_details
    : Array.isArray(payload.transactionFinanceDetails)
      ? payload.transactionFinanceDetails
      : []
  const documentRequests = Array.isArray(payload.document_requests)
    ? payload.document_requests
    : Array.isArray(payload.documentRequests)
      ? payload.documentRequests
      : []
  const documents = Array.isArray(payload.documents)
    ? payload.documents
    : []
  const events = Array.isArray(payload.transaction_events)
    ? payload.transaction_events
    : Array.isArray(payload.transactionEvents)
      ? payload.transactionEvents
      : []
  const notifications = Array.isArray(payload.transaction_notifications)
    ? payload.transaction_notifications
    : Array.isArray(payload.transactionNotifications)
      ? payload.transactionNotifications
      : []

  const participantMap = new Map()
  const rolePlayerMap = new Map()
  const stepMap = new Map()
  const financeDetailsMap = new Map()
  const requestMap = new Map()
  const documentMap = new Map()
  const eventMap = new Map()
  const notificationMap = new Map()

  for (const item of participants) {
    const txId = rowId(item)
    if (!txId) continue
    if (!participantMap.has(txId)) participantMap.set(txId, [])
    participantMap.get(txId).push(item)
  }

  for (const item of rolePlayers) {
    const txId = rowId(item)
    if (!txId) continue
    if (!rolePlayerMap.has(txId)) rolePlayerMap.set(txId, [])
    rolePlayerMap.get(txId).push(item)
  }

  for (const item of steps) {
    const txId = normalizeText(item.transaction_id || item.transactionId)
    if (!txId) continue
    if (!stepMap.has(txId)) stepMap.set(txId, [])
    stepMap.get(txId).push(item)
  }

  for (const item of financeDetails) {
    const txId = normalizeText(item.transaction_id || item.transactionId)
    if (!txId) continue
    if (!financeDetailsMap.has(txId)) financeDetailsMap.set(txId, [])
    financeDetailsMap.get(txId).push(item)
  }

  for (const item of documentRequests) {
    const txId = normalizeText(item.transaction_id || item.transactionId)
    if (!txId) continue
    if (!requestMap.has(txId)) requestMap.set(txId, [])
    requestMap.get(txId).push(item)
  }

  for (const item of documents) {
    const txId = normalizeText(item.transaction_id || item.transactionId)
    if (!txId) continue
    if (!documentMap.has(txId)) documentMap.set(txId, [])
    documentMap.get(txId).push(item)
  }

  for (const item of events) {
    const txId = normalizeText(item.transaction_id || item.transactionId)
    if (!txId) continue
    if (!eventMap.has(txId)) eventMap.set(txId, [])
    eventMap.get(txId).push(item)
  }

  for (const item of notifications) {
    const txId = normalizeText(item.transaction_id || item.transactionId)
    if (!txId) continue
    if (!notificationMap.has(txId)) notificationMap.set(txId, [])
    notificationMap.get(txId).push(item)
  }

  return transactions.map((transaction) => {
    const transactionId = rowId(transaction)
    return {
      ...transaction,
      transaction_participants: participantMap.get(transactionId) || [],
      transaction_role_players: rolePlayerMap.get(transactionId) || [],
      transaction_subprocess_steps: stepMap.get(transactionId) || [],
      transaction_finance_details: financeDetailsMap.get(transactionId) || [],
      document_requests: requestMap.get(transactionId) || [],
      documents: documentMap.get(transactionId) || [],
      transaction_events: eventMap.get(transactionId) || [],
      transaction_notifications: notificationMap.get(transactionId) || [],
    }
  })
}

function pickStepKey(transaction = {}, action) {
  const steps = Array.isArray(transaction.transaction_subprocess_steps)
    ? transaction.transaction_subprocess_steps
    : []
  if (!steps.length) return 'application_in_progress'

  if (action === 'finance.review_compliance') {
    const complianceStep = steps.find((item) =>
      normalizeText(item.step_key || '').toLowerCase().includes('compliance'),
    )
    if (complianceStep?.step_key) {
      return normalizeText(complianceStep.step_key)
    }
  }

  const financeStep = steps.find((item) =>
    normalizeText(item.process_type || item.processType || '').toLowerCase() === 'finance',
  )
  const fallback = financeStep?.step_key || steps[0]?.step_key
  return normalizeText(fallback || 'application_in_progress')
}

function buildScopeMap(organisations = [], memberships = []) {
  const scoped = new Map()
  for (const org of organisations) {
    const id = normalizeText(org.id)
    if (!id) continue
    scoped.set(id, org)
  }
  const userMembershipByWorkspace = new Map()
  for (const membership of memberships) {
    const workspaceId = normalizeText(membership.organisation_id || membership.organisationId || membership.workspace_id)
    if (!workspaceId) continue
    if (!userMembershipByWorkspace.has(workspaceId)) {
      userMembershipByWorkspace.set(workspaceId, [])
    }
    userMembershipByWorkspace.get(workspaceId).push(membership)
  }
  return {
    scoped,
    userMembershipByWorkspace,
  }
}

function loadManualMappingEntries() {
  if (!MANUAL_MAPPING_PATH) return []
  const entries = readJsonFromPath(MANUAL_MAPPING_PATH, 'manual mapping')
  if (!Array.isArray(entries)) {
    throw new Error('Manual mapping payload must be an array.')
  }
  return entries
}

function buildExclusionIndex(manualMappings = [], exclusions = []) {
  const index = new Map()

  for (const exclusion of exclusions) {
    const transactionId = normalizeText(exclusion.transaction_id || exclusion.transactionId)
    if (!transactionId) continue
    if (exclusion.active === false) continue
    const exclusionType = normalizeText(
      exclusion.exclusion_type || exclusion.exclusionType || 'legacy_compatibility_required',
    )
    index.set(transactionId, {
      exclusionType: PHASE5C_EXCLUSION_TYPES.has(exclusionType)
        ? exclusionType
        : 'legacy_compatibility_required',
      source: normalizeText(exclusion.source || 'exclusion_file'),
      reason: normalizeText(exclusion.reason || ''),
    })
  }

  for (const mapping of manualMappings) {
    const transactionId = normalizeText(mapping.transactionId || mapping.transaction_id)
    if (!transactionId) continue
    const action = normalizeText(mapping.action || '').toLowerCase()
    if (action === 'accepted_unresolved') {
      index.set(transactionId, {
        exclusionType: 'accepted_unresolved_legacy',
        source: 'manual_mapping',
        reason: normalizeText(mapping.reason || ''),
      })
    }
  }

  return index
}

function normalizeScopeLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  return SCOPE_LEVELS.has(normalized) ? normalized : 'assigned'
}

function userMatchesByIdOrEmail(user = {}, candidateUserId = '', candidateEmail = '') {
  const userId = normalizeText(user.userId || user.id)
  const userEmail = normalizeEmail(user.email)
  if (userId && candidateUserId && userId === normalizeText(candidateUserId)) return true
  if (userEmail && candidateEmail && userEmail === normalizeEmail(candidateEmail)) return true
  return false
}

function isBondRole(value = '') {
  const normalized = normalizeRoleType(value)
  return [
    'bond_originator',
    'consultant',
    'processor',
    'manager',
    'compliance',
    'branch_manager',
    'team_lead',
    'regional_manager',
  ].includes(normalized)
}

function rowContainsUserByRoleRows(row = {}, rows = [], keyPrefix = 'participant') {
  const userId = normalizeText(row.user_id || row.userId || row.user || '')
  const email = normalizeText(row.participant_email || row.participantEmail || row.email || '')
  const role = normalizeRoleType(row.role_type || row.role || row.transaction_role || row.legal_role || '')
  if (!userId && !email) return false
  if (!isBondRole(role) && role !== '') return false
  return (userId && role === normalizeRoleType(keyPrefix)) || email
}

function buildUserScenarios(payload = {}, transactions = []) {
  const memberships = Array.isArray(payload.organisation_users)
    ? payload.organisation_users
    : Array.isArray(payload.organisationUsers)
      ? payload.organisationUsers
      : []
  const organisations = Array.isArray(payload.organisations)
    ? payload.organisations
    : []
  const users = Array.isArray(payload.authUsers)
    ? payload.authUsers
    : Array.isArray(payload.users)
      ? payload.users
      : []

  const bondWorkspaceIds = new Set(
    organisations
      .filter((org) => isBondScopedOrganization(org))
      .map((org) => normalizeText(org.id))
      .filter(Boolean),
  )

  const profileById = new Map(users.map((user) => [normalizeText(user.id), user]))
  const byRole = new Map()

  for (const membership of memberships) {
    const workspaceId = normalizeText(
      membership.organisation_id || membership.organisationId || membership.workspace_id || membership.workspaceId,
    )
    if (!workspaceId || !bondWorkspaceIds.has(workspaceId)) continue

    const role = normalizeOrgRole(membership.workspace_role || membership.workspaceRole || membership.role)
    if (!role) continue

    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role).push(membership)
  }

  const personalMembership = memberships.find((entry) => {
    const workspaceId = normalizeText(entry.organisation_id || entry.organisationId || entry.workspace_id)
    return (
      normalizeScopeLevel(entry.scope_level || entry.scopeLevel || '') === 'workspace_hq' &&
      organisations.some(
        (org) =>
          normalizeText(org.id) === workspaceId &&
          normalizeText(org.workspace_kind) === 'personal_originator',
      )
    )
  })

  const independentOriginatorMembership = personalMembership
  const consultantMembership = (byRole.get('consultant') || [])[0]
  const processorMembership = (byRole.get('processor') || [])[0]
  const complianceMembership = (byRole.get('compliance') || [])[0]
  const branchManagerMembership = (byRole.get('branch_manager') || [])[0]
  const regionalManagerMembership = (byRole.get('regional_manager') || [])[0]
  const hqManagerMembership = (byRole.get('hq_manager') || [])[0]
  const ownerDirectorMembership =
    (byRole.get('owner') || [])[0] || (byRole.get('director') || [])[0]

  function fromMembership(label, membership) {
    if (!membership) return null
    const userId = normalizeText(
      membership.user_id ||
        membership.userId ||
        membership.auth_user_id ||
        membership.authUserId,
    )
    const profile = profileById.get(userId) || {}

    return {
      label,
      userId,
      email: normalizeEmail(membership.email || profile.email),
      name: normalizeText(membership.user_name || profile.name || profile.full_name || ''),
      membership: {
        workspaceId: normalizeText(membership.organisation_id || membership.organisationId || membership.workspace_id),
        workspaceRole: normalizeOrgRole(membership.workspace_role || membership.workspaceRole || membership.role),
        scopeLevel: normalizeScopeLevel(
          membership.scope_level ||
            membership.scopeLevel ||
            membership.scope ||
            '',
        ),
        regionId: normalizeText(membership.region_id || membership.regionId || ''),
        workspaceUnitId: normalizeText(
          membership.workspace_unit_id || membership.workspaceUnitId || membership.unitId || '',
        ),
        email: normalizeEmail(membership.email || profile.email || ''),
      },
    }
  }

  const participantMembership = (() => {
    for (const transaction of transactions) {
      const participants = Array.isArray(transaction.transaction_participants)
        ? transaction.transaction_participants
        : []
      const found = participants.find(
        (entry) => isBondRole(entry.role_type || entry.role || entry.transaction_role || entry.legal_role) &&
          (entry.user_id || entry.userId || entry.participant_email || ''),
      )
      if (found) {
        const userId = normalizeText(found.user_id || found.userId)
        if (!userId) continue
        return {
          label: 'transaction_participant',
          userId,
          email: normalizeEmail(found.participant_email || found.email),
          membership: null,
          participantTag: {
            roleType: normalizeRoleType(found.role_type || found.role || found.transaction_role || found.legal_role),
          },
        }
      }
    }
    return null
  })()

  const scenarios = [
    fromMembership('independent_originator', independentOriginatorMembership),
    fromMembership('consultant', consultantMembership),
    fromMembership('processor', processorMembership),
    fromMembership('compliance', complianceMembership),
    fromMembership('branch_manager', branchManagerMembership),
    fromMembership('regional_manager', regionalManagerMembership),
    fromMembership('hq_manager', hqManagerMembership),
    fromMembership('owner_director', ownerDirectorMembership),
    participantMembership,
    {
      label: 'unrelated_user',
      userId: '00000000-0000-4000-8000-000000000999',
      email: 'unrelated-user@example.test',
      name: 'Unrelated User',
      membership: null,
    },
  ].filter(Boolean)

  return scenarios
}

function isArchivedOrInactiveTransaction(row = {}) {
  return Boolean(
    row.archived_at ||
      row.deleted_at ||
      row.cancelled_at ||
      String(row.lifecycle_state || '').toLowerCase() === 'archived' ||
      String(row.lifecycle_state || '').toLowerCase() === 'inactive' ||
      String(row.lifecycle_state || '').toLowerCase() === 'cancelled' ||
      String(row.operational_state || '').toLowerCase() === 'archived' ||
      row.is_active === false,
  )
}

function isBondWorkspaceReady(transaction = {}) {
  if (!transaction) return false
  if (isArchivedOrInactiveTransaction(transaction)) return false

  const workspaceId = normalizeText(
    transaction.bond_workspace_id ||
      transaction.organisation_id ||
      transaction.workspace_id ||
      transaction.workspaceId,
  )
  if (!workspaceId) return false

  return true
}

function canAccessTransactionCurrent(user = {}, transaction = {}) {
  const membership = user.membership || {}
  const workspaceId = normalizeText(membership.workspaceId)
  const txWorkspaceId = normalizeText(transaction.bond_workspace_id || transaction.organisation_id || transaction.workspace_id)

  const userId = normalizeText(user.userId || user.id)
  const userEmail = normalizeEmail(user.email)

  if (
    userId &&
    [
      transaction.primary_bond_consultant_user_id,
      transaction.assigned_bond_processor_user_id,
      transaction.assigned_bond_manager_user_id,
      transaction.assigned_bond_compliance_user_id,
    ]
      .map((value) => normalizeText(value))
      .includes(userId)
  ) {
    return true
  }

  const participants = Array.isArray(transaction.transaction_participants)
    ? transaction.transaction_participants
    : []
  for (const participant of participants) {
    if (!isBondRole(participant.role_type || participant.role || participant.transaction_role || participant.legal_role)) {
      continue
    }
    if (
      userMatchesByIdOrEmail(
        user,
        participant.user_id || participant.userId,
        participant.participant_email || participant.email,
      )
    ) {
      return true
    }
  }

  const rolePlayers = Array.isArray(transaction.transaction_role_players)
    ? transaction.transaction_role_players
    : []
  for (const rolePlayer of rolePlayers) {
    const role = normalizeText(rolePlayer.role_type || rolePlayer.role || rolePlayer.legal_role || rolePlayer.transaction_role)
    if (!isBondRole(role) && normalizeText(role) !== 'bond_originator') {
      continue
    }
    if (
      userMatchesByIdOrEmail(
        user,
        rolePlayer.user_id || rolePlayer.userId,
        rolePlayer.participant_email || rolePlayer.email,
        )
    ) {
      return true
    }
  }

  if (userEmail && normalizeEmail(transaction.assigned_bond_originator_email) === userEmail) {
    return true
  }
  if (userEmail && normalizeEmail(transaction.bond_originator) === userEmail) {
    return true
  }

  if (!workspaceId || !txWorkspaceId || workspaceId !== txWorkspaceId) return false

  const scopeLevel = normalizeScopeLevel(membership.scopeLevel || membership.scope_level || '')
  const regionId = normalizeText(membership.region_id || membership.regionId || '')
  const unitId = normalizeText(membership.workspace_unit_id || membership.workspaceUnitId || '')

  if (scopeLevel === 'workspace_hq') {
    return true
  }
  if ([
    'owner',
    'director',
    'hq_manager',
  ].includes((membership.workspaceRole || '').toLowerCase())) {
    return true
  }
  if (scopeLevel === 'region' && regionId && normalizeText(transaction.bond_region_id || transaction.region_id) === regionId) {
    return true
  }
  if (
    ['branch', 'team'].includes(scopeLevel) &&
    unitId &&
    normalizeText(transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id) === unitId
  ) {
    return true
  }

  return false
}

function getCanonicalExclusionType(exclusion = null) {
  const type = normalizeText(exclusion?.exclusionType)
  return PHASE5C_EXCLUSION_TYPES.has(type) ? type : null
}

function canAccessTransactionCanonicalModel({
  user = {},
  transaction = {},
  exclusion = null,
  currentAccess = false,
}) {
  const exclusionType = getCanonicalExclusionType(exclusion)
  const txReady = isBondWorkspaceReady(transaction)

  if (exclusionType || !txReady) {
    return {
      allow: currentAccess,
      excluded: true,
      exclusionType: exclusionType || 'not_bond_scoped',
    }
  }

  const participantRows = Array.isArray(transaction.transaction_participants)
    ? transaction.transaction_participants
    : []
  const rolePlayerRows = Array.isArray(transaction.transaction_role_players)
    ? transaction.transaction_role_players
    : []

  if (currentAccess) {
    return { allow: true, excluded: false, exclusionType: null }
  }

  const userId = normalizeText(user.userId || user.id)
  const userEmail = normalizeEmail(user.email)

  if (
    userId &&
    [
      transaction.primary_bond_consultant_user_id,
      transaction.assigned_bond_processor_user_id,
      transaction.assigned_bond_manager_user_id,
      transaction.assigned_bond_compliance_user_id,
    ]
      .map((value) => normalizeText(value))
      .includes(userId)
  ) {
    return { allow: true, excluded: false, exclusionType: null }
  }

  for (const participant of participantRows) {
    if (!isBondRole(participant.role_type || participant.role || participant.transaction_role || participant.legal_role)) {
      continue
    }
    if (
      userMatchesByIdOrEmail(
        user,
        participant.user_id || participant.userId,
        participant.participant_email || participant.email,
      )
    ) {
      return { allow: true, excluded: false, exclusionType: null }
    }
  }

  for (const rolePlayer of rolePlayerRows) {
    const role = normalizeRoleType(rolePlayer.role_type || rolePlayer.role || rolePlayer.legal_role || rolePlayer.transaction_role)
    if (!isBondRole(role) && normalizeText(role) !== 'bond_originator') {
      continue
    }
    if (
      userMatchesByIdOrEmail(
        user,
        rolePlayer.user_id || rolePlayer.userId,
        rolePlayer.participant_email || rolePlayer.email,
      )
    ) {
      return { allow: true, excluded: false, exclusionType: null }
    }
  }

  if (userEmail && normalizeEmail(transaction.assigned_bond_originator_email) === userEmail) {
    return { allow: true, excluded: false, exclusionType: null }
  }
  if (userEmail && normalizeEmail(transaction.bond_originator) === userEmail) {
    return { allow: true, excluded: false, exclusionType: null }
  }

  const membership = user.membership || {}
  const workspaceId = normalizeText(membership.workspaceId)
  const txWorkspaceId = normalizeText(
    transaction.bond_workspace_id ||
      transaction.organisation_id ||
      transaction.workspace_id,
  )

  if (!workspaceId || workspaceId !== txWorkspaceId) {
    return { allow: false, excluded: false, exclusionType: null }
  }

  const role = normalizeOrgRole(
    membership.workspaceRole ||
      membership.workspace_role ||
      membership.role,
  )

  const scopeLevel = normalizeScopeLevel(membership.scopeLevel || membership.scope_level || '')
  const txRegionId = normalizeText(transaction.bond_region_id || transaction.region_id)
  const txUnitId = normalizeText(
    transaction.bond_workspace_unit_id ||
      transaction.workspace_unit_id ||
      transaction.branch_id ||
      transaction.team_id,
  )
  const userRegionId = normalizeText(membership.regionId || membership.region_id || '')
  const userUnitId = normalizeText(membership.workspaceUnitId || membership.workspace_unit_id || '')

  if (scopeLevel === 'workspace_hq') return { allow: true, excluded: false, exclusionType: null }
  if (role === 'owner' || role === 'director' || role === 'hq_manager') {
    return { allow: true, excluded: false, exclusionType: null }
  }
  if (scopeLevel === 'region' && userRegionId && txRegionId && userRegionId === txRegionId) {
    return { allow: true, excluded: false, exclusionType: null }
  }
  if (['branch', 'team'].includes(scopeLevel) && userUnitId && txUnitId && userUnitId === txUnitId) {
    return { allow: true, excluded: false, exclusionType: null }
  }

  return { allow: false, excluded: false, exclusionType: null }
}

function resolveAssignedRole(user = {}, transaction = {}) {
  const userId = normalizeText(user.userId || user.id)
  if (userId && normalizeText(transaction.primary_bond_consultant_user_id) === userId) return 'consultant'
  if (userId && normalizeText(transaction.assigned_bond_processor_user_id) === userId) return 'processor'
  if (userId && normalizeText(transaction.assigned_bond_manager_user_id) === userId) return 'manager'
  if (userId && normalizeText(transaction.assigned_bond_compliance_user_id) === userId) return 'compliance'

  const participants = Array.isArray(transaction.transaction_participants)
    ? transaction.transaction_participants
    : []

  const matchedParticipant = participants.find((participant) =>
    userMatchesByIdOrEmail(
      user,
      participant.user_id || participant.userId,
      participant.participant_email || participant.email,
    ),
  )
  if (matchedParticipant) {
    const role = normalizeRoleType(matchedParticipant.role_type || matchedParticipant.role || matchedParticipant.legal_role)
    return role || 'participant'
  }

  const rolePlayers = Array.isArray(transaction.transaction_role_players)
    ? transaction.transaction_role_players
    : []
  const matchedRolePlayer = rolePlayers.find((entry) =>
    userMatchesByIdOrEmail(user, entry.user_id || entry.userId, entry.participant_email || entry.email),
  )
  if (matchedRolePlayer) {
    const role = normalizeRoleType(matchedRolePlayer.role_type || matchedRolePlayer.role || matchedRolePlayer.legal_role)
    return role || 'participant'
  }

  const role = normalizeOrgRole(user.membership?.workspaceRole || user.membership?.workspace_role || user.workspaceRole || '')
  return role || 'none'
}

function resolveFinanceStepBucket(stepKey = '') {
  const normalized = normalizeText(stepKey).toLowerCase()
  if (!normalized || normalized === 'undefined' || normalized === 'null') return 'shared_finance_owned'

  if (normalized.includes('compliance')) return 'compliance_owned'
  if (normalized.includes('blocked') || normalized.includes('escalat')) return 'manager_owned'
  if (normalized.includes('submit') || normalized.includes('bank_feedback') || normalized.includes('document') || normalized.includes('feedback') || normalized.includes('ready_for_transfer'))
    return 'processor_owned'

  if (normalized.includes('grant') || normalized.includes('approve') || normalized.includes('approved')) return 'processor_owned'

  if (normalized.includes('application_not_started')) return 'consultant_owned'
  if (normalized.includes('proof_of_funds') || normalized.includes('funds')) return 'processor_owned'

  return 'shared_finance_owned'
}

function canManageAssignmentsByScope({
  user = {},
  transaction = {},
  targetRole = '',
}) {
  const scopeLevel = normalizeScopeLevel(user.membership?.scopeLevel || user.membership?.scope_level || '')
  const role = normalizeOrgRole(user.membership?.workspaceRole || user.membership?.workspace_role || '')
  const userRegionId = normalizeText(user.membership?.region_id || user.membership?.regionId || '')
  const userUnitId = normalizeText(
    user.membership?.workspace_unit_id ||
      user.membership?.workspaceUnitId ||
      user.membership?.unitId ||
      user.membership?.branch_id ||
      user.membership?.branchId ||
      '',
  )
  const txRegionId = normalizeText(transaction.bond_region_id || transaction.region_id)
  const txUnitId = normalizeText(
    transaction.bond_workspace_unit_id ||
      transaction.workspace_unit_id ||
      transaction.branch_id ||
      transaction.team_id,
  )

  if (['owner', 'director', 'hq_manager'].includes(role)) return true

  if (role === 'regional_manager') {
    if (!userRegionId || !txRegionId) return targetRole === 'processor' ? true : false
    return userRegionId === txRegionId
  }

  if (['branch_manager', 'team_lead', 'manager', 'compliance', 'processor', 'consultant'].includes(role)) {
    if (!userUnitId || !txUnitId) return false
    return userUnitId === txUnitId
  }

  return false
}

function hasManagementScope(user = {}, transaction = {}) {
  return canManageAssignmentsByScope({ user, transaction })
}

function currentAllowsForAction({
  action,
  transaction,
  user,
  stepKey,
  canView,
}) {
  if (!canView) return false

  const actorRole = resolveAssignedRole(user, transaction)
  const role = normalizeOrgRole(actorRole)

  if (action === 'finance.view') return true
  if (action === 'finance.update_step' || action === 'finance.complete_step' || action === 'finance.block_step' || action === 'finance.unblock_step') {
    if (role === 'participant') return false
    return [
      'consultant',
      'processor',
      'manager',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'team_lead',
      'director',
      'owner',
      'compliance',
    ].includes(role)
  }

  if (action === 'finance.request_documents' || action === 'finance.upload_documents' || action === 'finance.add_internal_note' || action === 'finance.add_client_visible_note') {
    if (role === 'compliance' && action === 'finance.upload_documents') return false
    if (role === 'participant') return false
    return [
      'consultant',
      'processor',
      'manager',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'team_lead',
      'director',
      'owner',
    ].includes(role)
  }

  if (action === 'finance.review_documents' || action === 'finance.manage_bank_feedback') {
    return [
      'processor',
      'compliance',
      'manager',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'team_lead',
      'director',
      'owner',
    ].includes(role)
  }

  if (action === 'finance.submit_to_banks') {
    return [
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'manager',
      'director',
      'owner',
    ].includes(role)
  }

  if ([
    'finance.mark_submission_ready',
    'finance.record_approval',
    'finance.record_decline',
    'finance.record_grant',
  ].includes(action)) {
    if (role === 'participant' || role === 'compliance') return false
    return [
      'consultant',
      'processor',
      'manager',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'team_lead',
      'director',
      'owner',
    ].includes(role)
  }

  if (action === 'finance.escalate') {
    return ROLE_MANAGERIAL.has(role)
  }

  if (action === 'finance.reassign_consultant' || action === 'finance.reassign_processor') {
    if (role === 'participant') return false
    return ROLE_MANAGERIAL.has(role)
  }

  if (action === 'finance.assign_compliance') {
    return ['manager', 'branch_manager', 'regional_manager', 'hq_manager', 'director', 'owner', 'team_lead'].includes(role)
  }

  if (action === 'finance.review_compliance') {
    return ['compliance', 'manager', 'branch_manager', 'regional_manager', 'hq_manager', 'director', 'owner', 'team_lead'].includes(role)
  }

  return false
}

function canonicalAllowsForAction({
  action,
  transaction,
  user,
  stepKey,
  canView,
}) {
  if (!canView) return false

  const actorRole = resolveAssignedRole(user, transaction)
  const role = normalizeOrgRole(actorRole)
  const membershipRole = normalizeOrgRole(user.membership?.workspaceRole || user.membership?.workspace_role || '')
  const effectiveRole = role && role !== 'none' ? role : membershipRole
  const stepBucket = resolveFinanceStepBucket(stepKey)

  if (action === 'finance.view') return true

  if (action === 'finance.update_step' || action === 'finance.complete_step' || action === 'finance.block_step' || action === 'finance.unblock_step') {
    if (role === 'participant') return false

    if (stepBucket === 'compliance_owned') {
      return effectiveRole === 'compliance' || ROLE_MANAGERIAL.has(effectiveRole)
    }
    if (stepBucket === 'manager_owned') {
      return ROLE_MANAGERIAL.has(effectiveRole)
    }
    if (stepBucket === 'processor_owned') {
      return effectiveRole === 'processor' || effectiveRole === 'consultant' || ROLE_MANAGERIAL.has(effectiveRole)
    }
    return effectiveRole === 'consultant' || effectiveRole === 'processor' || ROLE_MANAGERIAL.has(effectiveRole)
  }

  if (action === 'finance.request_documents' || action === 'finance.upload_documents' || action === 'finance.add_internal_note' || action === 'finance.add_client_visible_note') {
    if (effectiveRole === 'participant') return false
    return [
      'consultant',
      'processor',
      'manager',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'director',
      'owner',
      'team_lead',
    ].includes(effectiveRole)
  }

  if (action === 'finance.review_documents') {
    return effectiveRole === 'compliance' || ROLE_MANAGERIAL.has(effectiveRole)
  }

  if (action === 'finance.manage_bank_feedback') {
    if (effectiveRole === 'consultant') return false
    if (effectiveRole === 'compliance') return false
    return effectiveRole === 'processor' || ROLE_MANAGERIAL.has(effectiveRole)
  }

  if (action === 'finance.submit_to_banks') {
    return ROLE_EXPLICIT_BANK_SUBMITTER.has(effectiveRole)
  }

  if ([
    'finance.mark_submission_ready',
    'finance.record_approval',
    'finance.record_decline',
    'finance.record_grant',
  ].includes(action)) {
    return effectiveRole === 'consultant' || effectiveRole === 'processor' || ROLE_MANAGERIAL.has(effectiveRole)
  }

  if (action === 'finance.escalate') {
    return ROLE_MANAGERIAL.has(effectiveRole) && canManageAssignmentsByScope({ user, transaction, targetRole: 'escalation' })
  }

  if (action === 'finance.reassign_consultant' || action === 'finance.reassign_processor') {
    if (!canManageAssignmentsByScope({ user, transaction, targetRole: 'processor' })) return false
    if (effectiveRole === 'participant') return false
    return ROLE_MANAGERIAL.has(effectiveRole)
  }

  if (action === 'finance.assign_compliance') {
    return [
      'manager',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'director',
      'owner',
      'team_lead',
    ].includes(effectiveRole) && canManageAssignmentsByScope({ user, transaction, targetRole: 'compliance' })
  }

  if (action === 'finance.review_compliance') {
    return [
      'compliance',
      'manager',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'director',
      'owner',
      'team_lead',
    ].includes(effectiveRole)
  }

  return false
}

function samplePush(map, key, value) {
  if (!map[key]) map[key] = []
  if (map[key].length >= SAMPLE_LIMIT) return
  map[key].push(value)
}

function evaluateWriteAccess(payload = {}) {
  const transactions = attachRelations(payload)
  const exclusions = loadExclusions()
  const manualMappings = loadManualMappings()
  const exclusionIndex = buildExclusionIndex(manualMappings, exclusions)
  const users = buildUserScenarios(payload, transactions)
  const actions = parseActionFilter()

  const userScenarioCount = users.length

  const counters = {
    allowedByCurrent_allowedByCanonicalModel: 0,
    allowedByCurrent_deniedByCanonicalModel: 0,
    deniedByCurrent_allowedByCanonicalModel: 0,
    deniedByCurrent_deniedByCanonicalModel: 0,
    unexpectedAllow: 0,
    unexpectedDeny: 0,
    excludedLegacyWriteCompat: 0,
    manualReviewWriteExcluded: 0,
    canonicalReadyWriteAllowed: 0,
    canonicalReadyWriteDenied: 0,
  }

  const samples = {
    allowedByCurrent_deniedByCanonicalModel: [],
    deniedByCurrent_allowedByCanonicalModel: [],
    unexpectedAllow: [],
    unexpectedDeny: [],
    excludedLegacyWriteCompat: [],
    manualReviewWriteExcluded: [],
  }

  const actionSummaries = {}
  for (const action of actions) {
    actionSummaries[action] = {
      allowedByCurrent_allowedByCanonicalModel: 0,
      allowedByCurrent_deniedByCanonicalModel: 0,
      deniedByCurrent_allowedByCanonicalModel: 0,
      deniedByCurrent_deniedByCanonicalModel: 0,
      unexpectedAllow: 0,
      unexpectedDeny: 0,
      excludedLegacyWriteCompat: 0,
      manualReviewWriteExcluded: 0,
      canonicalReadyWriteAllowed: 0,
      canonicalReadyWriteDenied: 0,
    }
  }

  const scenarioCoverage = {
    independent_originator: users.some((user) => user.label === 'independent_originator'),
    consultant: users.some((user) => user.label === 'consultant'),
    processor: users.some((user) => user.label === 'processor'),
    compliance: users.some((user) => user.label === 'compliance'),
    branch_manager: users.some((user) => user.label === 'branch_manager'),
    regional_manager: users.some((user) => user.label === 'regional_manager'),
    hq_manager: users.some((user) => user.label === 'hq_manager'),
    owner_director: users.some((user) => user.label === 'owner_director'),
    transaction_participant: users.some((user) => user.label === 'transaction_participant'),
    unrelated_user: users.some((user) => user.label === 'unrelated_user'),
  }

  for (const user of users) {
    for (const transaction of transactions) {
      const txId = rowId(transaction)
      const exclusion = exclusionIndex.get(txId) || null
      const currentRowAllows = canAccessTransactionCurrent(user, transaction)
      const canonicalBase = canAccessTransactionCanonicalModel({
        user,
        transaction,
        exclusion,
        currentAccess: currentRowAllows,
      })

      const exclusionType = canonicalBase.exclusionType
      const wasExcluded = canonicalBase.excluded

      if (wasExcluded) {
        if (exclusionType === 'accepted_unresolved_legacy' || exclusionType === 'legacy_compatibility_required') {
          counters.excludedLegacyWriteCompat += 1
          for (const action of actions) {
            actionSummaries[action].excludedLegacyWriteCompat += 1
          }
        }
        if (exclusionType === 'manual_review') {
          counters.manualReviewWriteExcluded += 1
          for (const action of actions) {
            actionSummaries[action].manualReviewWriteExcluded += 1
          }
        }
      } else if (isBondWorkspaceReady(transaction)) {
        counters.canonicalReadyWriteAllowed += 1
        for (const action of actions) {
          actionSummaries[action].canonicalReadyWriteAllowed += 1
        }
      } else {
        counters.canonicalReadyWriteDenied += 1
        for (const action of actions) {
          actionSummaries[action].canonicalReadyWriteDenied += 1
        }
      }

      const stepKey = pickStepKey(transaction)

      for (const action of actions) {
        const currentAllowed = currentAllowsForAction({
          action,
          transaction,
          user,
          stepKey,
          canView: currentRowAllows,
        })
        let canonicalAllowed = currentAllowed
        if (!wasExcluded) {
          canonicalAllowed = canonicalAllowsForAction({
            action,
            transaction,
            user,
            stepKey,
            canView: canonicalBase.allow,
          })
        }

        if (!canonicalBase.allow) {
          canonicalAllowed = false
        }

        const actionSummary = actionSummaries[action]

        if (currentAllowed && canonicalAllowed) {
          counters.allowedByCurrent_allowedByCanonicalModel += 1
          actionSummary.allowedByCurrent_allowedByCanonicalModel += 1
        }
        if (currentAllowed && !canonicalAllowed) {
          counters.allowedByCurrent_deniedByCanonicalModel += 1
          actionSummary.allowedByCurrent_deniedByCanonicalModel += 1
          samplePush(samples, 'allowedByCurrent_deniedByCanonicalModel', {
            action,
            user: user.label,
            transactionId: txId,
          })
          samplePush(actionSummary, 'allowedByCurrent_deniedByCanonicalModel', {
            user: user.label,
            transactionId: txId,
          })
        }
        if (!currentAllowed && canonicalAllowed) {
          counters.deniedByCurrent_allowedByCanonicalModel += 1
          actionSummary.deniedByCurrent_allowedByCanonicalModel += 1
          samplePush(samples, 'deniedByCurrent_allowedByCanonicalModel', {
            action,
            user: user.label,
            transactionId: txId,
          })
          samplePush(actionSummary, 'deniedByCurrent_allowedByCanonicalModel', {
            user: user.label,
            transactionId: txId,
          })
        }
        if (!currentAllowed && !canonicalAllowed) {
          counters.deniedByCurrent_deniedByCanonicalModel += 1
          actionSummary.deniedByCurrent_deniedByCanonicalModel += 1
        }

        if (!canonicalBase.excluded) {
          if (currentAllowed && !canonicalAllowed) {
            counters.unexpectedDeny += 1
            actionSummary.unexpectedDeny += 1
            samplePush(samples, 'unexpectedDeny', {
              action,
              user: user.label,
              transactionId: txId,
            })
            samplePush(actionSummary, 'unexpectedDeny', {
              user: user.label,
              transactionId: txId,
            })
          }
          if (!currentAllowed && canonicalAllowed) {
            counters.unexpectedAllow += 1
            actionSummary.unexpectedAllow += 1
            samplePush(samples, 'unexpectedAllow', {
              action,
              user: user.label,
              transactionId: txId,
            })
            samplePush(actionSummary, 'unexpectedAllow', {
              user: user.label,
              transactionId: txId,
            })
          }
        }
      }
    }
  }

  const missingScenarios = Object.entries(scenarioCoverage)
    .filter(([, value]) => !value)
    .map(([label]) => label)

  return {
    inputPath: INPUT_PATH,
    transactionCount: transactions.length,
    userScenarioCount,
    actionCount: actions.length,
    categories: counters,
    samples,
    actionSummaries,
    scenarioCoverage,
    missingScenarios,
  }
}

function parseActionFilter() {
  const raw = ACTION_FILTER ? ACTION_FILTER.split(',').map(normalizeText).filter(Boolean) : []
  if (!raw.length) return ACTION_DEFINITIONS.map((action) => action.key)
  const filtered = []
  for (const action of raw) {
    const key = normalizeText(action)
    if (!ACTION_INDEX[key]) {
      throw new Error(`Unknown finance write action filter: ${action}`)
    }
    filtered.push(key)
  }
  return filtered
}

function loadExclusions() {
  return readJsonFromPath(EXCLUSIONS_PATH, 'cutover exclusions') || []
}

function loadManualMappings() {
  return readJsonFromPath(MANUAL_MAPPING_PATH, 'manual mappings') || []
}

function runSimulationWithPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload')
  }
  return evaluateWriteAccess(payload)
}

function evaluateFromPath() {
  const input = readJsonFromPath(INPUT_PATH, 'shadow input')
  const payload = input || {}
  return runSimulationWithPayload(payload)
}

const report = evaluateFromPath()

if (OUTPUT_PATH) {
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`)
}

console.log('bond rls finance write simulation report')
console.log(JSON.stringify(report, null, 2))
