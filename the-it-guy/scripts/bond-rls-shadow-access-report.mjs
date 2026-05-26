#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const INPUT_PATH = process.env.BOND_ASSIGNMENT_RECONCILIATION_INPUT || process.env.BOND_RLS_SHADOW_INPUT || '/tmp/staging-bond-assignment-export.json'
const DEFAULT_MANUAL_MAPPING_PATH = path.join(process.cwd(), 'scripts/data/bond-workspace-manual-mapping.json')
const DEFAULT_EXCLUSIONS_PATH = path.join(process.cwd(), 'scripts/data/bond-rls-cutover-exclusions.json')
const MANUAL_MAPPING_PATH =
  process.env.BOND_ASSIGNMENT_MANUAL_MAPPING ||
  (fs.existsSync(DEFAULT_MANUAL_MAPPING_PATH) ? DEFAULT_MANUAL_MAPPING_PATH : '')
const EXCLUSIONS_PATH =
  process.env.BOND_RLS_CUTOVER_EXCLUSIONS ||
  (fs.existsSync(DEFAULT_EXCLUSIONS_PATH) ? DEFAULT_EXCLUSIONS_PATH : '')
const OUTPUT_PATH = process.env.BOND_RLS_SHADOW_OUTPUT || ''
const SAMPLE_LIMIT = Number(process.env.BOND_RLS_SHADOW_SAMPLE_LIMIT || '10')

const PHASE5B_EXCLUSION_TYPES = new Set([
  'accepted_unresolved_legacy',
  'manual_review',
  'archived_or_inactive',
  'not_bond_scoped',
  'legacy_compatibility_required',
])

function normalizeExclusionType(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  return PHASE5B_EXCLUSION_TYPES.has(normalized) ? normalized : null
}

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

function isBondRole(value = '') {
  return [
    'bond_originator',
    'consultant',
    'processor',
    'manager',
    'compliance',
    'branch_manager',
    'team_lead',
    'regional_manager',
  ].includes(normalizeText(value).toLowerCase())
}

function isBondOrganisation(org = {}) {
  const kind = normalizeText(org.workspace_kind || org.workspaceKind).toLowerCase()
  const type = normalizeText(org.type || org.workspace_type || org.workspaceType).toLowerCase()
  return kind === 'bond_company' || kind === 'personal_originator' || type === 'bond_originator'
}

