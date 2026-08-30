import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const contract = JSON.parse(await fs.readFile(path.join(root, 'config/listing-worker-phase11-syndication-rehearsal.json'), 'utf8'))
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
function assertTarget(projectRef, baseUrl) {
  if (projectRef === contract.productionProjectRef) throw new Error('Production project refused by Phase 11 syndication guard.')
  if (projectRef !== contract.stagingProjectRef) throw new Error('Target does not match the approved Phase 11 staging project.')
  if (new URL(baseUrl).hostname !== `${projectRef}.supabase.co`) throw new Error('Staging URL does not match the approved project.')
}
async function api(baseUrl, apikey, bearer, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { apikey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : null
  if (!response.ok) throw new Error(`Staging request failed (${response.status}): ${data?.message || data?.error || 'unknown error'}`)
  return data
}

const projectRef = required('SUPABASE_STAGING_PROJECT_REF')
const baseUrl = required('SUPABASE_STAGING_URL').replace(/\/$/, '')
assertTarget(projectRef, baseUrl)
const provider = option('--provider')
const listingId = option('--listing-id')
const receipt = {
  contract: contract.contract,
  projectRef,
  provider: provider || null,
  listingId: listingId || null,
  environment: contract.allowedEnvironment,
  mode: execute ? 'single_sandbox_submission' : 'read_only_preflight',
  scheduleEnabled: false,
  productionEnabled: false,
  measuredAt: new Date().toISOString(),
  status: execute ? 'PENDING' : 'STAGING_SYNDICATION_PREFLIGHT_READY',
  evidence: {},
}

if (!execute) {
  receipt.evidence.requiredExecutionInputs = [
    '--provider', '--listing-id', '--payload-file', '--confirm',
    'SUPABASE_STAGING_ANON_KEY', 'SUPABASE_STAGING_USER_ACCESS_TOKEN',
    'SUPABASE_STAGING_SERVICE_ROLE_KEY', 'LISTING_JOB_RUNNER_SECRET',
  ]
  console.log(JSON.stringify(receipt, null, 2))
  process.exit(0)
}

if (option('--confirm') !== contract.executionConfirmation) throw new Error(`--confirm must equal ${contract.executionConfirmation}.`)
if (!contract.allowedProviders.includes(provider)) throw new Error('Provider is not approved by the Phase 11 contract.')
if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new Error('--listing-id must be a UUID.')
const payloadPath = option('--payload-file')
if (!payloadPath) throw new Error('--payload-file is required for explicit provider mappings.')
const providerPayload = JSON.parse(await fs.readFile(path.resolve(payloadPath), 'utf8'))
const anonKey = required('SUPABASE_STAGING_ANON_KEY')
const userToken = required('SUPABASE_STAGING_USER_ACCESS_TOKEN')
const serviceKey = required('SUPABASE_STAGING_SERVICE_ROLE_KEY')
const runnerSecret = required('LISTING_JOB_RUNNER_SECRET')

const active = await api(baseUrl, serviceKey, serviceKey,
  '/rest/v1/listing_background_jobs?select=id&status=in.(queued,processing,retry_scheduled)&limit=1')
if (active.length) throw new Error('Staging queue must be idle before the bounded syndication rehearsal.')

const publishConfirmation = `${provider.toUpperCase()}_PUBLISH:${listingId}:sandbox`
const job = await api(baseUrl, anonKey, userToken, '/rest/v1/rpc/bridge_enqueue_listing_syndication_job_v1', {
  method: 'POST',
  body: JSON.stringify({
    p_listing_id: listingId,
    p_provider: provider,
    p_environment: 'sandbox',
    p_confirmation: publishConfirmation,
    p_payload: { ...providerPayload, source: 'phase11_staging_syndication_rehearsal' },
    p_revision: `phase11-${Date.now()}`,
  }),
})

const workerResponse = await fetch(`${baseUrl}/functions/v1/listing-job-runner`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-listing-job-runner-secret': runnerSecret },
  body: JSON.stringify({ limit: contract.batchLimit }),
})
const worker = await workerResponse.json()
if (!workerResponse.ok) throw new Error(`Listing syndication worker failed (${workerResponse.status}).`)

const [completed] = await api(baseUrl, serviceKey, serviceKey,
  `/rest/v1/listing_background_jobs?id=eq.${job.id}&select=id,job_type,status,attempt_count,last_error_code,completed_at,result`)
const events = await api(baseUrl, serviceKey, serviceKey,
  `/rest/v1/listing_background_job_events?job_id=eq.${job.id}&select=event_type,attempt_count,error_code,created_at&order=created_at.asc`)
if (completed?.status !== 'completed' || completed?.result?.submitted !== true) {
  throw new Error(`Sandbox syndication ended in ${completed?.status || 'unknown'} without submission evidence.`)
}
if (!events.some((event) => event.event_type === 'queued') || !events.some((event) => event.event_type === 'completed')) {
  throw new Error('Syndication lifecycle evidence is incomplete.')
}

receipt.status = 'STAGING_SYNDICATION_REHEARSAL_PASSED'
receipt.evidence = {
  job: { ...completed, result: { ...completed.result, listingId: undefined } },
  lifecycle: events,
  worker: { claimed: worker.claimed, completed: worker.completed, manualReview: worker.manualReview },
  approval: { exactConfirmationUsed: true, authenticatedAdminRequired: true },
}
const evidencePath = path.join(root, contract.evidencePathTemplate.replace('{provider}', provider))
await fs.mkdir(path.dirname(evidencePath), { recursive: true })
await fs.writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(receipt, null, 2))
