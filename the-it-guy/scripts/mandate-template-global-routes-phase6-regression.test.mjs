import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PHASE4_B3_RELEASE_CONTRACT } from '../src/core/documents/legalTemplateApproval.js'
import {
  GLOBAL_MANDATE_ROUTE_PHASE5_ORGANISATION_ROLLOUT_VERSION,
  buildMandateGlobalRouteOrganisationRollout,
} from './mandate-template-global-routes-phase5-organisation-rollout.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION,
  buildMandateGlobalRouteCoverageAudit,
} from './mandate-template-global-routes-phase4-coverage-audit.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
  buildMandateGlobalRoutePhase3Plan,
} from './mandate-template-global-routes-phase3.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  buildRouteTemplatePayload,
  listMandateGlobalRouteTemplates,
} from './mandate-template-global-routes-phase2.mjs'

export const GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION = 'mandate_global_routes_phase6_regression_v1'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-global-routes-phase6'],
  'node scripts/mandate-template-global-routes-phase6-regression.test.mjs',
  'package.json should expose the mandate global routes Phase 6 regression test.',
)

const routes = listMandateGlobalRouteTemplates()
assert.equal(routes.length, 8, 'Phase 6 guards the exact eight mandate route variants.')
assert.deepEqual([...new Set(routes.map((route) => route.sellerProfile))].sort(), [
  'company',
  'individual',
  'individual_spouse_consent',
  'trust',
])
assert.deepEqual([...new Set(routes.map((route) => route.propertyProfile))].sort(), [
  'full_title',
  'sectional_title',
])

function digest(seed) {
  return `sha256:${String(seed).repeat(64).slice(0, 64)}`
}

function approvalMetadata({ routeKey, contentDigest, reviewEvidenceDigest, b1ManifestDigest }) {
  return {
    legal_review_status: 'approved',
    legal_approved_at: '2026-07-29T10:00:00.000Z',
    legal_approval_reference: `COUNSEL-${routeKey}`,
    legal_approved_by: 'thread:user-confirmed-counsel-approval',
    legal_approval_content_digest: contentDigest,
    legal_counsel_review_evidence_digest: reviewEvidenceDigest,
    legal_b1_manifest_digest: b1ManifestDigest,
    legal_b3_applied_at: '2026-07-29T10:00:01.000Z',
    legal_b3_applied_by: 'codex',
    legal_b3_application_reference: GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION,
    legal_phase4_b3_release_contract: PHASE4_B3_RELEASE_CONTRACT,
  }
}

const sourceTemplate = {
  id: 'source-template',
  organisation_id: null,
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_default_v1',
  template_label: 'Global Seller Mandate',
  template_format: 'structured',
  version_tag: 'source-v1',
  status: 'published',
  is_active: true,
  is_default: true,
  metadata_json: approvalMetadata({
    routeKey: 'source',
    contentDigest: digest('1'),
    reviewEvidenceDigest: digest('2'),
    b1ManifestDigest: digest('3'),
  }),
  definition_schema_version: 1,
  definition_json: { route: 'default' },
  created_at: '2026-07-29T08:00:00.000Z',
  updated_at: '2026-07-29T08:00:00.000Z',
}

const sourceSections = [
  { template_id: sourceTemplate.id, section_key: 'parties', section_label: 'Parties', section_type: 'legal_text', sort_order: 10, is_required: true, is_repeatable: false, condition_json: {}, placeholder_keys: ['seller_full_name'], legal_text: 'Universal parties', metadata_json: {} },
  { template_id: sourceTemplate.id, section_key: 'seller_individual_capacity_pack', section_label: 'Individual Seller Capacity', section_type: 'legal_text', sort_order: 20, is_required: true, is_repeatable: false, condition_json: { enabled: true }, placeholder_keys: ['seller_marital_status'], legal_text: 'Individual seller wording', metadata_json: {} },
  { template_id: sourceTemplate.id, section_key: 'seller_company_authority_pack', section_label: 'Company Authority', section_type: 'legal_text', sort_order: 30, is_required: true, is_repeatable: false, condition_json: { enabled: true }, placeholder_keys: ['seller_company_registration_number'], legal_text: 'Company wording', metadata_json: {} },
  { template_id: sourceTemplate.id, section_key: 'seller_trust_authority_pack', section_label: 'Trust Authority', section_type: 'legal_text', sort_order: 40, is_required: true, is_repeatable: false, condition_json: { enabled: true }, placeholder_keys: ['seller_trust_registration_number'], legal_text: 'Trust wording', metadata_json: {} },
  { template_id: sourceTemplate.id, section_key: 'seller_spouse_consent_pack', section_label: 'Spouse Consent', section_type: 'legal_text', sort_order: 50, is_required: true, is_repeatable: false, condition_json: { enabled: true }, placeholder_keys: ['seller_spouse_name'], legal_text: 'Spouse wording', metadata_json: {} },
  { template_id: sourceTemplate.id, section_key: 'property_full_title_pack', section_label: 'Full Title Property', section_type: 'legal_text', sort_order: 60, is_required: true, is_repeatable: false, condition_json: { enabled: true }, placeholder_keys: ['erf_number'], legal_text: 'Full title wording', metadata_json: {} },
  { template_id: sourceTemplate.id, section_key: 'property_sectional_title_pack', section_label: 'Sectional Title Property', section_type: 'legal_text', sort_order: 70, is_required: true, is_repeatable: false, condition_json: { enabled: true }, placeholder_keys: ['sectional_title_number'], legal_text: 'Sectional wording', metadata_json: {} },
  { template_id: sourceTemplate.id, section_key: 'signatures', section_label: 'Signatures', section_type: 'signature_zone', sort_order: 80, is_required: true, is_repeatable: false, condition_json: {}, placeholder_keys: [], legal_text: '', metadata_json: {} },
]

