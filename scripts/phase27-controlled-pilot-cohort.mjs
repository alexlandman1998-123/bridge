#!/usr/bin/env node
import { createHash } from 'node:crypto'
import process from 'node:process'
import { createClient } from '../the-it-guy/node_modules/@supabase/supabase-js/dist/index.mjs'
import { assessDocumentExperienceLaunchHealth } from '../the-it-guy/src/core/documents/documentExperienceLaunchGate.js'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const PILOT_ORGANISATION_ID = 'ec19d0a6-bcba-4eef-aa72-9972de88204d'
const MAX_PARTICIPANTS = 10
const WRITE_FLAG = 'PHASE27_PILOT_WRITE'

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`
}

function activeMembership(row = {}) {
  return ['active', 'accepted'].includes(String(row.membership_status || row.status || '').trim().toLowerCase())
}

function adminMembership(row = {}) {
  if (row.is_primary_owner === true) return true
  return [row.app_role, row.workspace_role, row.organisation_role, row.role]
    .some((value) => ['admin', 'owner', 'principal', 'agency_admin', 'organisation_admin'].includes(String(value || '').trim().toLowerCase()))
}

const apply = process.argv.includes('--apply')
const projectRef = arg('project-ref') || process.env.SUPABASE_PRODUCTION_PROJECT_REF || ''
const organisationId = arg('organisation-id') || PILOT_ORGANISATION_ID
const operator = arg('operator')
const reference = arg('reference')
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const blockers = []

if (projectRef !== PRODUCTION_PROJECT_REF || !url.includes(PRODUCTION_PROJECT_REF)) blockers.push({ code: 'PHASE27_PROJECT_MISMATCH', detail: 'The supplied credentials are not for the canonical production project.' })
if (organisationId !== PILOT_ORGANISATION_ID) blockers.push({ code: 'PHASE27_COHORT_MISMATCH', detail: 'Phase 27 is locked to the reviewed one-organisation cohort.' })
if (!serviceRoleKey) blockers.push({ code: 'PHASE27_SERVICE_ROLE_MISSING', detail: 'Production service-role access is required for the preflight.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'PHASE27_WRITE_FLAG_MISSING', detail: `${WRITE_FLAG}=true is required for activation.` })
if (apply && arg('confirm-project-ref') !== PRODUCTION_PROJECT_REF) blockers.push({ code: 'PHASE27_PROJECT_CONFIRMATION_MISMATCH', detail: 'Confirm the exact production project ref.' })
if (apply && arg('confirm-organisation-id') !== PILOT_ORGANISATION_ID) blockers.push({ code: 'PHASE27_COHORT_CONFIRMATION_MISMATCH', detail: 'Confirm the exact pilot organisation ID.' })
if (apply && !operator) blockers.push({ code: 'PHASE27_OPERATOR_MISSING', detail: 'Record the accountable human operator.' })
if (apply && !reference) blockers.push({ code: 'PHASE27_REFERENCE_MISSING', detail: 'Record the rollout change reference.' })

let report = {
  phase: 27,
  mode: apply ? 'apply' : 'dry-run',
  status: 'BLOCKED',
  projectRef: projectRef || null,
  cohort: { organisationId, maximumOrganisations: 1, maxParticipants: MAX_PARTICIPANTS },
  blockers,
  mutatedData: false,
}

if (!blockers.length) {
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [organisation, memberships, packets, telemetry, controls, enrolments] = await Promise.all([
    client.from('organisations').select('id, name, type, status, is_demo_data').eq('id', organisationId).maybeSingle(),
    client.from('organisation_users').select('role, workspace_role, organisation_role, app_role, status, membership_status, is_primary_owner').eq('organisation_id', organisationId),
    client.from('document_packets').select('id', { count: 'exact', head: true }).eq('organisation_id', organisationId),
    client.from('telemetry_events').select('event_name, severity, created_at, metadata').eq('category', 'document_experience').order('created_at', { ascending: false }).limit(5000),
    client.from('document_experience_rollout_controls_n6').select('id, environment, stage, status, revision, max_participants, observation_started_at, observation_ends_at, expires_at, change_reference').eq('environment', 'production').order('revision', { ascending: false }).limit(1),
    client.from('document_experience_rollout_enrolments_n6').select('control_id, organisation_id, status').eq('organisation_id', organisationId),
  ])
  for (const [name, result] of Object.entries({ organisation, memberships, packets, telemetry, controls, enrolments })) {
    if (result.error) blockers.push({ code: 'PHASE27_PRODUCTION_READ_FAILED', detail: `${name}: ${result.error.message}` })
  }

  const memberRows = memberships.data || []
  const activeMembers = memberRows.filter(activeMembership)
  const activeAdmins = activeMembers.filter(adminMembership)
  const n4 = assessDocumentExperienceLaunchHealth({
    n1: { ready: true, status: 'READY_FOR_N2' },
    n2: { ready: true, status: 'READY_FOR_N3' },
    telemetryAvailable: !telemetry.error,
    events: telemetry.data || [],
  })
  if (!organisation.data || organisation.data.status !== 'active' || organisation.data.is_demo_data === true) blockers.push({ code: 'PHASE27_ORGANISATION_NOT_ELIGIBLE', detail: 'The candidate must be an active non-demo organisation.' })
  if (activeMembers.length < 1 || activeMembers.length > MAX_PARTICIPANTS) blockers.push({ code: 'PHASE27_PARTICIPANT_LIMIT_INVALID', detail: `The candidate has ${activeMembers.length} active members; the pilot permits 1-${MAX_PARTICIPANTS}.` })
  if (!activeAdmins.length) blockers.push({ code: 'PHASE27_ADMIN_COVERAGE_MISSING', detail: 'The candidate requires at least one active administrator.' })
  if (!Number(packets.count || 0)) blockers.push({ code: 'PHASE27_DOCUMENT_HISTORY_MISSING', detail: 'The candidate has no existing document packets for controlled observation.' })
  blockers.push(...n4.blockers.map((row) => ({ code: row.code, detail: row.detail })))

  const latestControl = controls.data?.[0] || null
  const sourceN4 = {
    contract: n4.contract,
    status: n4.status,
    decision: n4.decision,
    ready: n4.ready,
    coverage: n4.coverage,
    metrics: n4.metrics,
    checkedAt: new Date().toISOString(),
  }
  const cohortDigest = digest({ environment: 'production', organisationIds: [organisationId] })
  const evidenceDigest = digest(sourceN4)
  report = {
    phase: 27,
    mode: apply ? 'apply' : 'dry-run',
    status: blockers.length ? 'BLOCKED_PENDING_GENUINE_N4_EVIDENCE' : apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY',
    projectRef,
    cohort: {
      organisationId,
      organisationName: organisation.data?.name || null,
      organisationType: organisation.data?.type || null,
      activeMembers: activeMembers.length,
      activeAdmins: activeAdmins.length,
      documentPackets: Number(packets.count || 0),
      maximumOrganisations: 1,
      maxParticipants: MAX_PARTICIPANTS,
      cohortDigest,
    },
    n4: sourceN4,
    evidenceDigest,
    existingControl: latestControl ? { stage: latestControl.stage, status: latestControl.status, revision: latestControl.revision, expiresAt: latestControl.expires_at } : null,
    existingEnrolmentCount: (enrolments.data || []).length,
    blockers,
    nextRuntimeConfiguration: blockers.length ? null : {
      VITE_DOCUMENT_EXPERIENCE_ROLLOUT_MODE: 'enforced',
      VITE_DOCUMENT_EXPERIENCE_ROLLOUT_ENVIRONMENT: 'production',
    },
    mutatedData: false,
  }

  if (apply && !blockers.length) {
    const startedAt = new Date()
    const observationEndsAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000)
    const expiresAt = new Date(observationEndsAt.getTime() + 24 * 60 * 60 * 1000)
    const result = await client.rpc('bridge_set_document_experience_rollout_n6', {
      p_environment: 'production',
      p_stage: 'pilot',
      p_status: 'active',
      p_cohort_digest: cohortDigest,
      p_evidence_digest: evidenceDigest,
      p_max_participants: MAX_PARTICIPANTS,
      p_observation_started_at: startedAt.toISOString(),
      p_observation_ends_at: observationEndsAt.toISOString(),
      p_expires_at: expiresAt.toISOString(),
      p_change_reference: reference,
      p_organisation_ids: [organisationId],
      p_source_n4: sourceN4,
      p_expected_revision: Number(latestControl?.revision || 0),
    })
    if (result.error) throw result.error
    const access = await client.rpc('bridge_document_experience_runtime_access_n6', { p_organisation_id: organisationId, p_environment: 'production' })
    if (access.error || access.data?.allowed !== true || access.data?.reason !== 'enrolled') throw access.error || new Error('The applied N6 control did not authorize the exact cohort.')
    report = {
      ...report,
      status: 'N6_CONTROL_ACTIVE_PENDING_VERCEL_ENFORCEMENT',
      activation: {
        controlId: result.data?.control_id || null,
        revision: result.data?.revision || null,
        stage: result.data?.stage || null,
        status: result.data?.status || null,
        organisationCount: result.data?.organisation_count || null,
        observationStartedAt: startedAt.toISOString(),
        observationEndsAt: observationEndsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        operator,
        reference,
      },
      runtimeAccess: { configured: access.data?.configured, allowed: access.data?.allowed, reason: access.data?.reason, stage: access.data?.stage, revision: access.data?.revision },
      mutatedData: true,
    }
  }
}

console.log(JSON.stringify(report, null, 2))
if (report.status.startsWith('BLOCKED')) process.exitCode = 2
