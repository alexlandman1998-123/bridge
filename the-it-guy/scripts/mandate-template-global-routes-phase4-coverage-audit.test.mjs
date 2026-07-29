import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PHASE4_B3_RELEASE_CONTRACT } from '../src/core/documents/legalTemplateApproval.js'
import {
  buildMandateGlobalRoutePhase3Plan,
  GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
} from './mandate-template-global-routes-phase3.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  listMandateGlobalRouteTemplates,
} from './mandate-template-global-routes-phase2.mjs'
import {
  buildMandateGlobalRouteCoverageAudit,
  GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION,
} from './mandate-template-global-routes-phase4-coverage-audit.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-global-routes-phase4'],
  'node scripts/mandate-template-global-routes-phase4-coverage-audit.test.mjs',
  'package.json should expose the mandate global routes Phase 4 coverage audit test.',
)
assert.equal(
  packageJson.scripts?.['audit:mandate-template-global-routes-phase4'],
  'node --env-file=.env --env-file=.env.staging.local scripts/mandate-template-global-routes-phase4-coverage-audit.mjs',
  'package.json should expose the read-only mandate global routes Phase 4 live audit.',
)

const routes = listMandateGlobalRouteTemplates()
assert.equal(routes.length, 8)

const sourceTemplate = {
  id: 'source-template',
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_default_v1',
  status: 'published',
  is_active: true,
  is_default: true,
  metadata_json: {
    legal_review_status: 'approved',
    legal_approved_at: '2026-07-28T19:50:52.761Z',
    legal_approval_reference: 'COUNSEL-MANDATE-VNEXT-20260728',
    legal_approved_by: 'thread:user-confirmed-counsel-approval',
    legal_approval_content_digest: 'sha256:91924c1d5d84ca75471825a0976f9ecc463d51b38567ca0e311e4956bdcb6b65',
    legal_counsel_review_evidence_digest: 'sha256:ce5d473dd3ae79c8cd893dd51a767cfe72f578408633b3bbbbfda1153f1b7d0b',
    legal_b1_manifest_digest: 'sha256:6f080a20e1fa53b2b0485e3439263a3d80d0ecfa9ab80eadb5ed46271ab1770b',
    legal_b3_applied_at: '2026-07-28T19:51:00.000Z',
    legal_b3_applied_by: 'service_role:mandate-vnext-release',
    legal_b3_application_reference: 'B3-MANDATE-VNEXT-20260728',
    legal_phase4_b3_release_contract: PHASE4_B3_RELEASE_CONTRACT,
  },
}

