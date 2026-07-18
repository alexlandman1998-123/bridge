import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentNextExpansionHandoff, buildLegalDocumentNextExpansionHandoff } from '../src/core/documents/legalDocumentNextExpansionHandoff.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-t3-expansion-proposal.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 600_000, maxBuffer: 30 * 1024 * 1024 })
let t3
try { t3 = JSON.parse(run.stdout) } catch { t3 = { status: 'UNAVAILABLE', ready: false, proposal: null, candidateAssessments: [] } }
let continuationState
let activationState
let pilot
try { continuationState = JSON.parse(fs.readFileSync('config/legal-document-expanded-cohort-continuation.json', 'utf8')) } catch { continuationState = { status: 'unavailable', record: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
try { pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8')) } catch { pilot = {} }
const continuation = continuationState.record
const activation = activationState.activation
const configuredAge = process.env.LEGAL_DOCUMENT_PHASE_T4_MAX_PROPOSAL_AGE_MINUTES
const evidenceAgeLimitMinutes = configuredAge === undefined ? 15 : Number(configuredAge)
const configurationBlockers = []
if (!Number.isInteger(evidenceAgeLimitMinutes) || evidenceAgeLimitMinutes < 1 || evidenceAgeLimitMinutes > 60) configurationBlockers.push({ code: 'T4_EVIDENCE_AGE_LIMIT_INVALID', kind: 'stop', solution: 'Set LEGAL_DOCUMENT_PHASE_T4_MAX_PROPOSAL_AGE_MINUTES to a whole number from 1 through 60.' })
let handoff = null
if (t3.status === 'READY_FOR_T4' && t3.ready === true && t3.proposal && continuation?.status === 'continued' && activation?.status === 'activated' && !configurationBlockers.length) {
  const payload = buildLegalDocumentNextExpansionHandoff({ t3, continuation, activation, evidenceAgeLimitMinutes })
  handoff = { ...payload, handoffDigest: digest(payload) }
}
const assessment = assessLegalDocumentNextExpansionHandoff({ t3, handoff, continuation, activation, pilot, digest })
const blockers = [...configurationBlockers, ...assessment.blockers]
const ready = blockers.length === 0 && assessment.ready
const status = ready ? 'READY_FOR_U1' : blockers.some((row) => row.kind === 'stop') ? 'HANDOFF_BLOCKED' : 'NO_GO'
console.log(JSON.stringify({
  phase: 'T4', status, ready, blockerCount: blockers.length, blockers,
  handoff: ready ? handoff : null,
  evidence: {
    t3Status: t3.status || 'UNAVAILABLE',
    continuationState: continuationState.status || 'UNAVAILABLE',
    activationState: activationState.status || 'UNAVAILABLE',
    sourceT3CheckedAt: t3.checkedAt || null,
    evidenceAgeLimitMinutes,
  },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!ready) process.exitCode = 1
