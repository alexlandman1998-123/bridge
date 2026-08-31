import { createHash } from 'node:crypto'
import { normalizeProperty24Text } from './client.js'

export const PROPERTY24_LIVE_CUTOVER_STATES = Object.freeze({
  BLOCKED: 'blocked',
  APPROVED: 'approved',
  PILOT: 'pilot',
  PAUSED: 'paused',
  LIVE: 'live',
})

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])
const PRODUCTION_WRITE_STATES = new Set([
  PROPERTY24_LIVE_CUTOVER_STATES.PILOT,
  PROPERTY24_LIVE_CUTOVER_STATES.LIVE,
])

function cutoverError(code, message, status = 409, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.details = details
  return error
}

function isMissingTableError(error = {}) {
  const message = normalizeProperty24Text(error.message || error.details).toLowerCase()
  return MISSING_TABLE_CODES.has(normalizeProperty24Text(error.code).toUpperCase()) || message.includes('does not exist')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeGate(row = {}, organisationId = '') {
  return {
    id: row.id || null,
    organisationId: normalizeProperty24Text(row.organisation_id || row.organisationId || organisationId),
    status: normalizeProperty24Text(row.status).toLowerCase() || PROPERTY24_LIVE_CUTOVER_STATES.BLOCKED,
    phase6PackStatus: normalizeProperty24Text(row.phase6_pack_status || row.phase6PackStatus) || null,
    phase6PackGeneratedAt: row.phase6_pack_generated_at || row.phase6PackGeneratedAt || null,
    phase6PackDigest: normalizeProperty24Text(row.phase6_pack_digest || row.phase6PackDigest) || null,
    phase6EvidenceSummary: row.phase6_evidence_summary || row.phase6EvidenceSummary || {},
    pilotListingLimit: Math.min(Math.max(Number(row.pilot_listing_limit || row.pilotListingLimit || 3), 1), 3),
    approvedBy: row.approved_by || row.approvedBy || null,
    approvedAt: row.approved_at || row.approvedAt || null,
    pilotStartedBy: row.pilot_started_by || row.pilotStartedBy || null,
    pilotStartedAt: row.pilot_started_at || row.pilotStartedAt || null,
    liveEnabledBy: row.live_enabled_by || row.liveEnabledBy || null,
    liveEnabledAt: row.live_enabled_at || row.liveEnabledAt || null,
    pausedBy: row.paused_by || row.pausedBy || null,
    pausedAt: row.paused_at || row.pausedAt || null,
    pauseReason: row.pause_reason || row.pauseReason || null,
    lastReconciledAt: row.last_reconciled_at || row.lastReconciledAt || null,
    lastReconciliationStatus: row.last_reconciliation_status || row.lastReconciliationStatus || null,
    lastReconciliationSummary: row.last_reconciliation_summary || row.lastReconciliationSummary || {},
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    migrationReady: Boolean(row.id || row.migrationReady),
  }
}

async function selectRows(query, { optional = false } = {}) {
  const result = await query
  if (result?.error) {
    if (optional && isMissingTableError(result.error)) return []
    throw result.error
  }
  return asArray(result?.data)
}

async function maybeSingle(query, { optional = false } = {}) {
  const result = typeof query.maybeSingle === 'function' ? await query.maybeSingle() : await query.single()
  if (result?.error) {
    if (result.error.code === 'PGRST116') return null
    if (optional && isMissingTableError(result.error)) return null
    throw result.error
  }
  return result?.data || null
}

export async function fetchProperty24LiveCutoverGate({ supabase, organisationId } = {}) {
  if (!supabase?.from) throw cutoverError('supabase_required', 'Supabase client is required.', 500)
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  if (!normalizedOrganisationId) throw cutoverError('organisation_id_required', 'Organisation ID is required.', 400)
  const row = await maybeSingle(
    supabase
      .from('property24_live_cutover_gates')
      .select('*')
      .eq('organisation_id', normalizedOrganisationId),
    { optional: true },
  )
  return normalizeGate(row || {}, normalizedOrganisationId)
}

export async function fetchProperty24LiveCutoverEvents({ supabase, organisationId, limit = 20 } = {}) {
  return selectRows(
    supabase
      .from('property24_live_cutover_events')
      .select('id, organisation_id, action, previous_status, next_status, actor_user_id, reason, evidence_summary, created_at')
      .eq('organisation_id', organisationId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit || 20), 1), 100)),
    { optional: true },
  )
}

