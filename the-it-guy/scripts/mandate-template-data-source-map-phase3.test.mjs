import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { listCanonicalMergeFields } from '../src/core/documents/mergeFieldRegistry.js'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'
import {
  MANDATE_TEMPLATE_DATA_SOURCE_MAP_VERSION,
  buildMandateTemplateDataSourceReport,
  formatMandateTemplateDataSourceMapMarkdown,
  getMandateTemplateDataSourceMapping,
  listMandateTemplateDataSourceMappings,
} from '../src/core/documents/mandateTemplateDataSourceMap.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-data-source-map-phase3'],
  'node scripts/mandate-template-data-source-map-phase3.test.mjs',
  'package.json should expose the mandate template data source map Phase 3 contract.',
)
assert.equal(
  packageJson.scripts?.['report:mandate-template-data-source-map'],
  'node scripts/report-mandate-template-data-source-map.mjs',
  'package.json should expose the mandate template data source map reporter.',
)

const mandateRegistryFields = listCanonicalMergeFields({ packetType: 'mandate' })
const mappings = listMandateTemplateDataSourceMappings()
assert.equal(mappings.length, mandateRegistryFields.length, 'Every mandate registry field should have a Phase 3 data-source mapping.')
assert.equal(new Set(mappings.map((mapping) => mapping.key)).size, mappings.length, 'Mapped fields should be unique.')

for (const key of mandateRegistryFields.map((field) => field.key)) {
  assert.ok(getMandateTemplateDataSourceMapping(key), `${key} should resolve to a data-source mapping.`)
}

const legalName = getMandateTemplateDataSourceMapping('organisation_legal_name')
assert.equal(legalName.sourceDomain, 'company_settings')
assert.equal(legalName.collectionSurface, 'Company Settings')
assert.equal(legalName.vNextReadinessCritical, true)
assert.ok(legalName.primarySourcePaths.includes('organisation.legalName'))

const tradingNameAlias = getMandateTemplateDataSourceMapping('organisation_name')
assert.equal(tradingNameAlias.key, 'organisation_trading_name')
assert.equal(tradingNameAlias.sourceDomain, 'company_settings')

const legacyAgencyAlias = getMandateTemplateDataSourceMapping('agency_legal_name')
assert.equal(legacyAgencyAlias.key, 'organisation_legal_name')

const agentFfc = getMandateTemplateDataSourceMapping('agent_ffc_number')
assert.equal(agentFfc.sourceDomain, 'agent_profile')
assert.equal(agentFfc.collectionSurface, 'User / Agent Profile')
assert.equal(agentFfc.missingPolicy, 'vnext_readiness_gap')

const sellerName = getMandateTemplateDataSourceMapping('seller_full_name')
assert.equal(sellerName.sourceDomain, 'seller_onboarding')
assert.equal(sellerName.missingPolicy, 'block_generation')
assert.ok(sellerName.primarySourcePaths.some((path) => path.includes('onboardingSubmission')))

const sellerRepresentative = getMandateTemplateDataSourceMapping('seller_representative_name')
assert.equal(sellerRepresentative.missingPolicy, 'conditional_required')

const propertyAddress = getMandateTemplateDataSourceMapping('property_address')
assert.equal(propertyAddress.sourceDomain, 'property_profile')
assert.equal(propertyAddress.missingPolicy, 'block_generation')

const disclosure = getMandateTemplateDataSourceMapping('property_disclosure_status')
assert.equal(disclosure.key, 'mandatory_disclosure_status')
assert.equal(disclosure.sourceDomain, 'disclosure_artifact')
assert.equal(disclosure.collectionSurface, 'Mandatory Disclosure Form')

const mandateStart = getMandateTemplateDataSourceMapping('mandate_start_date')
assert.equal(mandateStart.sourceDomain, 'mandate_draft')
assert.equal(mandateStart.missingPolicy, 'block_generation')

const commissionStructure = getMandateTemplateDataSourceMapping('commission_structure')
assert.equal(commissionStructure.sourceDomain, 'mandate_draft')
assert.ok(commissionStructure.fallbackSourcePaths.some((path) => path.includes('agency.defaultCommissionStructure')))

