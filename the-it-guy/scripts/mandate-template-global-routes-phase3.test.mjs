import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildB3ApprovalBatch,
  buildMandateGlobalRoutePhase3Plan,
  buildRouteApprovalDigestPayload,
  buildRouteReleaseSet,
  buildTemplateVersionPayload,
  GLOBAL_MANDATE_ROUTE_PHASE3_REVIEW_CONTRACT,
  GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
  PHASE3_WRITE_FLAG,
} from './mandate-template-global-routes-phase3.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  listMandateGlobalRouteTemplates,
} from './mandate-template-global-routes-phase2.mjs'
import { PHASE4_B3_RELEASE_CONTRACT } from '../src/core/documents/legalTemplateApproval.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-global-routes-phase3'],
  'node scripts/mandate-template-global-routes-phase3.test.mjs',
  'package.json should expose the mandate global routes Phase 3 test.',
)
assert.equal(
  packageJson.scripts?.['publish:mandate-template-global-routes-phase3'],
  'node --env-file=.env --env-file=.env.staging.local scripts/mandate-template-global-routes-phase3.mjs',
  'package.json should expose the guarded mandate global routes Phase 3 publish command.',
)

const routes = listMandateGlobalRouteTemplates()
assert.equal(routes.length, 8, 'Phase 3 must publish the same eight mandate route variants created in Phase 2.')

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

const routeTemplates = routes.map((route) => ({
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
    mandate_global_route_phase2_applied_at: '2026-07-29T08:00:00.000Z',
    mandate_global_route_phase2_applied_by: 'codex',
    mandate_global_route_phase2_reference: 'phase2-test',
    mandate_template_variant: route.key,
    seller_clause_profile: route.sellerProfile,
    property_clause_profile: route.propertyProfile,
  },
  definition_schema_version: 1,
  definition_json: { route: route.key, status: 'draft' },
  created_at: '2026-07-29T08:00:00.000Z',
  updated_at: '2026-07-29T08:00:00.000Z',
}))

const routeSections = routeTemplates.flatMap((template) => {
  const route = routes.find((item) => template.template_key === `mandate_${item.key}_v1`)
  return sourceSections
    .filter((section) => {
      if (!section.section_key.endsWith('_pack')) return true
      return route.allowedConditionalPackKeys.includes(section.section_key)
    })
    .map((section) => ({ ...section, template_id: template.id, condition_json: section.section_key.endsWith('_pack') ? {} : section.condition_json }))
})

const individualFullTitle = routes.find((route) => route.key === 'individual_full_title')
const digestPayload = buildRouteApprovalDigestPayload({
  template: routeTemplates.find((template) => template.template_key === 'mandate_individual_full_title_v1'),
  route: individualFullTitle,
  sections: routeSections.filter((section) => section.template_id === 'template-individual_full_title'),
})
assert.equal(digestPayload.release_contract, GLOBAL_MANDATE_ROUTE_PHASE3_VERSION)
assert.equal(digestPayload.runtime_release_contract, PHASE4_B3_RELEASE_CONTRACT)
assert.equal(digestPayload.phase2_version, GLOBAL_MANDATE_ROUTE_PHASE2_VERSION)
assert.equal(digestPayload.metadata_json.legal_review_status, undefined)
assert.equal(digestPayload.metadata_json.mandate_global_route_phase2_applied_at, '2026-07-29T08:00:00.000Z')
assert.deepEqual(digestPayload.allowed_conditional_pack_keys, ['property_full_title_pack', 'seller_individual_capacity_pack'])

const releaseSet = buildRouteReleaseSet({
  sourceTemplate,
  routeTemplates,
  sourceSections,
  routeSections,
  reference: 'phase3-test',
})
assert.match(releaseSet.b1ManifestDigest, /^sha256:[0-9a-f]{64}$/)
assert.equal(releaseSet.items.length, 8)
assert.match(releaseSet.items[0].contentDigest, /^sha256:[0-9a-f]{64}$/)
assert.match(releaseSet.items[0].reviewEvidenceDigest, /^sha256:[0-9a-f]{64}$/)
assert.equal(releaseSet.items[0].reviewEvidencePayload.review_contract, GLOBAL_MANDATE_ROUTE_PHASE3_REVIEW_CONTRACT)
assert.equal(releaseSet.items[0].reviewEvidencePayload.derived_from.source_reference, 'COUNSEL-MANDATE-VNEXT-20260728')

