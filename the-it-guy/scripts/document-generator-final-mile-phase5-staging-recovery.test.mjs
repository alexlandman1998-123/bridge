import assert from 'node:assert/strict'
import fs from 'node:fs'

const dispatchPath = '../supabase/functions/dispatch-final-signed-document/index.ts'
const resolverPath = '../supabase/functions/resolve-final-signed-document-access/index.ts'
const sharedAccessPath = '../supabase/functions/_shared/finalSignedArtifactAccess.ts'
const auditPath = 'docs/audits/document-generator-final-mile-phase-5.md'
const recoveryPath = 'config/legal-document-final-mile-phase5-staging-recovery.json'
const traceHashMigrationPath = '../supabase/migrations/202607260002_corrective_phase5_lifecycle_trace_hash_format.sql'

const dispatch = fs.readFileSync(dispatchPath, 'utf8')
const resolver = fs.readFileSync(resolverPath, 'utf8')
const sharedAccess = fs.readFileSync(sharedAccessPath, 'utf8')
const audit = fs.readFileSync(auditPath, 'utf8')
const recovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'))
const traceHashMigration = fs.readFileSync(traceHashMigrationPath, 'utf8')

for (const [label, source] of [
  ['dispatcher', dispatch],
  ['resolver', resolver],
]) {
  assert.match(source, /function decodeJwtPayload/, `${label} must decode service-role JWT claims`)
  assert.match(source, /function projectRefFromSupabaseUrl/, `${label} must bind service JWTs to the current project`)
  assert.match(source, /function isServiceRoleProjectJwt/, `${label} must share the service-role project JWT gate`)
  assert.match(source, /role\) === "service_role"|text\(claims\.role\) === "service_role"/, `${label} must require service_role`)
  assert.match(source, /iss\) === "supabase"|text\(claims\.iss\) === "supabase"/, `${label} must require Supabase-issued JWTs`)
  assert.match(source, /claims\.ref\) === expectedRef|text\(claims\.ref\) === expectedRef/, `${label} must require the current project ref`)
}

assert.match(dispatch, /isServiceRoleProjectJwt\(\{ bearer, serviceKey, supabaseUrl: url \}\)/)
assert.doesNotMatch(
  dispatch,
  /req\.headers\.get\("authorization"\)\)\s*!==\s*`Bearer \$\{serviceKey\}`/,
  'dispatcher must not use exact-string-only service authority',
)

assert.equal(recovery.status, 'staging_recovery_authorized')
assert.equal(recovery.environment?.projectRef, 'isdowlnollckzvltkasn')
assert.equal(recovery.organisationId, 'ec19d0a6-bcba-4eef-aa72-9972de88204d')
assert.match(recovery.recoveryPlanDigest, /^sha256:[a-f0-9]{64}$/)
assert.equal(recovery.runtime?.LEGAL_DOCUMENT_PILOT_ENABLED, 'true')
assert.equal(recovery.runtime?.LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS, recovery.organisationId)
assert.equal(recovery.runtime?.LEGAL_DOCUMENT_PILOT_PLAN_DIGEST, recovery.recoveryPlanDigest)
assert.equal(recovery.packets?.length, 2)
for (const packet of recovery.packets) {
  assert.match(packet.packetId, /^[0-9a-f-]{36}$/)
  assert.match(packet.packetVersionId, /^[0-9a-f-]{36}$/)
  assert.match(packet.renderedDocumentId, /^[0-9a-f-]{36}$/)
  assert.match(packet.renderedSha256, /^sha256:[a-f0-9]{64}$/)
}

assert.match(traceHashMigration, /legal_document_pilot_lifecycle_traces_phase5/)
assert.match(traceHashMigration, /artifact_sha256/)
assert.match(traceHashMigration, /\^\(sha256:\)\?\[0-9a-f\]\{64\}\$/)
assert.match(sharedAccess, /isPhase5LegacyFinalDeliveryTraceExact/)
assert.match(sharedAccess, /final_delivery_completed/)
assert.match(sharedAccess, /sameSha256\(trace\.artifact_sha256, evidence\.sha256\)/)
assert.match(sharedAccess, /legal_document_pilot_lifecycle_traces_phase5/)

for (const reference of [
  'single corrective migration',
  'dispatch-final-signed-document',
  'resolve-final-signed-document-access',
  'service-role JWT rotation',
  'controlled test recipients remain suppressed',
  'existing generated artifacts are bound',
  'bare 64-char SHA-256',
  'final_delivery_completed',
]) {
  assert.ok(audit.includes(reference), `Phase 5 audit should keep: ${reference}`)
}

console.log('document-generator final-mile Phase 5 staging recovery guard passed.')
