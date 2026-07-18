import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentCohortContinuationPayload } from '../src/core/documents/legalDocumentCohortContinuationRecord.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-cohort-continuation.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_O1_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-n4-continuation-gate.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_300_000, maxBuffer: 30 * 1024 * 1024 })
let n4
try { n4 = JSON.parse(run.stdout) } catch { n4 = { status: 'UNAVAILABLE', ready: false, decision: 'HALT_AND_DEACTIVATE' } }
const claimState = JSON.parse(fs.readFileSync('config/legal-document-release-claim.json', 'utf8'))
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const claim = claimState.claim
const apply = process.argv.includes('--apply')
const blockers = [...(n4.blockers || [])]
const expectedIds = [...new Set(claim?.releaseTarget?.organisationIds || [])].sort()
const confirmedIds = [...new Set(arg('confirm-organisation-ids').split(',').map((value) => value.trim()).filter(Boolean))].sort()
if (n4.status !== 'READY_FOR_O1' || n4.ready !== true || n4.decision !== 'CONTINUE_CONTROLLED_COHORT') blockers.push({ code: 'O1_N4_NOT_READY', solution: 'Resolve N4 before recording cohort continuation.' })
if (!arg('recorded-by')) blockers.push({ code: 'O1_OPERATOR_MISSING', solution: 'Supply --recorded-by with the accountable continuation operator.' })
if (!arg('reference')) blockers.push({ code: 'O1_REFERENCE_MISSING', solution: 'Supply --reference with the continuation/change record.' })
if (arg('confirm-environment') !== claim?.releaseTarget?.environment) blockers.push({ code: 'O1_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact claimed environment.' })
if (arg('confirm-project-ref') !== claim?.releaseTarget?.projectRef) blockers.push({ code: 'O1_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact claimed project ref.' })
if (confirmedIds.join(',') !== expectedIds.join(',')) blockers.push({ code: 'O1_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact sorted claimed cohort.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'O1_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for continuation writes.` })
const alreadyRecorded = [state.record, ...(state.history || [])].some((row) => row?.sourceClaimDigest && row.sourceClaimDigest === claim?.claimDigest)
if (alreadyRecorded) blockers.push({ code: 'O1_CLAIM_ALREADY_RECORDED', solution: 'Use the existing continuation record; one claim cannot authorize multiple continuation records.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentCohortContinuationPayload({ n4, claim: claim || {}, recordedBy: arg('recorded-by'), continuationReference: arg('reference') })
const record = { ...payload, recordDigest: digest(payload) }
const report = { phase: 'O1', action: 'record_continuation', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'RECORDED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, record: unique.length ? null : record, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'recorded', record, history: [...(state.history || []), ...(state.record ? [state.record] : [])] }
  const temporaryPath = `${STATE_PATH}.o1.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
