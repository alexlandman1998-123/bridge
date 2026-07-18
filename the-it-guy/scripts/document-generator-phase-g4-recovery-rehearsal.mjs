import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { assessDocumentGeneratorRecoveryRehearsal } from '../src/core/documents/documentGeneratorRecoveryRehearsal.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
function runJson(script, timeout = 420_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 30 * 1024 * 1024 })
  try { return { report: JSON.parse(String(run.stdout || '').trim()), error: null } } catch { return { report: null, error: String(run.stderr || run.stdout || `${script} returned no report.`).trim() } }
}

const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const g3Run = runJson('scripts/document-generator-phase-g3-operational-readiness.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const blockers = []
if (!g3Run.report) blockers.push({ code: 'G4_G3_CHECK_UNAVAILABLE', detail: g3Run.error, solution: 'Restore the G3 verifier before running recovery certification.' })
if (!g1Run.report) blockers.push({ code: 'G4_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the G1 controlled OTP and mandate pair used by the rehearsal.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'G4_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run the recovery rehearsal only against staging project ${STAGING_PROJECT_REF}.` })
if (!serviceKey) blockers.push({ code: 'G4_REHEARSAL_CREDENTIAL_MISSING', solution: 'Configure the staging service credential used by the read-only rehearsal endpoint.' })

const rehearsals = []
if (projectRef === STAGING_PROJECT_REF && serviceKey) for (const target of g1Run.report?.evidence || []) {
  try {
    const response = await fetch(`${url}/functions/v1/retry-final-document-completion`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify({ packetId: target.packetId, packetVersionId: target.versionId, rehearsal: true }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.success !== true) blockers.push({ code: 'G4_RECOVERY_ENDPOINT_FAILED', packetType: target.packetType, detail: body.errorCode || `HTTP_${response.status}`, solution: 'Deploy migration 202607180025 and the G4 rehearsal-enabled recovery endpoint, then retry.' })
    else rehearsals.push(body)
  } catch (error) {
    blockers.push({ code: 'G4_RECOVERY_ENDPOINT_FAILED', packetType: target.packetType, detail: error instanceof Error ? error.message : String(error), solution: 'Restore staging connectivity to the recovery endpoint and rerun G4.' })
  }
}

const assessment = assessDocumentGeneratorRecoveryRehearsal({ g3: g3Run.report || {}, rehearsals })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.packetType || ''}`, item])).values()]
const evidenceDigest = `sha256:${createHash('sha256').update(JSON.stringify(rehearsals)).digest('hex')}`
console.log(JSON.stringify({
  phase: 'G4',
  status: unique.length ? 'NO_GO' : 'READY_FOR_H1',
  ready: unique.length === 0,
  blockerCount: unique.length,
  blockers: unique,
  evidence: rehearsals.map((row) => ({ packetType: row.evidence?.packetType, packetId: row.evidence?.packetId, versionId: row.evidence?.versionId, safeToExecute: row.evidence?.safeToExecute, immutableArtifact: row.evidence?.immutableArtifact, transactionPublication: row.evidence?.transactionPublication, surfaceCompletion: row.evidence?.surfaceCompletion, actualState: row.evidence?.actualState, simulatedRecipientFailure: row.evidence?.simulatedRecipientFailure, mutatedData: row.mutatedData })),
  evidenceDigest,
  g3Status: g3Run.report?.status || 'UNAVAILABLE',
  projectRef,
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (unique.length) process.exitCode = 1
