#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { assertAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const text = (value) => String(value || '').trim()
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const apply = process.argv.includes('--apply')
const scope = option('--scope') || 'approved'
const batchLimit = Number(option('--limit') || 10)
const manifestPath = resolve(option('--manifest') || 'output/attorney-release/phase2-propagation-classification.json')
const allowlistPath = option('--allowlist') ? resolve(option('--allowlist')) : ''
const receiptPath = resolve(option('--receipt') || `output/attorney-release/phase3-${apply ? 'apply' : 'dry-run'}-receipt.json`)
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
const projectRef = text(process.env.SUPABASE_STAGING_PROJECT_REF)

assertAttorneyStagingTarget({
  supabaseUrl: url,
  expectedProjectRef: projectRef,
  productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
  environment: 'staging',
  recoveryConfirmation: process.env.SUPABASE_STAGING_RECOVERY_CONFIRMED,
  requireRecovery: apply,
})
if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.')
if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 10) throw new Error('The reconciliation batch limit must be between 1 and 10 transactions.')
if (!['approved', 'seeded-demo'].includes(scope)) throw new Error('Scope must be approved or seeded-demo.')
if (!existsSync(manifestPath)) throw new Error('The Phase 2 classification manifest is required.')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const { manifestFingerprint, generatedAt, ...manifestCore } = manifest
const calculatedFingerprint = createHash('sha256').update(JSON.stringify(manifestCore)).digest('hex')
if (!manifestFingerprint || calculatedFingerprint !== manifestFingerprint) throw new Error('The Phase 2 manifest fingerprint is invalid or stale.')
if (manifest.environment !== 'staging' || manifest.projectRef !== projectRef || manifest.reconciliation?.matchesRpcGapCount !== true) throw new Error('The Phase 2 manifest does not describe this complete staging gap set.')

let approval = null
if (scope === 'approved') {
  if (!allowlistPath || !existsSync(allowlistPath)) throw new Error('An approval allowlist is required for approved scope.')
  approval = JSON.parse(readFileSync(allowlistPath, 'utf8'))
  if (approval.manifestFingerprint !== manifestFingerprint) throw new Error('The allowlist is not bound to the current Phase 2 manifest.')
  if (!text(approval.approvedBy) || !text(approval.approvedAt)) throw new Error('The allowlist requires an accountable approver and timestamp.')
}

const eligibleEntries = manifest.entries.filter((entry) => entry.currentStageValid && entry.decision !== 'manual_review')
const requestedKeys = scope === 'seeded-demo'
  ? [...new Set(eligibleEntries.filter((entry) => entry.matterClass === 'seeded_demo' && entry.decision === 'demo_automatic_candidate').map((entry) => entry.recordKey))]
  : [...new Set(approval.approvedRecordKeys || [])]
if (!requestedKeys.length) throw new Error('The selected scope contains no approved record keys.')
if (requestedKeys.length > batchLimit) throw new Error(`The selected scope has ${requestedKeys.length} transactions, above the explicit limit of ${batchLimit}.`)
for (const recordKey of requestedKeys) {
  if (!eligibleEntries.some((entry) => entry.recordKey === recordKey)) throw new Error(`Record key ${recordKey} is absent, invalid, or requires manual review.`)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const transactions = await db.from('transactions').select('id,is_active,lifecycle_state,is_demo_data,demo_metadata')
if (transactions.error) throw transactions.error
const redactedKey = (transactionId) => createHash('sha256').update(`${projectRef}:${transactionId}`).digest('hex').slice(0, 16)
const transactionByKey = new Map((transactions.data || []).map((transaction) => [redactedKey(transaction.id), transaction]))
const targets = requestedKeys.map((recordKey) => ({ recordKey, transaction: transactionByKey.get(recordKey) }))
if (targets.some((target) => !target.transaction?.id)) throw new Error('At least one approved record key no longer resolves to a transaction.')
if (scope === 'seeded-demo' && targets.some(({ transaction }) => transaction.is_demo_data !== true || transaction.demo_metadata?.seedKey !== 'attorney-demo-full-workflows-v1')) {
  throw new Error('Seeded-demo scope resolved a transaction outside the canonical fixture set.')
}

async function healthFor(transactionId = null) {
  const result = await db.rpc('bridge_transaction_progress_propagation_health_phase6', { p_transaction_id: transactionId, p_stale_seconds: 120 })
  if (result.error) throw result.error
  return result.data || {}
}

const beforeGlobal = await healthFor()
if (Number(beforeGlobal.gapCount || 0) !== Number(manifest.sourceHealth?.gapCount || 0)) throw new Error('Propagation health changed after classification; regenerate Phase 2 before reconciliation.')
const results = []
for (const target of targets) {
  const before = await healthFor(target.transaction.id)
  let after = before
  let repaired = 0
  if (apply) {
    const result = await db.rpc('bridge_reconcile_transaction_progress_phase6', {
      p_transaction_id: target.transaction.id,
      p_limit: 10,
      p_source: `attorney_phase3_${manifestFingerprint.slice(0, 12)}`,
    })
    if (result.error) throw result.error
    after = result.data || {}
    repaired = Number(after.repairs?.total || 0)
  }
  results.push({
    recordKey: target.recordKey,
    matterClass: target.transaction.is_demo_data === true ? 'demo' : 'genuine',
    beforeGapCount: Number(before.gapCount || 0),
    afterGapCount: Number(after.gapCount || 0),
    repaired,
    idempotentCandidate: Number(after.gapCount || 0) === 0,
  })
}
const afterGlobal = apply ? await healthFor() : beforeGlobal
const receiptCore = {
  version: 'attorney-propagation-reconciliation-phase3-v1',
  mode: apply ? 'apply' : 'dry_run',
  environment: 'staging',
  projectRef,
  manifestFingerprint,
  scope,
  batchLimit,
  targetCount: targets.length,
  beforeGlobal: { status: beforeGlobal.status, gapCount: Number(beforeGlobal.gapCount || 0), counts: beforeGlobal.counts || {} },
  afterGlobal: { status: afterGlobal.status, gapCount: Number(afterGlobal.gapCount || 0), counts: afterGlobal.counts || {} },
  results,
  controls: {
    transactionSpecificRpcOnly: true,
    clientVisibleMutationAllowed: false,
    rawTransactionIdsIncluded: false,
    maximumBatchSize: 10,
  },
}
const receiptFingerprint = createHash('sha256').update(JSON.stringify(receiptCore)).digest('hex')
const receipt = { ...receiptCore, receiptFingerprint, createdAt: new Date().toISOString() }
const serializedReceipt = JSON.stringify(receipt)
if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serializedReceipt)) throw new Error('A raw UUID reached the reconciliation receipt.')
mkdirSync(dirname(receiptPath), { recursive: true })
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ phase: 3, mode: receipt.mode, status: apply ? 'APPLIED' : 'DRY_RUN_READY', receiptPath, receiptFingerprint, targetCount: targets.length, beforeGapCount: receipt.beforeGlobal.gapCount, afterGapCount: receipt.afterGlobal.gapCount, proposedOrRepaired: results.reduce((sum, item) => sum + (apply ? item.repaired : item.beforeGapCount), 0) }, null, 2))
