#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { assessDocumentExperienceLaunchHealth } from '../the-it-guy/src/core/documents/documentExperienceLaunchGate.js'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const PILOT_ORGANISATION_ID = 'ec19d0a6-bcba-4eef-aa72-9972de88204d'
const MAX_PARTICIPANTS = 10

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function output(report, exitCode = 0) {
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = exitCode
}

const action = arg('action') || 'status'
const projectRef = arg('project-ref') || process.env.SUPABASE_PRODUCTION_PROJECT_REF || ''
const organisationId = arg('organisation-id') || PILOT_ORGANISATION_ID
const operator = arg('operator')
const reference = arg('reference')
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const blockers = []

if (!['status', 'start', 'observe', 'stop'].includes(action)) blockers.push({ code: 'PHASE28_ACTION_INVALID', detail: 'Use status, start, observe, or stop.' })
if (projectRef !== PRODUCTION_PROJECT_REF || !url.includes(PRODUCTION_PROJECT_REF)) blockers.push({ code: 'PHASE28_PROJECT_MISMATCH', detail: 'The supplied credentials are not for the canonical production project.' })
if (organisationId !== PILOT_ORGANISATION_ID) blockers.push({ code: 'PHASE28_COHORT_MISMATCH', detail: 'The pilot is locked to Kingstons Real Estate.' })
if (!serviceRoleKey) blockers.push({ code: 'PHASE28_SERVICE_ROLE_MISSING', detail: 'Production service-role access is required.' })

const writeAction = ['start', 'stop'].includes(action)
if (writeAction && arg('confirm-project-ref') !== PRODUCTION_PROJECT_REF) blockers.push({ code: 'PHASE28_PROJECT_CONFIRMATION_MISMATCH', detail: 'Confirm the exact production project ref.' })
if (writeAction && arg('confirm-organisation-id') !== PILOT_ORGANISATION_ID) blockers.push({ code: 'PHASE28_COHORT_CONFIRMATION_MISMATCH', detail: 'Confirm the exact pilot organisation ID.' })
if (writeAction && !operator) blockers.push({ code: 'PHASE28_OPERATOR_MISSING', detail: 'Record the accountable human operator.' })
if (writeAction && !reference) blockers.push({ code: 'PHASE28_REFERENCE_MISSING', detail: 'Record the rollout change reference.' })
if (action === 'start' && process.env.PHASE28_PILOT_START !== 'true') blockers.push({ code: 'PHASE28_START_FLAG_MISSING', detail: 'PHASE28_PILOT_START=true is required.' })
if (action === 'stop' && process.env.PHASE28_PILOT_STOP !== 'true') blockers.push({ code: 'PHASE28_STOP_FLAG_MISSING', detail: 'PHASE28_PILOT_STOP=true is required.' })

