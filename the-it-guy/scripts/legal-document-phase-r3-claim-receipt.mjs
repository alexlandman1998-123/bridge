import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentExpandedCohortReleaseClaim } from '../src/core/documents/legalDocumentExpandedCohortReleaseClaim.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const CLAIM_PATH = 'config/legal-document-expanded-release-claim.json'
const RECEIPT_PATH = 'config/legal-document-expanded-release-receipt.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_R3_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-r2-verify-receipt.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 30 * 1024 * 1024 })
let r2
try { r2 = JSON.parse(run.stdout) } catch { r2 = { status: 'UNAVAILABLE', ready: false, blockers: [{ code: 'R3_R2_UNAVAILABLE', solution: 'Restore R2 verification before claiming a receipt.' }] } }
const receiptState = JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'))
const claimState = JSON.parse(fs.readFileSync(CLAIM_PATH, 'utf8'))
const receipt = receiptState.receipt
const apply = process.argv.includes('--apply')
const blockers = [...(r2.blockers || [])]
const expectedIds = ids((receipt?.releaseTarget?.organisationIds || []).join(','))
if (r2.status !== 'READY_FOR_R3' || r2.ready !== true) blockers.push({ code: 'R3_R2_NOT_READY', solution: 'Resolve R2 before claiming expanded-cohort authority.' })
if (!receipt?.receiptDigest) blockers.push({ code: 'R3_SOURCE_RECEIPT_MISSING', solution: 'Issue the R2 expanded-cohort receipt first.' })
if (!arg('claimed-by')) blockers.push({ code: 'R3_OPERATOR_MISSING', solution: 'Supply --claimed-by with the accountable execution operator.' })
if (!arg('execution-reference')) blockers.push({ code: 'R3_EXECUTION_REFERENCE_MISSING', solution: 'Supply --execution-reference with the deployment/change record.' })
if (arg('confirm-receipt-digest') !== receipt?.receiptDigest) blockers.push({ code: 'R3_RECEIPT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact R2 receipt digest.' })
if (arg('confirm-activation-digest') !== receipt?.sourceActivationDigest) blockers.push({ code: 'R3_ACTIVATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q2 activation digest carried by R2.' })
if (arg('confirm-environment') !== receipt?.releaseTarget?.environment) blockers.push({ code: 'R3_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact receipt environment.' })
if (arg('confirm-project-ref') !== receipt?.releaseTarget?.projectRef) blockers.push({ code: 'R3_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact receipt project ref.' })
if (ids(arg('confirm-organisation-ids')).join(',') !== expectedIds.join(',')) blockers.push({ code: 'R3_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact expanded receipt cohort.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'R3_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for claim writes.` })
const previouslyClaimed = [claimState.claim, ...(claimState.history || [])].some((row) => row?.sourceReceiptDigest && row.sourceReceiptDigest === receipt?.receiptDigest)
if (previouslyClaimed) blockers.push({ code: 'R3_RECEIPT_ALREADY_CLAIMED', solution: 'An R2 receipt is single-use; rebuild R1 and issue a new R2 receipt for another attempt.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentExpandedCohortReleaseClaim({ receipt: receipt || {}, claimedBy: arg('claimed-by'), executionReference: arg('execution-reference') })
const claim = { ...payload, claimDigest: digest(payload) }
const report = { phase: 'R3', action: 'claim_expanded_release_receipt', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'CLAIMED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, claim: unique.length ? null : claim, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'claimed', claim, history: [...(claimState.history || []), ...(claimState.claim ? [claimState.claim] : [])] }
  const temporaryPath = `${CLAIM_PATH}.r3.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, CLAIM_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
