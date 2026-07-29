import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildMandateGlobalRouteTemplatePlan,
  buildRouteSections,
  buildRouteTemplatePayload,
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  listMandateGlobalRouteTemplates,
  WRITE_FLAG,
} from './mandate-template-global-routes-phase2.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-global-routes-phase2'],
  'node scripts/mandate-template-global-routes-phase2.test.mjs',
  'package.json should expose the mandate global routes Phase 2 test.',
)
assert.equal(
  packageJson.scripts?.['prepare:mandate-template-global-routes-phase2'],
  'node --env-file=.env --env-file=.env.staging.local scripts/mandate-template-global-routes-phase2.mjs',
  'package.json should expose the guarded mandate global routes Phase 2 prepare command.',
)

const routes = listMandateGlobalRouteTemplates()
assert.equal(routes.length, 8, 'Mandate route library should contain eight non-default route variants.')
assert.deepEqual(routes.map((route) => route.key), [
  'company_full_title',
  'company_sectional_title',
  'trust_full_title',
  'trust_sectional_title',
  'individual_full_title',
  'individual_sectional_title',
  'individual_spouse_consent_full_title',
  'individual_spouse_consent_sectional_title',
])

const sourceTemplate = {
  id: 'global-default',
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_default_v1',
  template_format: 'structured',
  definition_schema_version: 1,
  metadata_json: {
    template_scope: 'global_default',
    render_mode: 'native_structured',
    legal_review_status: 'approved',
    legal_approved_at: '2026-07-01T00:00:00.000Z',
    legal_approval_reference: 'source-only',
  },
}

const sourceSections = [
  { section_key: 'parties', section_label: 'Parties', section_type: 'legal_text', sort_order: 10, is_required: true, placeholder_keys: ['seller_full_name'], legal_text: 'Universal parties', metadata_json: {} },
  { section_key: 'seller_individual_capacity_pack', section_label: 'Individual Seller Capacity', section_type: 'legal_text', sort_order: 20, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_marital_status'], legal_text: 'Individual seller wording', metadata_json: {} },
  { section_key: 'seller_company_authority_pack', section_label: 'Company Authority', section_type: 'legal_text', sort_order: 30, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_company_registration_number'], legal_text: 'Company wording', metadata_json: {} },
  { section_key: 'seller_trust_authority_pack', section_label: 'Trust Authority', section_type: 'legal_text', sort_order: 40, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_trust_registration_number'], legal_text: 'Trust wording', metadata_json: {} },
  { section_key: 'seller_spouse_consent_pack', section_label: 'Spouse Consent', section_type: 'legal_text', sort_order: 50, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['seller_spouse_name'], legal_text: 'Spouse wording', metadata_json: {} },
  { section_key: 'property_full_title_pack', section_label: 'Full Title Property', section_type: 'legal_text', sort_order: 60, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['erf_number'], legal_text: 'Full title wording', metadata_json: {} },
  { section_key: 'property_sectional_title_pack', section_label: 'Sectional Title Property', section_type: 'legal_text', sort_order: 70, is_required: true, condition_json: { enabled: true }, placeholder_keys: ['sectional_title_number'], legal_text: 'Sectional wording', metadata_json: {} },
  { section_key: 'signatures', section_label: 'Signatures', section_type: 'signature_zone', sort_order: 80, is_required: true, placeholder_keys: [], legal_text: '', metadata_json: {} },
]

const individualFullTitle = routes.find((route) => route.key === 'individual_full_title')
const individualSections = buildRouteSections(sourceSections, individualFullTitle)
assert.deepEqual(individualSections.map((section) => section.section_key), [
  'parties',
  'seller_individual_capacity_pack',
  'property_full_title_pack',
  'signatures',
])
assert.deepEqual(individualSections.find((section) => section.section_key === 'seller_individual_capacity_pack').condition_json, {})
assert.deepEqual(individualSections.find((section) => section.section_key === 'property_full_title_pack').condition_json, {})

const spouseSectional = routes.find((route) => route.key === 'individual_spouse_consent_sectional_title')
assert.deepEqual(buildRouteSections(sourceSections, spouseSectional).map((section) => section.section_key), [
  'parties',
  'seller_individual_capacity_pack',
  'seller_spouse_consent_pack',
  'property_sectional_title_pack',
  'signatures',
])

const payload = buildRouteTemplatePayload({
  sourceTemplate,
  route: individualFullTitle,
  sourceSections,
  appliedAt: '2026-07-29T00:00:00.000Z',
  appliedBy: 'test',
  reference: 'phase2-test',
})
assert.equal(payload.template_key, 'mandate_individual_full_title_v1')
assert.equal(payload.template_label, 'Seller Mandate - Individual + Full Title')
assert.equal(payload.version_tag, GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG)
assert.equal(payload.status, 'draft')
assert.equal(payload.is_active, false)
assert.equal(payload.is_default, false)
assert.equal(payload.metadata_json.mandate_template_variant, 'individual_full_title')
assert.equal(payload.metadata_json.seller_clause_profile, 'individual')
assert.equal(payload.metadata_json.property_clause_profile, 'full_title')
assert.equal(payload.metadata_json.mandate_global_route_phase2_version, GLOBAL_MANDATE_ROUTE_PHASE2_VERSION)
assert.equal(payload.metadata_json.legal_review_status, undefined)
assert.equal(payload.metadata_json.legal_approved_at, undefined)
assert.equal(payload.sections.length, 4)

const plan = buildMandateGlobalRouteTemplatePlan({
  sourceTemplate,
  sourceSections,
  existingTemplates: [
    {
      id: 'draft-company-full-title',
      template_key: 'mandate_company_full_title_v1',
      status: 'draft',
      metadata_json: { mandate_template_variant: 'company_full_title' },
    },
    {
      id: 'published-trust-full-title',
      template_key: 'mandate_trust_full_title_v1',
      status: 'published',
      is_active: true,
      metadata_json: { mandate_template_variant: 'trust_full_title' },
    },
  ],
})
assert.equal(plan.routeCount, 8)
assert.equal(plan.status, 'READY_TO_APPLY')
assert.equal(plan.targetPlans.find((target) => target.routeKey === 'company_full_title').action, 'update_draft')
assert.equal(plan.targetPlans.find((target) => target.routeKey === 'trust_full_title').action, 'already_published')
assert.equal(plan.targetPlans.filter((target) => target.action === 'create_draft').length, 6)

const scriptSource = await readFile(new URL('./mandate-template-global-routes-phase2.mjs', import.meta.url), 'utf8')
for (const token of [
  WRITE_FLAG,
  '--confirm-route-count',
  'SOURCE_TEMPLATE_MISSING',
  'ROUTE_TEMPLATE_STATE_UNEXPECTED',
  'global_route_variant',
]) {
  assert.ok(scriptSource.includes(token), `Phase 2 script should include ${token}.`)
}

console.log('Mandate template global routes Phase 2 contract passed.')
