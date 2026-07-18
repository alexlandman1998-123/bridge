import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentNextReleaseHandoff, buildLegalDocumentNextReleaseHandoff } from '../src/core/documents/legalDocumentNextReleaseHandoff.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-v3-verify-activation.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let v3
try { v3 = JSON.parse(run.stdout) } catch { v3 = { status: 'UNAVAILABLE', ready: false, verification: null, blockers: [] } }
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const pilot = read('config/legal-document-pilot.json', {})
const activationState = read('config/legal-document-next-expansion-activation.json', { status: 'unavailable', activation: null })
const activation = activationState.activation
const configuredAge = process.env.LEGAL_DOCUMENT_PHASE_V4_MAX_VERIFICATION_AGE_MINUTES
const evidenceAgeLimitMinutes = configuredAge === undefined ? 15 : Number(configuredAge)
const configurationBlockers = []
if (!Number.isInteger(evidenceAgeLimitMinutes) || evidenceAgeLimitMinutes < 1 || evidenceAgeLimitMinutes > 60) configurationBlockers.push({ code: 'V4_EVIDENCE_AGE_LIMIT_INVALID', kind: 'stop', solution: 'Set LEGAL_DOCUMENT_PHASE_V4_MAX_VERIFICATION_AGE_MINUTES to a whole number from 1 through 60.' })
let handoff = null
if (v3.status === 'READY_FOR_V4' && v3.ready === true && v3.verification && activation?.status === 'activated' && !configurationBlockers.length) {
  const payload = buildLegalDocumentNextReleaseHandoff({ v3, activation, evidenceAgeLimitMinutes })
  handoff = { ...payload, handoffDigest: digest(payload) }
}
const assessment = assessLegalDocumentNextReleaseHandoff({ v3, handoff, activation, pilot, digest })
const blockers = [...configurationBlockers, ...assessment.blockers]
const ready = blockers.length === 0 && assessment.ready
const status = ready ? 'READY_FOR_W1' : blockers.some((row) => row.kind === 'stop') ? 'HANDOFF_BLOCKED' : 'NO_GO'
console.log(JSON.stringify({
  phase: 'V4', status, ready, blockerCount: blockers.length, blockers, handoff: ready ? handoff : null,
  evidence: {
    v3Status: v3.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', sourceVerificationDigest: v3.verification?.verificationDigest || null,
    sourceActivationDigest: activation?.activationDigest || null, organisationIds: activation?.activatedOrganisationIds || [], evidenceAgeLimitMinutes,
  },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!ready) process.exitCode = 1