if (blockers.length) {
  output({ phase: 28, action, status: 'BLOCKED', projectRef: projectRef || null, organisationId, blockers, mutatedData: false }, 2)
} else if (action === 'start') {
  const phase27 = spawnSync(process.execPath, [
    'scripts/phase27-controlled-pilot-cohort.mjs',
    '--apply',
    `--project-ref=${projectRef}`,
    `--organisation-id=${organisationId}`,
    `--confirm-project-ref=${projectRef}`,
    `--confirm-organisation-id=${organisationId}`,
    `--operator=${operator}`,
    `--reference=${reference}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, PHASE27_PILOT_WRITE: 'true' },
    encoding: 'utf8',
  })
  let activation = null
  try { activation = JSON.parse(phase27.stdout) } catch { activation = { status: 'PHASE27_OUTPUT_INVALID' } }
  const activated = phase27.status === 0 && activation?.status === 'N6_CONTROL_ACTIVE_PENDING_VERCEL_ENFORCEMENT'
  output({
    phase: 28,
    action,
    status: activated ? 'PILOT_DB_ACTIVE_PENDING_RUNTIME_ENFORCEMENT' : 'BLOCKED_PENDING_GENUINE_N4_EVIDENCE',
    activation,
    nextStep: activated ? 'Set the two reviewed Vercel production rollout variables and redeploy the Phase 26 release commit.' : 'Complete the real journey matrix in shadow mode, then rerun status.',
    mutatedData: Boolean(activation?.mutatedData),
  }, activated ? 0 : 2)
} else {
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [controls, enrolments, telemetry, negativeOrganisation, audit] = await Promise.all([
    client.from('document_experience_rollout_controls_n6').select('*').eq('environment', 'production').order('revision', { ascending: false }).limit(1),
    client.from('document_experience_rollout_enrolments_n6').select('control_id, organisation_id, status').eq('organisation_id', organisationId),
    client.from('telemetry_events').select('event_name, severity, created_at, metadata').eq('category', 'document_experience').order('created_at', { ascending: false }).limit(5000),
    client.from('organisations').select('id, name').eq('status', 'active').neq('id', organisationId).limit(1).maybeSingle(),
    client.from('document_experience_rollout_audit_n6').select('environment, stage, status, revision, organisation_count, change_reference, created_at').eq('environment', 'production').order('revision', { ascending: false }).limit(10),
  ])
  for (const [name, result] of Object.entries({ controls, enrolments, telemetry, negativeOrganisation, audit })) {
    if (result.error) blockers.push({ code: 'PHASE28_PRODUCTION_READ_FAILED', detail: `${name}: ${result.error.message}` })
  }

  const n4 = assessDocumentExperienceLaunchHealth({
    n1: { ready: true, status: 'READY_FOR_N2' },
    n2: { ready: true, status: 'READY_FOR_N3' },
    telemetryAvailable: !telemetry.error,
    events: telemetry.data || [],
  })
  const latest = controls.data?.[0] || null
  let mutation = null

  if (action === 'stop' && !blockers.length) {
    if (!latest || latest.status !== 'active') {
      blockers.push({ code: 'PHASE28_ACTIVE_CONTROL_MISSING', detail: 'There is no active pilot control to stop.' })
    } else {
      const stopped = await client.rpc('bridge_set_document_experience_rollout_n6', {
        p_environment: 'production',
        p_stage: latest.stage,
        p_status: 'paused',
        p_cohort_digest: latest.cohort_digest,
        p_evidence_digest: digest({ stoppedFromEvidence: latest.evidence_digest, operator, reference }),
        p_max_participants: latest.max_participants,
        p_observation_started_at: latest.observation_started_at,
        p_observation_ends_at: latest.observation_ends_at,
        p_expires_at: latest.expires_at,
        p_change_reference: reference,
        p_organisation_ids: [organisationId],
        p_source_n4: { ...(latest.source_n4 || {}), stoppedAt: new Date().toISOString(), stoppedBy: operator },
        p_expected_revision: latest.revision,
      })
      if (stopped.error) blockers.push({ code: 'PHASE28_STOP_FAILED', detail: stopped.error.message })
      else mutation = stopped.data
    }
  }

  const positiveAccess = await client.rpc('bridge_document_experience_runtime_access_n6', { p_organisation_id: organisationId, p_environment: 'production' })
  const negativeAccess = negativeOrganisation.data?.id
    ? await client.rpc('bridge_document_experience_runtime_access_n6', { p_organisation_id: negativeOrganisation.data.id, p_environment: 'production' })
    : { data: null, error: null }
  if (positiveAccess.error) blockers.push({ code: 'PHASE28_POSITIVE_ACCESS_CHECK_FAILED', detail: positiveAccess.error.message })
  if (negativeAccess.error) blockers.push({ code: 'PHASE28_NEGATIVE_ACCESS_CHECK_FAILED', detail: negativeAccess.error.message })

  const currentControl = mutation ? { ...latest, status: 'paused', revision: mutation.revision } : latest
  let status = 'BLOCKED_PENDING_GENUINE_N4_EVIDENCE'
  if (mutation && !blockers.length) status = 'PILOT_STOPPED_FAIL_CLOSED'
  else if (currentControl?.status === 'active' && positiveAccess.data?.allowed === true && negativeAccess.data?.allowed !== true) status = 'PILOT_ACTIVE'
  else if (currentControl?.status === 'active') status = 'PILOT_FAIL_CLOSED'
  else if (currentControl?.status === 'paused') status = 'PILOT_PAUSED'
  else if (currentControl?.status === 'completed') status = 'PILOT_COMPLETED'
  else if (n4.ready) status = 'READY_TO_START'

  output({
    phase: 28,
    action,
    status,
    checkedAt: new Date().toISOString(),
    projectRef,
    cohort: { organisationId, maximumOrganisations: 1, maxParticipants: MAX_PARTICIPANTS },
    n4: { status: n4.status, decision: n4.decision, ready: n4.ready, coverage: n4.coverage, metrics: n4.metrics, blockerCodes: n4.blockers.map((row) => row.code) },
    control: currentControl ? { id: currentControl.id, stage: currentControl.stage, status: currentControl.status, revision: currentControl.revision, observationStartedAt: currentControl.observation_started_at, observationEndsAt: currentControl.observation_ends_at, expiresAt: currentControl.expires_at } : null,
    access: {
      enrolled: positiveAccess.data || null,
      nonEnrolled: negativeOrganisation.data ? { organisationId: negativeOrganisation.data.id, result: negativeAccess.data || null } : null,
    },
    audit: audit.data || [],
    blockers,
    mutation,
    mutatedData: Boolean(mutation),
  }, status.startsWith('BLOCKED') || status === 'PILOT_FAIL_CLOSED' ? 2 : 0)
}
