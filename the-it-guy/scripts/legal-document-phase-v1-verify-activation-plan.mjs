import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentNextExpansionActivationPlan } from '../src/core/documents/legalDocumentNextExpansionActivationPlan.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-u3-expanded-cohort-certification.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let u3
try { u3 = JSON.parse(run.stdout) } catch { u3 = { status: 'UNAVAILABLE', ready: false, certification: null } }
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const pilot = read('config/legal-document-pilot.json', {})
const state = read('config/legal-document-next-expansion-activation-plan.json', { status: 'unavailable', plan: null })
const pendingState = read('config/legal-document-next-pending-expansion.json', { status: 'unavailable', pending: null })
const continuationState = read('config/legal-document-expanded-cohort-continuation.json', { status: 'unavailable', record: null })
const activationState = read('config/legal-document-expansion-activation.json', { status: 'unavailable', activation: null })
const assessment = assessLegalDocumentNextExpansionActivationPlan({ plan: state.plan, currentU3: u3, pending: pendingState.pending, continuation: continuationState.record, activation: activationState.activation, pilot, digest })
console.log(JSON.stringify({
  phase: 'V1', status: assessment.ready ? 'READY_FOR_V2' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  evidence: {
    planState: state.status || 'UNAVAILABLE', u3Status: u3.status || 'UNAVAILABLE', pendingState: pendingState.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE',
    currentOrganisationIds: pilot.organisationIds || [], activationTarget: state.plan?.activationTarget || null, expiresAt: state.plan?.expiresAt || null,
    effectiveAllowlistChanged: false, runtimeActivationChanged: false, runtimeSecretsChanged: false,
  },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
