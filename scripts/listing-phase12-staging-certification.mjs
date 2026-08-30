import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const contract = JSON.parse(await fs.readFile(path.join(root, 'config/listing-worker-phase12-staging-certification.json'), 'utf8'))
const argv = process.argv.slice(2)
const certify = argv.includes('--certify')

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
  if (projectRef === contract.productionProjectRef) throw new Error('Production project refused by Phase 12 certification guard.')
  if (projectRef !== contract.stagingProjectRef) throw new Error('Target does not match the approved Phase 12 staging project.')
  if (new URL(baseUrl).hostname !== `${projectRef}.supabase.co`) throw new Error('Staging URL does not match the approved project.')
}
async function readJson(relativePath) {
  try { return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8')) } catch { return null }
}
function validateRehearsal(receipt, provider) {
  const ageMs = receipt?.measuredAt ? Date.now() - Date.parse(receipt.measuredAt) : Number.POSITIVE_INFINITY
  return Boolean(
    receipt &&
    receipt.contract === 'listing-worker-phase11-syndication-rehearsal-v1' &&
    receipt.status === 'STAGING_SYNDICATION_REHEARSAL_PASSED' &&
    receipt.projectRef === contract.stagingProjectRef &&
    receipt.provider === provider &&
    receipt.environment === 'sandbox' &&
    receipt.productionEnabled === false &&
    receipt.scheduleEnabled === false &&
    receipt.evidence?.job?.status === 'completed' &&
    receipt.evidence?.job?.result?.submitted === true &&
    ageMs >= 0 && ageMs <= contract.maximumReceiptAgeHours * 60 * 60 * 1000
  )
}
async function api(baseUrl, apikey, bearer, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { apikey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : null
  if (!response.ok) throw new Error(`Staging verification failed (${response.status}): ${data?.message || data?.error || 'unknown error'}`)
  return data
}

const projectRef = required('SUPABASE_STAGING_PROJECT_REF')
const baseUrl = required('SUPABASE_STAGING_URL').replace(/\/$/, '')
assertTarget(projectRef, baseUrl)
const receipts = Object.fromEntries(await Promise.all(contract.requiredProviders.map(async (provider) => [
  provider,
  await readJson(contract.phase11ReceiptTemplate.replace('{provider}', provider)),
])))
const rehearsalChecks = Object.fromEntries(contract.requiredProviders.map((provider) => [provider, validateRehearsal(receipts[provider], provider)]))
const receipt = {
  contract: contract.contract,
  projectRef,
  mode: certify ? 'staging_certification' : 'read_only_preflight',
  scheduleEnabled: false,
  productionEnabled: false,
  measuredAt: new Date().toISOString(),
  status: 'PENDING',
  checks: { rehearsals: rehearsalChecks },
  evidence: {},
}

if (!certify) {
  receipt.status = Object.values(rehearsalChecks).every(Boolean) ? 'STAGING_CERTIFICATION_PREFLIGHT_READY' : 'STAGING_CERTIFICATION_BLOCKED'
  receipt.evidence.blockers = contract.requiredProviders.filter((provider) => !rehearsalChecks[provider]).map((provider) => `phase11_${provider}_receipt_missing_or_invalid`)
  receipt.evidence.requiredEnvironment = [
    'SUPABASE_STAGING_ANON_KEY', 'SUPABASE_STAGING_USER_ACCESS_TOKEN',
    'SUPABASE_STAGING_SERVICE_ROLE_KEY', 'LISTING_SYNDICATION_ADAPTER_URL',
    'LISTING_SYNDICATION_WORKER_SECRET',
  ]
  console.log(JSON.stringify(receipt, null, 2))
  process.exit(0)
}

if (option('--confirm') !== contract.certificationConfirmation) throw new Error(`--confirm must equal ${contract.certificationConfirmation}.`)
if (!Object.values(rehearsalChecks).every(Boolean)) throw new Error('Valid, recent Phase 11 receipts for both providers are required.')
const anonKey = required('SUPABASE_STAGING_ANON_KEY')
const userToken = required('SUPABASE_STAGING_USER_ACCESS_TOKEN')
const serviceKey = required('SUPABASE_STAGING_SERVICE_ROLE_KEY')
const adapterUrl = required('LISTING_SYNDICATION_ADAPTER_URL')
const adapterSecret = required('LISTING_SYNDICATION_WORKER_SECRET')
if (new URL(adapterUrl).protocol !== 'https:') throw new Error('Syndication adapter URL must use HTTPS.')

const variants = await api(baseUrl, serviceKey, serviceKey, '/rest/v1/listing_media_variants?select=id&limit=1')
const remoteJobs = {}
const health = {}
for (const provider of contract.requiredProviders) {
  const rehearsal = receipts[provider]
  const jobId = rehearsal.evidence.job.id
  const [job] = await api(baseUrl, serviceKey, serviceKey,
    `/rest/v1/listing_background_jobs?id=eq.${jobId}&select=id,listing_id,job_type,status,completed_at,result`)
  if (!job || job.status !== 'completed' || job.result?.submitted !== true) throw new Error(`${provider} rehearsal job is not present and completed in staging.`)
  remoteJobs[provider] = { id: job.id, jobType: job.job_type, status: job.status, completedAt: job.completed_at }
  health[provider] = await api(baseUrl, anonKey, userToken, '/rest/v1/rpc/bridge_listing_syndication_health_v1', {
    method: 'POST', body: JSON.stringify({ p_listing_id: job.listing_id }),
  })
}

const adapterResponse = await fetch(adapterUrl, { headers: { 'x-listing-syndication-worker-secret': adapterSecret } })
const adapter = await adapterResponse.json().catch(() => ({}))
if (!adapterResponse.ok || adapter.status !== 'ready') throw new Error('Staging syndication adapter readiness probe failed.')
if (adapter.productionEnabled !== false) throw new Error('Production syndication must remain disabled during Phase 12.')
if (adapter.providers?.property24 !== true || adapter.providers?.privateProperty !== true) throw new Error('Both staging provider workers must be enabled.')

const edgeResponse = await fetch(`${baseUrl}/functions/v1/listing-job-runner`, { method: 'GET' })
if (edgeResponse.status !== 405) throw new Error('Listing job runner deployment probe did not return the expected method guard.')

receipt.status = 'STAGING_SYNDICATION_CERTIFIED'
receipt.checks = {
  ...receipt.checks,
  variantSchemaDeployed: Array.isArray(variants),
  enqueueControlsProvenByRehearsals: true,
  healthRpcDeployed: true,
  workerDeployed: true,
  adapterReady: true,
  providerWorkersEnabled: true,
  productionDisabled: true,
}
receipt.evidence = { remoteJobs, health, adapter: { ...adapter }, workerProbeStatus: edgeResponse.status }
receipt.receiptDigest = crypto.createHash('sha256').update(JSON.stringify({
  contract: receipt.contract, projectRef: receipt.projectRef, checks: receipt.checks, evidence: receipt.evidence,
})).digest('hex')
const evidencePath = path.join(root, contract.evidencePath)
await fs.mkdir(path.dirname(evidencePath), { recursive: true })
await fs.writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(receipt, null, 2))
