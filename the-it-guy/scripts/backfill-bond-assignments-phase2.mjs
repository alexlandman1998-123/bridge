#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const INPUT = process.env.BOND_ASSIGNMENT_BACKFILL_INPUT
const OUTPUT = process.env.BOND_ASSIGNMENT_BACKFILL_OUTPUT
const DRY_RUN = String(process.env.BOND_ASSIGNMENT_BACKFILL_DRY_RUN || 'true').toLowerCase() !== 'false'
const SAMPLE_LIMIT = Number(process.env.BOND_ASSIGNMENT_BACKFILL_SAMPLE_LIMIT || '5')

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

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch {
    return null
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
  return normalizeEmail(entry?.email || entry?.Email || entry?.user_email || entry?.userEmail || '')
}

function buildEmailIndex(inputs = []) {
  const rows = Array.isArray(inputs) ? inputs : []
  const index = new Map()
  for (const row of rows) {
    const email = extractEmail(row)
    if (!email) continue
    const userId = normalizeText(row?.id || row?.userId || row?.user_id)
    index.set(email, {
      id: userId || null,
      email,
      name: normalizeText(row?.name || row?.full_name || row?.fullName || row?.display_name || row?.displayName),
      source: 'user_profile',
    })
  }
  return index
}

function buildAuthUsers(users = []) {
  return buildEmailIndex(users)
}

function buildProfileIndex(profiles = []) {
  return buildEmailIndex(profiles)
}

