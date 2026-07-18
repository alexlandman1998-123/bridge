import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentReleaseClaimPayload } from '../src/core/documents/legalDocumentReleaseClaim.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const CLAIM_PATH = 'config/legal-document-release-claim.json'
const RECEIPT_PATH = 'config/legal-document-release-receipt.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_M3_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-m2-verify-receipt.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 900_000, maxBuffer: 30 * 1024 * 1024 })
let m2
try { m2 = JSON.parse(run.stdout) } catch { m2 = { status: 'UNAVAILABLE', ready: false } }
const receiptState = JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'))
const claimState = JSON.parse(fs.readFileSync(CLAIM_PATH, 'utf8'))
const receipt = receiptState.receipt
const apply = process.argv.includes('--apply')
const blockers = [...(m2.blockers || [])]
const expectedIds = [...new Set(receipt?.releaseTarget?.organisationIds || [])].sort()
const confirmedIds = [...new Set(arg('confirm-organisation-ids').split(',').map((value) => value.trim()).filter(Boolean))].sort()
if (m2.status !== 'READY_FOR_M3' || m2.ready !== true) blockers.push({ code: 'M3_M2_NOT_READY', solution: 'Resolve M2 before claiming release authority.' })
if (!receipt?.receiptDigest) blockers.push({ code: 'M3_SOURCE_RECEIPT_MISSING', solution: 'Issue the M2 receipt first.' })
if (!arg('claimed-by')) blockers.push({ code: 'M3_OPERATOR_MISSING', solution: 'Supply --claimed-by with the accountable release operator.' })
if (!arg('execution-reference')) blockers.push({ code: 'M3_EXECUTION_REFERENCE_MISSING', solution: 'Supply --execution-reference with the deployment/change record.' })
if (arg('confirm-environment') !== receipt?.releaseTarget?.environment) blockers.push({ code: 'M3_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact receipt environment.' })
if (arg('confirm-project-ref') !== receipt?.releaseTarget?.projectRef) blockers.push({ code: 'M3_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact receipt project ref.' })
if (confirmedIds.join(',') !== expectedIds.join(',')) blockers.push({ code: 'M3_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact sorted receipt cohort.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'M3_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for claim writes.` })
const previouslyClaimed = [claimState.claim, ...(claimState.history || [])].some((row) => row?.receiptDigest && row.receiptDigest === receipt?.receiptDigest)
if (previouslyClaimed) blockers.push({ code: 'M3_RECEIPT_ALREADY_CLAIMED', solution: 'A receipt is single-use; rebuild M1 and issue a new M2 receipt for another release attempt.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentReleaseClaimPayload({ receipt: receipt || {}, claimedBy: arg('claimed-by'), executionReference: arg('execution-reference') })
const claim = { ...payload, claimDigest: digest(payload) }
const report = { phase: 'M3', action: 'claim_receipt', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'CLAIMED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, claim: unique.length ? null : claim, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'claimed', claim, history: [...(claimState.history || []), ...(claimState.claim ? [claimState.claim] : [])] }
  const temporaryPath = `${CLAIM_PATH}.m3.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, CLAIM_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