const draftRoutePayloads = routes.map((route) => ({
  ...buildRouteTemplatePayload({
    sourceTemplate,
    route,
    sourceSections,
    appliedAt: '2026-07-29T09:00:00.000Z',
    appliedBy: 'codex',
    reference: GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION,
  }),
  id: `template-${route.key}`,
  created_at: '2026-07-29T09:00:00.000Z',
  updated_at: '2026-07-29T09:00:00.000Z',
}))

const draftRouteTemplates = draftRoutePayloads.map(({ sections, ...template }) => template)
const routeSections = draftRoutePayloads.flatMap((template) => template.sections.map((section) => ({
  ...section,
  template_id: template.id,
})))

const releasePlan = buildMandateGlobalRoutePhase3Plan({
  sourceTemplate,
  routeTemplates: draftRouteTemplates,
  sourceSections,
  routeSections,
  reference: GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION,
})
assert.equal(releasePlan.status, 'READY_TO_RELEASE')

const publishedRouteTemplates = draftRouteTemplates.map((template) => {
  const target = releasePlan.targetPlans.find((item) => item.templateId === template.id)
  return {
    ...template,
    status: 'published',
    is_active: true,
    is_default: false,
    published_at: '2026-07-29T10:00:00.000Z',
    updated_at: '2026-07-29T10:00:00.000Z',
    metadata_json: {
      ...template.metadata_json,
      mandate_global_route_phase3_version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
      mandate_global_route_phase3_published_at: '2026-07-29T10:00:00.000Z',
      mandate_global_route_phase3_published_by: 'codex',
      mandate_global_route_phase3_reference: GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION,
      ...approvalMetadata({
        routeKey: target.routeKey,
        contentDigest: target.contentDigest,
        reviewEvidenceDigest: target.reviewEvidenceDigest,
        b1ManifestDigest: target.b1ManifestDigest,
      }),
    },
  }
})

const releasedPlan = buildMandateGlobalRoutePhase3Plan({
  sourceTemplate,
  routeTemplates: publishedRouteTemplates,
  sourceSections,
  routeSections,
  reference: GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION,
})
assert.equal(releasedPlan.status, 'ALREADY_RELEASED')

const provenanceRows = releasedPlan.targetPlans.map((target, index) => ({
  template_id: target.templateId,
  audit_event_id: `audit-${index}`,
  content_digest: target.contentDigest,
  review_evidence_digest: target.reviewEvidenceDigest,
  b1_manifest_digest: target.b1ManifestDigest,
  review_reference: `COUNSEL-${target.routeKey}`,
  reviewed_by: 'thread:user-confirmed-counsel-approval',
  reviewed_at: '2026-07-29T10:00:00.000Z',
  b3_applied_at: '2026-07-29T10:00:01.000Z',
  b3_applied_by: 'codex',
  b3_application_reference: GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION,
  release_contract: PHASE4_B3_RELEASE_CONTRACT,
}))

const versionRows = publishedRouteTemplates.map((template) => ({
  id: `version-${template.id}`,
  template_id: template.id,
  version_tag: GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  status: 'published',
  sections_snapshot_json: routeSections.filter((section) => section.template_id === template.id),
  placeholder_keys: ['seller_full_name'],
  metadata_json: template.metadata_json,
  published_at: '2026-07-29T10:00:00.000Z',
  updated_at: '2026-07-29T10:00:00.000Z',
}))

