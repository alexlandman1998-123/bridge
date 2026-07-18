import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentExpandedCohortContinuationPayload } from '../src/core/documents/legalDocumentExpandedCohortContinuationRecord.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-expanded-cohort-continuation.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_T1_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-s4-continuation-gate.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 30 * 1024 * 1024 })
let s4
try { s4 = JSON.parse(run.stdout) } catch { s4 = { status: 'UNAVAILABLE', ready: false, decision: 'HALT_AND_DEACTIVATE', blockers: [{ code: 'T1_S4_UNAVAILABLE', solution: 'Implement and complete S4 before recording continuation.' }] } }
const claimState = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-claim.json', 'utf8'))
const activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8'))
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const claim = claimState.claim
const activation = activationState.activation
const apply = process.argv.includes('--apply')
const blockers = [...(s4.blockers || [])]
const expectedIds = ids((claim?.releaseTarget?.organisationIds || []).join(','))
if (s4.status !== 'READY_FOR_T1' || s4.ready !== true || s4.decision !== 'CONTINUE_EXPANDED_COHORT') blockers.push({ code: 'T1_S4_NOT_READY', solution: 'Resolve S4 before recording expanded-cohort continuation.' })
if (!arg('recorded-by')) blockers.push({ code: 'T1_OPERATOR_MISSING', solution: 'Supply --recorded-by with the accountable continuation operator.' })
if (!arg('reference')) blockers.push({ code: 'T1_REFERENCE_MISSING', solution: 'Supply --reference with the continuation/change record.' })
if (arg('confirm-activation-digest') !== activation?.activationDigest) blockers.push({ code: 'T1_ACTIVATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q2 activation digest.' })
if (arg('confirm-environment') !== claim?.releaseTarget?.environment) blockers.push({ code: 'T1_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact claimed environment.' })
if (arg('confirm-project-ref') !== claim?.releaseTarget?.projectRef) blockers.push({ code: 'T1_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact claimed project ref.' })
if (ids(arg('confirm-organisation-ids')).join(',') !== expectedIds.join(',')) blockers.push({ code: 'T1_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact expanded claimed cohort.' })
if (arg('confirm-added-organisation-id') !== activation?.addedOrganisationId) blockers.push({ code: 'T1_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact organisation added by Q2.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'T1_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for continuation writes.` })
if ([state.record, ...(state.history || [])].some((row) => row?.sourceClaimDigest === claim?.claimDigest)) blockers.push({ code: 'T1_CLAIM_ALREADY_RECORDED', solution: 'Use the existing continuation record; one R3 claim cannot authorize multiple records.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentExpandedCohortContinuationPayload({ s4, claim: claim || {}, activation: activation || {}, recordedBy: arg('recorded-by'), continuationReference: arg('reference') })
const record = { ...payload, recordDigest: digest(payload) }
const report = { phase: 'T1', action: 'record_expanded_continuation', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'RECORDED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, record: unique.length ? null : record, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'recorded', record, history: [...(state.history || []), ...(state.record ? [state.record] : [])] }
  const temporaryPath = `${STATE_PATH}.t1.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
