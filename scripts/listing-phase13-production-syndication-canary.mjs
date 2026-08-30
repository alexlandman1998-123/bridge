import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const contract = JSON.parse(await fs.readFile(path.join(root, 'config/listing-worker-phase13-production-canary.json'), 'utf8'))
const argv = process.argv.slice(2)
const execute = argv.includes('--execute')

function option(name) {
  const index = argv.indexOf(name)
  return index >= 0 ? String(argv[index + 1] || '').trim() : ''
}
function required(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}
function assertProductionTarget(projectRef, baseUrl) {
  if (projectRef !== contract.productionProjectRef) throw new Error('Target does not match the approved Phase 13 production project.')
  if (projectRef === contract.stagingProjectRef) throw new Error('Staging project cannot execute the Phase 13 production canary.')
  if (new URL(baseUrl).hostname !== `${projectRef}.supabase.co`) throw new Error('Production URL does not match the approved project.')
}
async function readJson(relativePath) {
  try { return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8')) } catch { return null }
}
function phase12Digest(receipt) {
  return crypto.createHash('sha256').update(JSON.stringify({
    contract: receipt.contract,
    projectRef: receipt.projectRef,
    checks: receipt.checks,
    evidence: receipt.evidence,
  })).digest('hex')
}
function phase12Valid(receipt) {
  return Boolean(
    receipt &&
    receipt.contract === 'listing-worker-phase12-staging-certification-v1' &&
    receipt.status === 'STAGING_SYNDICATION_CERTIFIED' &&
    receipt.projectRef === contract.stagingProjectRef &&
    receipt.productionEnabled === false &&
    receipt.scheduleEnabled === false &&
    receipt.checks?.productionDisabled === true &&
    receipt.checks?.providerWorkersEnabled === true &&
    receipt.receiptDigest === phase12Digest(receipt)
  )
}
async function api(baseUrl, apikey, bearer, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { apikey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : null
  if (!response.ok) throw new Error(`Production canary request failed (${response.status}): ${data?.message || data?.error || 'unknown error'}`)
  return data
}
async function queueHealth(baseUrl, serviceKey) {
  return api(baseUrl, serviceKey, serviceKey, '/rest/v1/rpc/bridge_listing_job_health_v1', {
    method: 'POST', body: JSON.stringify({ p_listing_id: null }),
  })
}
async function providerSyncEvidence(baseUrl, serviceKey, provider, listingId) {
  const route = provider === 'property24'
    ? `/rest/v1/property24_listing_syncs?private_listing_id=eq.${listingId}&environment=eq.production&select=listing_number,external_status,is_on_portal,last_successful_sync_at,last_error&limit=1`
    : `/rest/v1/private_property_listing_syncs?private_listing_id=eq.${listingId}&environment=eq.production&select=property_id,private_property_ref,external_status,is_on_portal,submitted_at,last_error&limit=1`
  const rows = await api(baseUrl, serviceKey, serviceKey, route)
  if (!rows[0] || rows[0].last_error) throw new Error(`${provider} production sync evidence is missing or contains an error.`)
  return rows[0]
}

const projectRef = required('SUPABASE_PRODUCTION_PROJECT_REF')
const baseUrl = required('SUPABASE_PRODUCTION_URL').replace(/\/$/, '')
assertProductionTarget(projectRef, baseUrl)
const phase12 = await readJson(contract.phase12ReceiptPath)
const provider = option('--provider')
const listingId = option('--listing-id')
const receipt = {
  contract: contract.contract,
  projectRef,
  provider: provider || null,
  listingId: listingId || null,
  phase12CertificateValid: phase12Valid(phase12),
  mode: execute ? 'single_production_syndication_canary' : 'read_only_preflight',
  scheduleEnabled: false,
  measuredAt: new Date().toISOString(),
  status: 'PENDING',
  rollback: contract.rollback,
  evidence: {},
}

if (!execute) {
  receipt.status = receipt.phase12CertificateValid ? 'PRODUCTION_SYNDICATION_CANARY_PREFLIGHT_READY' : 'PRODUCTION_SYNDICATION_CANARY_BLOCKED'
  receipt.evidence.blockers = receipt.phase12CertificateValid ? [] : ['phase12_staging_certificate_missing_or_invalid']
  receipt.evidence.requiredInputs = ['--provider', '--listing-id', '--payload-file', '--confirm']
  console.log(JSON.stringify(receipt, null, 2))
  process.exit(0)
}

if (!contract.allowedProviders.includes(provider)) throw new Error('Provider is not approved by the Phase 13 contract.')
if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new Error('--listing-id must be a UUID.')
const expectedConfirmation = `${contract.confirmationPrefix}:${provider}:${listingId}`
if (option('--confirm') !== expectedConfirmation) throw new Error(`--confirm must equal ${expectedConfirmation}.`)
if (!receipt.phase12CertificateValid) throw new Error('A valid Phase 12 staging certification receipt is required.')
const payloadPath = option('--payload-file')
if (!payloadPath) throw new Error('--payload-file is required for explicit production mappings.')
const providerPayload = JSON.parse(await fs.readFile(path.resolve(payloadPath), 'utf8'))
const anonKey = required('SUPABASE_PRODUCTION_ANON_KEY')
const userToken = required('SUPABASE_PRODUCTION_USER_ACCESS_TOKEN')
const serviceKey = required('SUPABASE_PRODUCTION_SERVICE_ROLE_KEY')
const runnerSecret = required('LISTING_JOB_RUNNER_SECRET')
const adapterUrl = required('LISTING_SYNDICATION_ADAPTER_URL')
const adapterSecret = required('LISTING_SYNDICATION_WORKER_SECRET')

const adapterResponse = await fetch(adapterUrl, { headers: { 'x-listing-syndication-worker-secret': adapterSecret } })
const adapter = await adapterResponse.json().catch(() => ({}))
const selectedProviderEnabled = provider === 'property24' ? adapter.providers?.property24 : adapter.providers?.privateProperty
if (!adapterResponse.ok || adapter.status !== 'ready' || adapter.productionEnabled !== true || selectedProviderEnabled !== true) {
  throw new Error('Selected production syndication adapter is not explicitly enabled.')
}

const healthBefore = await queueHealth(baseUrl, serviceKey)
const activeBefore = Number(healthBefore.queued || 0) + Number(healthBefore.processing || 0) + Number(healthBefore.retryScheduled || 0)
if (activeBefore !== 0 || Number(healthBefore.expiredLeases || 0) !== 0) throw new Error('Production queue must be idle and lease-clean before the canary.')

const job = await api(baseUrl, anonKey, userToken, '/rest/v1/rpc/bridge_enqueue_listing_syndication_canary_v1', {
  method: 'POST',
  body: JSON.stringify({
    p_listing_id: listingId,
    p_provider: provider,
    p_canary_confirmation: expectedConfirmation,
    p_payload: { ...providerPayload, source: 'phase13_production_syndication_canary' },
    p_revision: `phase13-${Date.now()}`,
  }),
})

const workerResponse = await fetch(`${baseUrl}/functions/v1/listing-job-runner`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-listing-job-runner-secret': runnerSecret },
  body: JSON.stringify({ limit: contract.batchLimit }),
})
const worker = await workerResponse.json()
if (!workerResponse.ok) throw new Error(`Production syndication worker failed (${workerResponse.status}).`)
const [completed] = await api(baseUrl, serviceKey, serviceKey,
  `/rest/v1/listing_background_jobs?id=eq.${job.id}&select=id,job_type,status,attempt_count,last_error_code,completed_at,result`)
const events = await api(baseUrl, serviceKey, serviceKey,
  `/rest/v1/listing_background_job_events?job_id=eq.${job.id}&select=event_type,attempt_count,error_code,created_at&order=created_at.asc`)
const sync = await providerSyncEvidence(baseUrl, serviceKey, provider, listingId)
const healthAfter = await queueHealth(baseUrl, serviceKey)
if (completed?.status !== 'completed' || Number(completed.attempt_count) !== 1 || completed.result?.submitted !== true) {
  throw new Error('Production syndication canary did not complete exactly once with submission evidence.')
}
if (!events.some((event) => event.event_type === 'queued') || !events.some((event) => event.event_type === 'completed')) {
  throw new Error('Production canary lifecycle evidence is incomplete.')
}
if (Number(healthAfter.expiredLeases || 0) !== 0) throw new Error('Production canary left an expired lease.')

receipt.status = 'PRODUCTION_SYNDICATION_CANARY_PASSED'
receipt.evidence = {
  phase12Digest: phase12.receiptDigest,
  job: { id: completed.id, jobType: completed.job_type, status: completed.status, attemptCount: completed.attempt_count, completedAt: completed.completed_at },
  lifecycle: events,
  providerSync: sync,
  healthBefore,
  healthAfter,
  worker: { claimed: worker.claimed, completed: worker.completed, retryScheduled: worker.retryScheduled, manualReview: worker.manualReview },
}
receipt.receiptDigest = crypto.createHash('sha256').update(JSON.stringify(receipt.evidence)).digest('hex')
const evidencePath = path.join(root, contract.evidencePath)
await fs.mkdir(path.dirname(evidencePath), { recursive: true })
await fs.writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(receipt, null, 2))