function buildCoverageAudit(overrides = {}) {
  return buildMandateGlobalRouteCoverageAudit({
    sourceTemplate,
    routeTemplates: publishedRouteTemplates,
    sourceSections,
    routeSections,
    provenanceRows,
    versionRows,
    reference: GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION,
    checkedAt: '2026-07-29T11:00:00.000Z',
    ...overrides,
  })
}

const coverageAudit = buildCoverageAudit()
assert.equal(coverageAudit.auditVersion, GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION)
assert.equal(coverageAudit.status, 'COVERED')
assert.equal(coverageAudit.summary.expectedRouteCount, 8)
assert.equal(coverageAudit.summary.coveredRouteCount, 8)
assert.equal(coverageAudit.summary.provenanceMatchedCount, 8)
assert.equal(coverageAudit.summary.versionSnapshotMatchedCount, 8)
assert.equal(coverageAudit.routeRows.every((row) => row.contentDigest && row.reviewEvidenceDigest && row.b1ManifestDigest), true)

const genericOrganisationTemplate = {
  id: 'org-a-generic-mandate',
  organisation_id: 'org-a',
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_default_v1',
  template_label: 'Agency Generic Mandate',
  status: 'published',
  is_active: true,
  is_default: true,
  updated_at: '2026-07-29T12:00:00.000Z',
  metadata_json: { template_scope: 'organisation' },
}

const approvedOrganisationOverride = {
  id: 'org-b-trust-sectional-title',
  organisation_id: 'org-b',
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_trust_sectional_title_custom_v1',
  template_label: 'Agency Trust Sectional Title Mandate',
  status: 'published',
  is_active: true,
  is_default: false,
  updated_at: '2026-07-29T12:00:00.000Z',
  metadata_json: {
    template_scope: 'organisation',
    mandate_template_variant: 'trust_sectional_title',
    mandate_clause_profile: 'trust_sectional_title',
    seller_clause_profile: 'trust',
    property_clause_profile: 'sectional_title',
    ...approvalMetadata({
      routeKey: 'org-b-trust-sectional-title',
      contentDigest: digest('a'),
      reviewEvidenceDigest: digest('b'),
      b1ManifestDigest: digest('c'),
    }),
  },
}

const rollout = buildMandateGlobalRouteOrganisationRollout({
  coverageAudit,
  organisations: [
    { id: 'org-a', name: 'Agency A', type: 'agency', status: 'active' },
    { id: 'org-b', name: 'Agency B', type: 'agency', status: 'active' },
    { id: 'org-c', name: 'Agency C', type: 'agency', status: 'active' },
  ],
  globalRouteTemplates: publishedRouteTemplates,
  organisationTemplates: [
    genericOrganisationTemplate,
    approvedOrganisationOverride,
  ],
  checkedAt: '2026-07-29T12:00:00.000Z',
})

assert.equal(rollout.rolloutVersion, GLOBAL_MANDATE_ROUTE_PHASE5_ORGANISATION_ROLLOUT_VERSION)
assert.equal(rollout.status, 'ROLLOUT_READY')
assert.equal(rollout.mutatedData, false)
assert.equal(rollout.summary.organisationCount, 3)
assert.equal(rollout.summary.organisationRouteCheckCount, 24)
assert.equal(rollout.summary.readyRouteCheckCount, 24)
assert.equal(rollout.summary.globalRouteSelectionCount, 23)
assert.equal(rollout.summary.organisationOverrideSelectionCount, 1)
assert.equal(rollout.summary.genericOrgTemplateBypassCount, 8)

const orgAGenericBypassed = rollout.organisationRows
  .find((row) => row.organisationId === 'org-a')
  .routeRows.every((row) => row.selectedSource === 'global_route_library')
assert.equal(orgAGenericBypassed, true, 'Generic organisation templates must not shadow route-specific global templates.')

const orgBTrustSectional = rollout.organisationRows
  .find((row) => row.organisationId === 'org-b')
  .routeRows.find((row) => row.routeKey === 'trust_sectional_title')
assert.equal(orgBTrustSectional.selectedSource, 'organisation_route_override')
assert.equal(orgBTrustSectional.selectedTemplateId, approvedOrganisationOverride.id)
assert.equal(orgBTrustSectional.selectedTemplateApproved, true)

const missingTemplateAudit = buildCoverageAudit({
  routeTemplates: publishedRouteTemplates.filter((template) => template.template_key !== 'mandate_company_full_title_v1'),
})
assert.equal(missingTemplateAudit.status, 'BLOCKED')
assert.equal(missingTemplateAudit.blockers.some((blocker) => blocker.code === 'ROUTE_TEMPLATE_MISSING'), true)

