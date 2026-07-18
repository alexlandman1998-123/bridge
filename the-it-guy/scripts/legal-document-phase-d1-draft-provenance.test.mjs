import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessGeneratedDraftVersion, buildDraftLegalProvenance } from '../src/core/documents/draftGenerationAssurance.js'

const template = { id: 'template-1', metadata_json: { legal_approval_content_digest: 'sha256:content', legal_counsel_review_evidence_digest: 'sha256:evidence', legal_b1_manifest_digest: 'sha256:manifest', legal_approved_at: '2026-07-17T10:00:00.000Z' } }
const packet = { id: 'packet-1', packet_type: 'mandate', template_id: 'template-1' }
const provenance = { templateId: 'template-1', templateVersion: 'v1', generatedAt: '2026-07-17T11:00:00.000Z', sectionManifestHash: 'fnv1a_a', placeholderHash: 'fnv1a_b', generationPayloadHash: 'fnv1a_c', contentFingerprint: 'fnv1a_d', ...buildDraftLegalProvenance(template) }
const version = { id: 'version-1', render_status: 'generated', rendered_file_path: 'packet/draft.docx', placeholders_missing_json: [], generated_at: provenance.generatedAt, validation_summary_json: { generationStatus: 'generated', previewOnly: false, render_provenance: provenance } }
assert.equal(assessGeneratedDraftVersion({ packet, template, version }).ready, true)
assert.ok(assessGeneratedDraftVersion({ packet, template, version: { ...version, placeholders_missing_json: ['seller_name'] } }).reasons.includes('D1_UNRESOLVED_PLACEHOLDERS'))
assert.ok(assessGeneratedDraftVersion({ packet, template: { ...template, metadata_json: { ...template.metadata_json, legal_approval_content_digest: 'sha256:changed' } }, version }).reasons.includes('D1_LEGAL_CONTENT_BINDING_MISSING'))
assert.ok(assessGeneratedDraftVersion({ packet, template, version: { ...version, generated_at: '2026-07-17T09:00:00.000Z' } }).reasons.includes('D1_DRAFT_PREDATES_APPROVAL'))

const service = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const assurance = fs.readFileSync('src/core/documents/draftGenerationAssurance.js', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-d1-verify.mjs', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const key of ['legalApprovalContentDigest', 'legalCounselReviewEvidenceDigest', 'legalB1ManifestDigest', 'legalApprovedAt']) assert.match(assurance, new RegExp(key))
assert.match(service, /buildDraftLegalProvenance/)
assert.match(service, /assertGeneratedDraftVersion/)
assert.match(verify, /legal-document-phase-c3-verify\.mjs/)
assert.match(verify, /legal-document-phase-b3-verify\.mjs/)
assert.match(verify, /D1_CONTROLLED_DRAFT_MISSING/)
assert.match(verify, /mutatedData: false/)
assert.match(a2, /legal-document-phase-d1-verify\.mjs/)
for (const name of ['test:legal-documents-phase-d1', 'verify:legal-documents:phase-d1']) assert.ok(pkg.scripts?.[name])

console.log('Legal document D1 generated-draft provenance contract passed.')