async function fetchOrganisationListingIds({ supabase, organisationId } = {}) {
  const rows = await selectRows(
    supabase
      .from('private_listings')
      .select('id')
      .eq('organisation_id', organisationId)
      .limit(5000),
  )
  return rows.map((row) => normalizeProperty24Text(row.id)).filter(Boolean)
}

export async function fetchProperty24ProductionEvidence({
  supabase,
  organisationId,
  agencyId,
  now = new Date(),
} = {}) {
  const listingIds = await fetchOrganisationListingIds({ supabase, organisationId })
  if (!listingIds.length) {
    return {
      listingIds: [],
      syncRows: [],
      attemptRows: [],
      summary: {
        trackedListingCount: 0,
        onPortalListingCount: 0,
        failedAttemptCount: 0,
        recentWriteAttemptCount: 0,
      },
    }
  }
  let syncQuery = supabase
    .from('property24_listing_syncs')
    .select('private_listing_id, listing_number, external_status, is_on_portal, last_successful_sync_at, last_error, updated_at')
    .eq('environment', 'production')
    .in('private_listing_id', listingIds)
    .limit(5000)
  if (agencyId) syncQuery = syncQuery.eq('agency_id', Number(agencyId))
  const syncRows = await selectRows(syncQuery, { optional: true })

  const recentCutoff = new Date((now instanceof Date ? now : new Date(now)).getTime() - 60 * 1000).toISOString()
  const failureCutoff = new Date((now instanceof Date ? now : new Date(now)).getTime() - 15 * 60 * 1000).toISOString()
  let attemptQuery = supabase
    .from('property24_sync_attempts')
    .select('id, private_listing_id, listing_number, action, status, retry_count, property24_http_status, error_summary, created_at')
    .eq('environment', 'production')
    .in('private_listing_id', listingIds)
    .gte('created_at', failureCutoff)
    .order('created_at', { ascending: false })
    .limit(500)
  if (agencyId) attemptQuery = attemptQuery.eq('agency_id', Number(agencyId))
  const attemptRows = await selectRows(attemptQuery, { optional: true })
  const failedAttempts = attemptRows.filter((row) => ['failed', 'blocked'].includes(normalizeProperty24Text(row.status).toLowerCase()))
  const recentWrites = attemptRows.filter((row) => (
    ['create', 'update', 'status_update'].includes(normalizeProperty24Text(row.action).toLowerCase()) &&
    Date.parse(row.created_at || 0) >= Date.parse(recentCutoff)
  ))
  return {
    listingIds,
    syncRows,
    attemptRows,
    summary: {
      trackedListingCount: syncRows.length,
      onPortalListingCount: syncRows.filter((row) => row.is_on_portal === true).length,
      failedAttemptCount: failedAttempts.length,
      recentWriteAttemptCount: recentWrites.length,
    },
  }
}

function createCheck({ key, label, ready, detail, requiredFor = ['pilot', 'live'] }) {
  return { key, label, ready: Boolean(ready), detail, requiredFor }
}