const sellerSignature = getMandateTemplateDataSourceMapping('seller_signature')
assert.equal(sellerSignature.sourceDomain, 'signing_system')
assert.equal(sellerSignature.missingPolicy, 'runtime_generated')

const mappedMandate = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    firstName: 'Sam',
    lastName: 'Seller',
    idNumber: '7801015009088',
    propertyAddress: '12 Sample Street, Pretoria',
    propertyStructureType: 'freehold',
    askingPrice: 2850000,
    commissionPercentage: 5,
    status: 'completed',
  },
  mandateDraft: {
    mandateType: 'sole',
    mandateStartDate: '2026-07-28',
    mandateEndDate: '2026-10-28',
    vatHandling: 'exclusive',
  },
  agency: {
    legalName: 'Samlin Properties (Pty) Ltd',
    tradingName: 'Samlin',
    registrationNumber: '2020/123456/07',
    address: '1 Main Road, Johannesburg',
    ffcNumber: 'FFC-FIRM-123456',
  },
  agent: {
    fullName: 'Alex Agent',
    email: 'alex@example.com',
    ffcNumber: 'FFC-AGENT-123456',
  },
})

assert.equal(mappedMandate.placeholders.property_title_type, 'full_title')
assert.equal(mappedMandate.placeholders.property_structure_type, 'freehold')
assert.equal(mappedMandate.placeholders['property.title_type_raw'], 'full_title')

const report = buildMandateTemplateDataSourceReport({
  generatedAt: '2026-07-28T12:00:00.000Z',
  placeholders: {
    ...mappedMandate.placeholders,
    property_disclosure_status: 'Completed and signed',
    property_disclosure_locked_at: '2026-07-28',
    property_disclosure_annexure: 'Mandatory Disclosure Form Annexure A',
  },
})

assert.equal(report.version, MANDATE_TEMPLATE_DATA_SOURCE_MAP_VERSION)
assert.equal(report.summary.total, mandateRegistryFields.length)
assert.ok(report.summary.byDomain.company_settings > 0)
assert.ok(report.summary.byDomain.seller_onboarding > 0)
assert.ok(report.summary.byDomain.disclosure_artifact > 0)
assert.equal(report.mappings.find((mapping) => mapping.key === 'organisation_legal_name')?.status, 'filled')
assert.equal(report.mappings.find((mapping) => mapping.key === 'mandatory_disclosure_status')?.status, 'filled')
assert.equal(report.mappings.find((mapping) => mapping.key === 'seller_signature')?.status, 'runtime_generated')
assert.ok(!report.summary.readinessGaps.some((gap) => gap.key === 'organisation_legal_name'))

const blankReport = buildMandateTemplateDataSourceReport({
  generatedAt: '2026-07-28T12:00:00.000Z',
  placeholders: {},
})
assert.ok(blankReport.summary.readinessGaps.some((gap) => gap.key === 'seller_full_name' && gap.status === 'missing_required'))
assert.ok(blankReport.summary.readinessGaps.some((gap) => gap.key === 'organisation_legal_name' && gap.status === 'missing_vnext_required'))
assert.ok(blankReport.summary.readinessGaps.some((gap) => gap.key === 'mandatory_disclosure_status' && gap.status === 'missing_vnext_required'))

const markdown = formatMandateTemplateDataSourceMapMarkdown(report)
for (const token of [
  'Mandate Template vNext Phase 3 Data Source Map',
  'Company Settings',
  'Seller Onboarding',
  'Mandatory Disclosure',
  'property_disclosure_*',
  'organisation_legal_name',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/mandateTemplateDataSourceMap.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_DATA_SOURCE_MAP_VERSION',
  'MANDATE_DATA_SOURCE_DOMAINS',
  'buildMandateTemplateDataSourceReport',
  'formatMandateTemplateDataSourceMapMarkdown',
  'organisation_ffc_number',
  'mandatory_disclosure_status',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('Mandate template data source map Phase 3 contract passed.')
