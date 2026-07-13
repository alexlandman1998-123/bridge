import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildMandateTemplateRoutingAudit,
  resolveMandateTemplateRoutingMetadata,
  resolveMandateTemplateRoutingProfile,
  scoreMandateTemplateCandidate,
  selectMandateTemplateCandidate,
} from '../src/core/documents/mandateTemplateRouting.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-routing-phase3'],
  'node scripts/mandate-template-routing-phase3.test.mjs',
  'package.json should expose the mandate template routing Phase 3 contract.',
)

const templates = [
  {
    id: 'default',
    template_key: 'mandate_default_v1',
    template_label: 'Mandate Agreement Default',
    status: 'published',
    is_default: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    metadata_json: {
      mandate_template_variant: 'default',
    },
  },
  {
    id: 'company-full-title',
    template_key: 'mandate_company_full_title_v1',
    template_label: 'Company Full Title Mandate',
    status: 'published',
    is_default: false,
    updated_at: '2026-02-01T00:00:00.000Z',
    metadata_json: {
      mandate_template_variant: 'company_full_title',
    },
  },
  {
    id: 'trust-sectional',
    template_key: 'mandate_trust_sectional_title_v1',
    template_label: 'Trust Sectional Mandate',
    status: 'published',
    is_default: false,
    updated_at: '2026-02-02T00:00:00.000Z',
    metadata_json: {
      seller_clause_profile: 'trust',
      property_clause_profile: 'sectional_title',
    },
  },
  {
    id: 'company-sectional',
    template_key: 'mandate_company_sectional_title_v1',
    template_label: 'Company Sectional Mandate',
    status: 'published',
    is_default: false,
    updated_at: '2026-02-03T00:00:00.000Z',
    metadata_json: {
      supported_mandate_template_variants: ['company_sectional_title'],
    },
  },
]

const companyFullTitleProfile = resolveMandateTemplateRoutingProfile({
  placeholders: {
    seller_entity_type: 'company',
    property_title_type: 'full_title',
  },
})
assert.equal(companyFullTitleProfile.templateVariant, 'company_full_title')

const companySelection = selectMandateTemplateCandidate(templates, {
  scenarioProfile: companyFullTitleProfile,
})
assert.equal(companySelection.template.id, 'company-full-title')
assert.ok(companySelection.score > scoreMandateTemplateCandidate(templates[0], {
  scenarioProfile: companyFullTitleProfile,
}).score)
assert.ok(companySelection.reasons.includes('exact_variant_metadata'))

const trustShareBlockProfile = resolveMandateTemplateRoutingProfile({
  placeholders: {
    seller_entity_type: 'trust',
    property_title_type: 'share_block',
  },
})
assert.equal(trustShareBlockProfile.templateVariant, 'trust_sectional_title')
assert.equal(selectMandateTemplateCandidate(templates, {
  scenarioProfile: trustShareBlockProfile,
}).template.id, 'trust-sectional')

const companySectionalScore = scoreMandateTemplateCandidate(templates[1], {
  scenarioProfile: resolveMandateTemplateRoutingProfile({
    placeholders: {
      seller_entity_type: 'company',
      property_title_type: 'sectional_title',
    },
  }),
})
assert.equal(companySectionalScore.compatible, false)
assert.deepEqual(companySectionalScore.reasons, ['variant_mismatch'])

const marriedSectionalProfile = resolveMandateTemplateRoutingProfile({
  placeholders: {
    seller_entity_type: 'individual',
    seller_marital_regime: 'in community of property',
    property_title_type: 'sectional_title',
  },
})
assert.equal(marriedSectionalProfile.templateVariant, 'individual_spouse_consent_sectional_title')
assert.equal(selectMandateTemplateCandidate(templates, {
  scenarioProfile: marriedSectionalProfile,
}).template.id, 'default')

const defaultFallbackScore = scoreMandateTemplateCandidate(templates[0], {
  scenarioProfile: marriedSectionalProfile,
}).score
const untaggedFallbackScore = scoreMandateTemplateCandidate({
  id: 'organisation-generic',
  template_key: 'mandate_agency_generic_v1',
  status: 'published',
  is_default: false,
  metadata_json: {},
}, {
  scenarioProfile: marriedSectionalProfile,
}).score
assert.equal(defaultFallbackScore, untaggedFallbackScore)

const routingMetadata = resolveMandateTemplateRoutingMetadata(templates[2])
assert.deepEqual(routingMetadata.sellerProfiles, ['trust'])
assert.deepEqual(routingMetadata.propertyProfiles, ['sectional_title'])
assert.equal(routingMetadata.hasRoutingMetadata, true)

const audit = buildMandateTemplateRoutingAudit(companySelection)
assert.equal(audit.selectedTemplateId, 'company-full-title')
assert.equal(audit.mandateTemplateVariant, 'company_full_title')
assert.equal(audit.sellerClauseProfile, 'company')
assert.equal(audit.propertyClauseProfile, 'full_title')
assert.ok(audit.matchReasons.includes('exact_variant_metadata'))

const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
for (const token of [
  'resolveMandateScenarioTemplateForPacket',
  'mandate_scenario_variant',
  'mandateTemplateRouting',
  'mandateTemplateVariant',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include ${token}.`)
}

const settingsSource = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_ROUTE_OPTIONS',
  'mandate_template_variant',
  'mandateTemplateVariant',
  'Mandate route',
  'Company + Full Title',
]) {
  assert.ok(settingsSource.includes(token), `Settings template editor should include ${token}.`)
}

console.log('Mandate template routing Phase 3 contract passed.')
