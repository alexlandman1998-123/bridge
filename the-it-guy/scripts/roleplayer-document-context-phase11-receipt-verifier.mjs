import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const RECEIPT_VERIFIER_CONTRACT = 'roleplayer_document_context_release_receipt_verifier_v1'
const RECEIPT_CONTRACT = 'roleplayer_document_context_release_receipt_v1'
const LAUNCH_LOCK_CONTRACT = 'roleplayer_document_context_launch_lock_v1'
const DEFAULT_RECEIPT_DIR = 'private-evidence/roleplayer-document-context-phase10'
const DEFAULT_MAX_RECEIPT_AGE_MINUTES = 120

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function getManifestDigest(manifest = {}, fileName = '') {
  return manifest.files?.find((file) => file.name === fileName)?.sha256 || ''
}

function ageMinutes(value = '', nowMs = Date.now()) {
  const valueMs = Date.parse(value)
  if (!Number.isFinite(valueMs)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.round((nowMs - valueMs) / 60000))
}

function canonicalReceiptDigest(receipt = {}) {
  const { receiptDigest, ...payload } = receipt
  return sha256(JSON.stringify(payload))
}

function resolveReceiptPaths() {
  const receiptDir = path.resolve(arg('receipt-dir') || process.env.ROLEPLAYER_CONTEXT_RECEIPT_DIR || DEFAULT_RECEIPT_DIR)
  return {
    receiptDir,
    receiptPath: path.join(receiptDir, 'roleplayer-document-context-phase10-release-receipt.json'),
    manifestPath: path.join(receiptDir, 'roleplayer-document-context-phase10-manifest.json'),
    summaryPath: path.join(receiptDir, 'roleplayer-document-context-phase10-summary.md'),
  }
}

function validateReceipt({ receiptPath, manifestPath, summaryPath, maxAgeMinutes, checkedAtMs }) {
  const blockers = []
  if (!fs.existsSync(receiptPath)) {
    blockers.push({ code: 'phase10_receipt_missing', detail: `Missing receipt file: ${receiptPath}` })
  }
  if (!fs.existsSync(manifestPath)) {
    blockers.push({ code: 'phase10_manifest_missing', detail: `Missing manifest file: ${manifestPath}` })
  }
  if (!fs.existsSync(summaryPath)) {
    blockers.push({ code: 'phase10_summary_missing', detail: `Missing summary file: ${summaryPath}` })
  }
  if (blockers.length) return { blockers, receipt: null, launchLockReport: null, manifest: null, receiptAgeMinutes: null }

  const receiptText = readText(receiptPath)
  const manifestText = readText(manifestPath)
  const summaryText = readText(summaryPath)
  const receiptFileDigest = sha256(receiptText)
  const manifestFileDigest = sha256(manifestText)
  const summaryFileDigest = sha256(summaryText)
  const receiptPayload = JSON.parse(receiptText)
  const manifest = JSON.parse(manifestText)
  const receipt = receiptPayload.receipt || {}
  const launchLockReport = receiptPayload.launchLockReport || {}
  const launchLock = launchLockReport.launchLock || {}
  const receiptAgeMinutes = ageMinutes(receipt.issuedAt, checkedAtMs)

  if (manifest.receiptContract !== RECEIPT_CONTRACT) {
    blockers.push({ code: 'phase10_manifest_contract_invalid', detail: `Expected ${RECEIPT_CONTRACT}; received ${manifest.receiptContract || 'missing'}.` })
  }
  if (manifest.mutatedData !== false) {
    blockers.push({ code: 'phase10_manifest_mutation_flag_invalid', detail: 'Manifest must declare mutatedData=false.' })
  }
  if (getManifestDigest(manifest, path.basename(receiptPath)) !== receiptFileDigest) {
    blockers.push({ code: 'phase10_receipt_file_digest_mismatch', detail: 'Manifest digest does not match the Phase 10 receipt artifact.' })
  }
  if (getManifestDigest(manifest, path.basename(summaryPath)) !== summaryFileDigest) {
    blockers.push({ code: 'phase10_summary_digest_mismatch', detail: 'Manifest digest does not match the Phase 10 summary artifact.' })
  }
  if (manifestFileDigest.length !== 64) {
    blockers.push({ code: 'phase10_manifest_digest_invalid', detail: 'Manifest digest could not be calculated.' })
  }
  if (receipt.contract !== RECEIPT_CONTRACT || receipt.status !== 'issued') {
    blockers.push({ code: 'phase10_receipt_contract_invalid', detail: `Receipt status is ${receipt.status || 'missing'} for contract ${receipt.contract || 'missing'}.` })
  }
  if (receipt.mutatedData !== false) {
    blockers.push({ code: 'phase10_receipt_mutation_flag_invalid', detail: 'Receipt must declare mutatedData=false.' })
  }
  if (receipt.receiptDigest !== manifest.receiptDigest || receipt.receiptDigest !== canonicalReceiptDigest(receipt)) {
    blockers.push({ code: 'phase10_receipt_digest_invalid', detail: 'Receipt digest is missing, stale, or hand-edited.' })
  }
  if (launchLockReport.contract !== LAUNCH_LOCK_CONTRACT || launchLockReport.locked !== true || launchLockReport.status !== 'LAUNCH_LOCKED') {
    blockers.push({ code: 'phase9_launch_lock_report_invalid', detail: `Launch lock report status is ${launchLockReport.status || 'missing'}, locked=${Boolean(launchLockReport.locked)}.` })
  }
  if (launchLock.status !== 'locked' || !launchLock.lockDigest) {
    blockers.push({ code: 'phase9_launch_lock_missing', detail: 'Embedded launch lock payload must be present and locked.' })
  }
  if (receipt.sourceLaunchLockContract !== launchLockReport.contract || receipt.sourceLaunchLockDigest !== launchLock.lockDigest) {
    blockers.push({ code: 'phase10_launch_lock_binding_invalid', detail: 'Receipt must bind to the embedded Phase 9 launch-lock digest.' })
  }
  if (manifest.sourceLaunchLockDigest !== receipt.sourceLaunchLockDigest) {
    blockers.push({ code: 'phase10_manifest_launch_lock_binding_invalid', detail: 'Manifest must bind to the same Phase 9 launch-lock digest as the receipt.' })
  }
  if (
    receipt.sourceHandoffDigest !== launchLock.sourceHandoffDigest ||
    receipt.sourceAuthorityDigest !== launchLock.sourceAuthorityDigest ||
    receipt.sourceEvidenceSha256 !== launchLock.sourceEvidenceSha256 ||
    receipt.sourceManifestSha256 !== launchLock.sourceManifestSha256
  ) {
    blockers.push({ code: 'phase10_source_chain_binding_invalid', detail: 'Receipt source digests must match the embedded launch-lock source chain.' })
  }
  for (const [key, value] of Object.entries(receipt.demoReadiness || {})) {
    if (value !== true) blockers.push({ code: 'phase10_demo_readiness_incomplete', detail: `Demo readiness ${key} must be true.` })
  }
  for (const key of ['refreshEvidence', 'refreshHandoff', 'verifyLaunchLock', 'rerunOperationalGate', 'fastPreflight']) {
    if (!receipt.operatorCommands?.[key]) blockers.push({ code: 'phase10_operator_command_missing', detail: `Missing operator command: ${key}.` })
  }
  if (
    receipt.rollbackPosture?.mutatedApplicationData !== false ||
    receipt.rollbackPosture?.databaseRollbackRequired !== false ||
    receipt.rollbackPosture?.templateRollbackRequired !== false
  ) {
    blockers.push({ code: 'phase10_rollback_posture_invalid', detail: 'Receipt requires no application-data, database, or template rollback obligation.' })
  }
  if (!receipt.receiptUse?.invalidIf?.includes('document rendering files change after receipt')) {
    blockers.push({ code: 'phase10_invalidation_policy_missing', detail: 'Receipt must declare that renderer changes invalidate the receipt.' })
  }
  if (!Number.isFinite(receiptAgeMinutes) || receiptAgeMinutes > maxAgeMinutes) {
    blockers.push({ code: 'phase10_receipt_stale', detail: `Receipt age is ${receiptAgeMinutes} minutes; limit is ${maxAgeMinutes} minutes.` })
  }

  return {
    blockers,
    receipt,
    launchLockReport,
    manifest,
    digests: {
      receiptFileSha256: receiptFileDigest,
      manifestFileSha256: manifestFileDigest,
      summaryFileSha256: summaryFileDigest,
    },
    receiptAgeMinutes,
  }
}

