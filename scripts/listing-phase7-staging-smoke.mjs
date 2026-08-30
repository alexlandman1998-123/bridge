import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const contract = JSON.parse(await fs.readFile(path.join(root, 'config/listing-worker-phase7-staging.json'), 'utf8'))
const args = new Set(process.argv.slice(2))
const execute = args.has('--execute')
const confirmationIndex = process.argv.indexOf('--confirm')
const confirmation = confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : ''

function required(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function assertTarget(projectRef, baseUrl) {
  if (projectRef === contract.productionProjectRef) throw new Error('Production project refused by Phase 7 staging guard.')
  if (projectRef !== contract.stagingProjectRef) throw new Error('Target does not match the approved Phase 7 staging project.')
  const host = new URL(baseUrl).hostname
  if (!host.startsWith(`${projectRef}.`) && host !== `${projectRef}.supabase.co`) {
    throw new Error('SUPABASE_STAGING_URL does not match SUPABASE_STAGING_PROJECT_REF.')
  }
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
  if (!response.ok) throw new Error(`Staging request failed (${response.status}): ${payload?.message || payload?.error || 'unknown error'}`)
  return payload
}

async function schemaPreflight(baseUrl, serviceKey) {
  const [jobs, events, runs] = await Promise.all([
    api(baseUrl, serviceKey, '/rest/v1/listing_background_jobs?select=id&limit=1'),
    api(baseUrl, serviceKey, '/rest/v1/listing_background_job_events?select=id&limit=1'),
    api(baseUrl, serviceKey, '/rest/v1/listing_job_worker_runs?select=id&limit=1'),
  ])
  return { jobsTable: Array.isArray(jobs), eventsTable: Array.isArray(events), workerRunsTable: Array.isArray(runs) }
}

const projectRef = required('SUPABASE_STAGING_PROJECT_REF')
const baseUrl = required('SUPABASE_STAGING_URL').replace(/\/$/, '')
assertTarget(projectRef, baseUrl)

const receipt = {
  contract: contract.contract,
  projectRef,
  productionRefused: projectRef !== contract.productionProjectRef,
  mode: execute ? 'bounded_write_smoke' : 'read_only_preflight',
  scheduleEnabled: false,
  allowedJobType: contract.allowedJobType,
  measuredAt: new Date().toISOString(),
  status: 'PENDING',
  evidence: {},
}

if (!execute) {
  receipt.status = 'STAGING_PREFLIGHT_READY'
  receipt.evidence.requiredEnvironment = [
    'SUPABASE_STAGING_SERVICE_ROLE_KEY',
    'LISTING_JOB_RUNNER_SECRET',
  ]
  console.log(JSON.stringify(receipt, null, 2))
  process.exit(0)
}

if (confirmation !== contract.executionConfirmation) throw new Error(`--confirm must equal ${contract.executionConfirmation}.`)
const serviceKey = required('SUPABASE_STAGING_SERVICE_ROLE_KEY')
const runnerSecret = required('LISTING_JOB_RUNNER_SECRET')
receipt.evidence.schema = await schemaPreflight(baseUrl, serviceKey)

const listings = await api(
  baseUrl,
  serviceKey,
  '/rest/v1/private_listings?select=id,organisation_id,listing_media(id,storage_bucket,storage_path)&limit=50',
)
const listing = listings.find((row) =>
  row.organisation_id && Array.isArray(row.listing_media) && row.listing_media.every((media) => media.storage_bucket && media.storage_path),
)
if (!listing) throw new Error('No staging listing has fully canonical media for the bounded smoke.')

const idempotencyKey = `phase7-smoke:${listing.id}:${crypto.randomUUID()}`
const [job] = await api(baseUrl, serviceKey, '/rest/v1/listing_background_jobs', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: listing.organisation_id,
    listing_id: listing.id,
    job_type: contract.allowedJobType,
    idempotency_key: idempotencyKey,
    payload: { source: 'phase7_staging_smoke', bounded: true },
    max_attempts: 1,
  }),
})

const workerResponse = await fetch(`${baseUrl}/functions/v1/listing-job-runner`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-listing-job-runner-secret': runnerSecret },
  body: JSON.stringify({ limit: contract.batchLimit }),
})
const workerResult = await workerResponse.json()
if (!workerResponse.ok) throw new Error(`Listing worker smoke failed (${workerResponse.status}).`)

const [completedJob] = await api(baseUrl, serviceKey, `/rest/v1/listing_background_jobs?id=eq.${job.id}&select=id,status,attempt_count,last_error_code,completed_at`)
const events = await api(baseUrl, serviceKey, `/rest/v1/listing_background_job_events?job_id=eq.${job.id}&select=event_type,attempt_count,error_code,created_at&order=created_at.asc`)
const runs = await api(baseUrl, serviceKey, `/rest/v1/listing_job_worker_runs?worker_id=eq.${encodeURIComponent(workerResult.workerId)}&select=status,claimed_count,completed_count,duration_ms,started_at,finished_at`)
if (completedJob?.status !== 'completed') throw new Error(`Smoke job ended in ${completedJob?.status || 'unknown'} state.`)
if (!events.some((event) => event.event_type === 'queued') || !events.some((event) => event.event_type === 'completed')) {
  throw new Error('Smoke lifecycle evidence is incomplete.')
}
if (!runs.some((run) => run.status === 'completed' && Number(run.completed_count) >= 1)) throw new Error('Worker heartbeat evidence is incomplete.')

receipt.status = 'STAGING_SMOKE_PASSED'
receipt.evidence = {
  ...receipt.evidence,
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