const plan = buildMandateGlobalRoutePhase3Plan({
  sourceTemplate,
  routeTemplates,
  sourceSections,
  routeSections,
  reference: 'phase3-test',
})
assert.equal(plan.status, 'READY_TO_RELEASE')
assert.equal(plan.routeCount, 8)
assert.equal(plan.actionCount, 8)
assert.equal(plan.targetPlans.every((target) => target.action === 'publish_and_apply_b3'), true)

const approvalBatch = buildB3ApprovalBatch({
  plan,
  targetPlans: plan.targetPlans,
  appliedBy: 'codex',
  reference: 'phase3-test',
})
assert.equal(approvalBatch.length, 8)
assert.equal(approvalBatch[0].packetType, 'mandate')
assert.equal(approvalBatch[0].reviewedBy, 'thread:user-confirmed-counsel-approval')
assert.equal(approvalBatch[0].reviewedAt, '2026-07-28T19:50:52.761Z')
assert.match(approvalBatch[0].reviewReference, /^COUNSEL-MANDATE-VNEXT-20260728-ROUTE-/)

const publishedRouteTemplates = routeTemplates.map((template) => ({
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
    mandate_global_route_phase3_reference: 'phase3-test',
    legal_review_status: 'approved',
    legal_approved_at: '2026-07-28T19:50:52.761Z',
    legal_approval_reference: `${sourceTemplate.metadata_json.legal_approval_reference}-ROUTE-${template.metadata_json.mandate_template_variant.toUpperCase()}`,
    legal_approved_by: sourceTemplate.metadata_json.legal_approved_by,
    legal_approval_content_digest: plan.targetPlans.find((target) => target.templateId === template.id).contentDigest,
    legal_counsel_review_evidence_digest: plan.targetPlans.find((target) => target.templateId === template.id).reviewEvidenceDigest,
    legal_b1_manifest_digest: plan.b1ManifestDigest,
    legal_b3_applied_at: '2026-07-29T09:00:01.000Z',
    legal_b3_applied_by: 'codex',
    legal_b3_application_reference: 'phase3-test',
    legal_phase4_b3_release_contract: PHASE4_B3_RELEASE_CONTRACT,
  },
}))
const releasedPlan = buildMandateGlobalRoutePhase3Plan({
  sourceTemplate,
  routeTemplates: publishedRouteTemplates,
  sourceSections,
  routeSections,
  reference: 'phase3-test',
})
assert.equal(releasedPlan.status, 'ALREADY_RELEASED')
assert.equal(releasedPlan.targetPlans.every((target) => target.action === 'already_released'), true)

const versionPayload = buildTemplateVersionPayload({
  template: publishedRouteTemplates.find((template) => template.template_key === 'mandate_individual_full_title_v1'),
  sections: routeSections.filter((section) => section.template_id === 'template-individual_full_title'),
  appliedAt: '2026-07-29T09:00:00.000Z',
})
assert.equal(versionPayload.status, 'published')
assert.equal(versionPayload.version_tag, GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG)
assert.deepEqual(versionPayload.placeholder_keys, ['erf_number', 'seller_full_name', 'seller_marital_status'])
assert.equal(versionPayload.metadata_json.legal_phase4_b3_release_contract, PHASE4_B3_RELEASE_CONTRACT)

const badPlan = buildMandateGlobalRoutePhase3Plan({
  sourceTemplate: { ...sourceTemplate, metadata_json: {} },
  routeTemplates,
  sourceSections,
  routeSections,
  reference: 'phase3-test',
})
assert.equal(badPlan.status, 'BLOCKED')
assert.equal(badPlan.blockers.some((blocker) => blocker.code === 'SOURCE_TEMPLATE_LEGAL_APPROVAL_MISSING'), true)

const scriptSource = await readFile(new URL('./mandate-template-global-routes-phase3.mjs', import.meta.url), 'utf8')
for (const token of [
  PHASE3_WRITE_FLAG,
  '--confirm-route-count',
  'bridge_apply_legal_document_counsel_approvals',
  'publish_and_apply_b3',
  'ROUTE_TEMPLATE_APPROVAL_DIGEST_DRIFT',
]) {
  assert.ok(scriptSource.includes(token), `Phase 3 script should include ${token}.`)
}

console.log('Mandate template global routes Phase 3 contract passed.')