function buildOrganisationUserIndex(organisationUsers = []) {
  const index = new Map()
  for (const membership of Array.isArray(organisationUsers) ? organisationUsers : []) {
    const email = extractEmail(membership)
    const altEmail = extractEmail(membership?.user?.email || membership?.profile?.email)
    const userId = normalizeText(membership?.user_id || membership?.userId || membership?.user?.id || membership?.profile?.id)
    if (email) {
      index.set(email, {
        id: userId,
        email,
        name: normalizeText(membership?.name || membership?.user?.name || membership?.profile?.name),
        source: 'organisation_user',
      })
    }
    if (altEmail) {
      index.set(altEmail, {
        id: userId,
        email: altEmail,
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
    const role = String(participant?.role || participant?.role_type || participant?.participant_role || '').toLowerCase()
    if (!['bond_originator', 'consultant', 'processor', 'manager', 'compliance'].includes(role)) continue
    const email = normalizeEmail(participant?.email || participant?.participantEmail || participant?.participant_email || participant?.user_email)
    const userId = normalizeText(participant?.user_id || participant?.userId || participant?.user?.id)
    const name = normalizeText(participant?.name || participant?.participant_name || participant?.participantName || participant?.full_name)
    if (email || userId) {
      candidates.push({
        email,
        id: userId || null,
        name,
        source: `participant:${role}`,
      })
    }
  }
  return candidates
}

function buildRolePlayerCandidates(row = {}) {
  const rolePlayers = Array.isArray(row.transaction_role_players) ? row.transaction_role_players : []
  const candidates = []
  for (const rolePlayer of rolePlayers) {
    const role = String(rolePlayer?.role_type || rolePlayer?.role || rolePlayer?.participant_role || '').toLowerCase()
    if (role !== 'bond_originator' && role !== 'consultant') continue
    const email = normalizeEmail(rolePlayer?.email || rolePlayer?.participant_email || rolePlayer?.participantEmail || rolePlayer?.user_email)
    const userId = normalizeText(rolePlayer?.user_id || rolePlayer?.userId || rolePlayer?.user?.id)
    const name = normalizeText(rolePlayer?.name || rolePlayer?.participant_name || rolePlayer?.participantName || rolePlayer?.full_name)
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
  if (canonicalConsultantId && participantIds.length && !participantIds.includes(canonicalConsultantId)) return true
  if (legacyEmail && canonicalEmail && legacyEmail !== canonicalEmail) return true
  if (legacyEmail && participantEmails.length && !participantEmails.includes(legacyEmail)) return true
  return false
}

function pickBestMatchFromLegacy(row = {}, indexes = []) {
  const email = normalizeEmail(row.assigned_bond_originator_email)
  if (!email) return { user: null, source: 'legacy_email_only', reason: 'no_assigned_email' }

  for (const index of indexes) {
    if (index.has(email)) {
      return { user: index.get(email), source: index.get(email)?.source || 'user_index', reason: 'matched_by_email' }
    }
  }

  const participants = buildParticipantCandidates(row)
  for (const participant of participants) {
    if (participant.email === email && participant.id) {
      return { user: participant, source: participant.source, reason: 'matched_participant_by_email' }
    }
  }

  return { user: null, source: 'legacy_email_only', reason: 'no_user_match' }
}

function backfillRow(row = {}, indexes = {}) {
  const hasCanonical = Boolean(row.primary_bond_consultant_user_id || row.bond_workspace_id || row.bond_region_id || row.bond_workspace_unit_id)
  const transactionId = normalizeText(row.id || row.transaction_id || row.transactionId)
  const hasLegacyEmail = Boolean(normalizeEmail(row.assigned_bond_originator_email))
  const hasLegacyText = Boolean(normalizeText(row.bond_originator))
  const participants = buildParticipantCandidates(row)
  const rolePlayers = buildRolePlayerCandidates(row)

  if (hasCanonical) {
    return {
      ...row,
      transaction_id: transactionId || null,
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      warning: null,
      backfill_source: 'skipped_existing',
      backfill_action: 'skipped',
      legacy_canonical_mismatch: detectLegacyCanonicalMismatch(row),
      proposed_updates: {},
    }
  }

  const workspaceId = normalizeText(row.bond_workspace_id || row.organisation_id || row.workspace_id)
  if (!workspaceId) {
    return {
      ...row,
      transaction_id: transactionId || null,
      warning: 'missing_workspace_id',
      bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
      backfill_source: 'missing_workspace',
      backfill_action: 'unsafe',
      proposed_updates: {},
    }
  }

  const participantMatch = participants.find((candidate) => candidate.id)
  const rolePlayerMatch = rolePlayers.find((candidate) => candidate.id)
  const legacyMatch = pickBestMatchFromLegacy(row, indexes)

  const resolved = participantMatch || rolePlayerMatch || legacyMatch.user || null
  const resolvedSource = participantMatch?.source || rolePlayerMatch?.source || (resolved ? legacyMatch.source : legacyMatch.source)
  const reason = participantMatch ? 'participant_match' : rolePlayerMatch ? 'role_player_match' : resolved ? legacyMatch.reason || 'legacy_email_match' : legacyMatch.reason
  const updatedAt = new Date().toISOString()
  const multipleParticipants = participants.length > 1

  if (!resolved) {
    const hasAnyFallbackSignal = hasLegacyEmail || hasLegacyText || participants.length > 0
    const warning = hasLegacyText ? 'legacy_text_only' : hasAnyFallbackSignal ? `unresolved:${reason}` : null
    const action = hasLegacyText ? 'manual_review' : hasAnyFallbackSignal ? 'ambiguous' : 'skipped'
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
      backfill_action: action,
      proposed_updates: action === 'skipped' ? {} : proposedUpdates,
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
    primary_bond_consultant_user_id: resolved.id || row.primary_bond_consultant_user_id || null,
    assigned_bond_originator_email: resolveAssignedEmail(row),
    bond_assignment_status: row.bond_assignment_status || 'consultant_assigned',
    bond_assignment_source: row.bond_assignment_source || 'legacy_backfill',
    warning: resolved.id ? null : `unresolved:${reason}`,
    backfill_source: resolvedSource,
    backfill_reason: reason,
    backfill_action: resolved.id ? 'safe_update' : 'ambiguous',
    proposed_updates: proposedUpdates,
  }
}

function resolveAssignedEmail(row = {}) {
  const fallback = normalizeEmail(row.bond_originator)
  return normalizeEmail(row.assigned_bond_originator_email || fallback || null)
}

function backfillRows(rows = [], sources = {}) {
  const indexes = [
    buildAuthUsers(sources.authUsers),
    buildAuthUsers(sources.users),
    buildAuthUsers(sources.userMap),
    buildProfileIndex(sources.profiles),
    buildProfileIndex(sources.profileMap),
    buildOrganisationUserIndex(sources.organisationUsers),
    buildOrganisationUserIndex(sources.memberships),
  ]
  return rows.map((row) => backfillRow(row, indexes.filter(Boolean)))
}

function loadRowsFromInput() {
  const payload = readJson(INPUT)
  if (!payload) return []
  return rowsFromPayload(payload)
}

function writeRows(rows = []) {
  if (!OUTPUT) return
  fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2))
}

function printStats(rows = []) {
  const safeUpdateRows = rows.filter((row) => row.backfill_action === 'safe_update')
  const ambiguousRows = rows.filter((row) => row.backfill_action === 'ambiguous')
  const manualReviewRows = rows.filter((row) => row.backfill_action === 'manual_review')
  const unsafeRows = rows.filter((row) => row.backfill_action === 'unsafe')
  const skippedRows = rows.filter((row) => row.backfill_action === 'skipped')
  const mismatchRows = rows.filter((row) => row.legacy_canonical_mismatch)

  const stats = {
    total: rows.length,
    existingCanonical: rows.filter((row) => row.backfill_source === 'skipped_existing').length,
    backfilledConsultant: rows.filter((row) => row.primary_bond_consultant_user_id).length,
    matchedWithWorkspace: rows.filter((row) => row.bond_workspace_id).length,
    warnings: rows.filter((row) => row.warning).length,
    legacyTextOnly: rows.filter((row) => row.warning === 'legacy_text_only').length,
    missingWorkspace: rows.filter((row) => row.warning === 'missing_workspace_id').length,
    dryRun: DRY_RUN,
    wouldUpdate: safeUpdateRows.length,
    wouldSkip: skippedRows.length,
    ambiguousRows: ambiguousRows.length,
    manualReviewRows: manualReviewRows.length,
    unsafeRows: unsafeRows.length,
    canonicalLegacyMismatches: mismatchRows.length,
    samples: {
      wouldUpdate: safeUpdateRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      ambiguous: ambiguousRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      manualReview: manualReviewRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      unsafe: unsafeRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
      mismatch: mismatchRows.slice(0, SAMPLE_LIMIT).map((row) => row.transaction_id || row.id || null).filter(Boolean),
    },
  }

  return stats
}

try {
  const payload = readJson(INPUT)
  const rows = rowsFromPayload(payload)

  if (!rows.length) {
    console.log('No input rows found for backfill. Set BOND_ASSIGNMENT_BACKFILL_INPUT with a JSON array payload.')
    process.exit(0)
  }

  const migrated = backfillRows(normalizeRows(rows), {
    users: payload?.users || payload?.authUsers,
    authUsers: payload?.authUsers,
    profiles: payload?.profiles,
    organisationUsers: payload?.organisationUsers || payload?.membershipUsers,
    memberships: payload?.membershipUsers,
  })

  writeRows(migrated)

  const stats = printStats(migrated)
  const output = {
    mode: DRY_RUN ? 'dry_run' : 'write_preview',
    stats,
  }
  console.log(JSON.stringify(output, null, 2))
} catch (error) {
  console.error('Bond assignment backfill script failed:', error?.message || error)
  process.exitCode = 1
}
