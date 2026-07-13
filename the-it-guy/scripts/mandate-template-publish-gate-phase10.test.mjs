import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_PUBLISH_GATE_VERSION,
  buildMandateTemplatePublishGateReport,
  serializeMandateTemplatePublishGateScan,
} from '../src/core/documents/mandateTemplatePublishGate.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-publish-gate-phase10'],
  'node scripts/mandate-template-publish-gate-phase10.test.mjs',
  'package.json should expose the mandate template publish gate Phase 10 contract.',
)

assert.equal(MANDATE_TEMPLATE_PUBLISH_GATE_VERSION, 'mandate_template_publish_gate_v1')

function universalSection(extra = {}) {
  return {
    sectionKey: 'introduction_purpose',
    sectionLabel: 'Introduction and Purpose',
    legalText: 'The Seller appoints the Agency to market the Property under this estate agency mandate and pay commission.',
    placeholderKeysText: 'seller_full_name, property_address, mandate_type, mandate_start_date, mandate_end_date, commission_structure, asking_price, agent_full_name, organisation_name',
    ...extra,
  }
}

function fullTitleSection() {
  return {
    sectionKey: 'property_full_title_pack',
    sectionLabel: 'Full Title Property Pack',
    legalText: 'The full title Property includes erf number, title deed, municipal rates, and servitude information.',
    placeholderKeysText: 'erf_number, title_deed_number, rates_account_number, servitude_details',
  }
}

function companyAuthoritySection() {
  return {
    sectionKey: 'seller_company_authority_pack',
    sectionLabel: 'Seller Company Authority Pack',
    legalText: 'The company or close corporation signatory is authorised by directors resolution to bind the Seller.',
    placeholderKeysText: 'seller_company_registration_number, seller_resolution_date',
  }
}

const badDefaultGate = buildMandateTemplatePublishGateReport({
  packet_type: 'mandate',
  metadata_json: { mandate_template_variant: 'default' },
  sections: [
    universalSection({
      sectionKey: 'property_details',
      sectionLabel: 'Property Details',
      legalText: 'The Seller must provide body corporate levy and sectional title scheme rules for the Property.',
      placeholderKeysText: 'property_address, body_corporate_details, levy_amount',
    }),
  ],
}, { packetType: 'mandate' })
assert.equal(badDefaultGate.applies, true)
assert.equal(badDefaultGate.canPublish, false)
assert.ok(badDefaultGate.blockers.some((issue) => issue.code === 'FORBIDDEN_UNCONDITIONAL_SIGNAL'))
assert.ok(badDefaultGate.blockingMessages.some((message) => message.includes('Sectional title property wording')))

const goodCompanyFullTitleGate = buildMandateTemplatePublishGateReport({
  packet_type: 'mandate',
  metadata_json: { mandate_template_variant: 'company_full_title' },
  sections: [
    universalSection(),
    companyAuthoritySection(),
    fullTitleSection(),
  ],
}, { packetType: 'mandate' })
assert.equal(goodCompanyFullTitleGate.canPublish, true)
assert.equal(goodCompanyFullTitleGate.blockingCount, 0)
assert.equal(goodCompanyFullTitleGate.metadata.gateVersion, MANDATE_TEMPLATE_PUBLISH_GATE_VERSION)
assert.equal(goodCompanyFullTitleGate.metadata.isValidForPublish, true)
assert.equal(goodCompanyFullTitleGate.metadata.routeKey, 'company_full_title')

const nonMandateGate = buildMandateTemplatePublishGateReport({
  packet_type: 'otp',
  sections: [],
}, { packetType: 'otp' })
assert.equal(nonMandateGate.applies, false)
assert.equal(nonMandateGate.canPublish, true)

const compactMetadata = serializeMandateTemplatePublishGateScan(goodCompanyFullTitleGate)
assert.ok(compactMetadata.scannedAt)
assert.equal(Object.hasOwn(compactMetadata, 'scan'), false)
assert.equal(Object.hasOwn(compactMetadata, 'sectionAnalyses'), false)
assert.equal(Object.hasOwn(compactMetadata, 'signalHits'), false)

const settingsSource = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
for (const token of [
  'buildMandateTemplatePublishGateReport',
  'serializeMandateTemplatePublishGateScan',
  'mandatePublishGateReport',
  'last_mandate_content_scan',
  'contentScanBlockers',
  'Mandate Content Gate',
  'Mandate content scanner found blockers',
]) {
  assert.ok(settingsSource.includes(token), `Settings publish gate should include ${token}.`)
}

const publishReviewIndex = settingsSource.indexOf('const publishReview = useMemo')
const contentScanBlockerIndex = settingsSource.indexOf('const contentScanBlockers = mandatePublishGateReport?.blockingMessages || []')
const publishBlockersIndex = settingsSource.indexOf('...contentScanBlockers')
assert.ok(
  publishReviewIndex > -1 && contentScanBlockerIndex > publishReviewIndex && publishBlockersIndex > contentScanBlockerIndex,
  'Publish review should add mandate content scan blockers before publish confirmation.',
)

const confirmIndex = settingsSource.indexOf('async function confirmPublishTemplate')
const confirmGateIndex = settingsSource.indexOf("mandatePublishGateReport?.isValidForPublish === false", confirmIndex)
assert.ok(confirmIndex > -1 && confirmGateIndex > confirmIndex, 'Publish confirmation must re-check the mandate content gate.')

console.log('Mandate template publish gate Phase 10 contract passed.')
