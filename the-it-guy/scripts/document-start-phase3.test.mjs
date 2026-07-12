import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

function normalizeSpaces(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const packageJson = JSON.parse(await read('../package.json'))
const page = await read('../src/pages/LegalDocumentWorkspacePage.jsx')
const panel = await read('../src/components/documents/MandateDraftIntakePanel.jsx')
const mapper = await read('../src/core/documents/mandateDataMapper.js')
const rolloutDoc = await read('../docs/audits/document-start-phase-3.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase3'],
  'node scripts/document-start-phase3.test.mjs',
  'package.json should expose the document-start Phase 3 audit.',
)

for (const reference of [
  "import MandateDraftIntakePanel from '../components/documents/MandateDraftIntakePanel'",
  'const documentStartSourceMode = normalizeKey(searchParams.get(\'sourceMode\'))',
  'const documentStartEntryPoint = normalizeKey(searchParams.get(\'documentStart\'))',
  'sellerFullName',
  'sellerIdNumber',
  'sellerDomiciliumAddress',
  'propertyAddress',
  'propertySuburb',
  'propertyCity',
  'propertyType',
  'sourceMode: documentStartSourceMode || null',
  'documentStart: documentStartEntryPoint || null',
  '<MandateDraftIntakePanel',
  'draft={effectiveMandateDraft}',
  'sourceMode={documentStartSourceMode}',
  'documentStart={documentStartEntryPoint}',
  'onFieldChange={updateMandateDraftField}',
]) {
  assertIncludes(page, reference, `LegalDocumentWorkspacePage should keep Phase 3 wiring ${reference}.`)
}

for (const reference of [
  'Mandate details',
  'Review the essentials',
  'Seller',
  'Property',
  'Manual capture',
  'Core mandate fields',
  'Ready for draft generation.',
  'Seller contact and authority',
  'Property extras',
  'Terms and special conditions',
]) {
  assertIncludes(panel, reference, `MandateDraftIntakePanel should keep ${reference}.`)
}

for (const reference of [
  'resolveSellerProfile(onboarding, lead, contact, mandateDraft)',
  'resolvePropertyProfile(onboarding, lead, privateListing, transaction, mandateDraft)',
  'draftHasAnyValue',
  'document_packet_context',
  'mandateDraft.sellerFullName',
  'mandateDraft.propertyAddress',
  'mandateDraft.askingPrice',
  'mandateDraft.specialConditions',
]) {
  assertIncludes(mapper, reference, `mandateDataMapper should keep manual draft support ${reference}.`)
}

const mapped = mapSellerOnboardingToMandateData({
  onboardingSubmission: {},
  lead: {
    name: 'Saved Seller',
    sellerPropertyAddress: 'Saved Road',
    estimatedValue: 900000,
  },
  privateListing: {},
  agency: {
    legalName: 'Kingstons Real Estate',
  },
  organisation: {
    name: 'Kingstons Real Estate',
  },
  agent: {
    fullName: 'Alex Agent',
    email: 'alex@example.test',
  },
  contact: {},
  transaction: {},
  mandateDraft: {
    sellerEntityType: 'individual',
    sellerFullName: 'Manual Seller',
    sellerIdNumber: '8001015009087',
    sellerEmail: 'seller@example.test',
    sellerPhone: '+27110000000',
    sellerDomiciliumAddress: '9 Notice Street, Boksburg',
    propertyAddress: '12 Manual Road',
    propertySuburb: 'Boksburg',
    propertyCity: 'Ekurhuleni',
    propertyType: 'House',
    unitNumber: '7',
    complexName: 'Manual Estate',
    erfNumber: '1234',
    askingPrice: '1234567',
    mandateType: 'exclusive',
    mandateStartDate: '2026-07-05',
    mandateEndDate: '2026-10-05',
    commissionStructure: 'fixed',
    commissionAmount: '55000',
    vatHandling: 'inclusive',
    specialConditions: 'Manual condition applies.',
  },
})

assert.equal(mapped.seller.fullName, 'Manual Seller')
assert.equal(mapped.seller.identityNumber, '8001015009087')
assert.equal(mapped.seller.email, 'seller@example.test')
assert.equal(mapped.seller.domiciliumAddress, '9 Notice Street, Boksburg')
assert.equal(mapped.property.fullAddress, '12 Manual Road')
assert.equal(mapped.property.suburb, 'Boksburg')
assert.equal(mapped.property.city, 'Ekurhuleni')
assert.equal(mapped.property.propertyType, 'House')
assert.equal(mapped.property.unitNumber, '7')
assert.equal(mapped.property.complexName, 'Manual Estate')
assert.equal(mapped.property.erfNumber, '1234')
assert.equal(mapped.property.askingPrice, 1234567)
assert.equal(mapped.mandate.type, 'exclusive')
assert.equal(mapped.mandate.startDate, '2026-07-05')
assert.equal(mapped.mandate.expiryDate, '2026-10-05')
assert.equal(mapped.mandate.commissionStructure, 'fixed')
assert.equal(mapped.mandate.commissionAmount, 55000)
assert.equal(mapped.mandate.vatHandling, 'inclusive')
assert.equal(mapped.mandate.specialConditions, 'Manual condition applies.')
assert.equal(mapped.sourceContext.seller, 'document_packet_context')
assert.equal(mapped.sourceContext.property, 'document_packet_context')
assert.equal(mapped.sourceContext.mandate, 'document_packet_context')
assert.equal(mapped.sourceContext.commission, 'document_packet_context')
assert.equal(mapped.placeholders.seller_full_name, 'Manual Seller')
assert.equal(mapped.placeholders.property_address, '12 Manual Road')
assert.equal(mapped.placeholders.property_suburb, 'Boksburg')
assert.equal(mapped.placeholders.mandate_type, 'Exclusive')
assert.equal(mapped.placeholders.mandate_start_date, '2026-07-05')
assert.equal(mapped.placeholders.mandate_expiry_date, '2026-10-05')
assert.equal(mapped.placeholders.special_conditions, 'Manual condition applies.')
assert.ok(normalizeSpaces(mapped.placeholders.asking_price).includes('1'), 'asking price should render from manual draft value.')

for (const reference of [
  'Manual mandate intake',
  'seller, property, mandate, and commission',
  'existing Legal Document Workspace',
  'No new packet engine',
  'No signing changes',
  'Saved lead and onboarding details remain prefilled',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 3 rollout note should keep ${reference}.`)
}

console.log('document-start-phase3 audit passed')
