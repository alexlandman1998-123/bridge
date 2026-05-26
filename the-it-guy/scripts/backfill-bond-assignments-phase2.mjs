#!/usr/bin/env node
import fs from 'node:fs'

const INPUT = process.env.BOND_ASSIGNMENT_BACKFILL_INPUT
const OUTPUT = process.env.BOND_ASSIGNMENT_BACKFILL_OUTPUT
const DRY_RUN = String(process.env.BOND_ASSIGNMENT_BACKFILL_DRY_RUN || 'true').toLowerCase() !== 'false'
const SAMPLE_LIMIT = Number(process.env.BOND_ASSIGNMENT_BACKFILL_SAMPLE_LIMIT || '5')
const MANUAL_MAPPING_INPUT = process.env.BOND_ASSIGNMENT_MANUAL_MAPPING || ''

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
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

function isActiveParticipant(item = {}) {
  const status = normalizeText(item.status || item.removed_at).toLowerCase()
  return !status || status === 'active'
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

function isTestOrDemo(row = {}) {
  return Boolean(
    row.is_demo_data ||
      String(row.client_name || '').toLowerCase().includes('demo') ||
      String(row.client_name || '').toLowerCase().includes('test'),
  )
}

function readJson(filePath) {
  if (!filePath) return null
  if (!fs.existsSync(filePath)) {
    throw new Error(`BOND_ASSIGNMENT_BACKFILL_INPUT was provided but file is missing: ${filePath}`)
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Failed to parse JSON input at ${filePath}: ${error?.message || error}`)
  }
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.transactions)) return payload.transactions
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : []
}

function extractEmail(entry = {}) {
  return normalizeEmail(
    firstText(
      entry?.email,
      entry?.Email,
      entry?.user_email,
      entry?.userEmail,
      entry?.participant_email,
      entry?.participantEmail,
      entry?.profile?.email,
      entry?.user?.email,
    ),
  )
}

function extractUserId(entry = {}) {
  return normalizeText(
    firstText(entry?.user_id, entry?.userId, entry?.id, entry?.profile?.id, entry?.user?.id),
  )
}

function attachRelationsToTransactions(payload = {}) {
  const transactionRows = rowsFromPayload(payload)
  const participants = Array.isArray(payload?.transaction_participants)
    ? payload.transaction_participants
    : Array.isArray(payload?.transactionParticipants)
      ? payload.transactionParticipants
      : []
  const rolePlayers = Array.isArray(payload?.transaction_role_players)
    ? payload.transaction_role_players
    : Array.isArray(payload?.transactionRolePlayers)
      ? payload.transactionRolePlayers
      : []

  const participantMap = new Map()
  for (const participant of participants) {
    const transactionId = normalizeText(participant?.transaction_id || participant?.transactionId)
    if (!transactionId) continue
    if (!participantMap.has(transactionId)) participantMap.set(transactionId, [])
    participantMap.get(transactionId).push(participant)
  }

  const rolePlayerMap = new Map()
  for (const rolePlayer of rolePlayers) {
    const transactionId = normalizeText(rolePlayer?.transaction_id || rolePlayer?.transactionId)
    if (!transactionId) continue
    if (!rolePlayerMap.has(transactionId)) rolePlayerMap.set(transactionId, [])
    rolePlayerMap.get(transactionId).push(rolePlayer)
  }

  return transactionRows.map((row) => {
    const transactionId = normalizeText(row?.id || row?.transaction_id || row?.transactionId)
    return {
      ...row,
      transaction_participants: Array.isArray(row?.transaction_participants)
        ? row.transaction_participants
        : participantMap.get(transactionId) || [],
      transaction_role_players: Array.isArray(row?.transaction_role_players)
        ? row.transaction_role_players
        : rolePlayerMap.get(transactionId) || [],
    }
  })
}

function buildAuthUsers(users = []) {
  const index = new Map()
  for (const row of Array.isArray(users) ? users : []) {
    const email = extractEmail(row)
    if (!email) continue
    const userId = normalizeText(row?.id || row?.user_id || row?.userId)
    index.set(email, {
      id: userId || null,
      email,
      name: normalizeText(
        row?.name || row?.full_name || row?.fullName || row?.display_name || row?.displayName,
      ),
      source: 'user_profile',
    })
  }
  return index
}

function buildOrganisationUserIndex(organisationUsers = []) {
  const index = new Map()
  for (const membership of Array.isArray(organisationUsers) ? organisationUsers : []) {
    const userId = normalizeText(
      membership?.user_id ||
        membership?.userId ||
        membership?.user?.id ||
        membership?.profile?.id,
    )
    const directEmail = extractEmail(membership)
    const nestedEmail = normalizeEmail(membership?.user?.email || membership?.profile?.email)
    for (const email of [directEmail, nestedEmail]) {
      if (!email) continue
      index.set(email, {
        id: userId || null,
        email,
        name: normalizeText(membership?.name || membership?.user?.name || membership?.profile?.name),
        source: 'organisation_user',
      })
    }
  }
  return index
}

function buildParticipantCandidates(row = {}) {
  const participants = Array.isArray(row.transaction_participants) ? row.transaction_participants : []
  const candidates = []
  for (const participant of participants) {
    if (!isActiveParticipant(participant)) continue
    const role = normalizeText(
      participant?.role || participant?.role_type || participant?.participant_role || participant?.transaction_role || participant?.legal_role,
    ).toLowerCase()
    if (!isBondRole(role)) continue
    const email = extractEmail(participant)
    const userId = extractUserId(participant)
    const name = normalizeText(
      participant?.name ||
        participant?.participant_name ||
        participant?.participantName ||
        participant?.full_name,
    )
    if (email || userId) {
      candidates.push({
        email,
        id: userId || null,
        name,
        source: `participant:${role}`,
        workspace_id: normalizeText(
          participant?.workspace_id || participant?.workspaceId || participant?.organisation_id || participant?.organisationId,
        ),
        organisation_id: normalizeText(
          participant?.organisation_id || participant?.organisationId || participant?.organization_id,
        ),
      })
    }
  }
  return candidates
}

function buildRolePlayerCandidates(row = {}) {
  const rolePlayers = Array.isArray(row.transaction_role_players) ? row.transaction_role_players : []
  const candidates = []
  for (const rolePlayer of rolePlayers) {
    if (!isActiveParticipant(rolePlayer)) continue
    const role = normalizeText(rolePlayer?.role_type || rolePlayer?.role || rolePlayer?.participant_role).toLowerCase()
    if (role !== 'bond_originator' && role !== 'consultant') continue
    const email = extractEmail(rolePlayer)
    const userId = extractUserId(rolePlayer)
    const name = normalizeText(
      rolePlayer?.name ||
        rolePlayer?.participant_name ||
        rolePlayer?.participantName ||
        rolePlayer?.full_name,
    )
    if (email || userId) {
      candidates.push({
        email,
        id: userId || null,
        name,
        source: `role_player:${role}`,
      })
    }
  }
  return candidates
}

function detectLegacyCanonicalMismatch(row = {}) {
  const canonicalConsultantId = normalizeText(row.primary_bond_consultant_user_id)
  const legacyEmail = normalizeEmail(row.assigned_bond_originator_email)
  const canonicalEmail = normalizeEmail(
    firstText(
      row.primary_bond_consultant_email,
      row.primaryConsultantEmail,
      row.primary_consultant_email,
      row.primaryConsultant?.email,
    ),
  )
  const participants = buildParticipantCandidates(row)
  const participantIds = participants.map((entry) => normalizeText(entry.id)).filter(Boolean)
  const participantEmails = participants.map((entry) => normalizeEmail(entry.email)).filter(Boolean)
  if (canonicalConsultantId && participantIds.length && !participantIds.includes(canonicalConsultantId))
    return true
  if (legacyEmail && canonicalEmail && legacyEmail !== canonicalEmail) return true
  if (legacyEmail && participantEmails.length && !participantEmails.includes(legacyEmail)) return true
  return false
}

function buildWorkspaceContext(sources = {}) {
  const organisations = Array.isArray(sources?.organisations) ? sources.organisations : []
  const organisationUsers = Array.isArray(sources?.organisationUsers) ? sources.organisationUsers : []
  const bondOrganisationIds = new Set(
    organisations
      .filter((org) => isBondOrganisation(org))
      .map((org) => normalizeText(org.id))
      .filter(Boolean),
  )
  const onlyBondWorkspaceId = bondOrganisationIds.size === 1 ? [...bondOrganisationIds][0] : null

  const membershipsByUser = new Map()
  const membershipsByEmail = new Map()
  function addMembership(target, key, workspaceId) {
    if (!key || !workspaceId) return
    if (!target.has(key)) target.set(key, new Set())
    target.get(key).add(workspaceId)
  }

  for (const membership of organisationUsers) {
    const workspaceId = normalizeText(
      membership?.organisation_id ||
        membership?.workspace_id ||
        membership?.organisationId ||
        membership?.workspaceId,
    )
    if (!workspaceId) continue
    if (bondOrganisationIds.size > 0 && !bondOrganisationIds.has(workspaceId)) continue
    addMembership(
      membershipsByUser,
      normalizeText(membership?.user_id || membership?.userId),
      workspaceId,
    )
    addMembership(membershipsByEmail, extractEmail(membership), workspaceId)
  }

  return { bondOrganisationIds, onlyBondWorkspaceId, membershipsByUser, membershipsByEmail }
}

function loadManualMappings() {
  if (!MANUAL_MAPPING_INPUT) return new Map()
  if (!fs.existsSync(MANUAL_MAPPING_INPUT)) {
    throw new Error(
      `BOND_ASSIGNMENT_MANUAL_MAPPING was provided but file is missing: ${MANUAL_MAPPING_INPUT}`,
    )
  }
  const entries = JSON.parse(fs.readFileSync(MANUAL_MAPPING_INPUT, 'utf8'))
  if (!Array.isArray(entries)) {
    throw new Error('BOND_ASSIGNMENT_MANUAL_MAPPING must be a JSON array.')
  }
  const map = new Map()
  for (const entry of entries) {
    const transactionId = normalizeText(entry?.transactionId || entry?.transaction_id)
    if (!transactionId) continue
    map.set(transactionId, {
      transactionId,
      bondWorkspaceId: normalizeText(entry?.bondWorkspaceId || entry?.bond_workspace_id),
      reason: normalizeText(entry?.reason),
      confidence: normalizeText(entry?.confidence),
      action: normalizeText(entry?.action || '').toLowerCase(),
    })
  }
  return map
}

function dedupeWorkspaceCandidates(candidates = []) {
  const seen = new Set()
  const deduped = []
  for (const candidate of candidates) {
    const workspaceId = normalizeText(candidate?.workspaceId)
    if (!workspaceId) continue
    if (seen.has(workspaceId)) continue
    seen.add(workspaceId)
    deduped.push({ ...candidate, workspaceId })
  }
  return deduped
}

function isLikelyBondTransaction(row = {}, participants = [], rolePlayers = []) {
  if (
    row.bond_workspace_id ||
    row.primary_bond_consultant_user_id ||
    row.assigned_bond_processor_user_id ||
    row.assigned_bond_manager_user_id ||
    row.assigned_bond_compliance_user_id
  )
    return true
  if (normalizeEmail(row.assigned_bond_originator_email)) return true
  if (normalizeText(row.bond_originator)) return true
  if (participants.length > 0 || rolePlayers.length > 0) return true
  const financeType = normalizeText(row.finance_type).toLowerCase()
  const managedBy = normalizeText(row.finance_managed_by).toLowerCase()
  return financeType.includes('bond') || managedBy.includes('bond')
}

function resolveBondWorkspaceCandidate(row = {}, context = {}, manualMap = new Map()) {
  const transactionId = normalizeText(row?.id || row?.transaction_id || row?.transactionId)
  const participants = buildParticipantCandidates(row)
  const rolePlayers = buildRolePlayerCandidates(row)
  const likelyBond = isLikelyBondTransaction(row, participants, rolePlayers)
  if (!likelyBond) return { status: 'notBondScoped', source: 'notBondScoped', workspaceId: null, candidates: [] }
  if (isArchivedOrInactive(row) || isTestOrDemo(row)) {
    return { status: 'archivedOrInactive', source: 'archivedOrInactive', workspaceId: null, candidates: [] }
  }

  const manual = manualMap.get(transactionId)
  if (manual?.action === 'accepted_unresolved') {
    return {
      status: 'acceptedUnresolvedLegacy',
      source: 'acceptedUnresolvedLegacy',
      workspaceId: null,
      candidates: [],
      reason: manual.reason || 'manual_accepted_unresolved',
    }
  }
  if (manual?.bondWorkspaceId) {
    return {
      status: 'resolved',
      source: 'resolvedFromManualMapping',
      workspaceId: manual.bondWorkspaceId,
      candidates: [{ workspaceId: manual.bondWorkspaceId, source: 'manual_mapping' }],
    }
  }

  const canonicalWorkspaceId = normalizeText(row.bond_workspace_id)
  if (canonicalWorkspaceId) {
    return {
      status: 'resolved',
      source: 'resolvedFromCanonical',
      workspaceId: canonicalWorkspaceId,
      candidates: [{ workspaceId: canonicalWorkspaceId, source: 'canonical' }],
    }
  }

  const candidates = []
  for (const participant of participants) {
    const workspaceId = normalizeText(participant.workspace_id)
    const organisationId = normalizeText(participant.organisation_id)
    if (workspaceId) candidates.push({ workspaceId, source: 'resolvedFromParticipantWorkspace' })
    if (organisationId) candidates.push({ workspaceId: organisationId, source: 'resolvedFromParticipantOrganisation' })
  }

  const legacyEmail = normalizeEmail(row.assigned_bond_originator_email)
  if (legacyEmail && context.membershipsByEmail.has(legacyEmail)) {
    for (const workspaceId of context.membershipsByEmail.get(legacyEmail)) {
      candidates.push({ workspaceId, source: 'resolvedFromMembershipEmail' })
    }
  }
  for (const participant of participants) {
    if (participant.email && context.membershipsByEmail.has(participant.email)) {
      for (const workspaceId of context.membershipsByEmail.get(participant.email)) {
        candidates.push({ workspaceId, source: 'resolvedFromMembershipEmail' })
      }
    }
    if (participant.id && context.membershipsByUser.has(participant.id)) {
      for (const workspaceId of context.membershipsByUser.get(participant.id)) {
        candidates.push({ workspaceId, source: 'resolvedFromMembershipUser' })
      }
    }
  }
  for (const rolePlayer of rolePlayers) {
    if (rolePlayer.email && context.membershipsByEmail.has(rolePlayer.email)) {
      for (const workspaceId of context.membershipsByEmail.get(rolePlayer.email)) {
        candidates.push({ workspaceId, source: 'resolvedFromMembershipEmail' })
      }
    }
    if (rolePlayer.id && context.membershipsByUser.has(rolePlayer.id)) {
      for (const workspaceId of context.membershipsByUser.get(rolePlayer.id)) {
        candidates.push({ workspaceId, source: 'resolvedFromMembershipUser' })
      }
    }
  }

  const deduped = dedupeWorkspaceCandidates(candidates)
  if (deduped.length === 1) {
    return {
      status: 'resolved',
      source: deduped[0].source,
      workspaceId: deduped[0].workspaceId,
      candidates: deduped,
    }
  }
  if (deduped.length > 1) {
    return {
      status: 'ambiguousWorkspace',
      source: 'ambiguousWorkspace',
      workspaceId: null,
      candidates: deduped,
    }
  }

  if (context.onlyBondWorkspaceId) {
    return {
      status: 'singleBondWorkspaceLowConfidence',
      source: 'singleBondWorkspaceLowConfidence',
      workspaceId: context.onlyBondWorkspaceId,
      candidates: [{ workspaceId: context.onlyBondWorkspaceId, source: 'single_bond_workspace' }],
    }
  }

  return { status: 'missingWorkspace', source: 'missingWorkspace', workspaceId: null, candidates: [] }
}

function resolveAssignedEmail(row = {}) {
  const fallback = normalizeEmail(row.bond_originator)
  return normalizeEmail(row.assigned_bond_originator_email || fallback || null)
}

function pickBestMatchFromLegacy(row = {}, indexes = []) {
  const email = normalizeEmail(row.assigned_bond_originator_email)
  if (!email) return { user: null, source: 'legacy_email_only', reason: 'no_assigned_email' }
  for (const index of indexes) {
    if (index.has(email)) {
      return {
        user: index.get(email),
        source: index.get(email)?.source || 'user_index',
        reason: 'matched_by_email',
      }
    }
  }
  const participants = buildParticipantCandidates(row)
  for (const participant of participants) {
    if (participant.email === email && participant.id) {
      return {
        user: participant,
        source: participant.source,
        reason: 'matched_participant_by_email',
      }
    }
  }
  return { user: null, source: 'legacy_email_only', reason: 'no_user_match' }
}

function backfillRow(row = {}, indexes = [], workspaceContext = {}, manualMap = new Map()) {
  const hasCanonical = Boolean(
    row.primary_bond_consultant_user_id ||
      row.bond_workspace_id ||
      row.bond_region_id ||
      row.bond_workspace_unit_id,
  )
  const transactionId = normalizeText(row.id || row.transaction_id || row.transactionId)
  const hasLegacyEmail = Boolean(normalizeEmail(row.assigned_bond_originator_email))
  const hasLegacyText = Boolean(normalizeText(row.bond_originator))
  const participants = buildParticipantCandidates(row)
  const rolePlayers = buildRolePlayerCandidates(row)
  const workspaceResolution = resolveBondWorkspaceCandidate(row, workspaceContext, manualMap)

  if (hasCanonical) {
    return {
      ...row,
      transaction_id: transactionId || null,
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      warning: null,
      backfill_source: 'skipped_existing',
      backfill_action: 'skipped',
      workspace_resolution_source: 'resolvedFromCanonical',
      workspace_resolution_status: 'resolved',
      workspace_resolution_candidates: workspaceResolution.candidates,
      legacy_canonical_mismatch: detectLegacyCanonicalMismatch(row),
      proposed_updates: {},
    }
  }

  if (workspaceResolution.status === 'notBondScoped') {
    return {
      ...row,
      transaction_id: transactionId || null,
      warning: 'not_bond_scoped',
      backfill_source: 'not_bond_scoped',
      backfill_action: 'not_bond_scoped',
      workspace_resolution_source: workspaceResolution.source,
      workspace_resolution_status: workspaceResolution.status,
      workspace_resolution_candidates: workspaceResolution.candidates,
      proposed_updates: {},
    }
  }

  if (workspaceResolution.status === 'archivedOrInactive') {
    return {
      ...row,
      transaction_id: transactionId || null,
      warning: 'accepted_unresolved_legacy_archived_or_inactive',
      backfill_source: 'accepted_unresolved_legacy',
      backfill_action: 'accepted_unresolved_legacy',
      workspace_resolution_source: workspaceResolution.source,
      workspace_resolution_status: workspaceResolution.status,
      workspace_resolution_candidates: workspaceResolution.candidates,
      proposed_updates: {},
    }
  }

  if (workspaceResolution.status === 'acceptedUnresolvedLegacy') {
    return {
      ...row,
      transaction_id: transactionId || null,
      warning: workspaceResolution.reason || 'accepted_unresolved_legacy',
      backfill_source: 'accepted_unresolved_legacy',
      backfill_action: 'accepted_unresolved_legacy',
      workspace_resolution_source: workspaceResolution.source,
      workspace_resolution_status: workspaceResolution.status,
      workspace_resolution_candidates: workspaceResolution.candidates,
      proposed_updates: {},
    }
  }

  if (workspaceResolution.status === 'ambiguousWorkspace') {
    return {
      ...row,
      transaction_id: transactionId || null,
      warning: 'ambiguous_workspace_candidates',
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      backfill_source: 'ambiguous_workspace',
      backfill_action: 'ambiguous_workspace',
      workspace_resolution_source: workspaceResolution.source,
      workspace_resolution_status: workspaceResolution.status,
      workspace_resolution_candidates: workspaceResolution.candidates,
      proposed_updates: {},
    }
  }

  if (
    workspaceResolution.status === 'missingWorkspace' ||
    workspaceResolution.status === 'singleBondWorkspaceLowConfidence'
  ) {
    return {
      ...row,
      transaction_id: transactionId || null,
      warning:
        workspaceResolution.status === 'singleBondWorkspaceLowConfidence'
          ? 'single_bond_workspace_low_confidence'
          : 'missing_workspace_id',
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      backfill_source:
        workspaceResolution.status === 'singleBondWorkspaceLowConfidence'
          ? 'single_bond_workspace_low_confidence'
          : 'missing_workspace',
      backfill_action: 'manual_review',
      workspace_resolution_source: workspaceResolution.source,
      workspace_resolution_status: workspaceResolution.status,
      workspace_resolution_candidates: workspaceResolution.candidates,
      proposed_updates: {},
    }
  }

  const workspaceId = workspaceResolution.workspaceId
  const participantMatch = participants.find((candidate) => candidate.id)
  const rolePlayerMatch = rolePlayers.find((candidate) => candidate.id)
  const legacyMatch = pickBestMatchFromLegacy(row, indexes)

  const resolved = participantMatch || rolePlayerMatch || legacyMatch.user || null
  const resolvedSource =
    participantMatch?.source ||
    rolePlayerMatch?.source ||
    (resolved ? legacyMatch.source : legacyMatch.source)
  const reason = participantMatch
    ? 'participant_match'
    : rolePlayerMatch
      ? 'role_player_match'
      : resolved
        ? legacyMatch.reason || 'legacy_email_match'
        : legacyMatch.reason
  const updatedAt = new Date().toISOString()
  const multipleParticipants = participants.length > 1

  if (!resolved) {
    const hasAnyFallbackSignal = hasLegacyEmail || hasLegacyText || participants.length > 0
    const warning = hasLegacyText
      ? 'legacy_text_only'
      : hasAnyFallbackSignal
        ? `unresolved:${reason}`
        : null
    const proposedUpdates = {
      bond_workspace_id: workspaceId,
      bond_assignment_status: row.bond_assignment_status || 'unassigned',
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      bond_assignment_updated_at: updatedAt,
      bond_assignment_updated_by: row.bond_assignment_updated_by || null,
    }
    return {
      ...row,
      transaction_id: transactionId || null,
      bond_workspace_id: workspaceId,
      bond_assignment_status: row.bond_assignment_status || 'unassigned',
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      warning,
      backfill_source: resolvedSource,
      backfill_reason: reason,
      backfill_action: 'manual_review',
      workspace_resolution_source: workspaceResolution.source,
      workspace_resolution_status: workspaceResolution.status,
      workspace_resolution_candidates: workspaceResolution.candidates,
      proposed_updates: proposedUpdates,
    }
  }

  if (multipleParticipants) {
    return {
      ...row,
      transaction_id: transactionId || null,
      bond_workspace_id: workspaceId,
      bond_assignment_status: row.bond_assignment_status || 'unassigned',
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      warning: 'multiple_participants_manual_review',
      backfill_source: resolvedSource || 'participant',
      backfill_reason: 'multiple_participants',
      backfill_action: 'manual_review',
      workspace_resolution_source: workspaceResolution.source,
      workspace_resolution_status: workspaceResolution.status,
      workspace_resolution_candidates: workspaceResolution.candidates,
      proposed_updates: {},
    }
  }

  const proposedUpdates = {
    bond_workspace_id: workspaceId,
    bond_region_id: row.bond_region_id || null,
    bond_workspace_unit_id: row.bond_workspace_unit_id || null,
    primary_bond_consultant_user_id: resolved.id || row.primary_bond_consultant_user_id || null,
    assigned_bond_processor_user_id: row.assigned_bond_processor_user_id || null,
    assigned_bond_manager_user_id: row.assigned_bond_manager_user_id || null,
    assigned_bond_compliance_user_id: row.assigned_bond_compliance_user_id || null,
    bond_assignment_status: row.bond_assignment_status || 'consultant_assigned',
    bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
    bond_assignment_updated_at: updatedAt,
    bond_assignment_updated_by: row.bond_assignment_updated_by || null,
  }

  return {
    ...row,
    transaction_id: transactionId || null,
    bond_workspace_id: workspaceId,
    primary_bond_consultant_user_id:
      resolved.id || row.primary_bond_consultant_user_id || null,
    assigned_bond_originator_email: resolveAssignedEmail(row),
    bond_assignment_status: row.bond_assignment_status || 'consultant_assigned',
    bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
    warning: resolved.id ? null : `unresolved:${reason}`,
    backfill_source: resolvedSource,
    backfill_reason: reason,
    backfill_action: 'safe_update',
    workspace_resolution_source: workspaceResolution.source,
    workspace_resolution_status: workspaceResolution.status,
    workspace_resolution_candidates: workspaceResolution.candidates,
    proposed_updates: proposedUpdates,
  }
}

function backfillRows(rows = [], sources = {}) {
  const indexes = [
    buildAuthUsers(sources.authUsers),
    buildAuthUsers(sources.users),
    buildAuthUsers(sources.userMap),
    buildAuthUsers(sources.profiles),
    buildAuthUsers(sources.profileMap),
    buildOrganisationUserIndex(sources.organisationUsers),
    buildOrganisationUserIndex(sources.memberships),
  ]
  const workspaceContext = buildWorkspaceContext(sources)
  const manualMap = loadManualMappings()
  return rows.map((row) =>
    backfillRow(row, indexes.filter(Boolean), workspaceContext, manualMap),
  )
}

function writeRows(rows = []) {
  if (!OUTPUT) return
  fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2))
}

function printStats(rows = []) {
  const safeUpdateRows = rows.filter((row) => row.backfill_action === 'safe_update')
  const manualReviewRows = rows.filter((row) => row.backfill_action === 'manual_review')
  const unsafeRows = rows.filter((row) => row.backfill_action === 'unsafe')
  const skippedRows = rows.filter((row) => row.backfill_action === 'skipped')
  const mismatchRows = rows.filter((row) => row.legacy_canonical_mismatch)
  const ambiguousWorkspaceRows = rows.filter(
    (row) => row.backfill_action === 'ambiguous_workspace',
  )
  const missingWorkspaceRows = rows.filter(
    (row) => row.workspace_resolution_status === 'missingWorkspace',
  )
  const acceptedUnresolvedRows = rows.filter(
    (row) => row.backfill_action === 'accepted_unresolved_legacy',
  )
  const notBondScopedRows = rows.filter((row) => row.backfill_action === 'not_bond_scoped')

  const stats = {
    total: rows.length,
    existingCanonical: rows.filter((row) => row.backfill_source === 'skipped_existing').length,
    backfilledConsultant: rows.filter((row) => row.primary_bond_consultant_user_id).length,
    matchedWithWorkspace: rows.filter((row) => row.bond_workspace_id).length,
    warnings: rows.filter((row) => row.warning).length,
    dryRun: DRY_RUN,
    wouldUpdate: safeUpdateRows.length,
    wouldSkip: skippedRows.length,
    manualReview: manualReviewRows.length,
    ambiguousWorkspace: ambiguousWorkspaceRows.length,
    missingWorkspace: missingWorkspaceRows.length,
    acceptedUnresolvedLegacy: acceptedUnresolvedRows.length,
    notBondScoped: notBondScopedRows.length,
    unsafe: unsafeRows.length,
    canonicalLegacyMismatches: mismatchRows.length,
    resolvedFromCanonical: rows.filter((row) => row.workspace_resolution_source === 'resolvedFromCanonical').length,
    resolvedFromParticipantWorkspace: rows.filter((row) => row.workspace_resolution_source === 'resolvedFromParticipantWorkspace').length,
    resolvedFromParticipantOrganisation: rows.filter((row) => row.workspace_resolution_source === 'resolvedFromParticipantOrganisation').length,
    resolvedFromMembershipEmail: rows.filter((row) => row.workspace_resolution_source === 'resolvedFromMembershipEmail').length,
    resolvedFromMembershipUser: rows.filter((row) => row.workspace_resolution_source === 'resolvedFromMembershipUser').length,
    resolvedFromManualMapping: rows.filter((row) => row.workspace_resolution_source === 'resolvedFromManualMapping').length,
    singleBondWorkspaceLowConfidence: rows.filter((row) => row.workspace_resolution_source === 'singleBondWorkspaceLowConfidence').length,
    samples: {
      wouldUpdate: safeUpdateRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      manualReview: manualReviewRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      ambiguousWorkspace: ambiguousWorkspaceRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      missingWorkspace: missingWorkspaceRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      acceptedUnresolvedLegacy: acceptedUnresolvedRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      notBondScoped: notBondScopedRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      mismatch: mismatchRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
    },
  }

  return stats
}

try {
  if (!INPUT) {
    throw new Error(
      'No backfill input provided. Set BOND_ASSIGNMENT_BACKFILL_INPUT to a JSON payload path.',
    )
  }
  const payload = readJson(INPUT)
  const rows = attachRelationsToTransactions(payload)
  if (!rows.length) {
    console.log(
      'No input rows found for backfill. Set BOND_ASSIGNMENT_BACKFILL_INPUT with a JSON array payload.',
    )
    process.exit(0)
  }

  const migrated = backfillRows(normalizeRows(rows), {
    users: payload?.users || payload?.authUsers,
    authUsers: payload?.authUsers,
    profiles: payload?.profiles,
    organisations: payload?.organisations,
    organisationUsers:
      payload?.organisationUsers || payload?.organisation_users || payload?.membershipUsers,
    memberships: payload?.membershipUsers || payload?.organisation_users,
  })

  writeRows(migrated)
  const stats = printStats(migrated)
  console.log(JSON.stringify({ mode: DRY_RUN ? 'dry_run' : 'write_preview', stats }, null, 2))
} catch (error) {
  console.error('Bond assignment backfill script failed:', error?.message || error)
  process.exitCode = 1
}
