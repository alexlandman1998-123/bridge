import {
  isMissingColumnError,
  isMissingTableError,
  isPermissionDeniedError,
  normalizeEmail as normalizeSharedEmail,
  normalizeText as normalizeSharedText,
  requireClient,
} from './attorneyFirmServiceShared.js'

const KNOWN_BOND_ASSIGNMENT_KEYS = Object.freeze(new Set(['transfer', 'bond', 'transfer_and_bond']))
const KNOWN_BOND_STATUSES = Object.freeze(new Set(['unassigned', 'workspace_assigned', 'consultant_assigned', 'processor_assigned', 'fully_assigned', 'inactive']))
const KNOWN_BOND_SOURCES = Object.freeze(
  new Set(['manual', 'legacy_backfill', 'participant_sync', 'invite_acceptance', 'workflow_assignment', 'system_repair']),
)
const TRUSTED_PARTICIPANT_ROLES = Object.freeze(new Set(['bond_originator', 'consultant', 'processor', 'manager', 'compliance', 'branch_manager', 'team_lead', 'regional_manager']))
const TRUSTED_ROLE_PLAYER_ROLES = Object.freeze(new Set(['bond_originator']))
const ACTIVE_RECORD_STATUSES = Object.freeze(new Set(['active', 'pending', 'assigned', 'in_progress', 'started', 'current']))

function normalizeText(value) {
  return normalizeSharedText(value)
}

function normalizeEmail(value) {
  return normalizeSharedEmail(value).toLowerCase()
}

