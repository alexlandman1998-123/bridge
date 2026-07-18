import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentExpandedCohortReleaseReceipt } from '../src/core/documents/legalDocumentExpandedCohortReleaseReceipt.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-expanded-release-receipt.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_R2_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-r1-release-authority.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 30 * 1024 * 1024 })
let r1
try { r1 = JSON.parse(run.stdout) } catch { r1 = { status: 'UNAVAILABLE', authorized: false, blockers: [{ code: 'R2_R1_UNAVAILABLE', solution: 'Restore R1 before issuing a receipt.' }] } }
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const authority = r1.authority
const apply = process.argv.includes('--apply')
const blockers = [...(r1.blockers || [])]
if (r1.status !== 'READY_FOR_R2' || r1.authorized !== true || !authority) blockers.push({ code: 'R2_R1_NOT_AUTHORIZED', solution: 'Resolve R1 before issuing the expanded-cohort receipt.' })
if (!arg('issued-by')) blockers.push({ code: 'R2_ISSUER_MISSING', solution: 'Supply --issued-by with the accountable release issuer.' })
if (!arg('reference')) blockers.push({ code: 'R2_REFERENCE_MISSING', solution: 'Supply --reference with the release/change record.' })
if (arg('confirm-authority-digest') !== authority?.authorityDigest) blockers.push({ code: 'R2_AUTHORITY_CONFIRMATION_MISMATCH', solution: 'Confirm the exact fresh R1 authority digest.' })
if (arg('confirm-activation-digest') !== authority?.sourceActivationDigest) blockers.push({ code: 'R2_ACTIVATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q2 activation digest carried by R1.' })
if (arg('confirm-environment') !== authority?.releaseTarget?.environment) blockers.push({ code: 'R2_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact R1 release environment.' })
if (arg('confirm-project-ref') !== authority?.releaseTarget?.projectRef) blockers.push({ code: 'R2_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact R1 release project ref.' })
if (ids(arg('confirm-organisation-ids')).join(',') !== ids((authority?.releaseTarget?.organisationIds || []).join(',')).join(',')) blockers.push({ code: 'R2_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact expanded organisation cohort.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'R2_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for receipt writes.` })
const existingExpiry = Date.parse(state.receipt?.expiresAt || '')
if (state.status === 'issued' && Number.isFinite(existingExpiry) && existingExpiry > Date.now()) blockers.push({ code: 'R2_UNEXPIRED_RECEIPT_EXISTS', solution: 'Use the existing receipt; R2 never overwrites live authority.' })
if ([state.receipt, ...(state.history || [])].some((row) => row?.sourceAuthorityDigest === authority?.authorityDigest)) blockers.push({ code: 'R2_AUTHORITY_ALREADY_ISSUED', solution: 'Use the existing receipt; one R1 authority cannot be issued twice.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentExpandedCohortReleaseReceipt({ authority: authority || {}, issuedBy: arg('issued-by'), releaseReference: arg('reference') })
const receipt = { ...payload, receiptDigest: digest(payload) }
const report = { phase: 'R2', action: 'issue_expanded_release_receipt', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'ISSUED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, receipt: unique.length ? null : receipt, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'issued', receipt, history: [...(state.history || []), ...(state.receipt ? [state.receipt] : [])] }
  const temporaryPath = `${STATE_PATH}.r2.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
