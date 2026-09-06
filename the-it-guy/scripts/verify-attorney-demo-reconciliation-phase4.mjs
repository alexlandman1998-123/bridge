#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ATTORNEY_RELEASE_ROLES } from '../src/constants/attorneyReleaseReadinessPhase0.js'
import { assertAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const text = (value) => String(value || '').trim()
const verifyIdempotency = process.argv.includes('--verify-idempotency')
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
const anonKey = text(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY)
const projectRef = text(process.env.SUPABASE_STAGING_PROJECT_REF)
const receiptPath = resolve('output/attorney-release/phase4-demo-apply-receipt.json')
const reportPath = resolve('output/attorney-release/phase4-demo-verification.json')

assertAttorneyStagingTarget({
  supabaseUrl: url,
  expectedProjectRef: projectRef,
  productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
  environment: 'staging',
  recoveryConfirmation: process.env.SUPABASE_STAGING_RECOVERY_CONFIRMED,
  requireRecovery: verifyIdempotency,
})
if (!serviceKey || !anonKey) throw new Error('Staging service-role and anonymous keys are required.')
if (!existsSync(receiptPath)) throw new Error('The Phase 4 demo apply receipt is required.')
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
const { receiptFingerprint, createdAt, ...receiptCore } = receipt
const calculatedReceiptFingerprint = createHash('sha256').update(JSON.stringify(receiptCore)).digest('hex')
if (receiptFingerprint !== calculatedReceiptFingerprint || receipt.mode !== 'apply' || receipt.scope !== 'seeded-demo') throw new Error('The Phase 4 apply receipt is invalid.')
if (receipt.beforeGlobal?.gapCount - receipt.afterGlobal?.gapCount !== 14 || receipt.results?.reduce((sum, item) => sum + Number(item.repaired || 0), 0) !== 14) throw new Error('The Phase 4 receipt does not prove the expected 14 repairs.')

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const seeded = await admin.from('transactions').select('id').eq('is_demo_data', true).contains('demo_metadata', { seedKey: 'attorney-demo-full-workflows-v1' })
if (seeded.error || seeded.data?.length !== 6) throw new Error(seeded.error?.message || 'Expected six canonical fixtures.')
const transactionIds = seeded.data.map(({ id }) => id)
const redactedKey = (transactionId) => createHash('sha256').update(`${projectRef}:${transactionId}`).digest('hex').slice(0, 16)

async function health(transactionId = null) {
  const result = await admin.rpc('bridge_transaction_progress_propagation_health_phase6', { p_transaction_id: transactionId, p_stale_seconds: 120 })
  if (result.error) throw result.error
  return result.data || {}
}

const fixtureHealth = []
for (const transactionId of transactionIds) fixtureHealth.push({ recordKey: redactedKey(transactionId), health: await health(transactionId) })
if (fixtureHealth.some((item) => Number(item.health.gapCount || 0) !== 0)) throw new Error('At least one canonical fixture still has a propagation gap.')

const repairedProgress = await admin.from('transaction_shared_progress').select('transaction_id,process_key,visibility,source_type').in('transaction_id', transactionIds).eq('source_type', 'phase6_reconciliation')
if (repairedProgress.error) throw repairedProgress.error
if (repairedProgress.data?.length !== 14) throw new Error(`Expected 14 repaired fixture projections, found ${repairedProgress.data?.length || 0}.`)
if (repairedProgress.data.some((item) => item.visibility !== 'professional_shared')) throw new Error('A repaired fixture projection escaped professional-only visibility.')

const actorChecks = []
for (const role of ATTORNEY_RELEASE_ROLES) {
  const email = text(process.env[`${role.envPrefix}_EMAIL`]) || `${role.key}.attorney.uat@arch9.co.za`
  const password = text(process.env[`${role.envPrefix}_PASSWORD`] || process.env.ATTORNEY_DEMO_PASSWORD)
  const actor = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const signIn = await actor.auth.signInWithPassword({ email, password })
  if (signIn.error || !signIn.data.user?.id) throw new Error(`Unable to authenticate ${role.label}.`)
  const assignments = await actor.from('transaction_attorney_assignments').select('id,attorney_role,transaction_id').eq('attorney_role', role.transactionRole).eq('is_demo_data', true)
  if (assignments.error || !assignments.data?.length) throw new Error(`${role.label} cannot read its seeded assignments.`)
  const otherAssignments = await actor.from('transaction_attorney_assignments').select('id').neq('attorney_role', role.transactionRole).eq('is_demo_data', true)
  if (otherAssignments.error) throw otherAssignments.error
  actorChecks.push({ role: role.transactionRole, authenticated: true, assignmentCount: assignments.data.length, visibleOtherRoleAssignments: otherAssignments.data?.length || 0 })
  await actor.auth.signOut()
}

const globalBeforeIdempotency = await health()
const idempotency = []
if (verifyIdempotency) {
  for (const transactionId of transactionIds) {
    const result = await admin.rpc('bridge_reconcile_transaction_progress_phase6', {
      p_transaction_id: transactionId,
      p_limit: 10,
      p_source: `attorney_phase4_idempotency_${receiptFingerprint.slice(0, 8)}`,
    })
    if (result.error) throw result.error
    idempotency.push({ recordKey: redactedKey(transactionId), repaired: Number(result.data?.repairs?.total || 0), remainingGapCount: Number(result.data?.gapCount || 0) })
  }
  if (idempotency.some((item) => item.repaired !== 0 || item.remainingGapCount !== 0)) throw new Error('Fixture reconciliation is not idempotent.')
}
const globalAfterIdempotency = await health()
if (Number(globalAfterIdempotency.gapCount || 0) !== Number(globalBeforeIdempotency.gapCount || 0)) throw new Error('Idempotency verification changed global propagation health.')

const reportCore = {
  version: 'attorney-demo-reconciliation-phase4-v1',
  environment: 'staging',
  projectRef,
  applyReceiptFingerprint: receiptFingerprint,
  status: verifyIdempotency ? 'VERIFIED_IDEMPOTENT' : 'VERIFIED_READ_ONLY',
  fixtureCount: transactionIds.length,
  repairedProjectionCount: repairedProgress.data.length,
  fixtureGapCount: fixtureHealth.reduce((sum, item) => sum + Number(item.health.gapCount || 0), 0),
  globalGapCount: Number(globalAfterIdempotency.gapCount || 0),
  repairedVisibility: [...new Set(repairedProgress.data.map((item) => item.visibility))],
  actorChecks,
  idempotency,
  privacy: { rawTransactionIdsIncluded: false, clientDataIncluded: false, credentialsIncluded: false },
}
const reportFingerprint = createHash('sha256').update(JSON.stringify(reportCore)).digest('hex')
const report = { ...reportCore, reportFingerprint, verifiedAt: new Date().toISOString() }
const serialized = JSON.stringify(report)
if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) throw new Error('A raw UUID reached the Phase 4 report.')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ phase: 4, status: report.status, reportPath, reportFingerprint, fixtureCount: report.fixtureCount, repairedProjectionCount: report.repairedProjectionCount, fixtureGapCount: report.fixtureGapCount, globalGapCount: report.globalGapCount, actorChecks, idempotentTransactionCount: idempotency.length }, null, 2))
