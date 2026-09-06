#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { getAttorneyStageKeysForLane } from '../src/constants/attorneyWorkflowStages.js'
import { assertAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const text = (value) => String(value || '').trim()
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
const projectRef = text(process.env.SUPABASE_STAGING_PROJECT_REF)
const outputOption = process.argv.find((value) => value.startsWith('--output='))
const outputPath = resolve(outputOption?.slice('--output='.length) || 'output/attorney-release/phase2-propagation-classification.json')

assertAttorneyStagingTarget({
  supabaseUrl: url,
  expectedProjectRef: projectRef,
  productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
  environment: 'staging',
})
if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the read-only classification.')
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function fetchAll(table, columns) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from(table).select(columns).range(offset, offset + 999)
    if (result.error) throw new Error(`${table}: ${result.error.message}`)
    rows.push(...result.data)
    if (result.data.length < 1000) return rows
  }
}

function normalizedStatus(value) {
  const status = text(value).toLowerCase()
  if (['complete', 'completed'].includes(status)) return 'completed'
  if (status === 'blocked') return 'blocked'
  if (['waiting', 'waiting_on_party'].includes(status)) return 'waiting'
  if (['active', 'pending', 'in_progress'].includes(status)) return 'in_progress'
  return 'not_started'
}

function processKeyForLane(lane) {
  return text(lane.process_type).toLowerCase() === 'attorney' ? 'transfer' : text(lane.process_type).toLowerCase()
}

function redactedKey(transactionId) {
  return createHash('sha256').update(`${projectRef}:${transactionId}`).digest('hex').slice(0, 16)
}

function countBy(rows, key) {
  const counts = {}
  for (const row of rows) counts[row[key]] = (counts[row[key]] || 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

const [transactions, lanes, steps, sharedProgress, rpcResult] = await Promise.all([
  fetchAll('transactions', 'id,is_active,lifecycle_state,is_demo_data,demo_metadata'),
  fetchAll('transaction_subprocesses', 'id,transaction_id,process_type,current_stage,lane_status,status,updated_at,is_demo_data'),
  fetchAll('transaction_subprocess_steps', 'subprocess_id,step_key'),
  fetchAll('transaction_shared_progress', 'transaction_id,process_key,visibility,step_key,status,updated_at'),
  db.rpc('bridge_transaction_progress_propagation_health_phase6', { p_transaction_id: null, p_stale_seconds: 120 }),
])
if (rpcResult.error) throw rpcResult.error

const activeTransactions = transactions.filter((item) => item.is_active !== false && !['archived', 'cancelled'].includes(text(item.lifecycle_state).toLowerCase()))
const activeIds = new Set(activeTransactions.map(({ id }) => id))
const transactionById = new Map(activeTransactions.map((item) => [item.id, item]))
const progressByKey = new Map(sharedProgress.filter((item) => activeIds.has(item.transaction_id)).map((item) => [`${item.transaction_id}:${item.process_key}`, item]))
const stepsByLane = new Map()
for (const step of steps) {
  if (!stepsByLane.has(step.subprocess_id)) stepsByLane.set(step.subprocess_id, new Set())
  stepsByLane.get(step.subprocess_id).add(step.step_key)
}

const latestLaneByKey = new Map()
for (const lane of lanes.filter((item) => activeIds.has(item.transaction_id))) {
  const processKey = processKeyForLane(lane)
  const key = `${lane.transaction_id}:${processKey}`
  const previous = latestLaneByKey.get(key)
  if (!previous || new Date(lane.updated_at || 0) > new Date(previous.updated_at || 0)) latestLaneByKey.set(key, { ...lane, processKey })
}

const rawGaps = []
for (const transaction of activeTransactions) {
  if (!progressByKey.has(`${transaction.id}:transaction`)) rawGaps.push({ transactionId: transaction.id, processKey: 'transaction', gapType: 'missing_baseline', lane: null })
}
for (const lane of latestLaneByKey.values()) {
  if (normalizedStatus(lane.lane_status || lane.status) !== 'not_started' && !progressByKey.has(`${lane.transaction_id}:${lane.processKey}`)) {
    rawGaps.push({ transactionId: lane.transaction_id, processKey: lane.processKey, gapType: 'missing_lane_progress', lane })
  }
}

const entries = rawGaps.map((gap) => {
  const transaction = transactionById.get(gap.transactionId) || {}
  const seededDemo = transaction.is_demo_data === true && transaction.demo_metadata?.seedKey === 'attorney-demo-full-workflows-v1'
  const currentStage = text(gap.lane?.current_stage)
  const expectedStages = ['transfer', 'bond', 'cancellation'].includes(gap.processKey) ? new Set(getAttorneyStageKeysForLane(gap.processKey)) : null
  const currentStageValid = !gap.lane || !currentStage || stepsByLane.get(gap.lane.id)?.has(currentStage) === true || expectedStages?.has(currentStage) === true
  const decision = !currentStageValid
    ? 'manual_review'
    : seededDemo
      ? 'demo_automatic_candidate'
      : 'allowlisted_automatic_candidate'
  return {
    recordKey: redactedKey(gap.transactionId),
    matterClass: seededDemo ? 'seeded_demo' : transaction.is_demo_data === true ? 'other_demo' : 'genuine',
    gapType: gap.gapType,
    processKey: gap.processKey,
    expectedVisibility: 'professional_shared',
    clientRecipientsRequired: false,
    currentStageValid,
    decision,
    reason: !currentStageValid
      ? 'The lane current stage is absent from its workflow steps and requires correction before projection.'
      : seededDemo
        ? 'Deterministic demo matter with a valid source state; eligible for demo-first reconciliation.'
        : 'Valid source state, but genuine or non-canonical demo data requires explicit transaction allowlisting.',
  }
}).sort((left, right) => left.recordKey.localeCompare(right.recordKey) || left.processKey.localeCompare(right.processKey))

const rpcHealth = rpcResult.data || {}
const manifestCore = {
  version: 'attorney-propagation-classification-phase2-v1',
  environment: 'staging',
  projectRef,
  sourceHealth: {
    status: rpcHealth.status || 'unknown',
    gapCount: Number(rpcHealth.gapCount || 0),
    counts: rpcHealth.counts || {},
  },
  reconciliation: {
    classifiedGapCount: entries.length,
    matchesRpcGapCount: entries.length === Number(rpcHealth.gapCount || 0),
    byGapType: countBy(entries, 'gapType'),
    byMatterClass: countBy(entries, 'matterClass'),
    byProcessKey: countBy(entries, 'processKey'),
    byDecision: countBy(entries, 'decision'),
  },
  privacy: { rawTransactionIdsIncluded: false, clientNamesIncluded: false, clientContactsIncluded: false },
  entries,
}
const serializedManifestCore = JSON.stringify(manifestCore)
if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serializedManifestCore)) {
  throw new Error('Privacy check failed: a raw UUID reached the redacted classification manifest.')
}
const manifestFingerprint = createHash('sha256').update(serializedManifestCore).digest('hex')
const manifest = { ...manifestCore, manifestFingerprint, generatedAt: new Date().toISOString() }
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ phase: 2, status: manifestCore.reconciliation.matchesRpcGapCount ? 'CLASSIFIED' : 'MISMATCH', outputPath, manifestFingerprint, ...manifestCore.reconciliation }, null, 2))
if (!manifestCore.reconciliation.matchesRpcGapCount) process.exitCode = 1