function normalizeId(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeUuid(value) {
  const normalized = normalizeText(value)
  return isUuid(normalized) ? normalized : null
}

function pickText(candidate, keys = []) {
  for (const key of keys) {
    const value = candidate?.[key]
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeLegacyBondAssignment(transaction = null) {
  if (!transaction) {
    return {
      assignedBondOriginatorEmail: '',
      assignedBondOriginatorName: '',
      assignedBondAttorneyEmail: '',
      assignedBondAttorneyName: '',
    }
  }

  return {
    assignedBondOriginatorEmail: normalizeEmail(
      transaction.assigned_bond_originator_email || transaction.assignedBondOriginatorEmail || transaction?.assigned_bond_originator || '',
    ),
    assignedBondOriginatorName: normalizeText(transaction.bond_originator || transaction.bondOriginator || ''),
    assignedBondAttorneyEmail: normalizeEmail(transaction.assigned_attorney_email || transaction.assignedAttorneyEmail),
    assignedBondAttorneyName: normalizeText(transaction.attorney || ''),
  }
}

function normalizeTransactionNameRows(transaction = null) {
  const participants = transaction?.participants || transaction?.transactionParticipants || transaction?.transaction_participants || []
  return Array.isArray(participants) ? participants : []
}

function normalizeTransactionRolePlayerRows(transaction = null) {
  if (Array.isArray(transaction?.rolePlayers)) return transaction.rolePlayers
  if (Array.isArray(transaction?.transactionRolePlayers)) return transaction.transactionRolePlayers
  if (Array.isArray(transaction?.transaction_role_players)) return transaction.transaction_role_players
  return []
}

function normalizeAssignments(inputAssignments = []) {
  const list = Array.isArray(inputAssignments) ? inputAssignments : []
  return list.filter(
    (item) =>
      item &&
      KNOWN_BOND_ASSIGNMENT_KEYS.has(
        normalizeText(item.assignmentType || item.type || item.attorneyRole || item.attorney_role).toLowerCase(),
      ),
  )
}

function normalizeAttorneyName(candidate = null) {
  const nestedName = normalizeText(candidate?.attorneyUser?.name || candidate?.attorneyUser?.full_name || candidate?.attorney_user?.name || candidate?.attorney_user?.full_name || '')
  if (nestedName) return nestedName
  return (
    pickText(candidate, ['name', 'fullName', 'full_name', 'displayName', 'display_name']) ||
    pickText(candidate, ['assignedBondOriginatorName']) ||
    pickText(candidate, ['participantName', 'participant_name'])
  )
}

function normalizeAttorneyEmail(candidate = null) {
  const nestedEmail = normalizeEmail(
    candidate?.attorneyUser?.email || candidate?.attorneyUser?.emailAddress || candidate?.attorney_user?.email || candidate?.attorney_user?.email_address || '',
  )
  if (nestedEmail) return nestedEmail

  return normalizeEmail(pickText(candidate, ['email', 'assignedEmail', 'assigned_email', 'attorneyEmail', 'attorney_email', 'participantEmail', 'participant_email']))
}

function parseLegacySourceRole(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'bond_originator' || normalized === 'bond originator') return 'bond_originator'
  if (normalized === 'transfer_attorney' || normalized === 'attorney') return 'transfer_attorney'
  return normalized
}

function isActiveParticipant(record = null) {
  const status = normalizeText(record?.status || record?.participantStatus || record?.removed_at || '').toLowerCase()
  return !status || status === 'active' || ACTIVE_RECORD_STATUSES.has(status)
}

function pickParticipantEmail(row = null) {
  return normalizeEmail(
    pickText(row, [
      'email',
      'assignedEmail',
      'assigned_email',
      'participantEmail',
      'participant_email',
      'emailAddress',
      'email_address',
    ]),
  )
}

function pickParticipantName(row = null) {
  return normalizeText(
    pickText(row, ['name', 'fullName', 'full_name', 'displayName', 'display_name', 'contactPerson', 'partnerName', 'partner_name', 'participant_name', 'participantName']),
  )
}

function pickRole(row = null) {
  const role = parseLegacySourceRole(
    pickText(row, [
      'participantRole',
      'participant_role',
      'role_type',
      'roleType',
      'role',
      'legalRole',
      'legal_role',
      'participant_role_type',
    ]),
  )
  return role
}

function resolveCanonicalAssignment(transaction = null) {
  const candidate = {
    bondWorkspaceId: normalizeUuid(
      pickText(transaction, ['assigned_organisation_id', 'assignedOrganisationId', 'bond_workspace_id', 'bondWorkspaceId', 'organisation_id', 'organisationId', 'organization_id', 'organizationId']),
    ),
    bondRegionId: normalizeUuid(pickText(transaction, ['assigned_region_id', 'assignedRegionId', 'bond_region_id', 'bondRegionId'])),
    bondWorkspaceUnitId: normalizeUuid(
      pickText(transaction, [
        'assigned_workspace_unit_id',
        'assignedWorkspaceUnitId',
        'assigned_branch_id',
        'assignedBranchId',
        'assigned_team_id',
        'assignedTeamId',
        'bond_workspace_unit_id',
        'bondWorkspaceUnitId',
        'workspace_unit_id',
        'workspaceUnitId',
      ]),
    ),
    primaryConsultantUserId: normalizeUuid(
      pickText(transaction, ['assigned_user_id', 'assignedUserId', 'primary_bond_consultant_user_id', 'primaryBondConsultantUserId', 'bond_originator_user_id', 'bondOriginatorUserId']),
    ),
    processorUserId: normalizeUuid(
      pickText(transaction, ['assigned_bond_processor_user_id', 'assignedBondProcessorUserId', 'processor_user_id', 'processorUserId']),
    ),
    managerUserId: normalizeUuid(
      pickText(transaction, ['assigned_bond_manager_user_id', 'assignedBondManagerUserId', 'manager_user_id', 'managerUserId']),
    ),
    complianceUserId: normalizeUuid(
      pickText(transaction, ['assigned_bond_compliance_user_id', 'assignedBondComplianceUserId', 'compliance_user_id', 'complianceUserId']),
    ),
    status: normalizeText(pickText(transaction, ['assignment_status', 'assignmentStatus', 'bond_assignment_status', 'bondAssignmentStatus'])).toLowerCase(),
    source: normalizeText(pickText(transaction, ['assignment_source', 'assignmentSource', 'bond_assignment_source', 'bondAssignmentSource'])).toLowerCase(),
    workspaceIdFromLegacy: normalizeUuid(transaction?.organisation_id || transaction?.organisationId || transaction?.organization_id || transaction?.organizationId),
  }

  const hasValue = Object.entries(candidate).some(
    ([key, value]) =>
      ![
        'status',
        'source',
        'workspaceIdFromLegacy',
      ].includes(key) &&
      Boolean(value),
  )

  return {
    ...candidate,
    hasCanonical: hasValue,
    status: KNOWN_BOND_STATUSES.has(candidate.status) ? candidate.status : 'unassigned',
    source: KNOWN_BOND_SOURCES.has(candidate.source) ? candidate.source : null,
    workspaceId: candidate.bondWorkspaceId || candidate.workspaceIdFromLegacy || null,
  }
}

function mergeAssignmentResult(target = {}, source = {}) {
  const output = { ...target }
  for (const [key, value] of Object.entries(source)) {
    if (value && !output[key]) {
      output[key] = value
    }
  }
  return output
}

function mapParticipantByRole(items = [], target = {}) {
  return (Array.isArray(items) ? items : []).reduce((accumulator, row) => {
    if (!isActiveParticipant(row)) return accumulator
    const role = pickRole(row)
    const userId = normalizeId(pickText(row, ['user_id', 'userId', 'assignedUserId', 'assigned_user_id']))
    const email = pickParticipantEmail(row)
    const name = pickParticipantName(row)

    if (role === 'bond_originator' || role === 'consultant') {
      accumulator.primaryConsultantUserId = accumulator.primaryConsultantUserId || userId
      accumulator.primaryConsultantEmail = accumulator.primaryConsultantEmail || email
      accumulator.primaryConsultantName = accumulator.primaryConsultantName || name
      accumulator.source = accumulator.source || 'participant'
      accumulator.confidence = Math.max(accumulator.confidence || 0, 0.7)
      return accumulator
    }
    if (role === 'processor') {
      accumulator.processorUserId = accumulator.processorUserId || userId
      accumulator.processorEmail = accumulator.processorEmail || email
      accumulator.processorName = accumulator.processorName || name
      accumulator.source = accumulator.source || 'participant'
      accumulator.confidence = Math.max(accumulator.confidence || 0, 0.5)
      return accumulator
    }
    if (role === 'manager' || role === 'regional_manager' || role === 'branch_manager' || role === 'team_lead') {
      accumulator.managerUserId = accumulator.managerUserId || userId
      accumulator.managerEmail = accumulator.managerEmail || email
      accumulator.managerName = accumulator.managerName || name
      accumulator.source = accumulator.source || 'participant'
      accumulator.confidence = Math.max(accumulator.confidence || 0, 0.5)
      return accumulator
    }
    if (role === 'compliance') {
      accumulator.complianceUserId = accumulator.complianceUserId || userId
      accumulator.complianceEmail = accumulator.complianceEmail || email
      accumulator.complianceName = accumulator.complianceName || name
      accumulator.source = accumulator.source || 'participant'
      accumulator.confidence = Math.max(accumulator.confidence || 0, 0.4)
    }
    return accumulator
  }, target)
}

function resolveParticipantBondAssignmentSource(transaction = null) {
  const base = {
    primaryConsultantUserId: null,
    primaryConsultantEmail: null,
    primaryConsultantName: null,
    processorUserId: null,
    processorEmail: null,
    processorName: null,
    managerUserId: null,
    managerEmail: null,
    managerName: null,
    complianceUserId: null,
    complianceEmail: null,
    complianceName: null,
    source: null,
    confidence: 0,
  }

  const participants = normalizeTransactionNameRows(transaction)
  const mappedFromParticipant = mapParticipantByRole(participants, base)
  const acceptedRoles = Object.values(mappedFromParticipant).some(Boolean)
  if (!acceptedRoles && Object.keys(base).length) {
    return {
      ...base,
      source: null,
      confidence: 0,
      hasParticipant: false,
    }
  }

  return { ...mappedFromParticipant, source: mappedFromParticipant.source, confidence: mappedFromParticipant.confidence || 0.6, hasParticipant: true }
}

function resolveRolePlayerBondAssignmentSource(transaction = null) {
  const base = {
    primaryConsultantUserId: null,
    primaryConsultantEmail: null,
    primaryConsultantName: null,
    processorUserId: null,
    processorEmail: null,
    processorName: null,
    managerUserId: null,
    managerEmail: null,
    managerName: null,
    complianceUserId: null,
    complianceEmail: null,
    complianceName: null,
    source: null,
    confidence: 0,
  }

  const rolePlayers = normalizeTransactionRolePlayerRows(transaction)
  const withPlayers = rolePlayers.reduce((accumulator, row) => {
    const role = normalizeText(row?.role_type || row?.roleType || row?.legal_role || row?.legalRole)
    const status = normalizeText(row?.status || row?.removed_at || '').toLowerCase()
    if (status && !ACTIVE_RECORD_STATUSES.has(status) && status !== 'active') return accumulator

    if (TRUSTED_ROLE_PLAYER_ROLES.has(role)) {
      if (!accumulator.primaryConsultantUserId) {
        accumulator.primaryConsultantUserId = normalizeUuid(row?.user_id || row?.userId || row?.participant_user_id || row?.participantUserId)
      }
      if (!accumulator.primaryConsultantEmail) {
        accumulator.primaryConsultantEmail = normalizeEmail(
          row?.participant_email || row?.participantEmail || row?.email || row?.participant_email_address || row?.emailAddress,
        )
      }
      if (!accumulator.primaryConsultantName) {
        accumulator.primaryConsultantName = normalizeText(row?.participant_name || row?.participantName || row?.name)
      }
      accumulator.source = accumulator.source || 'role_player'
      accumulator.confidence = Math.max(accumulator.confidence || 0, 0.6)
    }
    return accumulator
  }, base)

  const hasData = Object.keys(withPlayers).some((key) => withPlayers[key] && !['source', 'confidence'].includes(key))
  return {
    ...withPlayers,
    source: withPlayers.source,
    confidence: hasData ? withPlayers.confidence || 0.4 : 0,
    hasRolePlayer: hasData,
  }
}

function resolveLegacyBondAssignmentSource(transaction = null) {
  const legacy = normalizeLegacyBondAssignment(transaction)
  if (legacy.assignedBondOriginatorEmail) {
    return {
      source: 'legacy_email',
      confidence: 0.3,
      primaryConsultantEmail: legacy.assignedBondOriginatorEmail,
      primaryConsultantName: normalizeText(legacy.assignedBondOriginatorName) || null,
      primaryConsultantUserId: null,
      processorUserId: null,
      managerUserId: null,
      complianceUserId: null,
      bondWorkspaceId: null,
      bondRegionId: null,
      bondWorkspaceUnitId: null,
      status: 'unassigned',
      sourceHint: null,
      legacyBondOriginator: legacy.assignedBondOriginatorName || legacy.assignedBondOriginatorEmail,
      legacyBondOriginatorEmail: legacy.assignedBondOriginatorEmail,
      legacyBondOriginatorName: legacy.assignedBondOriginatorName,
    }
  }
  if (legacy.assignedBondOriginatorName) {
    return {
      source: 'legacy_text',
      confidence: 0.2,
      primaryConsultantEmail: null,
      primaryConsultantName: normalizeText(legacy.assignedBondOriginatorName),
      primaryConsultantUserId: null,
      processorUserId: null,
      managerUserId: null,
      complianceUserId: null,
      bondWorkspaceId: null,
      bondRegionId: null,
      bondWorkspaceUnitId: null,
      status: 'unassigned',
      sourceHint: null,
      legacyBondOriginator: legacy.assignedBondOriginatorName,
      legacyBondOriginatorEmail: null,
      legacyBondOriginatorName: legacy.assignedBondOriginatorName,
    }
  }
  return {
    source: 'none',
    confidence: 0,
    primaryConsultantEmail: null,
    primaryConsultantName: null,
    primaryConsultantUserId: null,
    processorUserId: null,
    managerUserId: null,
    complianceUserId: null,
    bondWorkspaceId: null,
    bondRegionId: null,
    bondWorkspaceUnitId: null,
    status: 'unassigned',
    sourceHint: null,
    legacyBondOriginator: null,
    legacyBondOriginatorEmail: null,
    legacyBondOriginatorName: null,
  }
}

function parseTransferAttorney(assignment = null) {
  return {
    email: normalizeAttorneyEmail(assignment),
    name: normalizeAttorneyName(assignment),
    id: normalizeId(assignment?.attorneyUser?.id || assignment?.primaryAttorney?.id || assignment?.attorney_user_id || assignment?.primaryAttorneyId),
  }
}

function resolveBondAttorneyFallback(transferAssignments = [], activeAssignments = []) {
  const normalizedTransferAssignments = Array.isArray(transferAssignments) ? transferAssignments : []
  const normalizedActiveAssignments = Array.isArray(activeAssignments) ? activeAssignments : []

  const transfer =
    normalizedActiveAssignments.find(
      (item) => item?.attorneyRole === 'bond_attorney' || normalizeText(item?.assignmentType).toLowerCase() === 'bond',
    ) || null
  if (transfer) return parseTransferAttorney(transfer)
  const bondedCandidate = normalizedTransferAssignments.find((item) => {
    const candidate = parseTransferAttorney(item)
    return Boolean(candidate.email || candidate.name || candidate.id)
  }) || null
  return parseTransferAttorney(bondedCandidate)
}

function resolveCanonicalOrLegacyContactFields(transaction = null) {
  const primary = resolveCanonicalAssignment(transaction)
  const participant = resolveParticipantBondAssignmentSource(transaction)
  const rolePlayer = resolveRolePlayerBondAssignmentSource(transaction)
  const legacy = normalizeLegacyBondAssignment(transaction)

  return mergeAssignmentResult(
    {
      consultantEmail: primary.primaryConsultantEmail || participant.primaryConsultantEmail || rolePlayer.primaryConsultantEmail || null,
      consultantName: primary.primaryConsultantName || participant.primaryConsultantName || rolePlayer.primaryConsultantName || null,
    },
    {
      consultantEmail: legacy.assignedBondOriginatorEmail || null,
      consultantName: legacy.assignedBondOriginatorName || null,
    },
  )
}

export function resolveCanonicalBondAssignment(transaction = null) {
  return resolveCanonicalAssignment(transaction || {})
}

export function resolveLegacyBondAssignment(transaction = null) {
  return normalizeLegacyBondAssignment(transaction)
}

export function resolveParticipantBondAssignment(transaction = null) {
  return resolveParticipantBondAssignmentSource(transaction || {})
}

export function resolveRolePlayerBondAssignment(transaction = null) {
  return resolveRolePlayerBondAssignmentSource(transaction || {})
}

export function resolveEffectiveBondAssignment(transaction = null) {
  const sourceTransaction = transaction || {}
  const canonical = resolveCanonicalAssignment(sourceTransaction)
  const participant = resolveParticipantBondAssignmentSource(sourceTransaction)
  const rolePlayer = resolveRolePlayerBondAssignmentSource(sourceTransaction)
  const legacy = resolveLegacyBondAssignmentSource(sourceTransaction)
  const warnings = []

  if (canonical.hasCanonical) {
    return {
      source: 'canonical',
      confidence: 0.95,
      bondWorkspaceId: canonical.bondWorkspaceId,
      bondRegionId: canonical.bondRegionId,
      bondWorkspaceUnitId: canonical.bondWorkspaceUnitId,
      primaryConsultantUserId: canonical.primaryConsultantUserId,
      processorUserId: canonical.processorUserId,
      managerUserId: canonical.managerUserId,
      complianceUserId: canonical.complianceUserId,
      primaryConsultantEmail: canonical.primaryConsultantEmail || null,
      primaryConsultantName: canonical.primaryConsultantName || null,
      processorEmail: canonical.processorEmail || null,
      processorName: canonical.processorName || null,
      managerEmail: canonical.managerEmail || null,
      managerName: canonical.managerName || null,
      complianceEmail: canonical.complianceEmail || null,
      complianceName: canonical.complianceName || null,
      status: canonical.status,
      legacyBondOriginator: null,
      legacyBondOriginatorEmail: null,
      legacyBondOriginatorName: null,
      sourceHint: canonical.source || null,
      warnings,
    }
  }

  if (participant.hasParticipant) {
    return {
      source: 'participant',
      confidence: participant.confidence || 0.7,
      bondWorkspaceId: null,
      bondRegionId: null,
      bondWorkspaceUnitId: null,
      primaryConsultantUserId: participant.primaryConsultantUserId,
      processorUserId: participant.processorUserId,
      managerUserId: participant.managerUserId,
      complianceUserId: participant.complianceUserId,
      primaryConsultantEmail: participant.primaryConsultantEmail,
      primaryConsultantName: participant.primaryConsultantName,
      processorEmail: participant.processorEmail,
      processorName: participant.processorName,
      managerEmail: participant.managerEmail,
      managerName: participant.managerName,
      complianceEmail: participant.complianceEmail,
      complianceName: participant.complianceName,
      status: canonical.status,
      legacyBondOriginator: null,
      legacyBondOriginatorEmail: null,
      legacyBondOriginatorName: null,
      sourceHint: participant.source || null,
      warnings,
    }
  }

  if (rolePlayer.hasRolePlayer) {
    return {
      source: 'role_player',
      confidence: rolePlayer.confidence || 0.6,
      bondWorkspaceId: null,
      bondRegionId: null,
      bondWorkspaceUnitId: null,
      primaryConsultantUserId: rolePlayer.primaryConsultantUserId,
      processorUserId: rolePlayer.processorUserId,
      managerUserId: rolePlayer.managerUserId,
      complianceUserId: rolePlayer.complianceUserId,
      primaryConsultantEmail: rolePlayer.primaryConsultantEmail,
      primaryConsultantName: rolePlayer.primaryConsultantName,
      processorEmail: rolePlayer.processorEmail,
      processorName: rolePlayer.processorName,
      managerEmail: rolePlayer.managerEmail,
      managerName: rolePlayer.managerName,
      complianceEmail: rolePlayer.complianceEmail,
      complianceName: rolePlayer.complianceName,
      status: canonical.status,
      legacyBondOriginator: rolePlayer.primaryConsultantName || rolePlayer.primaryConsultantEmail || null,
      legacyBondOriginatorEmail: rolePlayer.primaryConsultantEmail || null,
      legacyBondOriginatorName: rolePlayer.primaryConsultantName || null,
      sourceHint: rolePlayer.source || null,
      warnings,
    }
  }

  if (legacy.source !== 'none') {
    return {
      source: legacy.source,
      confidence: legacy.confidence,
      bondWorkspaceId: null,
      bondRegionId: null,
      bondWorkspaceUnitId: null,
      primaryConsultantUserId: null,
      processorUserId: null,
      managerUserId: null,
      complianceUserId: null,
      primaryConsultantEmail: legacy.primaryConsultantEmail,
      primaryConsultantName: legacy.primaryConsultantName,
      processorEmail: null,
      processorName: null,
      managerEmail: null,
      managerName: null,
      complianceEmail: null,
      complianceName: null,
      status: legacy.status,
      legacyBondOriginator: legacy.legacyBondOriginator,
      legacyBondOriginatorEmail: legacy.legacyBondOriginatorEmail,
      legacyBondOriginatorName: legacy.legacyBondOriginatorName,
      sourceHint: null,
      warnings,
    }
  }

  return {
    source: 'none',
    confidence: 0,
    bondWorkspaceId: null,
    bondRegionId: null,
    bondWorkspaceUnitId: null,
    primaryConsultantUserId: null,
    processorUserId: null,
    managerUserId: null,
    complianceUserId: null,
    primaryConsultantEmail: null,
    primaryConsultantName: null,
    processorEmail: null,
    processorName: null,
    managerEmail: null,
    managerName: null,
    complianceEmail: null,
    complianceName: null,
    status: 'unassigned',
    legacyBondOriginator: null,
    legacyBondOriginatorEmail: null,
    legacyBondOriginatorName: null,
    sourceHint: null,
    warnings: ['no_assignment_resolved'],
  }
}

export function resolveBondAssignment(transaction = null) {
  return resolveEffectiveBondAssignment(transaction)
}

export function getBondAssignmentDisplay(transaction = null) {
  const assignment = resolveEffectiveBondAssignment(transaction)
  return {
    source: assignment.source,
    confidence: assignment.confidence,
    workspace: {
      id: assignment.bondWorkspaceId || null,
      regionId: assignment.bondRegionId || null,
      unitId: assignment.bondWorkspaceUnitId || null,
    },
    consultant: assignment.primaryConsultantUserId
      ? {
          userId: assignment.primaryConsultantUserId,
          email: assignment.primaryConsultantEmail || null,
          name: assignment.primaryConsultantName || null,
        }
      : {
          userId: null,
          email: assignment.legacyBondOriginatorEmail || assignment.primaryConsultantEmail || null,
          name: assignment.legacyBondOriginatorName || assignment.primaryConsultantName || null,
        },
    processor: {
      userId: assignment.processorUserId,
      email: assignment.processorEmail || null,
      name: assignment.processorName || null,
    },
    manager: {
      userId: assignment.managerUserId,
      email: assignment.managerEmail || null,
      name: assignment.managerName || null,
    },
    compliance: {
      userId: assignment.complianceUserId,
      email: assignment.complianceEmail || null,
      name: assignment.complianceName || null,
    },
    status: assignment.status,
    warnings: assignment.warnings || [],
  }
}

export function resolveCurrentBondAssignment(input = {}) {
  const transaction = input.transaction || {}
  const assignments = normalizeAssignments(input.assignments)
  const normalizedAssignments = Array.isArray(assignments) ? assignments : []
  const transferAssignment = normalizedAssignments.find((item) => normalizeText(item.attorneyRole).toLowerCase() === 'transfer_attorney')
  const bondAssignment = normalizedAssignments.find((item) => normalizeText(item.attorneyRole).toLowerCase() === 'bond_attorney')
  const current = resolveEffectiveBondAssignment(transaction)

  const legacy = normalizeLegacyBondAssignment(transaction)

  const transferParty = parseTransferAttorney(transferAssignment)
  const bondParty = resolveBondAttorneyFallback(bondAssignment, normalizedAssignments)
  const canonicalFallback = resolveCanonicalOrLegacyContactFields(transaction)

  return {
    transaction,
    assignments: normalizedAssignments,
    transferAssignment,
    transferAttorneyEmail: transferParty.email || null,
    transferAttorneyName: transferParty.name || null,
    bondAssignment,
    bondAttorneyEmail: bondParty.email || null,
    bondAttorneyName: bondParty.name || null,
    bondOriginatorEmail: bondParty.email || canonicalFallback.consultantEmail || legacy.assignedBondOriginatorEmail || '',
    bondOriginatorName: bondParty.name || canonicalFallback.consultantName || legacy.assignedBondOriginatorName || '',
    participantBondOriginatorEmail: canonicalFallback.consultantEmail || bondParty.email || null,
    participantBondOriginatorName: canonicalFallback.consultantName || bondParty.name || null,
    bondAssignmentResolution: current,
  }
}

const normaliseLegacyBondAssignment = normalizeLegacyBondAssignment

export { normalizeLegacyBondAssignment, normaliseLegacyBondAssignment }

function buildAuditPayload(actorId = null, source = 'manual') {
  return {
    bond_assignment_updated_at: nowIso(),
    bond_assignment_updated_by: actorId || null,
    bond_assignment_source: source || null,
  }
}

function buildAssignmentPayload(transactionId, values = {}, source = 'manual') {
  const resolvedTransactionId = normalizeUuid(transactionId)
  const status = normalizeText(values?.status || values?.bond_assignment_status || values?.bondAssignmentStatus || '')
  const canonicalSource = normalizeText(values?.source || values?.bond_assignment_source || values?.bondAssignmentSource || source || '').toLowerCase()

  return {
    ...(resolvedTransactionId ? { id: resolvedTransactionId } : {}),
    bond_workspace_id: normalizeId(values?.bondWorkspaceId || values?.bond_workspace_id || values?.workspaceId || values?.organisation_id),
    bond_region_id: normalizeId(values?.bondRegionId || values?.bond_region_id || values?.regionId),
    bond_workspace_unit_id: normalizeId(values?.bondWorkspaceUnitId || values?.bond_workspace_unit_id || values?.unitId || values?.unit_id),
    primary_bond_consultant_user_id: normalizeId(values?.primaryConsultantUserId || values?.primary_bond_consultant_user_id),
    assigned_bond_processor_user_id: normalizeId(values?.processorUserId || values?.assigned_bond_processor_user_id),
    assigned_bond_manager_user_id: normalizeId(values?.managerUserId || values?.assigned_bond_manager_user_id),
    assigned_bond_compliance_user_id: normalizeId(values?.complianceUserId || values?.assigned_bond_compliance_user_id),
    bond_assignment_rule_id: normalizeId(values?.bondAssignmentRuleId || values?.bond_assignment_rule_id || values?.ruleId || null),
    bond_assignment_method: normalizeText(values?.bondAssignmentMethod || values?.bond_assignment_method || values?.assignmentMethod || values?.method || null),
    bond_assignment_status: KNOWN_BOND_STATUSES.has(status) ? status : 'unassigned',
    bond_assignment_source: KNOWN_BOND_SOURCES.has(canonicalSource) ? canonicalSource : 'manual',
    ...buildAuditPayload(values?.actorId || null, values?.source || source),
  }
}

function prunePayload(payload = {}) {
  const base = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    if (value === null || value === '' || isUuid(value) || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      base[key] = value
    }
  }
  delete base.id
  return base
}

async function safelyDropMissingColumnsAndRetry({ query, payload = {} }) {
  let current = { ...payload }
  let result = await query(current)

  if (!result?.error) return result

  if (isMissingTableError(result.error, 'transactions')) {
    return result
  }

  let guard = 0
  while (guard < 12 && result.error) {
    const error = result.error
    const isMissingColumn =
      isMissingColumnError(error, 'bond_workspace_id') ||
      isMissingColumnError(error, 'bond_region_id') ||
      isMissingColumnError(error, 'bond_workspace_unit_id') ||
      isMissingColumnError(error, 'primary_bond_consultant_user_id') ||
      isMissingColumnError(error, 'assigned_bond_processor_user_id') ||
      isMissingColumnError(error, 'assigned_bond_manager_user_id') ||
      isMissingColumnError(error, 'assigned_bond_compliance_user_id') ||
      isMissingColumnError(error, 'bond_assignment_status') ||
      isMissingColumnError(error, 'bond_assignment_source') ||
      isMissingColumnError(error, 'bond_assignment_rule_id') ||
      isMissingColumnError(error, 'bond_assignment_method') ||
      isMissingColumnError(error, 'bond_assignment_updated_at') ||
      isMissingColumnError(error, 'bond_assignment_updated_by')

    if (!isMissingColumn) {
      return result
    }

    const missing = error.message?.toLowerCase() || ''
    let removed = false

    if (missing.includes('bond_workspace_id')) {
      delete current.bond_workspace_id
      removed = true
    }
    if (missing.includes('bond_region_id')) {
      delete current.bond_region_id
      removed = true
    }
    if (missing.includes('bond_workspace_unit_id')) {
      delete current.bond_workspace_unit_id
      removed = true
    }
    if (missing.includes('primary_bond_consultant_user_id')) {
      delete current.primary_bond_consultant_user_id
      removed = true
    }
    if (missing.includes('assigned_bond_processor_user_id')) {
      delete current.assigned_bond_processor_user_id
      removed = true
    }
    if (missing.includes('assigned_bond_manager_user_id')) {
      delete current.assigned_bond_manager_user_id
      removed = true
    }
    if (missing.includes('assigned_bond_compliance_user_id')) {
      delete current.assigned_bond_compliance_user_id
      removed = true
    }
    if (missing.includes('bond_assignment_rule_id')) {
      delete current.bond_assignment_rule_id
      removed = true
    }
    if (missing.includes('bond_assignment_method')) {
      delete current.bond_assignment_method
      removed = true
    }
    if (missing.includes('bond_assignment_status')) {
      delete current.bond_assignment_status
      removed = true
    }
    if (missing.includes('bond_assignment_source')) {
      delete current.bond_assignment_source
      removed = true
    }
    if (missing.includes('bond_assignment_updated_at')) {
      delete current.bond_assignment_updated_at
      removed = true
    }
    if (missing.includes('bond_assignment_updated_by')) {
      delete current.bond_assignment_updated_by
      removed = true
    }
    if (!removed) return result
    result = await query(current)
    guard += 1
  }

  return result
}

async function updateTransactionAssignmentFields(transactionId, payload = {}, options = {}) {
  const normalizedTransactionId = normalizeUuid(transactionId)
  if (!normalizedTransactionId) {
    return { ok: false, error: 'transactionId is required', data: null }
  }

  const client = options.client || requireClient()
  const actor = options.actor || (await client.auth.getUser().then(({ data }) => data?.user || null).catch(() => null))
  const actorId = normalizeId(actor?.id || options.actorId)
  const prepared = prunePayload(buildAssignmentPayload(normalizedTransactionId, payload, payload?.source || 'manual'))

  if (!Object.keys(prepared).length) {
    return { ok: false, error: 'no assignment values provided', data: null }
  }

  const basePayload = buildAuditPayload(actorId, payload.source || 'manual')
  const merged = prunePayload({ ...prepared, ...basePayload })

  let result = await safelyDropMissingColumnsAndRetry({
    query: (nextPayload) => client.from('transactions').update(nextPayload).eq('id', normalizedTransactionId),
    payload: merged,
  })

  if (result?.error) {
    throw result.error
  }

  return {
    ok: true,
    data: { transactionId: normalizedTransactionId, values: merged },
  }
}

async function syncLegacyBondAssignmentColumns(transactionId, assignment = {}, options = {}) {
  const client = options.client || requireClient()
  const currentTransaction = resolveCanonicalOrLegacyContactFields(options.currentTransaction || null)
  const canonicalSourcePayload = resolveEffectiveBondAssignment(options.currentTransaction || null)
  const payload = {}
  const consultant = assignment.primaryConsultantUserId || canonicalSourcePayload.primaryConsultantUserId
  const requestedConsultantEmail = normalizeEmail(
    options.primaryConsultantEmail || options.assignedBondOriginatorEmail || options.consultantEmail || options.email || null,
  )
  const hasCanonicalConsultantEmail = Boolean(canonicalSourcePayload.primaryConsultantEmail || requestedConsultantEmail)

  if (options.emitLegacyEmail || (consultant && hasCanonicalConsultantEmail)) {
    payload.assigned_bond_originator_email =
      canonicalSourcePayload.primaryConsultantEmail || requestedConsultantEmail || null
  }

  if (!options.currentBondOriginator || options.overwriteBondOriginator) {
    if (canonicalSourcePayload.primaryConsultantName || currentTransaction.consultantName) {
      payload.bond_originator = canonicalSourcePayload.primaryConsultantName || currentTransaction.consultantName || null
    } else if (options.legacyBondOriginatorName) {
      payload.bond_originator = options.legacyBondOriginatorName
    }
  }

  const updatePayload = prunePayload(payload)
  if (!Object.keys(updatePayload).length) {
    return { ok: true, data: null }
  }

  const result = await safelyDropMissingColumnsAndRetry({
    query: (nextPayload) => client.from('transactions').update(nextPayload).eq('id', normalizeUuid(transactionId)),
    payload: updatePayload,
  })

  if (result?.error) return { ok: false, error: result.error.message || 'update failed' }
  return { ok: true, data: updatePayload }
}

async function syncTransactionRolePlayer(transactionId, roleType, userId, options = {}) {
  if (!transactionId || !roleType) return { ok: true }
  const client = options.client || requireClient()
  const membershipPayload = {
    transaction_id: normalizeUuid(transactionId),
    role_type: roleType,
    user_id: normalizeId(userId) || null,
    status: 'active',
    participant_email: normalizeEmail(options.email || null) || null,
    participant_name: normalizeText(options.name || null) || null,
    assignment_source: 'manual',
    updated_at: nowIso(),
    created_at: nowIso(),
  }
  const safePayload = prunePayload(membershipPayload)

  const result = await client
    .from('transaction_role_players')
    .upsert(safePayload, { onConflict: 'transaction_id,role_type' })
    .select('id')
    .limit(1)
  if (!result.error) return { ok: true, data: result.data || null }

  if (isMissingTableError(result.error, 'transaction_role_players') || isPermissionDeniedError(result.error)) {
    return { ok: true, skipped: true }
  }
  const fallbackRows = { transaction_id: normalizeUuid(transactionId), role_type: roleType, user_id: normalizeId(userId), status: 'active' }
  const fallback = await client.from('transaction_role_players').insert(prunePayload(fallbackRows))
  if (fallback.error) {
    if (isMissingTableError(fallback.error, 'transaction_role_players') || isPermissionDeniedError(fallback.error)) return { ok: true, skipped: true }
    return { ok: false, error: fallback.error }
  }
  return { ok: true, data: fallback.data || null }
}

async function syncDualWrite(transactionId, payload = {}, options = {}, { syncLegacy = false } = {}) {
  const canonical = resolveCanonicalAssignment(payload || {})
  const writeResult = await updateTransactionAssignmentFields(transactionId, payload, options)
  if (!writeResult.ok) return writeResult

  if (syncLegacy) {
    const legacyResult = await syncLegacyBondAssignmentColumns(
      transactionId,
      {
        primaryConsultantUserId: canonical.primaryConsultantUserId,
        primaryConsultantEmail: canonical.primaryConsultantEmail || options.primaryConsultantEmail,
        primaryConsultantName: canonical.primaryConsultantName || options.primaryConsultantName,
      },
      { ...options, currentTransaction: options.currentTransaction },
    )
    if (!legacyResult.ok) return legacyResult
  }
  return { ok: true, data: writeResult.data }
}

export async function assignBondWorkspace(transactionId, payload = {}) {
  return syncDualWrite(
    transactionId,
    {
      bondWorkspaceId: payload.workspaceId || payload.bondWorkspaceId || payload.bond_workspace_id,
      status: payload.status || 'workspace_assigned',
      source: payload.source || 'manual',
    },
    payload,
  )
}

export async function assignBondRegion(transactionId, payload = {}) {
  return syncDualWrite(
    transactionId,
    {
      bondRegionId: payload.regionId || payload.bondRegionId || payload.bond_region_id,
      status: payload.status || 'workspace_assigned',
      source: payload.source || 'manual',
    },
    payload,
  )
}

export async function assignBondUnit(transactionId, payload = {}) {
  return syncDualWrite(
    transactionId,
    {
      bondWorkspaceUnitId: payload.workspaceUnitId || payload.bondWorkspaceUnitId || payload.bond_workspace_unit_id,
      status: payload.status || 'consultant_assigned',
      source: payload.source || 'manual',
    },
    payload,
  )
}

export async function assignPrimaryBondConsultant(transactionId, payload = {}) {
  const result = await syncDualWrite(transactionId, {
    primaryConsultantUserId: payload.userId || payload.primaryConsultantUserId || payload.primary_bond_consultant_user_id,
    status: payload.status || 'consultant_assigned',
    source: payload.source || 'manual',
  }, payload, { syncLegacy: true })

  if (result.ok && payload.userId) {
    await syncTransactionRolePlayer(transactionId, 'bond_originator', payload.userId, {
      email: payload.email,
      name: payload.name,
      client: payload.client,
      actorId: payload.actorId || payload.actor?.id,
    })
  }
  return result
}

export async function assignBondProcessor(transactionId, payload = {}) {
  const result = await syncDualWrite(transactionId, {
    processorUserId: payload.userId || payload.processorUserId || payload.assigned_bond_processor_user_id,
    status: payload.status || 'processor_assigned',
    source: payload.source || 'manual',
  }, payload)

  if (result.ok && payload.userId) {
    await syncTransactionRolePlayer(transactionId, 'processor', payload.userId, {
      email: payload.email,
      name: payload.name,
      client: payload.client,
      actorId: payload.actorId || payload.actor?.id,
    })
  }
  return result
}

export async function assignBondManager(transactionId, payload = {}) {
  const result = await syncDualWrite(transactionId, {
    managerUserId: payload.userId || payload.managerUserId || payload.assigned_bond_manager_user_id,
    status: payload.status || 'fully_assigned',
    source: payload.source || 'manual',
  }, payload)
  if (result.ok && payload.userId) {
    await syncTransactionRolePlayer(transactionId, 'manager', payload.userId, {
      email: payload.email,
      name: payload.name,
      client: payload.client,
      actorId: payload.actorId || payload.actor?.id,
    })
  }
  return result
}

export async function assignBondComplianceReviewer(transactionId, payload = {}) {
  const result = await syncDualWrite(transactionId, {
    complianceUserId: payload.userId || payload.complianceUserId || payload.assigned_bond_compliance_user_id,
    status: payload.status || 'fully_assigned',
    source: payload.source || 'manual',
  }, payload)

  if (result.ok && payload.userId) {
    await syncTransactionRolePlayer(transactionId, 'compliance', payload.userId, {
      email: payload.email,
      name: payload.name,
      client: payload.client,
      actorId: payload.actorId || payload.actor?.id,
    })
  }
  return result
}

export async function clearBondAssignment(transactionId, payload = {}) {
  const resolvedPayload = {
    bondWorkspaceId: payload.clearWorkspace ? null : undefined,
    bondRegionId: payload.clearRegion ? null : undefined,
    bondWorkspaceUnitId: payload.clearUnit ? null : undefined,
    primaryConsultantUserId: payload.clearPrimaryConsultant ? null : undefined,
    processorUserId: payload.clearProcessor ? null : undefined,
    managerUserId: payload.clearManager ? null : undefined,
    complianceUserId: payload.clearCompliance ? null : undefined,
    status: payload.status || 'unassigned',
    source: payload.source || 'manual',
  }
  return syncDualWrite(transactionId, resolvedPayload, payload)
}

function applyValidationResult(result = {}) {
  return {
    ok: result.errors?.length === 0,
    warnings: result.warnings || [],
    errors: result.errors || [],
    ...result,
  }
}

export function validateBondWorkspaceAssignment(payload = {}) {
  const errors = []
  const warnings = []
  const workspaceId = normalizeId(payload.workspaceId || payload.bondWorkspaceId || payload.bond_workspace_id)
  const regionId = normalizeId(payload.regionId || payload.bondRegionId || payload.bond_region_id)
  const unitId = normalizeId(payload.workspaceUnitId || payload.bondWorkspaceUnitId || payload.bond_workspace_unit_id)
  if (!workspaceId) warnings.push('workspace_id_missing')
  if (!payload.workspaceId && !payload.bondWorkspaceId && !payload.bond_workspace_id) {
    errors.push('workspace_assignment_missing')
  }
  if (payload.source && !KNOWN_BOND_SOURCES.has(normalizeText(payload.source))) warnings.push('unknown_bond_assignment_source')
  if (payload.status && !KNOWN_BOND_STATUSES.has(normalizeText(payload.status))) warnings.push('unknown_bond_assignment_status')
  if (!regionId && !unitId) warnings.push('scope_not_set')
  return applyValidationResult({ warnings, errors })
}

export async function validateBondUserBelongsToWorkspace(userId, workspaceId, options = {}) {
  const resolvedUserId = normalizeUuid(userId)
  const resolvedWorkspaceId = normalizeUuid(workspaceId)
  if (!resolvedUserId || !resolvedWorkspaceId) return false
  if (!resolvedWorkspaceId || !resolvedUserId) return false
  if (Array.isArray(options.memberships) && options.memberships.length) {
    return options.memberships.some((item) => {
      const status = normalizeText(item?.status)
      return (
        status !== 'active' &&
        status !== 'pending' &&
        status !== 'invited'
        ? false
        : normalizeUuid(item.user_id || item.userId || item.user?.id) === resolvedUserId &&
          normalizeUuid(item.organisation_id || item.organisationId || item.organisationId) === resolvedWorkspaceId
      )
    })
  }

  if (options.client || !options.allowDbFallback) return false
  const client = options.client || requireClient()
  const query = await client
    .from('organisation_users')
    .select('id')
    .eq('organisation_id', resolvedWorkspaceId)
    .eq('user_id', resolvedUserId)
    .eq('status', 'active')
    .limit(1)
  if (query.error) {
    if (isPermissionDeniedError(query.error)) return false
    if (isMissingTableError(query.error, 'organisation_users')) return false
    throw query.error
  }
  return Boolean(query.data && query.data.length)
}

export async function validateBondUserScopeForAssignment(userId, workspaceId, regionId = null, unitId = null, options = {}) {
  if (!(await validateBondUserBelongsToWorkspace(userId, workspaceId, options))) return false
  if (!regionId && !unitId) return true
  const userMemberships = Array.isArray(options.memberships)
    ? options.memberships
    : []
  const resolvedUserId = normalizeUuid(userId)
  const normalizedRegionId = normalizeUuid(regionId)
  const normalizedUnitId = normalizeUuid(unitId)
  if (userMemberships.length) {
    const membership = userMemberships.find((item) => normalizeUuid(item.user_id || item.userId || item.user?.id) === resolvedUserId)
    if (!membership) return false
    const membershipRegionId = normalizeUuid(membership.region_id || membership.regionId)
    const membershipUnitId = normalizeUuid(membership.workspace_unit_id || membership.workspaceUnitId || membership.unit_id || membership.unitId)
    if (normalizedRegionId) return normalizedRegionId === membershipRegionId
    if (normalizedUnitId) return normalizedUnitId === membershipUnitId
    return true
  }
  if (options.forceAssumeScopeMatch) return true
  return true
}

export function validateBondAssignmentTransition(currentAssignment = null, nextAssignment = null) {
  const warnings = []
  const errors = []
  const current = currentAssignment || {}
  const next = nextAssignment || {}

  const currentWorkspace = normalizeId(current.bondWorkspaceId || current.bond_workspace_id || current.organisation_id)
  const nextWorkspace = normalizeId(next.bondWorkspaceId || next.bond_workspace_id || next.organisation_id)
  if (!currentWorkspace && nextWorkspace) {
    warnings.push('assigning_workspace_to_legacy_record')
  }
  if (currentWorkspace && nextWorkspace && currentWorkspace !== nextWorkspace) {
    warnings.push('workspace_reassignment')
  }
  if (!next.primaryConsultantUserId && !next.processorUserId && !next.managerUserId && !next.complianceUserId && !next.bondWorkspaceId) {
    warnings.push('clearing_assignment')
  }
  if ((current.status || 'unassigned') === 'inactive' && next.status && next.status !== 'inactive') {
    warnings.push('reactivating_assignment')
  }

  if (!currentWorkspace && !nextWorkspace && !next.source && next.source !== 'canonical' && next.source !== 'participant') {
    errors.push('invalid_transition_without_workspace')
  }

  return applyValidationResult({ warnings, errors, from: current, to: next })
}

export function prepareBondAssignmentPayload(input = {}) {
  const current = resolveCurrentBondAssignment(input)
  const effective = current.bondAssignmentResolution || resolveEffectiveBondAssignment(input.transaction)
  const legacy = normalizeLegacyBondAssignment(input.transaction)

  const bondOriginatorEmail = effective.primaryConsultantEmail || legacy.assignedBondOriginatorEmail || current.participantBondOriginatorEmail || ''
  const bondOriginatorName =
    effective.primaryConsultantName ||
    current.bondOriginatorName ||
    current.participantBondOriginatorName ||
    legacy.assignedBondOriginatorName ||
    current.participantBondOriginatorEmail ||
    null

  const canonical = resolveCanonicalAssignment(input.transaction)
  const assignedAttorney = parseTransferAttorney(normalizeText(input?.transferAttorney) ? null : current.bondAssignment)
  const attachment = {
    attorney: assignedAttorney.name || legacy.assignedBondAttorneyName || null,
    assigned_attorney_email: assignedAttorney.email || legacy.assignedBondAttorneyEmail || null,
    assigned_bond_originator_email: bondOriginatorEmail || null,
    bond_originator: bondOriginatorName || null,
    ...buildAssignmentPayload(null, canonical, canonical.source),
    __legacy: {
      source: 'bondAssignmentService',
      transferAssignmentId: current.transferAssignment?.id || null,
      bondAssignmentId: current.bondAssignment?.id || null,
      effectiveSource: effective.source || null,
    },
  }

  return prunePayload(attachment)
}
