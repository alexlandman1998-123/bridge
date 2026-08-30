import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const contract = JSON.parse(await fs.readFile(path.join(root, 'config/listing-worker-phase8-production-canary.json'), 'utf8'))
const execute = process.argv.includes('--execute')
const confirmationIndex = process.argv.indexOf('--confirm')
const confirmation = confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : ''

function required(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function assertProductionTarget(projectRef, baseUrl) {
  if (projectRef !== contract.productionProjectRef) throw new Error('Target does not match the approved production project.')
  if (projectRef === contract.stagingProjectRef) throw new Error('Staging project cannot be used for the production canary.')
  if (new URL(baseUrl).hostname !== `${projectRef}.supabase.co`) {
    throw new Error('SUPABASE_PRODUCTION_URL does not match SUPABASE_PRODUCTION_PROJECT_REF.')
  }
}

async function readPhase7Receipt() {
  try {
    return JSON.parse(await fs.readFile(path.join(root, contract.phase7ReceiptPath), 'utf8'))
  } catch {
    return null
  }
}

function phase7Passed(receipt) {
  return Boolean(
    receipt &&
    receipt.contract === 'listing-worker-phase7-staging-v1' &&
    receipt.status === 'STAGING_SMOKE_PASSED' &&
    receipt.projectRef === contract.stagingProjectRef &&
    receipt.productionRefused === true &&
    receipt.scheduleEnabled === false &&
    receipt.allowedJobType === contract.allowedJobType,
  )
}

async function api(baseUrl, serviceKey, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`Production request failed (${response.status}): ${payload?.message || payload?.error || 'unknown error'}`)
  return payload
}

async function queueHealth(baseUrl, serviceKey) {
  return api(baseUrl, serviceKey, '/rest/v1/rpc/bridge_listing_job_health_v1', {
    method: 'POST',
    body: JSON.stringify({ p_listing_id: null }),
  })
}

const projectRef = required('SUPABASE_PRODUCTION_PROJECT_REF')
const baseUrl = required('SUPABASE_PRODUCTION_URL').replace(/\/$/, '')
assertProductionTarget(projectRef, baseUrl)
const phase7Receipt = await readPhase7Receipt()

const receipt = {
  contract: contract.contract,
  projectRef,
  phase7ReceiptValid: phase7Passed(phase7Receipt),
  mode: execute ? 'single_production_canary' : 'read_only_preflight',
  scheduleEnabled: false,
  allowedJobType: contract.allowedJobType,
  blockedHandlers: contract.blockedHandlers,
  measuredAt: new Date().toISOString(),
  status: 'PENDING',
  evidence: {},
}

if (!execute) {
  receipt.status = receipt.phase7ReceiptValid ? 'PRODUCTION_CANARY_PREFLIGHT_READY' : 'PRODUCTION_CANARY_BLOCKED'
  receipt.evidence.blockers = receipt.phase7ReceiptValid ? [] : ['phase7_staging_smoke_receipt_missing_or_invalid']
  receipt.evidence.requiredEnvironment = ['SUPABASE_PRODUCTION_SERVICE_ROLE_KEY', 'LISTING_JOB_RUNNER_SECRET']
  console.log(JSON.stringify(receipt, null, 2))
  process.exit(0)
}

if (confirmation !== contract.executionConfirmation) throw new Error(`--confirm must equal ${contract.executionConfirmation}.`)
if (!receipt.phase7ReceiptValid) throw new Error('A valid Phase 7 STAGING_SMOKE_PASSED receipt is required.')
const serviceKey = required('SUPABASE_PRODUCTION_SERVICE_ROLE_KEY')
const runnerSecret = required('LISTING_JOB_RUNNER_SECRET')
const healthBefore = await queueHealth(baseUrl, serviceKey)
const activeBefore = Number(healthBefore.queued || 0) + Number(healthBefore.processing || 0) + Number(healthBefore.retryScheduled || 0)
if (activeBefore !== 0) throw new Error('Production queue must be idle before the canary.')
if (Number(healthBefore.expiredLeases || 0) !== 0) throw new Error('Production queue has expired leases.')

const listings = await api(
  baseUrl,
  serviceKey,
  '/rest/v1/private_listings?select=id,organisation_id,listing_media(id,storage_bucket,storage_path)&limit=50',
)
const listing = listings.find((row) =>
  row.organisation_id && Array.isArray(row.listing_media) && row.listing_media.length > 0 &&
  row.listing_media.every((media) => media.storage_bucket && media.storage_path),
)
if (!listing) throw new Error('No production listing has fully canonical media for the canary.')

const [job] = await api(baseUrl, serviceKey, '/rest/v1/listing_background_jobs', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: listing.organisation_id,
    listing_id: listing.id,
    job_type: contract.allowedJobType,
    idempotency_key: `phase8-production-canary:${listing.id}:${crypto.randomUUID()}`,
    payload: { source: 'phase8_production_canary', bounded: true },
    max_attempts: contract.maxAttempts,
  }),
})

const workerResponse = await fetch(`${baseUrl}/functions/v1/listing-job-runner`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-listing-job-runner-secret': runnerSecret },
  body: JSON.stringify({ limit: contract.batchLimit }),
})
const workerResult = await workerResponse.json()
if (!workerResponse.ok) throw new Error(`Production canary worker failed (${workerResponse.status}).`)

const [completedJob] = await api(baseUrl, serviceKey, `/rest/v1/listing_background_jobs?id=eq.${job.id}&select=id,status,attempt_count,last_error_code,completed_at`)
const events = await api(baseUrl, serviceKey, `/rest/v1/listing_background_job_events?job_id=eq.${job.id}&select=event_type,attempt_count,error_code,created_at&order=created_at.asc`)
const runs = await api(baseUrl, serviceKey, `/rest/v1/listing_job_worker_runs?worker_id=eq.${encodeURIComponent(workerResult.workerId)}&select=status,claimed_count,completed_count,duration_ms,started_at,finished_at`)
const healthAfter = await queueHealth(baseUrl, serviceKey)
if (completedJob?.status !== 'completed' || Number(completedJob.attempt_count) !== 1) throw new Error('Production canary did not complete exactly once.')
if (!events.some((event) => event.event_type === 'queued') || !events.some((event) => event.event_type === 'completed')) throw new Error('Production canary lifecycle evidence is incomplete.')
if (!runs.some((run) => run.status === 'completed' && Number(run.completed_count) === 1)) throw new Error('Production worker heartbeat evidence is incomplete.')
if (Number(healthAfter.expiredLeases || 0) !== 0) throw new Error('Production canary left an expired lease.')

receipt.status = 'PRODUCTION_CANARY_PASSED'
receipt.evidence = {
  healthBefore,
  healthAfter,
  job: completedJob,
  lifecycle: events,
  worker: runs[0],
  workerOutcome: {
    claimed: workerResult.claimed,
    completed: workerResult.completed,
    retryScheduled: workerResult.retryScheduled,
    manualReview: workerResult.manualReview,
  },
}
const evidencePath = path.join(root, contract.evidencePath)
await fs.mkdir(path.dirname(evidencePath), { recursive: true })
await fs.writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(receipt, null, 2))
