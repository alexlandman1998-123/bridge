import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_CONTENT_SCANNER_VERSION,
  detectMandateTemplateSectionSignals,
  normalizeMandateTemplateSectionForScan,
  scanMandateTemplateContent,
  scanMandateTemplateSections,
} from '../src/core/documents/mandateTemplateContentScanner.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-content-scanner-phase9'],
  'node scripts/mandate-template-content-scanner-phase9.test.mjs',
  'package.json should expose the mandate template content scanner Phase 9 contract.',
)

assert.equal(MANDATE_TEMPLATE_CONTENT_SCANNER_VERSION, 'mandate_template_content_scanner_v1')

function universalSection(extra = {}) {
  return {
    sectionKey: 'introduction_purpose',
    sectionLabel: 'Introduction and Purpose',
    legalText: 'The Seller appoints the Agency to market the Property under this estate agency mandate and pay commission.',
    placeholderKeysText: 'seller_full_name, property_address, mandate_type, mandate_start_date, mandate_end_date, commission_structure, asking_price, agent_full_name, organisation_name',
    ...extra,
  }
}

function condition(field, value) {
  return {
    field,
    operator: 'in',
    value,
  }
}

const defaultWithAllowedPacks = scanMandateTemplateContent({
  metadata_json: { mandate_template_variant: 'default' },
  sections: [
    universalSection(),
    {
      sectionKey: 'property_sectional_title_pack',
      sectionLabel: 'Sectional Title Property Pack',
      legalText: 'Where the Property is sectional title, body corporate levy and participation quota details are disclosed.',
      placeholderKeysText: 'property_unit_number, property_section_number, sectional_title_number, body_corporate_details, levy_amount',
      conditionJson: condition('property_title_type', 'sectional_title, share_block'),
    },
    {
      sectionKey: 'seller_company_authority_pack',
      sectionLabel: 'Seller Company Authority Pack',
      legalText: 'The authorised representative confirms they are duly authorised by directors resolution to bind the Seller.',
      placeholderKeysText: 'seller_company_registration_number, seller_representative_name, seller_representative_capacity, seller_resolution_date, seller_authority_basis',
      conditionJson: condition('seller_entity_type', 'company, close_corporation'),
    },
  ],
})
assert.equal(defaultWithAllowedPacks.isValidForPublish, true)
assert.equal(defaultWithAllowedPacks.blockingCount, 0)
assert.ok(defaultWithAllowedPacks.presentSignalGroupKeys.includes('sectional_title'))
assert.ok(defaultWithAllowedPacks.presentPackKeys.includes('property_sectional_title_pack'))

const defaultWithSectionalLeak = scanMandateTemplateSections([
  universalSection({
    sectionKey: 'property_details',
    sectionLabel: 'Property Details',
    legalText: 'The Seller must provide body corporate levy and sectional title scheme rules for the Property.',
    placeholderKeysText: 'property_address, body_corporate_details, levy_amount',
  }),
], { routeKey: 'default' })
assert.equal(defaultWithSectionalLeak.isValidForPublish, false)
assert.ok(defaultWithSectionalLeak.blockers.some((issue) => issue.code === 'FORBIDDEN_UNCONDITIONAL_SIGNAL' && issue.signalGroupKey === 'sectional_title'))

const defaultWithUnconditionedPack = scanMandateTemplateSections([
  universalSection(),
  {
    sectionKey: 'property_sectional_title_pack',
    sectionLabel: 'Sectional Title Property Pack',
    legalText: 'Body corporate levy and sectional title scheme rules apply.',
    placeholderKeysText: 'body_corporate_details, levy_amount',
  },
], { routeKey: 'default' })
assert.ok(defaultWithUnconditionedPack.blockers.some((issue) => issue.code === 'CONDITIONAL_PACK_MISSING_CONDITION'))

const companyFullTitleGood = scanMandateTemplateContent({
  metadata_json: { mandate_template_variant: 'company_full_title' },
  sections: [
    universalSection(),
    {
      sectionKey: 'seller_company_authority_pack',
      sectionLabel: 'Seller Company Authority Pack',
      legalText: 'The company or close corporation signatory is duly authorised by directors resolution to bind the Seller.',
      placeholderKeysText: 'seller_company_registration_number, seller_representative_name, seller_representative_capacity, seller_resolution_date, seller_authority_basis',
    },
    {
      sectionKey: 'property_full_title_pack',
      sectionLabel: 'Full Title Property Pack',
      legalText: 'The full title Property details include erf number, title deed, municipal rates, and servitude information.',
      placeholderKeysText: 'erf_number, title_deed_number, rates_account_number, servitude_details',
    },
  ],
})
assert.equal(companyFullTitleGood.isValidForPublish, true)
assert.ok(companyFullTitleGood.presentSignalGroupKeys.includes('company_authority'))
assert.ok(companyFullTitleGood.presentSignalGroupKeys.includes('full_title'))