export function buildProperty24LiveCutoverView({
  gate = {},
  productionConnection = {},
  runtime = {},
  evidence = {},
  events = [],
} = {}) {
  const normalizedGate = normalizeGate({
    ...gate,
    organisation_id: gate.organisationId,
    phase6_pack_status: gate.phase6PackStatus,
    phase6_pack_generated_at: gate.phase6PackGeneratedAt,
    phase6_pack_digest: gate.phase6PackDigest,
    phase6_evidence_summary: gate.phase6EvidenceSummary,
    pilot_listing_limit: gate.pilotListingLimit,
    last_reconciled_at: gate.lastReconciledAt,
    last_reconciliation_status: gate.lastReconciliationStatus,
    last_reconciliation_summary: gate.lastReconciliationSummary,
    id: gate.id,
    status: gate.status,
  }, gate.organisationId)
  const evidenceSummary = evidence.summary || {}
  const checks = [
    createCheck({
      key: 'phase6_evidence',
      label: 'ExDev vetting evidence approved',
      ready: normalizedGate.phase6PackStatus === 'READY_FOR_VETTING' && Boolean(normalizedGate.phase6PackDigest),
      detail: normalizedGate.phase6PackStatus || 'Generate and approve a complete Phase 6 pack.',
    }),
    createCheck({
      key: 'production_connection',
      label: 'Production agency connection saved',
      ready: productionConnection.configured && productionConnection.environment === 'production',
      detail: productionConnection.configured ? `Agency ${productionConnection.agencyId}` : 'Save the production agency ID while keeping it disabled.',
    }),
    createCheck({
      key: 'production_credentials',
      label: 'Production credentials isolated and configured',
      ready: runtime.productionCredentialsReady,
      detail: runtime.productionCredentialsReady ? 'Environment-specific production credentials are server-side.' : 'Configure the Property24 production base URL, username and password.',
    }),
    createCheck({
      key: 'global_publish_switch',
      label: 'Global production publishing switch enabled',
      ready: runtime.syndicationEnabled,
      detail: runtime.syndicationEnabled ? 'The server permits controlled Property24 writes.' : 'PROPERTY24_SYNDICATION_ENABLED remains off.',
    }),
    createCheck({
      key: 'pilot_listing_evidence',
      label: 'Controlled production listings verified',
      ready: evidenceSummary.trackedListingCount >= 1 && evidenceSummary.trackedListingCount <= normalizedGate.pilotListingLimit,
      detail: `${evidenceSummary.trackedListingCount || 0}/${normalizedGate.pilotListingLimit} pilot listings tracked.`,
      requiredFor: ['live'],
    }),
    createCheck({
      key: 'portal_visibility',
      label: 'Pilot listings visible on Property24',
      ready: evidenceSummary.trackedListingCount >= 1 && evidenceSummary.onPortalListingCount === evidenceSummary.trackedListingCount,
      detail: `${evidenceSummary.onPortalListingCount || 0}/${evidenceSummary.trackedListingCount || 0} verified on portal.`,
      requiredFor: ['live'],
    }),
    createCheck({
      key: 'production_failures',
      label: 'No unresolved production write failures',
      ready: Number(evidenceSummary.failedAttemptCount || 0) === 0,
      detail: `${evidenceSummary.failedAttemptCount || 0} failed or blocked attempts in the last 15 minutes.`,
    }),
    createCheck({
      key: 'production_reconciliation',
      label: 'Production reconciliation passed',
      ready: normalizedGate.lastReconciliationStatus === 'OK',
      detail: normalizedGate.lastReconciliationStatus || 'Run reconciliation before promoting the pilot.',
      requiredFor: ['live'],
    }),
  ]
  const pilotReady = checks.filter((check) => check.requiredFor.includes('pilot')).every((check) => check.ready)
  const liveReady = checks.filter((check) => check.requiredFor.includes('live')).every((check) => check.ready)
  const availableActions = {
    approveExDev: [PROPERTY24_LIVE_CUTOVER_STATES.BLOCKED, PROPERTY24_LIVE_CUTOVER_STATES.APPROVED].includes(normalizedGate.status),
    startPilot: normalizedGate.status === PROPERTY24_LIVE_CUTOVER_STATES.APPROVED && pilotReady,
    resumePilot: normalizedGate.status === PROPERTY24_LIVE_CUTOVER_STATES.PAUSED && pilotReady,
    promoteLive: normalizedGate.status === PROPERTY24_LIVE_CUTOVER_STATES.PILOT && liveReady,
    pause: [PROPERTY24_LIVE_CUTOVER_STATES.APPROVED, PROPERTY24_LIVE_CUTOVER_STATES.PILOT, PROPERTY24_LIVE_CUTOVER_STATES.LIVE].includes(normalizedGate.status),
  }
  return {
    phase: 'property24-phase7-live-cutover',
    generatedAt: new Date().toISOString(),
    status: normalizedGate.status,
    gate: normalizedGate,
    productionConnection,
    runtime,
    evidenceSummary,
    checks,
    pilotReady,
    liveReady,
    availableActions,
    events: asArray(events),
    safety: {
      bulkPublishingAllowed: false,
      pilotListingLimit: normalizedGate.pilotListingLimit,
      rollbackDeletesRecords: false,
      rollbackUsesListingStatus: true,
    },
  }
}

function digestPack(pack = {}) {
  return createHash('sha256').update(JSON.stringify(pack)).digest('hex')
}