function isArchivedOrInactive(row = {}) {
  return Boolean(
    row.archived_at ||
      row.deleted_at ||
      row.cancelled_at ||
      String(row.lifecycle_state || '').toLowerCase() === 'archived' ||
      String(row.operational_state || '').toLowerCase() === 'archived' ||
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
    const id = normalizeText(participant.transaction_id || participant.transactionId)
    if (!id) continue
    if (!participantMap.has(id)) participantMap.set(id, [])
    participantMap.get(id).push(participant)
  }

  for (const rolePlayer of rolePlayers) {
    const id = normalizeText(rolePlayer.transaction_id || rolePlayer.transactionId)
    if (!id) continue
    if (!rolePlayerMap.has(id)) rolePlayerMap.set(id, [])
    rolePlayerMap.get(id).push(rolePlayer)
  }

  return transactions.map((transaction) => {
    const id = rowId(transaction)
    return {
      ...transaction,
      transaction_participants: Array.isArray(transaction.transaction_participants)
        ? transaction.transaction_participants
        : participantMap.get(id) || [],
      transaction_role_players: Array.isArray(transaction.transaction_role_players)
        ? transaction.transaction_role_players
        : rolePlayerMap.get(id) || [],
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
    const txId = normalizeText(entry.transaction_id || entry.transactionId)
    if (!txId) continue
    if (entry.active === false) continue
    index.set(txId, {
      exclusionType: normalizeText(entry.exclusion_type || entry.exclusionType || 'legacy_compatibility_required'),
      source: 'exclusion_file',
      reason: normalizeText(entry.reason),
    })
  }

  for (const entry of manualMappings) {
    const txId = normalizeText(entry.transactionId || entry.transaction_id)
    if (!txId) continue
    const action = normalizeText(entry.action).toLowerCase()
    if (action === 'accepted_unresolved') {
      index.set(txId, {
        exclusionType: 'accepted_unresolved_legacy',
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
  const participantRows = participants.filter(
    (item) =>
      isActive(item) && isBondRole(item.role_type || item.role || item.transaction_role || item.legal_role),
  )
  const rolePlayerRows = rolePlayers.filter(
    (item) =>
      isActive(item) &&
      ['bond_originator', 'consultant'].includes(
        normalizeText(item.role_type || item.role || item.transaction_role || item.legal_role).toLowerCase(),
      ),
  )
  return { participantRows, rolePlayerRows }
}

function rowWorkspaceId(row = {}) {
  return normalizeText(row.bond_workspace_id || row.organisation_id || row.workspace_id)
}

function userMatchesByIdOrEmail(user = {}, candidateUserId = '', candidateEmail = '') {
  const userId = normalizeText(user.userId || user.id)
  const userEmail = normalizeEmail(user.email)
  if (userId && candidateUserId && userId === normalizeText(candidateUserId)) return true
  if (userEmail && candidateEmail && userEmail === normalizeEmail(candidateEmail)) return true
  return false
}

function membershipAllowsCurrent(user = {}, row = {}) {
  const membership = user.membership || {}
  const workspaceId = normalizeText(membership.workspaceId || membership.organisation_id)
  const scopeLevel = normalizeText(membership.scopeLevel || membership.scope_level).toLowerCase()
  const workspaceRole = normalizeText(membership.workspaceRole || membership.workspace_role).toLowerCase()
  const rowWs = rowWorkspaceId(row)
  if (!workspaceId || !rowWs || workspaceId !== rowWs) {
    return { allow: false, reason: 'workspace_mismatch' }
  }
  if (scopeLevel === 'workspace_hq') return { allow: true, reason: 'scope_level_workspace_hq' }
  if (['owner', 'director', 'hq_manager'].includes(workspaceRole)) {
    return { allow: true, reason: `workspace_role_${workspaceRole}` }
  }
  if (scopeLevel === 'region' && membership.region_id && row.bond_region_id) {
    return normalizeText(membership.region_id) === normalizeText(row.bond_region_id)
      ? { allow: true, reason: `region_match_${normalizeText(membership.region_id)}` }
      : { allow: false, reason: 'region_mismatch' }
  }
  if (
    ['branch', 'team'].includes(scopeLevel) &&
    membership.workspace_unit_id &&
    row.bond_workspace_unit_id
  ) {
    return normalizeText(membership.workspace_unit_id) === normalizeText(row.bond_workspace_unit_id)
      ? { allow: true, reason: `workspace_unit_match_${normalizeText(membership.workspace_unit_id)}` }
      : { allow: false, reason: 'workspace_unit_mismatch' }
  }
  return { allow: false, reason: 'no_scope_match' }
}

function currentAllows(user = {}, row = {}) {
  if (!user) return { allow: false, reason: 'missing_user' }
  const userId = normalizeText(user.userId || user.id)
  const userEmail = normalizeEmail(user.email)
  const userName = normalizeText(user.name).toLowerCase()

  if (
    userId &&
    [
      row.primary_bond_consultant_user_id,
      row.assigned_bond_processor_user_id,
      row.assigned_bond_manager_user_id,
      row.assigned_bond_compliance_user_id,
    ]
      .map((value) => normalizeText(value))
      .includes(userId)
  ) {
    return { allow: true, reason: 'direct_assignment' }
  }

  const { participantRows, rolePlayerRows } = extractParticipantSignals(row)
  for (const participant of participantRows) {
    if (
      userMatchesByIdOrEmail(
        user,
        participant.user_id || participant.userId,
        participant.participant_email || participant.email,
      )
    ) {
      return { allow: true, reason: 'transaction_participants_fallback' }
    }
  }
  for (const rolePlayer of rolePlayerRows) {
    if (
      userMatchesByIdOrEmail(
        user,
        rolePlayer.user_id || rolePlayer.userId,
        rolePlayer.participant_email || rolePlayer.email,
      )
    ) {
      return { allow: true, reason: 'transaction_role_players_fallback' }
    }
  }

  if (userEmail && normalizeEmail(row.assigned_bond_originator_email) === userEmail) {
    return { allow: true, reason: 'assigned_bond_originator_email_fallback' }
  }
  if (userEmail && normalizeEmail(row.bond_originator) === userEmail) {
    return { allow: true, reason: 'bond_originator_email_fallback' }
  }
  if (userName && normalizeText(row.bond_originator).toLowerCase() === userName) {
    return { allow: true, reason: 'bond_originator_text_fallback' }
  }

  const membershipEvaluation = membershipAllowsCurrent(user, row)
  if (membershipEvaluation.allow) return membershipEvaluation

  return membershipEvaluation
}

function canonicalAllows(user = {}, row = {}, exclusion = null, currentAccess = false) {
  const exclusionType = exclusion?.exclusionType || null
  if (
    ['accepted_unresolved_legacy', 'manual_review', 'archived_or_inactive', 'not_bond_scoped', 'legacy_compatibility_required'].includes(
      exclusionType,
    )
  ) {
    return {
      allow: currentAccess,
      excluded: true,
      exclusionType,
      reason: `excluded_${exclusionType}`,
    }
  }

  if (isArchivedOrInactive(row)) {
    return {
      allow: currentAccess,
      excluded: true,
      exclusionType: 'archived_or_inactive',
      reason: 'excluded_archived_or_inactive',
    }
  }

  const userId = normalizeText(user.userId || user.id)
  if (
    userId &&
    [
      row.primary_bond_consultant_user_id,
      row.assigned_bond_processor_user_id,
      row.assigned_bond_manager_user_id,
      row.assigned_bond_compliance_user_id,
    ]
      .map((value) => normalizeText(value))
      .includes(userId)
  ) {
    return { allow: true, excluded: false, exclusionType: null, reason: 'direct_assignment' }
  }

  const membershipEvaluation = membershipAllowsCurrent(user, row)
  if (membershipEvaluation.allow) {
    return { allow: true, excluded: false, exclusionType: null, reason: membershipEvaluation.reason }
  }

  const { participantRows, rolePlayerRows } = extractParticipantSignals(row)
  for (const participant of participantRows) {
    if (
      userMatchesByIdOrEmail(
        user,
        participant.user_id || participant.userId,
        participant.participant_email || participant.email,
      )
    ) {
      return {
        allow: true,
        excluded: false,
        exclusionType: null,
        reason: 'transaction_participants_fallback',
      }
    }
  }
  for (const rolePlayer of rolePlayerRows) {
    if (
      userMatchesByIdOrEmail(
        user,
        rolePlayer.user_id || rolePlayer.userId,
        rolePlayer.participant_email || rolePlayer.email,
      )
    ) {
      return {
        allow: true,
        excluded: false,
        exclusionType: null,
        reason: 'transaction_role_players_fallback',
      }
    }
  }

  const userEmail = normalizeEmail(user.email)
  if (userEmail && normalizeEmail(row.assigned_bond_originator_email) === userEmail) {
    return {
      allow: true,
      excluded: false,
      exclusionType: null,
      reason: 'assigned_bond_originator_email_fallback',
    }
  }
  if (userEmail && normalizeEmail(row.bond_originator) === userEmail) {
    return {
      allow: true,
      excluded: false,
      exclusionType: null,
      reason: 'bond_originator_email_fallback',
    }
  }

  return { allow: false, excluded: false, exclusionType: null, reason: 'no_canonical_or_legacy_match' }
}

function isCanonicalReady(user = {}, row = {}, exclusion = null) {
  const exclusionType = normalizeExclusionType(exclusion?.exclusionType)
  if (exclusionType) {
    return { isReady: false, exclusionType }
  }

  if (isArchivedOrInactive(row)) {
    return { isReady: false, exclusionType: 'archived_or_inactive' }
  }

  if (!rowWorkspaceId(row)) {
    return { isReady: false, exclusionType: 'not_bond_scoped' }
  }

  return { isReady: true, exclusionType: null }
}

function canonicalOnlyAllows(user = {}, row = {}) {
  const userId = normalizeText(user.userId || user.id)
  if (
    userId &&
    [
      row.primary_bond_consultant_user_id,
      row.assigned_bond_processor_user_id,
      row.assigned_bond_manager_user_id,
      row.assigned_bond_compliance_user_id,
    ]
      .map((value) => normalizeText(value))
      .includes(userId)
  ) {
    return true
  }

  const membershipEvaluation = membershipAllowsCurrent(user, row)
  if (membershipEvaluation.allow) {
    return true
  }

  const { participantRows, rolePlayerRows } = extractParticipantSignals(row)
  for (const participant of participantRows) {
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
  for (const rolePlayer of rolePlayerRows) {
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

  return false
}

function phase5bAllows(user = {}, row = {}, exclusion = null, currentAccess = false) {
  const canonicalReady = isCanonicalReady(user, row, exclusion)
  if (!canonicalReady.isReady) {
    return {
      allow: currentAccess,
      excluded: true,
      exclusionType: canonicalReady.exclusionType,
      reason: `phase5b_excluded_${canonicalReady.exclusionType || 'not_ready'}`,
    }
  }

  return {
    allow: canonicalOnlyAllows(user, row),
    excluded: false,
    exclusionType: null,
    reason: canonicalOnlyAllows(user, row) ? 'phase5b_canonical_only_match' : 'phase5b_canonical_only_deny',
  }
}

function assignmentSummary(row = {}) {
  return {
    primaryBondConsultantUserId: normalizeText(row.primary_bond_consultant_user_id) || null,
    assignedBondProcessorUserId: normalizeText(row.assigned_bond_processor_user_id) || null,
    assignedBondManagerUserId: normalizeText(row.assigned_bond_manager_user_id) || null,
    assignedBondComplianceUserId: normalizeText(row.assigned_bond_compliance_user_id) || null,
  }
}

function participantSummary(row = {}) {
  const participants = Array.isArray(row.transaction_participants) ? row.transaction_participants : []
  const rolePlayers = Array.isArray(row.transaction_role_players) ? row.transaction_role_players : []
  return {
    transactionParticipants: participants
      .filter((entry) => isActive(entry))
      .map((entry) => ({
        role: normalizeText(entry.role_type || entry.role || entry.transaction_role || entry.legal_role) || null,
        userId: normalizeText(entry.user_id || entry.userId) || null,
        email: normalizeEmail(entry.participant_email || entry.email) || null,
      })),
    transactionRolePlayers: rolePlayers
      .filter((entry) => isActive(entry))
      .map((entry) => ({
        role: normalizeText(entry.role_type || entry.role || entry.transaction_role || entry.legal_role) || null,
        userId: normalizeText(entry.user_id || entry.userId) || null,
        email: normalizeEmail(entry.participant_email || entry.email) || null,
      })),
  }
}

function legacyFallbackSummary(row = {}) {
  return {
    assignedBondOriginatorEmail: normalizeEmail(row.assigned_bond_originator_email) || null,
    bondOriginatorText: normalizeText(row.bond_originator) || null,
  }
}

function detailedSample(user = {}, transaction = {}, current = {}, shadow = {}, phase5b = {}, exclusion = null) {
  return {
    transactionId: rowId(transaction),
    actorUserId: normalizeText(user.userId || user.id) || null,
    actorRole: user.label || null,
    workspaceRole: normalizeText(user.membership?.workspaceRole || user.membership?.workspace_role) || null,
    scopeLevel: normalizeText(user.membership?.scopeLevel || user.membership?.scope_level) || null,
    workspaceId: rowWorkspaceId(transaction) || null,
    regionId: normalizeText(transaction.bond_region_id) || null,
    workspaceUnitId: normalizeText(transaction.bond_workspace_unit_id) || null,
    currentAllowed: Boolean(current.allow),
    canonicalAllowed: Boolean(shadow.allow),
    phase5bAllowed: Boolean(phase5b.allow),
    reason: phase5b.reason || null,
    canonicalReason: shadow.reason || null,
    currentReason: current.reason || null,
    exclusionStatus: {
      excluded: Boolean(phase5b.excluded || shadow.excluded),
      exclusionType: phase5b.exclusionType || shadow.exclusionType || exclusion?.exclusionType || null,
      source: exclusion?.source || null,
      reason: exclusion?.reason || null,
    },
    assignmentSummary: assignmentSummary(transaction),
    participantSummary: participantSummary(transaction),
    legacyFallbackSummary: legacyFallbackSummary(transaction),
  }
}

function buildUserScenarios(payload = {}, transactions = []) {
  const memberships = Array.isArray(payload.organisation_users)
    ? payload.organisation_users
    : Array.isArray(payload.organisationUsers)
      ? payload.organisationUsers
      : []
  const organisations = Array.isArray(payload.organisations) ? payload.organisations : []
  const users = Array.isArray(payload.authUsers)
    ? payload.authUsers
    : Array.isArray(payload.users)
      ? payload.users
      : []

  const bondWorkspaceIds = new Set(
    organisations
      .filter((org) => isBondOrganisation(org))
      .map((org) => normalizeText(org.id))
      .filter(Boolean),
  )
  const profileById = new Map(users.map((user) => [normalizeText(user.id), user]))
  const byRole = new Map()
  for (const membership of memberships) {
    const role = normalizeText(membership.workspace_role || membership.role).toLowerCase()
    if (!role) continue
    if (!bondWorkspaceIds.has(normalizeText(membership.organisation_id))) continue
    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role).push(membership)
  }

  function fromMembership(label, membership) {
    if (!membership) return null
    const userId = normalizeText(membership.user_id)
    const profile = profileById.get(userId) || {}
    return {
      label,
      userId,
      email: normalizeEmail(membership.email || profile.email),
      name: normalizeText(`${membership.first_name || ''} ${membership.last_name || ''}`.trim()),
      membership: {
        workspaceId: normalizeText(membership.organisation_id || membership.workspace_id),
        workspaceRole: normalizeText(membership.workspace_role || membership.role),
        scopeLevel: normalizeText(membership.scope_level),
        region_id: normalizeText(membership.region_id),
        workspace_unit_id: normalizeText(membership.workspace_unit_id),
        organisation_id: normalizeText(membership.organisation_id),
      },
    }
  }

  const personalMembership = memberships.find(
    (entry) =>
      normalizeText(entry.scope_level).toLowerCase() === 'workspace_hq' &&
      organisations.some(
        (org) =>
          normalizeText(org.id) === normalizeText(entry.organisation_id) &&
          normalizeText(org.workspace_kind).toLowerCase() === 'personal_originator',
      ),
  )

  const transactionParticipant = (() => {
    for (const transaction of transactions) {
      const participants = Array.isArray(transaction.transaction_participants)
        ? transaction.transaction_participants
        : []
      const found = participants.find(
        (entry) => isBondRole(entry.role_type || entry.role || entry.transaction_role || entry.legal_role) && (entry.user_id || entry.participant_email),
      )
      if (found) {
        return {
          label: 'transaction_participant',
          userId: normalizeText(found.user_id),
          email: normalizeEmail(found.participant_email),
          name: normalizeText(found.participant_name),
          membership: null,
        }
      }
    }
    return null
  })()

  const scenarios = [
    fromMembership('independent_originator', personalMembership),
    fromMembership('consultant', (byRole.get('consultant') || [])[0]),
    fromMembership('processor', (byRole.get('processor') || [])[0]),
    fromMembership('compliance', (byRole.get('compliance') || [])[0]),
    fromMembership('branch_manager', (byRole.get('branch_manager') || [])[0]),
    fromMembership('regional_manager', (byRole.get('regional_manager') || [])[0]),
    fromMembership('hq_manager', (byRole.get('hq_manager') || [])[0]),
    fromMembership(
      'owner_director',
      (byRole.get('director') || [])[0] || (byRole.get('owner') || [])[0],
    ),
    transactionParticipant,
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

function samplePush(map, key, value) {
  if (!map[key]) map[key] = []
  if (map[key].length >= SAMPLE_LIMIT) return
  map[key].push(value)
}

function evaluateAccess(payload = {}) {
  const transactions = attachRelations(payload)
  const manualMappings = loadManualMappingEntries()
  const exclusionEntries = loadExclusionEntries()
  const exclusionIndex = buildExclusionIndex(manualMappings, exclusionEntries)
  const users = buildUserScenarios(payload, transactions)

  const counters = {
    currentAllows_canonicalAllows: 0,
    currentAllows_canonicalDenies: 0,
    currentDenies_canonicalAllows: 0,
    currentDenies_canonicalDenies: 0,
    currentAllows_phase5bAllows: 0,
    currentAllows_phase5bDenies: 0,
    currentDenies_phase5bAllows: 0,
    currentDenies_phase5bDenies: 0,
    unexpectedAllow: 0,
    unexpectedDeny: 0,
    excludedAcceptedLegacy: 0,
    manualReviewExcluded: 0,
    acceptedLegacyExcluded: 0,
    excludedLegacyStillAllowed: 0,
    canonicalReadyEnforced: 0,
  }

  const samples = {
    currentAllows_canonicalDenies: [],
    currentDenies_canonicalAllows: [],
    currentAllows_phase5bDenies: [],
    currentDenies_phase5bAllows: [],
    unexpectedAllow: [],
    unexpectedDeny: [],
    excludedLegacyStillAllowed: [],
    excludedAcceptedLegacy: [],
    manualReviewExcluded: [],
  }

  for (const user of users) {
    for (const transaction of transactions) {
      const transactionId = rowId(transaction)
      const exclusion = exclusionIndex.get(transactionId) || null
      const current = currentAllows(user, transaction)
      const shadow = canonicalAllows(user, transaction, exclusion, current.allow)
      const phase5b = phase5bAllows(user, transaction, exclusion, current.allow)
      const sample = detailedSample(user, transaction, current, shadow, phase5b, exclusion)

      if (current.allow && shadow.allow) counters.currentAllows_canonicalAllows += 1
      if (current.allow && !shadow.allow) counters.currentAllows_canonicalDenies += 1
      if (!current.allow && shadow.allow) counters.currentDenies_canonicalAllows += 1
      if (!current.allow && !shadow.allow) counters.currentDenies_canonicalDenies += 1

      if (current.allow && phase5b.allow) counters.currentAllows_phase5bAllows += 1
      if (current.allow && !phase5b.allow) counters.currentAllows_phase5bDenies += 1
      if (!current.allow && phase5b.allow) counters.currentDenies_phase5bAllows += 1
      if (!current.allow && !phase5b.allow) counters.currentDenies_phase5bDenies += 1

      if (!phase5b.excluded && current.allow && !phase5b.allow) {
        counters.unexpectedDeny += 1
        samplePush(samples, 'unexpectedDeny', sample)
      }
      if (!phase5b.excluded && !current.allow && phase5b.allow) {
        counters.unexpectedAllow += 1
        samplePush(samples, 'unexpectedAllow', sample)
      }

      if (phase5b.excluded) {
        if (phase5b.exclusionType === 'accepted_unresolved_legacy') {
          counters.acceptedLegacyExcluded += 1
          samplePush(samples, 'excludedAcceptedLegacy', sample)
        } else if (phase5b.exclusionType === 'manual_review') {
          counters.manualReviewExcluded += 1
          samplePush(samples, 'manualReviewExcluded', sample)
        }
        if (current.allow) {
          counters.excludedLegacyStillAllowed += 1
          samplePush(samples, 'excludedLegacyStillAllowed', sample)
        }
      } else {
        counters.canonicalReadyEnforced += 1
      }
      if (current.allow && !shadow.allow) {
        samplePush(samples, 'currentAllows_canonicalDenies', sample)
      }
      if (!current.allow && shadow.allow) {
        samplePush(samples, 'currentDenies_canonicalAllows', sample)
      }
      if (current.allow && !phase5b.allow) {
        samplePush(samples, 'currentAllows_phase5bDenies', sample)
      }
      if (!current.allow && phase5b.allow) {
        samplePush(samples, 'currentDenies_phase5bAllows', sample)
      }
    }
  }

  const scenarioCoverage = {
    independent_originator: users.some((item) => item.label === 'independent_originator'),
    consultant: users.some((item) => item.label === 'consultant'),
    processor: users.some((item) => item.label === 'processor'),
    compliance: users.some((item) => item.label === 'compliance'),
    branch_manager: users.some((item) => item.label === 'branch_manager'),
    regional_manager: users.some((item) => item.label === 'regional_manager'),
    hq_manager: users.some((item) => item.label === 'hq_manager'),
    owner_director: users.some((item) => item.label === 'owner_director'),
    transaction_participant: users.some((item) => item.label === 'transaction_participant'),
    unrelated_user: users.some((item) => item.label === 'unrelated_user'),
  }

  const missingScenarios = Object.entries(scenarioCoverage)
    .filter(([, value]) => !value)
    .map(([label]) => label)

  return {
    inputPath: INPUT_PATH,
    transactionCount: transactions.length,
    userScenarioCount: users.length,
    categories: {
      ...counters,
      excludedAcceptedLegacy: counters.acceptedLegacyExcluded,
    },
    samples,
    scenarioCoverage,
    missingScenarios,
  }
}

try {
  const payload = readJsonFromPath(INPUT_PATH, 'shadow input')
  const report = evaluateAccess(payload || {})
  if (OUTPUT_PATH) {
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  }
  console.log('bond rls shadow access report')
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  console.error('Bond RLS shadow access report failed:', error?.message || error)
  process.exitCode = 1
}