const sourceSections = [
  { template_id: 'source-template', section_key: 'parties', section_label: 'Parties', section_type: 'legal_text', sort_order: 10, is_required: true, placeholder_keys: ['seller_full_name'], legal_text: 'Universal parties', metadata_json: {} },
  { template_id: 'source-template', section_key: 'seller_individual_capacity_pack', section_label: 'Individual Seller Capacity', section_type: 'legal_text', sort_order: 20, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_marital_status'], legal_text: 'Individual seller wording', metadata_json: {} },
  { template_id: 'source-template', section_key: 'seller_company_authority_pack', section_label: 'Company Authority', section_type: 'legal_text', sort_order: 30, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_company_registration_number'], legal_text: 'Company wording', metadata_json: {} },
  { template_id: 'source-template', section_key: 'seller_trust_authority_pack', section_label: 'Trust Authority', section_type: 'legal_text', sort_order: 40, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_trust_registration_number'], legal_text: 'Trust wording', metadata_json: {} },
  { template_id: 'source-template', section_key: 'seller_spouse_consent_pack', section_label: 'Spouse Consent', section_type: 'legal_text', sort_order: 50, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_spouse_name'], legal_text: 'Spouse wording', metadata_json: {} },
  { template_id: 'source-template', section_key: 'property_full_title_pack', section_label: 'Full Title Property', section_type: 'legal_text', sort_order: 60, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['erf_number'], legal_text: 'Full title wording', metadata_json: {} },
  { template_id: 'source-template', section_key: 'property_sectional_title_pack', section_label: 'Sectional Title Property', section_type: 'legal_text', sort_order: 70, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['sectional_title_number'], legal_text: 'Sectional wording', metadata_json: {} },
  { template_id: 'source-template', section_key: 'signatures', section_label: 'Signatures', section_type: 'signature_zone', sort_order: 80, is_required: true, placeholder_keys: [], legal_text: '', metadata_json: {} },
]

const draftRouteTemplates = routes.map((route) => ({
  id: `template-${route.key}`,
  organisation_id: null,
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: `mandate_${route.key}_v1`,
  template_label: `Seller Mandate - ${route.label}`,
  template_format: 'structured',
  version_tag: GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  status: 'draft',
  is_active: false,
  is_default: false,
  metadata_json: {
    template_scope: 'global_route_variant',
    mandate_global_route_phase2_version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
    mandate_template_variant: route.key,
    seller_clause_profile: route.sellerProfile,
    property_clause_profile: route.propertyProfile,
  },
  definition_schema_version: 1,
  definition_json: { route: route.key, status: 'draft' },
  created_at: '2026-07-29T08:00:00.000Z',
  updated_at: '2026-07-29T08:00:00.000Z',
}))

const routeSections = draftRouteTemplates.flatMap((template) => {
  const route = routes.find((item) => template.template_key === `mandate_${item.key}_v1`)
  return sourceSections
    .filter((section) => !section.section_key.endsWith('_pack') || route.allowedConditionalPackKeys.includes(section.section_key))
    .map((section) => ({
      ...section,
      template_id: template.id,
      condition_json: section.section_key.endsWith('_pack') ? {} : section.condition_json,
    }))
})

const releasePlan = buildMandateGlobalRoutePhase3Plan({
  sourceTemplate,
  routeTemplates: draftRouteTemplates,
  sourceSections,
  routeSections,
  reference: 'phase4-test',
})
assert.equal(releasePlan.status, 'READY_TO_RELEASE')

const publishedRouteTemplates = draftRouteTemplates.map((template) => {
  const target = releasePlan.targetPlans.find((item) => item.templateId === template.id)
  return {
    ...template,
    status: 'published',
    is_active: true,
    published_at: '2026-07-29T09:00:00.000Z',
    definition_json: { ...template.definition_json, status: 'active' },
    metadata_json: {
      ...template.metadata_json,
      mandate_global_route_phase3_version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
      mandate_global_route_phase3_published_at: '2026-07-29T09:00:00.000Z',
      mandate_global_route_phase3_published_by: 'codex',
      mandate_global_route_phase3_reference: 'phase4-test',
      legal_review_status: 'approved',
      legal_approved_at: sourceTemplate.metadata_json.legal_approved_at,
      legal_approval_reference: `${sourceTemplate.metadata_json.legal_approval_reference}-ROUTE-${target.routeKey.toUpperCase()}`,
      legal_approved_by: sourceTemplate.metadata_json.legal_approved_by,
      legal_approval_content_digest: target.contentDigest,
      legal_counsel_review_evidence_digest: target.reviewEvidenceDigest,
      legal_b1_manifest_digest: releasePlan.b1ManifestDigest,
      legal_b3_applied_at: '2026-07-29T09:00:01.000Z',
      legal_b3_applied_by: 'codex',
      legal_b3_application_reference: 'phase4-test',
      legal_phase4_b3_release_contract: PHASE4_B3_RELEASE_CONTRACT,
    },
  }
})

const releasedPlan = buildMandateGlobalRoutePhase3Plan({
  sourceTemplate,
  routeTemplates: publishedRouteTemplates,
  sourceSections,
  routeSections,
  reference: 'phase4-test',
})
assert.equal(releasedPlan.status, 'ALREADY_RELEASED')

const provenanceRows = releasedPlan.targetPlans.map((target, index) => ({
  template_id: target.templateId,
  audit_event_id: `audit-${index}`,
  content_digest: target.contentDigest,
  review_evidence_digest: target.reviewEvidenceDigest,
  b1_manifest_digest: target.b1ManifestDigest,
  review_reference: `${sourceTemplate.metadata_json.legal_approval_reference}-ROUTE-${target.routeKey.toUpperCase()}`,
  reviewed_by: sourceTemplate.metadata_json.legal_approved_by,
  reviewed_at: sourceTemplate.metadata_json.legal_approved_at,
  b3_applied_at: '2026-07-29T09:00:01.000Z',
  b3_applied_by: 'codex',
  b3_application_reference: 'phase4-test',
  release_contract: PHASE4_B3_RELEASE_CONTRACT,
}))

const versionRows = publishedRouteTemplates.map((template) => ({
  id: `version-${template.id}`,
  template_id: template.id,
  version_tag: GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  status: 'published',
  sections_snapshot_json: template.definition_json.sections || [],
  placeholder_keys: ['seller_full_name'],
  metadata_json: template.metadata_json,
  published_at: '2026-07-29T09:00:00.000Z',
  updated_at: '2026-07-29T09:00:00.000Z',
}))

const audit = buildMandateGlobalRouteCoverageAudit({
  sourceTemplate,
  routeTemplates: publishedRouteTemplates,
  sourceSections,
  routeSections,
  provenanceRows,
  versionRows,
  reference: 'phase4-test',
  checkedAt: '2026-07-29T10:00:00.000Z',
})

assert.equal(audit.auditVersion, GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION)
assert.equal(audit.status, 'COVERED')
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.expectedRouteCount, 8)
assert.equal(audit.summary.coveredRouteCount, 8)
assert.equal(audit.summary.provenanceMatchedCount, 8)
assert.equal(audit.summary.versionSnapshotMatchedCount, 8)
assert.deepEqual(audit.matrix.sellerProfiles, ['company', 'individual', 'individual_spouse_consent', 'trust'])
assert.deepEqual(audit.matrix.propertyProfiles, ['full_title', 'sectional_title'])
assert.equal(audit.routeRows.every((row) => row.status === 'covered'), true)

const missingProvenanceAudit = buildMandateGlobalRouteCoverageAudit({
  sourceTemplate,
  routeTemplates: publishedRouteTemplates,
  sourceSections,
  routeSections,
  provenanceRows: provenanceRows.slice(1),
  versionRows,
  reference: 'phase4-test',
})
assert.equal(missingProvenanceAudit.status, 'BLOCKED')
assert.equal(missingProvenanceAudit.blockers.some((blocker) => blocker.code === 'ROUTE_B3_PROVENANCE_MISSING'), true)

const wrongSectionAudit = buildMandateGlobalRouteCoverageAudit({
  sourceTemplate,
  routeTemplates: publishedRouteTemplates,
  sourceSections,
  routeSections: routeSections.filter((section) => !(section.template_id === 'template-company_full_title' && section.section_key === 'property_full_title_pack')),
  provenanceRows,
  versionRows,
  reference: 'phase4-test',
})
assert.equal(wrongSectionAudit.status, 'BLOCKED')
assert.equal(wrongSectionAudit.blockers.some((blocker) => blocker.code === 'ROUTE_SECTION_COUNT_MISMATCH'), true)

const scriptSource = await readFile(new URL('./mandate-template-global-routes-phase4-coverage-audit.mjs', import.meta.url), 'utf8')
for (const token of [
  'mutatedData: false',
  'ROUTE_B3_PROVENANCE_MISSING',
  'ROUTE_VERSION_SNAPSHOT_MISSING',
  'ROUTE_SECTION_KEYS_MISMATCH',
  'PHASE3_RELEASE_NOT_COMPLETE',
  'phase3-global-mandate-route-library',
]) {
  assert.ok(scriptSource.includes(token), `Phase 4 coverage audit should include ${token}.`)
}

console.log('Mandate template global routes Phase 4 coverage audit contract passed.')