async function upsertGate({ supabase, organisationId, patch } = {}) {
  const result = await supabase
    .from('property24_live_cutover_gates')
    .upsert({ organisation_id: organisationId, ...patch }, { onConflict: 'organisation_id' })
    .select('*')
    .single()
  if (result.error) throw result.error
  return normalizeGate(result.data, organisationId)
}

async function updateGate({ supabase, organisationId, patch } = {}) {
  const result = await supabase
    .from('property24_live_cutover_gates')
    .update(patch)
    .eq('organisation_id', organisationId)
    .select('*')
    .single()
  if (result.error) throw result.error
  return normalizeGate(result.data, organisationId)
}

async function setProductionAccountEnabled({ supabase, organisationId, enabled } = {}) {
  const query = supabase
    .from('property24_accounts')
    .update({ enabled: enabled === true })
    .eq('organisation_id', organisationId)
    .eq('environment', 'production')
    .select('organisation_id, environment, agency_id, enabled')
  const result = enabled === true || typeof query.maybeSingle !== 'function'
    ? await query.single()
    : await query.maybeSingle()
  if (result.error) throw result.error
  if (enabled === true && !result.data) {
    throw cutoverError('property24_production_connection_missing', 'Save the production Property24 agency connection before enabling the pilot.')
  }
  return result.data || null
}

async function recordEvent({ supabase, organisationId, action, previousStatus, nextStatus, actorUserId, reason, evidenceSummary = {} } = {}) {
  const result = await supabase
    .from('property24_live_cutover_events')
    .insert({
      organisation_id: organisationId,
      action,
      previous_status: previousStatus || null,
      next_status: nextStatus,
      actor_user_id: actorUserId,
      reason,
      evidence_summary: evidenceSummary,
    })
    .select('id, action, previous_status, next_status, actor_user_id, reason, evidence_summary, created_at')
    .single()
  if (result.error) throw result.error
  return result.data
}

function requireReason(reason = '') {
  const normalized = normalizeProperty24Text(reason)
  if (normalized.length < 10) throw cutoverError('property24_cutover_reason_required', 'Add a reason of at least 10 characters for this cutover decision.', 400)
  return normalized
}

