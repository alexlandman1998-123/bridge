import assert from 'node:assert/strict'
import fs from 'node:fs'

const mandate = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
const approvalImmutability = fs.readFileSync('../supabase/migrations/202607220007_phase4_legal_runtime_metadata_immutability.sql', 'utf8')
const releaseIntegrity = fs.readFileSync('../supabase/migrations/202607220008_phase4_legal_template_release_integrity.sql', 'utf8')
const releaseProvenance = fs.readFileSync('../supabase/migrations/202607220009_phase4_legal_release_provenance.sql', 'utf8')
const releasePersistenceFence = fs.readFileSync('../supabase/migrations/202607220011_phase4_legal_release_persistence_fence.sql', 'utf8')
const pilotRelease = fs.readFileSync('../supabase/functions/_shared/legalDocumentPilotRelease.ts', 'utf8')

for (const token of [
  'PHASE4_TEMPLATE_RELEASE_CONTRACT',
  'phase4-server-template-release-v1',
  'phase4-b3-integrity-v1',
  'assertTemplateReleaseApproved',
  'readTemplateLegalApproval',
  'TEMPLATE_NOT_PUBLISHED',
  'TEMPLATE_INACTIVE',
  'LEGAL_TEMPLATE_APPROVAL_REQUIRED',
  'LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED',
  'legal_review_status',
  'legal_approved_at',
  'legal_approval_reference',
  'legal_approval_content_digest',
  'legal_counsel_review_evidence_digest',
  'legal_revoked_at',
  'legal_b1_manifest_digest',
  'legal_b3_applied_at',
  'legal_b3_applied_by',
  'legal_b3_application_reference',
  'legal_phase4_b3_release_contract',
  'LEGAL_DOCUMENT_PILOT_DISABLED',
  'LEGAL_DOCUMENT_PILOT_ORGANISATION_NOT_ALLOWLISTED',
  'assertLegalDocumentPilotRelease',
  'LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT',
  'recordGenerationReleaseBlock',
  'legal_document_generation_blocked',
  'legal_template_approval_blocked',
  'legal_document_pilot_blocked',
  'document_packet_template_release_provenance_phase4',
]) {
  assert.ok(mandate.includes(token), `Phase 4 server guard must retain ${token}.`)
}
for (const token of [
  'LEGAL_DOCUMENT_PILOT_ENABLED',
  'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST',
  'legal-document-pilot-release-v1',
]) assert.ok(pilotRelease.includes(token), `The shared pilot release guard must retain ${token}.`)

