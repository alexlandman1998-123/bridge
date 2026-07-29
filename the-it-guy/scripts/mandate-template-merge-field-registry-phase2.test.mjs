import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  listCanonicalMergeFields,
  normalizeMergeFieldPayload,
  resolveCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from '../src/core/documents/mergeFieldRegistry.js'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-merge-field-registry-phase2'],
  'node scripts/mandate-template-merge-field-registry-phase2.test.mjs',
  'package.json should expose the mandate vNext merge-field registry Phase 2 contract.',
)

const mandateFields = new Set(listCanonicalMergeFields({ packetType: 'mandate' }).map((field) => field.key))
for (const key of [
  'organisation_legal_name',
  'organisation_trading_name',
  'organisation_registration_number',
  'organisation_vat_number',
  'organisation_registered_address',
  'organisation_fsp_number',
  'organisation_ffc_number',
  'mandatory_disclosure_status',
  'mandatory_disclosure_signed_at',
  'mandatory_disclosure_annexure',
  'mandatory_disclosure_comments',
]) {
  assert.equal(mandateFields.has(key), true, `Mandate vNext registry should include ${key}.`)
}

for (const [legacy, canonical] of [
  ['agency_legal_name', 'organisation_legal_name'],
  ['organisation_name', 'organisation_trading_name'],
  ['agency_registration_number', 'organisation_registration_number'],
  ['agency_vat_number', 'organisation_vat_number'],
  ['agency_address', 'organisation_registered_address'],
  ['agency_fsp_number', 'organisation_fsp_number'],
  ['agency_ffc_number', 'organisation_ffc_number'],
  ['property_disclosure_status', 'mandatory_disclosure_status'],
  ['property_disclosure_locked_at', 'mandatory_disclosure_signed_at'],
  ['property_disclosure_annexure', 'mandatory_disclosure_annexure'],
  ['property_disclosure_comments', 'mandatory_disclosure_comments'],
]) {
  assert.equal(
    resolveCanonicalMergeFieldKey(legacy, { packetType: 'mandate' }),
    canonical,
    `${legacy} should resolve to ${canonical}.`,
  )
}

const legacyValidation = validateTemplateTokensAgainstRegistry({
  packetType: 'mandate',
  tokens: [
    'agency_legal_name',
    'organisation_name',
    'agency_registration_number',
    'property_disclosure_status',
    'seller_full_name',
  ],
})
assert.deepEqual(legacyValidation.unknown, [])
assert.ok(legacyValidation.deprecated.some((row) => row.token === 'agency_legal_name' && row.canonicalKey === 'organisation_legal_name'))
assert.ok(legacyValidation.deprecated.some((row) => row.token === 'organisation_name' && row.canonicalKey === 'organisation_trading_name'))
assert.ok(legacyValidation.deprecated.some((row) => row.token === 'property_disclosure_status' && row.canonicalKey === 'mandatory_disclosure_status'))
assert.ok(legacyValidation.normalized.includes('organisation_legal_name'))
assert.ok(legacyValidation.normalized.includes('organisation_trading_name'))
assert.ok(legacyValidation.normalized.includes('mandatory_disclosure_status'))

const normalizedPayload = normalizeMergeFieldPayload({
  agency_legal_name: 'Samlin Properties (Pty) Ltd',
  organisation_name: 'Samlin',
  agency_registration_number: '2020/123456/07',
  property_disclosure_status: 'Completed and signed',
}, { packetType: 'mandate', includeAliasKeys: true })
assert.equal(normalizedPayload.payload.organisation_legal_name, 'Samlin Properties (Pty) Ltd')
assert.equal(normalizedPayload.payload.organisation_trading_name, 'Samlin')
assert.equal(normalizedPayload.payload.organisation_registration_number, '2020/123456/07')
assert.equal(normalizedPayload.payload.mandatory_disclosure_status, 'Completed and signed')
assert.equal(normalizedPayload.payload.agency_legal_name, 'Samlin Properties (Pty) Ltd')
assert.equal(normalizedPayload.payload.organisation_name, 'Samlin')

const mappedMandate = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    firstName: 'Sam',
    lastName: 'Seller',
    idNumber: '7801015009088',
  },
  agency: {
    legalName: 'Samlin Properties (Pty) Ltd',
    tradingName: 'Samlin',
    registrationNumber: '2020/123456/07',
    vatNumber: '4123456789',
    address: '1 Main Road, Johannesburg',
    fspNumber: 'FSP-123456',
    ffcNumber: 'FFC-FIRM-123456',
  },
  agent: {
    fullName: 'Alex Agent',
    ffcNumber: 'FFC-AGENT-123456',
  },
})
assert.equal(mappedMandate.placeholders.organisation_legal_name, 'Samlin Properties (Pty) Ltd')
assert.equal(mappedMandate.placeholders.organisation_trading_name, 'Samlin')
assert.equal(mappedMandate.placeholders.organisation_registration_number, '2020/123456/07')
assert.equal(mappedMandate.placeholders.organisation_vat_number, '4123456789')
assert.equal(mappedMandate.placeholders.organisation_registered_address, '1 Main Road, Johannesburg')
assert.equal(mappedMandate.placeholders.organisation_fsp_number, 'FSP-123456')
assert.equal(mappedMandate.placeholders.organisation_ffc_number, 'FFC-FIRM-123456')
assert.equal(mappedMandate.placeholders.agency_legal_name, 'Samlin Properties (Pty) Ltd')
assert.equal(mappedMandate.placeholders.organisation_name, 'Samlin')

const source = await readFile(new URL('../src/core/documents/mergeFieldRegistry.js', import.meta.url), 'utf8')
for (const token of [
  'organisation_legal_name',
  'organisation_trading_name',
  'mandatory_disclosure_status',
  'agency_legal_name',
  'property_disclosure_status',
]) {
  assert.ok(source.includes(token), `merge-field registry source should include ${token}`)
}

console.log('Mandate template merge-field registry Phase 2 contract passed.')
