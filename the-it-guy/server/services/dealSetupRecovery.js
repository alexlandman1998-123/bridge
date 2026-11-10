import process from 'node:process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const digest = value => createHash('sha256').update(value).digest()
const rpc = async (client, name, args = {}) => {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}

// Built from the same services used by Deal Setup, without the browser client.
const loadReconciler = () => import('../../dist-ssr/dealSetupReconciler.mjs')

function checkedQuery(query) {
  return new Proxy(query, { get(target, property) {
    if (property === 'then') return (resolve, reject) => Promise.resolve(target).then(result => {
      // Interactive readers sometimes tolerate unavailable optional data. A
      // background writer must not mistake a failed read for an empty dataset.
      if (result.error) throw result.error
      return result
    }).then(resolve, reject)
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? (...args) => checkedQuery(value.apply(target, args)) : value
  } })
}

export function createDealSetupRecoveryClient(env = process.env, job = null, signal = null) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Recovery configuration unavailable.')
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: job ? {
        'x-arch9-deal-transaction': job.transaction_id,
        'x-arch9-deal-version': job.terms_version,
        'x-arch9-deal-lease': job.lease_id,
      } : {},
      fetch: (url, options) => fetch(url, { ...options, signal: signal || AbortSignal.timeout(15000) }),
    },
  })
  if (!job) return client
  return new Proxy(client, { get(target, property) {
    const value = Reflect.get(target, property)
    if (property === 'from' || property === 'rpc') return (...args) => checkedQuery(value.apply(target, args))
    return typeof value === 'function' ? value.bind(target) : value
  } })
}

export async function runDealSetupRecovery({
  client,
  clientForJob,
  load = loadReconciler,
  limit = 3,
  now = Date.now,
} = {}) {
  // Load before claiming: a packaging failure must not strand a leased deal.
  const { syncDealSetupAttorneyHandoff, syncDealSetupDownstream } = await load()
  const started = now()
  const summary = { claimed: 0, completed: 0, retrying: 0, superseded: 0 }
  for (let index = 0; index < Math.min(limit, 3) && now() - started < 150000; index++) {
    const job = await rpc(client, 'bridge_claim_deal_setup_recovery')
    if (!job) break
    summary.claimed++
    let succeeded = false
    try {
      const scoped = clientForJob(job, AbortSignal.timeout(45000))
      const handoff = await syncDealSetupAttorneyHandoff({ transactionId: job.transaction_id, client: scoped })
      if (handoff?.transactionId !== job.transaction_id || handoff.routingProfileRefreshed !== true) throw new Error('Handoff receipt unavailable.')
      const documents = await syncDealSetupDownstream({ transactionId: job.transaction_id, client: scoped })
      if (documents?.documentResolution?.transactionId !== job.transaction_id || documents.documentResolution.skipped) throw new Error('Document reconciliation unavailable.')
      succeeded = true
    } catch { /* The durable receipt contains safe copy, never raw customer/provider errors. */ }
    const receipt = await rpc(client, 'bridge_finish_deal_setup_recovery', {
      p_transaction_id: job.transaction_id,
      p_terms_version: job.terms_version,
      p_lease_id: job.lease_id,
      p_succeeded: succeeded,
    })
    if (!receipt?.accepted) summary.superseded++
    else summary[succeeded ? 'completed' : 'retrying']++
  }
  return summary
}

export async function createDealSetupRecoveryResponse({ method, headers = {}, env = process.env, run = runDealSetupRecovery, clientFactory = createDealSetupRecoveryClient } = {}) {
  const response = (status, body) => ({ status, body, headers: { 'Cache-Control': 'private, no-store' } })
  if (method !== 'GET') return response(405, { error: 'method_not_allowed' })
  if (!env.CRON_SECRET || !timingSafeEqual(digest(String(headers.authorization || '')), digest(`Bearer ${env.CRON_SECRET}`))) return response(401, { error: 'unauthorised' })
  // A release enables this explicitly after its migration and target checks.
  if (env.DEAL_SETUP_RECOVERY_ENABLED !== 'true') return response(200, { status: 'paused' })
  try {
    const summary = await run({ client: clientFactory(env), clientForJob: (job, signal) => clientFactory(env, job, signal) })
    return response(summary.retrying ? 503 : 200, { status: summary.retrying ? 'retrying' : 'ok', ...summary })
  } catch { return response(503, { error: 'deal_setup_recovery_unavailable' }) }
}