assert.match(
  mandate,
  /normalizeText\(template\.status\)\.toLowerCase\(\) !== "published"[\s\S]*?TEMPLATE_NOT_PUBLISHED/,
  'Non-capacity generation must require a published packet template.',
)
assert.match(
  mandate,
  /document_packet_template_release_provenance_phase4[\s\S]*?matchingProvenanceAuditIds\.has\(normalizeText\(row\.id\)\)/,
  'The generator must require protected B3 provenance linked to the exact audit event.',
)
assert.match(
  mandate,
  /event_type", "legal_counsel_approval_applied"\)[\s\S]*?phase4B3ReleaseContract[\s\S]*?sameApprovalInstant\(row\.created_at, approval\.b3AppliedAt\)/,
  'The runtime B3 cache must bind to the exact service-owned audit evidence.',
)
const runtimeApprovalGuard = mandate.match(
  /async function assertTemplateReleaseApproved\([\s\S]*?\n}\n\nfunction assertDocumentPilotAllowed/,
)?.[0] || ''
assert.doesNotMatch(
  runtimeApprovalGuard,
  /\.limit\(/,
  'The B3 audit lookup must not be capped by attacker-insertable row count.',
)
assert.match(
  mandate,
  /template\.is_active !== true[\s\S]*?TEMPLATE_INACTIVE/,
  'Non-capacity generation must require an explicitly active packet template.',
)
assert.match(
  mandate,
  /approval\.status !== "approved"[\s\S]*?Boolean\(approval\.revokedAt\)[\s\S]*?LEGAL_TEMPLATE_APPROVAL_REQUIRED/,
  'Approval metadata must be current, complete, and not revoked.',
)
assert.match(
  mandate,
  /!approval\.b1ManifestDigest[\s\S]*?!approval\.b3AppliedAt[\s\S]*?!approval\.b3AppliedBy[\s\S]*?!approval\.b3ApplicationReference[\s\S]*?phase4B3ReleaseContract[\s\S]*?throw runtimeApprovalRequired/,
  'Release approval must require the B1 digest, applied B3 promotion, and the fresh Phase 4 release contract.',
)
assert.match(
  mandate,
  /enforceReleaseGate: !capacityProbe/,
  'Capacity probes must preserve their non-persisting release-gate bypass.',
)
assert.match(
  mandate,
  /async function requireApprovedMandateTemplate\(\{[\s\S]*?enforceReleaseGate[\s\S]*?\}: \{/,
  'The template gate must receive the capacity-aware release-gate flag.',
)
assert.match(
  mandate,
  /if \(packet && enforceReleaseGate\) \{[\s\S]*?assertPacketGenerationAuthority[\s\S]*?const packetTemplateId[\s\S]*?from\("document_packet_templates"\)/,
  'Normal generation must prove packet authority before inspecting template state.',
)
assert.match(
  mandate,
  /const isPhase4LegalPacket = packetType === "otp" \|\| packetType === "mandate"/,
  'Phase 4 release controls must be explicitly scoped to OTP and mandate packets.',
)
assert.match(
  mandate,
  /if \(enforceReleaseGate && isPhase4LegalPacket\) \{[\s\S]*?assertTemplateReleaseApproved/,
  'Only governed legal packets must require the B1/B3 template release approval.',
)
assert.match(
  mandate,
  /if \(!capacityProbe && approval\.isPhase4LegalPacket\) \{[\s\S]*?assertDocumentPilotAllowed/,
  'Only normal governed legal generation must pass the server pilot allowlist.',
)
assert.match(
  mandate,
  /templateId: approval\.isPhase4LegalPacket \? approval\.templateId : ""/,
  'A frozen native OTP or mandate revision must receive the packet-approved template revision.',
)
assert.match(
  mandate,
  /source\.source_template_revision_id[\s\S]*?LEGAL_TEMPLATE_SOURCE_MISMATCH/,
  'A frozen native revision must reject a source-template mismatch.',
)
assert.match(
  mandate,
  /approval\.isPhase4LegalPacket[\s\S]*?packetTransactionId[\s\S]*?PACKET_TRANSACTION_BINDING_REQUIRED[\s\S]*?persistedTransactionId = approval\.isPhase4LegalPacket/,
  'Legal persistence must use the packet transaction rather than caller input.',
)
assert.match(
  mandate,
  /persistedGeneratedByUserId = caller\.service[\s\S]*?persistedGeneratedByRole = caller\.service[\s\S]*?internalOnly: approval\.isPhase4LegalPacket/,
  'Legal drafts must derive attribution from the caller and remain internal until final publication.',
)
assert.match(
  mandate,
  /catch \(error\) \{[\s\S]*?recordGenerationReleaseBlock\(\{ supabase, requestId, context: typed\.auditContext \}\)/,
  'A safely auditable release block must be recorded without changing the block result.',
)
assert.match(
  mandate,
  /event_payload_json: eventPayload[\s\S]*?created_by: null/,
  'Blocked generation audit events must avoid attaching the caller identity.',
)
assert.doesNotMatch(
  mandate.match(/const eventPayload = \{[\s\S]*?\n  \};/)?.[0] || '',
  /email|name|templatePath|templateBucket|userId/i,
  'Blocked-generation event payloads must not contain signer or caller PII/source paths.',
)
for (const token of [
  'bridge.legal_runtime_metadata_mutation',
  'bridge_legal_runtime_metadata_transition_phase4',
  "'legal_b3_applied_at'",
  "'legal_phase4_b3_release_contract'",
  "'legal_c3_restarted_at'",
  "coalesce(auth.role(), '') = 'service_role'",
]) {
  assert.ok(approvalImmutability.includes(token), `B3/C3 compatibility migration must retain ${token}.`)
}
assert.match(
  approvalImmutability,
  /bridge_apply_legal_document_counsel_approvals[\s\S]*?set_config\('bridge\.legal_runtime_metadata_mutation', 'b3', true\)/,
  'B3 must explicitly enter the narrow runtime-metadata transition before updating a published template.',
)
assert.match(
  approvalImmutability,
  /legal_b1_manifest_digest[\s\S]*?<> v_b1_manifest_digest[\s\S]*?approval belongs to a different B1 manifest/,
  'B3 must reject a stale manifest rather than overwrite a C3 review-cycle binding.',
)
assert.match(
  approvalImmutability,
  /bridge_restart_legal_document_review_cycle[\s\S]*?set_config\('bridge\.legal_runtime_metadata_mutation', 'c3', true\)/,
  'C3 must explicitly enter the narrow runtime-metadata transition before updating a published template.',
)
assert.match(
  approvalImmutability,
  /'legal_b3_applied_at', null,[\s\S]*?'legal_b3_applied_by', null,[\s\S]*?'legal_b3_application_reference', null/,
  'C3 must clear stale B3 provenance when it binds a template to a new review cycle.',
)
assert.match(
  approvalImmutability,
  /new\.metadata_json is distinct from old\.metadata_json[\s\S]*?not v_legal_metadata_transition_allowed/,
  'The immutable-template guard must still reject every metadata mutation outside the B3/C3 exception.',
)
assert.match(
  approvalImmutability,
  /v_b1_manifest_digest := lower\(trim\(coalesce\(p_b1_manifest_digest, ''\)\)\)/,
  'B3 must normalize the B1 manifest value before comparison and persistence.',
)
assert.match(
  approvalImmutability,
  /v_reviewed_at is null[\s\S]*?not isfinite\(v_reviewed_at\)/,
  'B3 must reject missing or non-finite counsel review timestamps.',
)
assert.match(
  approvalImmutability,
  /coalesce\(jsonb_typeof\(p_approvals\), ''\) <> 'array'/,
  'B3 must reject a NULL approval batch rather than report a no-op success.',
)
assert.match(
  approvalImmutability,
  /order by value->>'templateId'/,
  'B3 must lock an approval batch in a deterministic order.',
)
assert.match(
  approvalImmutability,
  /order by template_id/,
  'C3 must lock a restart batch in a deterministic order.',
)
assert.match(
  approvalImmutability,
  /set_config\('bridge\.legal_runtime_metadata_mutation', '', true\)/,
  'B3/C3 must clear their local metadata-transition mode before returning.',
)
for (const token of [
  'bridge_guard_legal_template_release_integrity_phase4',
  'bridge_guard_legal_template_release_audit_phase4',
  'legal_phase4_b3_release_contract',
  "v_old_status = 'published' and v_new_status = 'draft'",
  "v_new_status = 'published'",
  "coalesce(auth.role(), '') = 'service_role'",
  "legal_counsel_approval_applied', 'legal_review_cycle_restarted'",
]) {
  assert.ok(releaseIntegrity.includes(token), `Phase 4 release-integrity migration must retain ${token}.`)
}
assert.match(
  releaseIntegrity,
  /v_new_status = 'published'[\s\S]*?bridge_legal_runtime_metadata_has_release_claims_phase4\(new\.metadata_json\)/,
  'A caller cannot publish a legal template carrying a forged B1/B3 approval cache.',
)
assert.match(
  releaseIntegrity,
  /bridge_legal_runtime_metadata_changed_phase4\(old\.metadata_json, new\.metadata_json\)[\s\S]*?not v_service_runtime_transition/,
  'Published legal approval metadata must be mutable only through service B3/C3.',
)
assert.match(
  releaseIntegrity,
  /new\.event_type in \('legal_counsel_approval_applied', 'legal_review_cycle_restarted'\)[\s\S]*?coalesce\(auth\.role\(\), ''\) <> 'service_role'/,
  'Caller-authored B3/C3 audit rows must be rejected.',
)
for (const token of [
  'document_packet_template_release_provenance_phase4',
  'bridge_capture_legal_template_release_provenance_phase4',
  "release_contract = 'phase4-b3-integrity-v1'",
  "coalesce(auth.role(), '') <> 'service_role'",
  'new.actor_role is distinct from \'service_role\'',
  'trg_capture_legal_template_release_provenance_phase4',
  "grant select on table public.document_packet_template_release_provenance_phase4 to service_role",
]) {
  assert.ok(releaseProvenance.includes(token), `Phase 4 protected provenance migration must retain ${token}.`)
}
assert.match(
  releaseProvenance,
  /B3 audit evidence does not match the current legal template release metadata/,
  'Protected provenance must reject audit evidence that does not match the current template metadata.',
)
for (const token of [
  'bridge_assert_legal_template_release_persistence_fence_phase4',
  'bridge_enforce_legal_document_release_persistence_fence_phase4',
  'bridge_enforce_legal_version_release_persistence_fence_phase4',
  'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED',
  'document_packet_template_release_provenance_phase4',
  'document_packet_template_audit',
  'phase4-b3-integrity-v1',
  'trg_phase4_enforce_legal_document_release_persistence_fence',
  'trg_phase4_enforce_legal_version_release_persistence_fence',
]) {
  assert.ok(releasePersistenceFence.includes(token), `Phase 4 persistence fence must retain ${token}.`)
}
const persistenceHelper = releasePersistenceFence.match(
  /create or replace function public\.bridge_assert_legal_template_release_persistence_fence_phase4\([\s\S]*?\n\$\$;/,
)?.[0] || ''
assert.match(
  persistenceHelper,
  /from public\.document_packet_templates[\s\S]*?for update[\s\S]*?document_packet_template_release_provenance_phase4[\s\S]*?join public\.document_packet_template_audit/,
  'The write-time fence must lock the current template and recheck protected provenance plus its B3 audit row in one transaction.',
)
assert.match(
  persistenceHelper,
  /v_template\.organisation_id is not null and v_template\.organisation_id is distinct from v_packet\.organisation_id[\s\S]*?provenance\.organisation_id is not distinct from v_template\.organisation_id/,
  'The persistence fence must support valid global templates while rejecting a template owned by a different organisation.',
)
assert.doesNotMatch(
  persistenceHelper,
  /auth\.role\(\)/,
  'The shared release helper must support the existing authenticated mandate/D3 write paths; caller authority belongs to their outer write contracts.',
)
assert.match(
  releasePersistenceFence,
  /bridge_enforce_legal_document_release_persistence_fence_phase4[\s\S]*?new\.legal_packet_version_id is distinct from old\.legal_packet_version_id[\s\S]*?bridge_can_access_legal_packet_h2[\s\S]*?version\.id = new\.legal_packet_version_id[\s\S]*?version\.packet_id = v_packet_id[\s\S]*?bridge_assert_legal_template_release_persistence_fence_phase4/,
  'The document fence must cover both the initial Edge link and authenticated D3 linkage, bind a supplied version to the same packet, and never bypass the release recheck.',
)
assert.match(
  releasePersistenceFence,
  /v_generated_now[\s\S]*?v_f2_evidence_changed[\s\S]*?final_signed_file_path, ''\)\), ''\) is not null[\s\S]*?new\.final_signed_file_path is distinct from old\.final_signed_file_path[\s\S]*?bridge_assert_legal_template_release_persistence_fence_phase4/,
  'The version fence must recheck release state when a draft becomes generated and before F2 writes immutable final evidence, including a future direct-final INSERT.',
)
assert.match(
  releasePersistenceFence,
  /trg_guard_\*[\s\S]*?packet-then-template order/,
  'The version fence must document the packet-then-template trigger lock order needed to avoid D3/I1 deadlocks.',
)
assert.match(
  mandate,
  /legal_packet_id: \["otp", "mandate"\]\.includes\(normalizeText\(packetType\)\.toLowerCase\(\)\) \? packetId : null/,
  'The renderer must bind its first durable legal document row to the packet so the persistence fence cannot be bypassed.',
)
assert.match(
  mandate,
  /PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED[\s\S]*?LEGAL_TEMPLATE_RELEASE_REVOKED_DURING_GENERATION/,
  'A C3 race at document persistence must return a refresh/regenerate response rather than a generic server failure.',
)
console.log('Document generator Phase 4 server release guard contract passed.')