export async function applyProperty24LiveCutoverAction({
  supabase,
  organisationId,
  actorUserId,
  action,
  reason,
  phase6Pack = null,
  productionConnection = {},
  productionCredentialCheck = null,
  runtime = {},
  evidence = {},
  reconciliation = null,
  pilotListingLimit = 3,
  now = new Date(),
} = {}) {
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  const normalizedActorUserId = normalizeProperty24Text(actorUserId)
  const normalizedAction = normalizeProperty24Text(action).toLowerCase()
  const normalizedReason = requireReason(reason)
  if (!normalizedOrganisationId || !normalizedActorUserId) throw cutoverError('property24_cutover_identity_required', 'Organisation and actor are required.', 400)
  const current = await fetchProperty24LiveCutoverGate({ supabase, organisationId: normalizedOrganisationId })
  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString()
  let nextStatus = current.status
  let patch = {}
  let accountEnabled = null
  let eventEvidence = {}

  if (normalizedAction === 'approve_exdev') {
    if (![PROPERTY24_LIVE_CUTOVER_STATES.BLOCKED, PROPERTY24_LIVE_CUTOVER_STATES.APPROVED].includes(current.status)) {
      throw cutoverError('property24_cutover_transition_invalid', `ExDev evidence cannot be approved while the gate is ${current.status}.`)
    }
    if (phase6Pack?.status !== 'READY_FOR_VETTING') {
      throw cutoverError('property24_phase6_evidence_incomplete', 'Phase 6 must be READY_FOR_VETTING before production approval.')
    }
    nextStatus = PROPERTY24_LIVE_CUTOVER_STATES.APPROVED
    eventEvidence = {
      phase6PackStatus: phase6Pack.status,
      phase6PackGeneratedAt: phase6Pack.generatedAt || null,
      phase6Summary: phase6Pack.summary || {},
    }
    patch = {
      status: nextStatus,
      phase6_pack_status: phase6Pack.status,
      phase6_pack_generated_at: phase6Pack.generatedAt || timestamp,
      phase6_pack_digest: digestPack(phase6Pack),
      phase6_evidence_summary: phase6Pack.summary || {},
      pilot_listing_limit: Math.min(Math.max(Number(pilotListingLimit || 3), 1), 3),
      approved_by: normalizedActorUserId,
      approved_at: timestamp,
      pause_reason: null,
    }
  } else if (['start_pilot', 'resume_pilot'].includes(normalizedAction)) {
    const expectedState = normalizedAction === 'start_pilot' ? PROPERTY24_LIVE_CUTOVER_STATES.APPROVED : PROPERTY24_LIVE_CUTOVER_STATES.PAUSED
    if (current.status !== expectedState) {
      throw cutoverError('property24_cutover_transition_invalid', `${normalizedAction === 'start_pilot' ? 'Pilot start' : 'Pilot resume'} requires a ${expectedState} gate.`)
    }
    if (!productionConnection.configured || productionConnection.environment !== 'production') {
      throw cutoverError('property24_production_connection_missing', 'Save the production Property24 agency connection before starting the pilot.')
    }
    if (!runtime.syndicationEnabled || !runtime.productionCredentialsReady || productionCredentialCheck?.ok !== true) {
      throw cutoverError('property24_production_runtime_not_ready', 'Production credentials, authenticated read check, and the global syndication switch must be ready.')
    }
    nextStatus = PROPERTY24_LIVE_CUTOVER_STATES.PILOT
    patch = {
      status: nextStatus,
      pilot_started_by: normalizedActorUserId,
      pilot_started_at: timestamp,
      paused_by: null,
      paused_at: null,
      pause_reason: null,
    }
    eventEvidence = { productionCredentialCheck, agencyId: productionConnection.agencyId }
    accountEnabled = true
  } else if (normalizedAction === 'promote_live') {
    if (current.status !== PROPERTY24_LIVE_CUTOVER_STATES.PILOT) {
      throw cutoverError('property24_cutover_transition_invalid', 'Only an active pilot can be promoted to live.')
    }
    const summary = evidence.summary || {}
    if (summary.trackedListingCount < 1 || summary.trackedListingCount > current.pilotListingLimit) {
      throw cutoverError('property24_pilot_listing_evidence_invalid', `Verify between 1 and ${current.pilotListingLimit} production pilot listings before promotion.`)
    }
    if (summary.onPortalListingCount !== summary.trackedListingCount || summary.failedAttemptCount > 0 || reconciliation?.status !== 'OK') {
      throw cutoverError('property24_pilot_verification_failed', 'Pilot portal visibility, failure checks, and reconciliation must all pass before promotion.')
    }
    nextStatus = PROPERTY24_LIVE_CUTOVER_STATES.LIVE
    patch = {
      status: nextStatus,
      live_enabled_by: normalizedActorUserId,
      live_enabled_at: timestamp,
      last_reconciled_at: reconciliation.generatedAt || timestamp,
      last_reconciliation_status: reconciliation.status,
      last_reconciliation_summary: reconciliation.reconciliation?.summary || {},
    }
    eventEvidence = {
      productionEvidence: summary,
      reconciliation: { status: reconciliation.status, summary: reconciliation.reconciliation?.summary || {} },
    }
    accountEnabled = true
  } else if (normalizedAction === 'pause') {
    if (![PROPERTY24_LIVE_CUTOVER_STATES.APPROVED, PROPERTY24_LIVE_CUTOVER_STATES.PILOT, PROPERTY24_LIVE_CUTOVER_STATES.LIVE].includes(current.status)) {
      throw cutoverError('property24_cutover_transition_invalid', `The ${current.status} gate cannot be paused.`)
    }
    nextStatus = PROPERTY24_LIVE_CUTOVER_STATES.PAUSED
    patch = {
      status: nextStatus,
      paused_by: normalizedActorUserId,
      paused_at: timestamp,
      pause_reason: normalizedReason,
    }
    eventEvidence = { productionEvidence: evidence.summary || {} }
    accountEnabled = false
  } else {
    throw cutoverError('property24_cutover_action_invalid', 'Unsupported Property24 cutover action.', 400)
  }

  const nextGate = current.migrationReady
    ? await updateGate({ supabase, organisationId: normalizedOrganisationId, patch })
    : await upsertGate({ supabase, organisationId: normalizedOrganisationId, patch })
  try {
    if (accountEnabled !== null) {
      await setProductionAccountEnabled({ supabase, organisationId: normalizedOrganisationId, enabled: accountEnabled })
    }
    const event = await recordEvent({
      supabase,
      organisationId: normalizedOrganisationId,
      action: normalizedAction,
      previousStatus: current.status,
      nextStatus,
      actorUserId: normalizedActorUserId,
      reason: normalizedReason,
      evidenceSummary: eventEvidence,
    })
    return { gate: nextGate, event }
  } catch (error) {
    await updateGate({
      supabase,
      organisationId: normalizedOrganisationId,
      patch: {
        status: current.status,
        phase6_pack_status: current.phase6PackStatus,
        phase6_pack_generated_at: current.phase6PackGeneratedAt,
        phase6_pack_digest: current.phase6PackDigest,
        phase6_evidence_summary: current.phase6EvidenceSummary,
        pilot_listing_limit: current.pilotListingLimit,
        approved_by: current.approvedBy,
        approved_at: current.approvedAt,
        pilot_started_by: current.pilotStartedBy,
        pilot_started_at: current.pilotStartedAt,
        live_enabled_by: current.liveEnabledBy,
        live_enabled_at: current.liveEnabledAt,
        paused_by: current.pausedBy,
        paused_at: current.pausedAt,
        pause_reason: current.pauseReason,
        last_reconciled_at: current.lastReconciledAt,
        last_reconciliation_status: current.lastReconciliationStatus,
        last_reconciliation_summary: current.lastReconciliationSummary,
      },
    }).catch(() => null)
    if (accountEnabled !== null) {
      await setProductionAccountEnabled({
        supabase,
        organisationId: normalizedOrganisationId,
        enabled: current.status === PROPERTY24_LIVE_CUTOVER_STATES.PILOT || current.status === PROPERTY24_LIVE_CUTOVER_STATES.LIVE,
      }).catch(() => null)
    }
    throw error
  }
}