const companyFullTitleWithSectional = scanMandateTemplateContent({
  metadata_json: { mandate_template_variant: 'company_full_title' },
  sections: [
    universalSection(),
    {
      sectionKey: 'seller_company_authority_pack',
      legalText: 'The authorised representative is duly authorised by directors resolution.',
      placeholderKeysText: 'seller_company_registration_number, seller_representative_name, seller_authority_basis',
    },
    {
      sectionKey: 'property_details',
      legalText: 'The Seller must provide sectional title, body corporate and levy information.',
      placeholderKeysText: 'property_address, levy_amount',
    },
  ],
})
assert.equal(companyFullTitleWithSectional.isValidForPublish, false)
assert.ok(companyFullTitleWithSectional.blockers.some((issue) => issue.signalGroupKey === 'sectional_title'))
assert.ok(companyFullTitleWithSectional.blockers.some((issue) => issue.signalGroupKey === 'full_title' && issue.code === 'MISSING_REQUIRED_SIGNAL_GROUP'))

const companyFullTitleMissingCompany = scanMandateTemplateSections([
  universalSection(),
  {
    sectionKey: 'property_full_title_pack',
    legalText: 'Full title erf number and title deed details are recorded.',
    placeholderKeysText: 'erf_number, title_deed_number',
  },
], { routeKey: 'company_full_title' })
assert.ok(companyFullTitleMissingCompany.blockers.some((issue) => issue.code === 'MISSING_REQUIRED_SIGNAL_GROUP' && issue.signalGroupKey === 'company_authority'))

const trustSectionalMissingTrust = scanMandateTemplateSections([
  universalSection(),
  {
    sectionKey: 'property_sectional_title_pack',
    legalText: 'Sectional title body corporate levy and participation quota details are recorded.',
    placeholderKeysText: 'property_unit_number, sectional_title_number, levy_amount',
  },
], { routeKey: 'trust_sectional_title' })
assert.ok(trustSectionalMissingTrust.blockers.some((issue) => issue.signalGroupKey === 'trust_authority'))

const spouseSectionalMissingSpouse = scanMandateTemplateSections([
  universalSection(),
  {
    sectionKey: 'seller_individual_capacity_pack',
    legalText: 'The individual seller confirms contractual capacity and marital status.',
    placeholderKeysText: 'seller_marital_status, seller_id_number',
  },
  {
    sectionKey: 'property_sectional_title_pack',
    legalText: 'Sectional title scheme, body corporate and levy details are recorded.',
    placeholderKeysText: 'property_unit_number, body_corporate_details, levy_amount',
  },
], { routeKey: 'individual_spouse_consent_sectional_title' })
assert.ok(spouseSectionalMissingSpouse.blockers.some((issue) => issue.signalGroupKey === 'spouse_consent'))

const normalizedSection = normalizeMandateTemplateSectionForScan({
  section_key: 'property_sectional_title_pack',
  legal_text: 'Body Corporate details',
  placeholder_keys: ['body_corporate_details'],
  condition_json: condition('property_title_type', 'sectional_title'),
})
assert.equal(normalizedSection.sectionKey, 'property_sectional_title_pack')
assert.equal(normalizedSection.hasCondition, true)
assert.ok(detectMandateTemplateSectionSignals(normalizedSection).some((signal) => signal.signalGroupKey === 'sectional_title'))

const source = await readFile(new URL('../src/core/documents/mandateTemplateContentScanner.js', import.meta.url), 'utf8')
for (const token of [
  'scanMandateTemplateContent',
  'FORBIDDEN_UNCONDITIONAL_SIGNAL',
  'MISSING_REQUIRED_SIGNAL_GROUP',
  'CONDITIONAL_PACK_MISSING_CONDITION',
  'routeAllowsSignal',
]) {
  assert.ok(source.includes(token), `Content scanner source should include ${token}.`)
}

console.log('Mandate template content scanner Phase 9 contract passed.')
