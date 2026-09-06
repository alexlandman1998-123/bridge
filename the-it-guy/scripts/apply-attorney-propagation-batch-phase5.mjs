#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const text = (value) => String(value || '').trim()
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const apply = process.argv.includes('--apply')
const matterClass = option('--matter-class') || 'genuine'
const batchLimit = Number(option('--limit') || 10)
const approvedBy = text(option('--approved-by'))
const approvalReference = text(option('--approval-reference'))
const manifestPath = resolve(projectRoot, option('--manifest') || 'output/attorney-release/phase2-propagation-classification.json')
const ledgerPath = resolve(projectRoot, option('--ledger') || 'output/attorney-release/phase5-controlled-batch-ledger.json')
const projectRef = text(process.env.SUPABASE_STAGING_PROJECT_REF)

assertAttorneyStagingTarget({
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  expectedProjectRef: projectRef,
  productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
  environment: 'staging',
  recoveryConfirmation: process.env.SUPABASE_STAGING_RECOVERY_CONFIRMED,
  requireRecovery: apply,
})
if (!['genuine', 'other_demo'].includes(matterClass)) throw new Error('Matter class must be genuine or other_demo.')
if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 10) throw new Error('Phase 5 batches must contain between one and ten transactions.')
if (!approvedBy || !approvalReference) throw new Error('An explicit approver and approval reference are required.')
if (!existsSync(manifestPath)) throw new Error('The current Phase 2 manifest is required.')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const { manifestFingerprint, generatedAt, ...manifestCore } = manifest
if (createHash('sha256').update(JSON.stringify(manifestCore)).digest('hex') !== manifestFingerprint) throw new Error('The Phase 2 manifest fingerprint is invalid.')
const approvedRecordKeys = [...new Set(manifest.entries
  .filter((entry) => entry.matterClass === matterClass && entry.decision === 'allowlisted_automatic_candidate' && entry.currentStageValid)
  .map((entry) => entry.recordKey))]
  .slice(0, batchLimit)
if (!approvedRecordKeys.length) throw new Error(`No ${matterClass} candidates remain in the current manifest.`)

const batchKey = createHash('sha256').update(`${manifestFingerprint}:${matterClass}:${approvedRecordKeys.join(',')}`).digest('hex').slice(0, 12)
const allowlistPath = resolve(projectRoot, `output/attorney-release/phase5-allowlist-${batchKey}.json`)
const receiptPath = resolve(projectRoot, `output/attorney-release/phase5-${apply ? 'apply' : 'dry-run'}-${batchKey}.json`)
const allowlist = { manifestFingerprint, approvedBy, approvedAt: new Date().toISOString(), approvalReference, matterClass, approvedRecordKeys }
mkdirSync(dirname(allowlistPath), { recursive: true })
writeFileSync(allowlistPath, `${JSON.stringify(allowlist, null, 2)}\n`, { mode: 0o600 })

const reconcileArgs = [
  'scripts/reconcile-attorney-propagation-phase3.mjs',
  `--manifest=${manifestPath}`,
  `--allowlist=${allowlistPath}`,
  `--limit=${batchLimit}`,
  `--receipt=${receiptPath}`,
]
if (apply) reconcileArgs.push('--apply')
const reconciliation = spawnSync(process.execPath, reconcileArgs, { cwd: projectRoot, env: process.env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
if (reconciliation.status !== 0) throw new Error(`Guarded reconciliation failed: ${(reconciliation.stderr || reconciliation.stdout).trim()}`)
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
const repairedCount = receipt.results.reduce((sum, item) => sum + Number(item.repaired || 0), 0)
const observedReduction = Number(receipt.beforeGlobal.gapCount) - Number(receipt.afterGlobal.gapCount)
if (apply && (repairedCount !== observedReduction || receipt.results.some((item) => item.afterGapCount !== 0))) throw new Error('Batch verification failed: repairs do not match the observed zero-gap result.')
if (!apply && receipt.beforeGlobal.gapCount !== receipt.afterGlobal.gapCount) throw new Error('Dry-run unexpectedly changed propagation health.')

let nextManifestFingerprint = manifestFingerprint
if (apply) {
  const classification = spawnSync(process.execPath, ['scripts/classify-attorney-propagation-gaps-phase2.mjs'], { cwd: projectRoot, env: process.env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  if (classification.status !== 0) throw new Error(`Post-batch classification failed: ${(classification.stderr || classification.stdout).trim()}`)
  nextManifestFingerprint = JSON.parse(readFileSync(manifestPath, 'utf8')).manifestFingerprint
}

const previousLedger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { version: 'attorney-propagation-controlled-batches-phase5-v1', environment: 'staging', projectRef, batches: [] }
if (previousLedger.projectRef !== projectRef) throw new Error('The existing Phase 5 ledger belongs to another project.')
const batch = {
  batchKey,
  mode: apply ? 'apply' : 'dry_run',
  matterClass,
  manifestFingerprint,
  nextManifestFingerprint,
  approval: { approvedBy, approvalReference },
  targetCount: approvedRecordKeys.length,
  beforeGapCount: Number(receipt.beforeGlobal.gapCount),
  afterGapCount: Number(receipt.afterGlobal.gapCount),
  repairedCount,
  receiptFingerprint: receipt.receiptFingerprint,
  completedAt: new Date().toISOString(),
}
const ledgerCore = { ...previousLedger, batches: [...previousLedger.batches.filter((item) => item.batchKey !== batchKey || item.mode !== batch.mode), batch] }
delete ledgerCore.ledgerFingerprint
delete ledgerCore.updatedAt
const ledgerFingerprint = createHash('sha256').update(JSON.stringify(ledgerCore)).digest('hex')
const ledger = { ...ledgerCore, ledgerFingerprint, updatedAt: new Date().toISOString() }
writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ phase: 5, status: apply ? 'BATCH_APPLIED' : 'BATCH_DRY_RUN', matterClass, batchKey, targetCount: batch.targetCount, repairedCount, beforeGapCount: batch.beforeGapCount, afterGapCount: batch.afterGapCount, nextManifestFingerprint, ledgerPath, ledgerFingerprint }, null, 2))
