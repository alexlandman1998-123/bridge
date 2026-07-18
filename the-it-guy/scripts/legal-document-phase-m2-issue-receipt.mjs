import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentReleaseReceiptPayload, canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const CONFIG_PATH = 'config/legal-document-release-receipt.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_M2_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-m1-release-authority.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 800_000, maxBuffer: 30 * 1024 * 1024 })
let m1
try { m1 = JSON.parse(run.stdout) } catch { m1 = { status: 'UNAVAILABLE', authorized: false, blockers: [{ code: 'M2_M1_UNAVAILABLE' }] } }
const state = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
const apply = process.argv.includes('--apply')
const blockers = [...(m1.blockers || [])]
const target = m1.releaseTarget || {}
const confirmedIds = [...new Set(arg('confirm-organisation-ids').split(',').map((value) => value.trim()).filter(Boolean))].sort()
const targetIds = [...new Set(target.organisationIds || [])].sort()
if (m1.status !== 'READY_FOR_M2' || m1.authorized !== true) blockers.push({ code: 'M2_M1_NOT_AUTHORIZED', solution: 'Resolve M1 before issuing a release receipt.' })
if (!arg('issued-by')) blockers.push({ code: 'M2_ISSUER_MISSING', solution: 'Supply --issued-by with the accountable release owner.' })
if (!arg('reference')) blockers.push({ code: 'M2_RELEASE_REFERENCE_MISSING', solution: 'Supply --reference with the release or change record.' })
if (arg('confirm-environment') !== target.environment) blockers.push({ code: 'M2_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact M1 release environment.' })
if (arg('confirm-project-ref') !== target.projectRef) blockers.push({ code: 'M2_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact M1 release project ref.' })
if (confirmedIds.join(',') !== targetIds.join(',')) blockers.push({ code: 'M2_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact sorted M1 organisation cohort.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'M2_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for receipt writes.` })
const existingExpiry = Date.parse(state.receipt?.expiresAt || '')
if (state.status === 'issued' && Number.isFinite(existingExpiry) && existingExpiry > Date.now()) blockers.push({ code: 'M2_UNEXPIRED_RECEIPT_EXISTS', solution: 'Use the existing receipt or wait for it to expire; M2 never overwrites live authority.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const m1Digest = digest({ status: m1.status, authorized: m1.authorized, releaseTarget: m1.releaseTarget, evidence: m1.evidence, checkedAt: m1.checkedAt })
const payload = buildLegalDocumentReleaseReceiptPayload({ m1, issuedBy: arg('issued-by'), releaseReference: arg('reference'), m1Digest })
const receipt = { ...payload, receiptDigest: digest(payload) }
const report = { phase: 'M2', action: 'issue_receipt', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'ISSUED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, receipt: unique.length ? null : receipt, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'issued', receipt, history: [...(state.history || []), ...(state.receipt ? [state.receipt] : [])] }
  const temporaryPath = `${CONFIG_PATH}.m2.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, CONFIG_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
