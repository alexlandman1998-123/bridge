import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentProductionReleaseAuthority } from '../src/core/documents/legalDocumentProductionReleaseAuthority.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-l3-execution-gate.mjs'], {
  cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 800_000, maxBuffer: 30 * 1024 * 1024,
})
let l3
try {
  l3 = JSON.parse(run.stdout)
} catch {
  l3 = { status: 'UNAVAILABLE', gateComplete: false, mutatedData: false, evidence: { l1Status: 'UNAVAILABLE', l1MutatedData: false, l2MutatedData: false }, checkedAt: new Date(0).toISOString() }
}
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let expansionState
try { expansionState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { expansionState = { status: 'unavailable', activation: null } }
const expansionRequired = expansionState.status === 'activated' && Boolean(expansionState.activation?.activationDigest)
const q3 = expansionRequired ? runExpansionQ3() : null
const assessment = assessLegalDocumentProductionReleaseAuthority({
  l3,
  pilot,
  confirmation: {
    environment: process.env.LEGAL_DOCUMENT_RELEASE_ENVIRONMENT,
    projectRef: process.env.LEGAL_DOCUMENT_RELEASE_PROJECT_REF,
  },
  expansion: { required: expansionRequired, activationDigest: expansionState.activation?.activationDigest || null, q3 },
})

console.log(JSON.stringify({
  phase: 'M1',
  status: assessment.authorized ? 'READY_FOR_M2' : 'RELEASE_HOLD',
  authorized: assessment.authorized,
  blockerCount: assessment.blockers.length,
  blockers: assessment.blockers,
  releaseTarget: assessment.releaseTarget,
  evidenceAgeLimitMinutes: assessment.evidenceAgeLimitMinutes,
  evidence: {
    l1Status: l3.evidence?.l1Status || 'UNAVAILABLE',
    l2Status: l3.evidence?.l2Status || 'UNAVAILABLE',
    l3Status: l3.status || 'UNAVAILABLE',
    l3CurrentWave: l3.currentWave ?? null,
    coverage: l3.evidence?.coverage || { otp: false, mandate: false },
    configuredEnvironment: pilot.environment || null,
    configuredProjectRef: pilot.activation?.targetProjectRef || null,
    expansionRequired,
    q3Status: q3?.status || null,
    expansionActivationDigest: expansionState.activation?.activationDigest || null,
  },
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (!assessment.authorized) process.exitCode = 1

function runExpansionQ3() {
  const result = spawnSync(process.execPath, ['scripts/legal-document-phase-q3-verify-activation.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
  try { return JSON.parse(result.stdout) } catch { return { status: 'UNAVAILABLE', ready: false, mutatedData: false, verification: null } }
}