const staleVersionAudit = buildCoverageAudit({
  versionRows: versionRows.map((row) => row.template_id === 'template-individual_full_title'
    ? { ...row, version_tag: 'stale-version' }
    : row),
})
assert.equal(staleVersionAudit.status, 'BLOCKED')
assert.equal(staleVersionAudit.blockers.some((blocker) => blocker.code === 'ROUTE_VERSION_TAG_MISMATCH'), true)

const missingProvenanceAudit = buildCoverageAudit({
  provenanceRows: provenanceRows.filter((row) => row.template_id !== 'template-trust_sectional_title'),
})
assert.equal(missingProvenanceAudit.status, 'BLOCKED')
assert.equal(missingProvenanceAudit.blockers.some((blocker) => blocker.code === 'ROUTE_B3_PROVENANCE_MISSING'), true)

const driftedMetadataAudit = buildCoverageAudit({
  routeTemplates: publishedRouteTemplates.map((template) => template.template_key === 'mandate_individual_spouse_consent_sectional_title_v1'
    ? {
        ...template,
        metadata_json: {
          ...template.metadata_json,
          property_clause_profile: 'full_title',
        },
      }
    : template),
})
assert.equal(driftedMetadataAudit.status, 'BLOCKED')
assert.equal(driftedMetadataAudit.blockers.some((blocker) => blocker.code === 'ROUTE_PROPERTY_PROFILE_INVALID'), true)

const coverageBlockedRollout = buildMandateGlobalRouteOrganisationRollout({
  coverageAudit: missingProvenanceAudit,
  organisations: [{ id: 'org-a', name: 'Agency A', type: 'agency', status: 'active' }],
  globalRouteTemplates: publishedRouteTemplates,
  organisationTemplates: [],
})
assert.equal(coverageBlockedRollout.status, 'BLOCKED')
assert.equal(coverageBlockedRollout.blockers.some((blocker) => blocker.code === 'PHASE4_COVERAGE_NOT_COVERED'), true)

const unapprovedOverrideRollout = buildMandateGlobalRouteOrganisationRollout({
  coverageAudit,
  organisations: [{ id: 'org-d', name: 'Agency D', type: 'agency', status: 'active' }],
  globalRouteTemplates: publishedRouteTemplates,
  organisationTemplates: [{
    ...approvedOrganisationOverride,
    id: 'org-d-trust-sectional-title',
    organisation_id: 'org-d',
    metadata_json: {
      template_scope: 'organisation',
      mandate_template_variant: 'trust_sectional_title',
      mandate_clause_profile: 'trust_sectional_title',
      seller_clause_profile: 'trust',
      property_clause_profile: 'sectional_title',
    },
  }],
})
assert.equal(unapprovedOverrideRollout.status, 'BLOCKED')
assert.equal(unapprovedOverrideRollout.blockers.some((blocker) => blocker.code === 'ORG_ROUTE_OVERRIDE_NOT_B3_APPROVED'), true)

const phase4Source = await readFile(new URL('./mandate-template-global-routes-phase4-coverage-audit.mjs', import.meta.url), 'utf8')
const phase5Source = await readFile(new URL('./mandate-template-global-routes-phase5-organisation-rollout.mjs', import.meta.url), 'utf8')
for (const token of [
  'ROUTE_LIBRARY_CARDINALITY_CHANGED',
  'ROUTE_B3_PROVENANCE_MISSING',
  'ROUTE_VERSION_TAG_MISMATCH',
  'PHASE3_RELEASE_NOT_COMPLETE',
]) {
  assert.ok(phase4Source.includes(token), `Phase 6 regression should be backed by Phase 4 guard ${token}.`)
}
for (const token of [
  'scoreMandateTemplateCandidate',
  'selectSignableMandateRouteSelection',
  'resolveSignableTemplatePolicy',
  'ORG_ROUTE_OVERRIDE_NOT_B3_APPROVED',
  'PHASE4_COVERAGE_NOT_COVERED',
]) {
  assert.ok(phase5Source.includes(token), `Phase 6 regression should be backed by Phase 5 guard ${token}.`)
}

assert.equal(GLOBAL_MANDATE_ROUTE_PHASE6_REGRESSION_VERSION, 'mandate_global_routes_phase6_regression_v1')
assert.equal(coverageAudit.phase2Version, GLOBAL_MANDATE_ROUTE_PHASE2_VERSION)
assert.equal(coverageAudit.phase3Version, GLOBAL_MANDATE_ROUTE_PHASE3_VERSION)
assert.equal(coverageAudit.runtimeReleaseContract, PHASE4_B3_RELEASE_CONTRACT)

console.log('Mandate template global routes Phase 6 regression suite passed.')