export async function assertProperty24ProductionConnectionEnablement({ supabase, organisationId, environment, enabled } = {}) {
  if (normalizeProperty24Text(environment).toLowerCase() !== 'production' || enabled !== true) return null
  const gate = await fetchProperty24LiveCutoverGate({ supabase, organisationId })
  if (!PRODUCTION_WRITE_STATES.has(gate.status)) {
    throw cutoverError('property24_live_cutover_not_authorized', 'Production Property24 cannot be enabled until Phase 7 starts the controlled pilot.')
  }
  return gate
}

export async function assertProperty24ProductionWriteAllowed({
  supabase,
  organisationId,
  agencyId,
  listingId,
  environment,
  rollbackOnly = false,
  now = new Date(),
} = {}) {
  if (normalizeProperty24Text(environment).toLowerCase() !== 'production') return { required: false, allowed: true, gate: null }
  const gate = await fetchProperty24LiveCutoverGate({ supabase, organisationId })
  if (rollbackOnly && gate.status === PROPERTY24_LIVE_CUTOVER_STATES.PAUSED) {
    return { required: true, allowed: true, rollbackOnly: true, gate }
  }
  if (!PRODUCTION_WRITE_STATES.has(gate.status)) {
    throw cutoverError('property24_live_cutover_not_authorized', 'Production Property24 writes require an active Phase 7 pilot or live approval.', 403)
  }
  const evidence = await fetchProperty24ProductionEvidence({ supabase, organisationId, agencyId, now })
  if (evidence.summary.failedAttemptCount >= 3) {
    throw cutoverError('property24_production_circuit_open', 'Repeated Property24 production failures opened the safety circuit. Review failures before retrying.', 409)
  }
  if (evidence.summary.recentWriteAttemptCount >= 5) {
    throw cutoverError('property24_production_rate_limited', 'Too many Property24 production writes were attempted in the last minute. Wait before retrying.', 429)
  }
  const alreadyTracked = evidence.syncRows.some((row) => normalizeProperty24Text(row.private_listing_id) === normalizeProperty24Text(listingId))
  if (
    gate.status === PROPERTY24_LIVE_CUTOVER_STATES.PILOT &&
    !alreadyTracked &&
    evidence.summary.trackedListingCount >= gate.pilotListingLimit
  ) {
    throw cutoverError('property24_pilot_listing_limit_reached', `The Phase 7 pilot is limited to ${gate.pilotListingLimit} production listings.`, 409)
  }
  return { required: true, allowed: true, rollbackOnly: false, gate, evidence: evidence.summary }
}