function main() {
  const configuredMaxAge = Number(arg('max-age-minutes') || process.env.ROLEPLAYER_CONTEXT_RECEIPT_MAX_AGE_MINUTES || DEFAULT_MAX_RECEIPT_AGE_MINUTES)
  const maxAgeMinutes = Number.isInteger(configuredMaxAge) && configuredMaxAge > 0 ? configuredMaxAge : DEFAULT_MAX_RECEIPT_AGE_MINUTES
  const checkedAt = new Date().toISOString()
  const checkedAtMs = Date.parse(checkedAt)
  const paths = resolveReceiptPaths()
  const validation = validateReceipt({ ...paths, maxAgeMinutes, checkedAtMs })
  const verified = validation.blockers.length === 0
  const verifier = verified
    ? {
      contract: RECEIPT_VERIFIER_CONTRACT,
      status: 'verified',
      verifiedAt: checkedAt,
      sourceReceiptDigest: validation.receipt.receiptDigest,
      sourceLaunchLockDigest: validation.receipt.sourceLaunchLockDigest,
      sourceHandoffDigest: validation.receipt.sourceHandoffDigest,
      sourceAuthorityDigest: validation.receipt.sourceAuthorityDigest,
      sourceEvidenceSha256: validation.receipt.sourceEvidenceSha256,
      sourceManifestSha256: validation.receipt.sourceManifestSha256,
      receiptAgeMinutes: validation.receiptAgeMinutes,
      receiptAgeLimitMinutes: maxAgeMinutes,
      releaseScope: validation.receipt.releaseScope,
      demoReadiness: validation.receipt.demoReadiness,
      operatorCommands: validation.receipt.operatorCommands,
      rollbackPosture: validation.receipt.rollbackPosture,
      mutatedData: false,
    }
    : null
  if (verifier) verifier.verifierDigest = sha256(JSON.stringify(verifier))

  console.log(JSON.stringify({
    phase: '11',
    contract: RECEIPT_VERIFIER_CONTRACT,
    status: verified ? 'RELEASE_RECEIPT_VERIFIED' : 'RELEASE_RECEIPT_HOLD',
    verified,
    blockerCount: validation.blockers.length,
    blockers: validation.blockers,
    verifier,
    evidence: {
      receiptDir: paths.receiptDir,
      receiptPath: paths.receiptPath,
      manifestPath: paths.manifestPath,
      summaryPath: paths.summaryPath,
      receiptContract: validation.receipt?.contract || null,
      launchLockStatus: validation.launchLockReport?.status || null,
      receiptAgeMinutes: validation.receiptAgeMinutes,
      receiptAgeLimitMinutes: maxAgeMinutes,
      digests: validation.digests || null,
    },
    checkedAt,
    mutatedData: false,
  }, null, 2))

  if (!verified) process.exitCode = 1
}

main()
