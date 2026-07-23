import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(file, 'utf8')
const watchdog = read('../supabase/functions/legal-document-watchdog/index.ts')
const sharedFinalArtifact = read('../supabase/functions/_shared/finalSignedArtifactAccess.ts')
const pilotReleaseGuard = read('../supabase/functions/_shared/legalDocumentPilotRelease.ts')
const reconcile = read('scripts/legal-document-phase5-reconcile.mjs')
const incident = read('scripts/legal-document-phase5-acknowledge-incident.mjs')
const scale = read('scripts/legal-document-phase5-scale-gate.mjs')
const evidenceExport = read('scripts/legal-document-phase5-evidence-export.mjs')
const smoke = read('scripts/legal-document-phase5-watchdog-staging-smoke.mjs')
const docs = read('docs/legal-document-phase5-operations.md')
const pkg = JSON.parse(read('package.json'))
const scaleConfig = JSON.parse(read('config/legal-document-scale.json'))
const workflow = read('../.github/workflows/legal-document-watchdog.yml')
const supabaseConfig = read('../supabase/config.toml')
const incidentIntegrity = read('../supabase/migrations/202607220012_phase5_legal_document_health_incident_integrity.sql')

for (const token of [
  'legal_document_watchdog_started',
  'legal_document_watchdog_completed',
  'legal_document_watchdog_failed',
  'phase5-f2-f3-f4-v2',
  'LEGAL_DOCUMENT_WATCHDOG_ORGANISATION_IDS',
  'completed_at',
  'transaction_id',
  'isPhase3EvidenceExact',
  'isPublishedFinalDocumentExact',
  'final_signed_document_generated',
  'client.storage.from',
  'UNRESOLVED_GENERATION_FAILURES',
  'STALE_SIGNING_PACKETS',
  'COMPLETED_PACKET_FINAL_ARTIFACT_MISSING',
  'FINAL_ARTIFACT_EVIDENCE_MISSING',
  'FINAL_DOCUMENT_PUBLICATION_INVALID',
  'FINAL_ARTIFACT_STORAGE_MISMATCH',
  'FINAL_DELIVERY_INCOMPLETE',
  'PORTAL_PUBLICATION_MISSING',
  'FINAL_TRANSACTION_PUBLICATION_MISSING',
  'FINAL_SURFACE_COMPLETION_MISSING',
]) assert.match(watchdog, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.match(watchdog, /latestSuccessByPacket/, 'Generation failures must resolve per packet rather than globally.')
assert.doesNotMatch(watchdog, /latestSuccessAt/, 'The global-success masking algorithm must stay removed.')
for (const token of [
  'readPhase4PilotRelease',
  'LEGAL_DOCUMENT_PILOT_ENABLED',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST',
  'assessLegalDocumentPilotRelease',
  'LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT',
  'activationPlanDigest',
  'pendingDocumentVersionsQuery',
  'final_signed_document_id',
  'final_legal_packet_version_id',
]) assert.match(watchdog, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.match(
  watchdog,
  /watchdogOrganisationIds\.length !== 1[\s\S]*assessLegalDocumentPilotRelease[\s\S]*operation: "canonical_generation"[\s\S]*!decision\.allowed[\s\S]*decision\.organisationId !== watchdogOrganisationIds\[0\]/,
  'An active Phase 4 pilot must fail closed unless watchdog scope satisfies the one-organisation runtime release guard.',
)
assert.match(
  watchdog,
  /scopeByOrganisation\([\s\S]*?legal_final_artifact_evidence[\s\S]*?organisationIds/,
  'Final-artifact evidence must stay within the configured organisation scope.',
)
assert.match(
  watchdog,
  /pendingDocumentVersionsQuery[\s\S]*?final_signed_document_id[\s\S]*?\.in\("id", pendingDocumentIds\)/,
  'Pending final Documents must be resolved from organisation-scoped packet versions rather than globally.',
)
for (const token of [
  'legal-document-pilot-release-v1',
  'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST',
]) assert.match(pilotReleaseGuard, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.match(sharedFinalArtifact, /export function isPhase3EvidenceExact/)
assert.match(sharedFinalArtifact, /export function isPublishedFinalDocumentExact/)
assert.match(sharedFinalArtifact, /final_artifact_sha256/)
assert.match(sharedFinalArtifact, /final_legal_packet_version_id/)

assert.match(reconcile, /Automatic archival is disabled/)
assert.match(reconcile, /completed_at/)
assert.match(reconcile, /current_version_number/)
assert.match(reconcile, /final_signed_document_generated/)
assert.match(reconcile, /safeToArchiveIds: \[\]/)
assert.match(reconcile, /manualReviewIds/)
assert.doesNotMatch(reconcile, /client\.from\([^)]*\)\.(?:insert|update|upsert|delete)\(/)
assert.doesNotMatch(reconcile, /healthyFixtures|source_context_json\?\.fixture/)

assert.match(scale, /phase4\.exitCode !== 0 \|\| phase4\.report\?\.status !== 'GO'/)
assert.match(scale, /PILOT_TARGET_PROJECT_MISMATCH/)
assert.match(scale, /PILOT_COHORT_ACTIVATION_DRIFT/)
assert.match(scale, /WATCHDOG_CADENCE_GAP/)
assert.match(scale, /completed_at/)
assert.match(scale, /\.in\('organisation_id', cohort\)/)
assert.match(scale, /current_version_number/)
assert.match(scale, /final_signed_document_generated/)
assert.match(scale, /client\.storage\.from/)
assert.match(scale, /requiredWatchdogContract/)
assert.doesNotMatch(scale, /client\.from\([^)]*\)\.(?:insert|update|upsert|delete)\(/)
assert.equal(scaleConfig.requiredWatchdogContract, 'phase5-f2-f3-f4-v2')
assert.equal(scaleConfig.maximumWatchdogGapMinutes, 90)

assert.match(evidenceExport, /--confirm-project-ref/)
assert.match(evidenceExport, /private-evidence/)
assert.match(evidenceExport, /packetIds: 'omitted'/)
assert.match(evidenceExport, /incidentNotes: 'omitted'/)
assert.match(evidenceExport, /legal-document-phase5-manifest\.json/)
assert.match(read('.gitignore'), /private-evidence\//)

assert.match(incident, /LEGAL_DOCUMENT_INCIDENT_WRITE/)
assert.match(incident, /legal_document_incident_acknowledgement_v1/)
assert.match(incident, /--actor-id/)
assert.match(incident, /bridge_acknowledge_legal_document_incident_phase5/)
assert.doesNotMatch(incident, /\.from\('system_health_snapshots'\)\.insert\(/)
for (const token of [
  'legal_document_watchdog_v1',
  'legal_document_incident_acknowledgement_v1',
  'before insert or update or delete on public.system_health_snapshots',
  'PHASE5_LEGAL_DOCUMENT_HEALTH_SNAPSHOT_IMMUTABLE',
  'PHASE5_INCIDENT_ACK_RPC_REQUIRED',
  'legal_document_incident_acknowledgements',
  'incident_snapshot_id uuid not null references public.system_health_snapshots(id) on delete restrict',
  'acknowledgement_snapshot_id uuid not null unique references public.system_health_snapshots(id) on delete restrict',
  'acknowledged_by uuid not null references auth.users(id) on delete restrict',
  'PHASE5_LEGAL_DOCUMENT_INCIDENT_ACK_IMMUTABLE',
  'bridge_acknowledge_legal_document_incident_phase5',
  'p_actor_id uuid',
  'PHASE5_ACCOUNTABLE_ACTOR_REQUIRED',
  'grant execute on function public.bridge_acknowledge_legal_document_incident_phase5(uuid, text, text, uuid) to service_role',
]) assert.match(incidentIntegrity, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.match(incidentIntegrity, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/)
assert.match(incidentIntegrity, /char_length\(v_owner\) not between 1 and 160/)
assert.match(incidentIntegrity, /char_length\(v_note\) not between 1 and 2000/)

assert.match(workflow, /cron: '17 \* \* \* \*'/)
assert.match(workflow, /SUPABASE_STAGING_SERVICE_ROLE_KEY/)
assert.match(workflow, /--max-time 90/)
assert.match(supabaseConfig, /\[functions\.legal-document-watchdog\][\s\S]*verify_jwt = false/)
assert.match(smoke, /LEGAL_DOCUMENT_WATCHDOG_STAGING_WRITE/)
assert.match(docs, /Automatic archival is disabled/)
assert.match(docs, /phase5-f2-f3-f4-v2/)
assert.match(docs, /one canonical G3 operational evaluator/)
for (const name of [
  'test:legal-documents-phase5',
  'test:legal-documents-phase5-egress',
  'verify:legal-documents:phase5-watchdog-staging',
  'verify:legal-documents:phase5-reconcile',
  'verify:legal-documents:phase5-scale',
  'export:legal-documents:phase5-evidence',
  'acknowledge:legal-documents:phase5-incident',
]) assert.ok(pkg.scripts?.[name], `Missing ${name}`)

console.log('Legal document Phase 5 operations contract passed')
