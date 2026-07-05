import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  DOCUMENT_START_DOCUMENT_KINDS,
  DOCUMENT_START_ENTRY_POINTS,
  DOCUMENT_START_MODE_OPTIONS,
  DOCUMENT_START_PACKET_TYPES,
  DOCUMENT_START_SOURCE_MODES,
  getDocumentStartEntryPointRule,
  getDocumentStartModeOptions,
  getDocumentStartRequiredFields,
  validateDocumentStartRequest,
} from '../src/core/documents/documentStartRules.js'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const rulesSource = await read('../src/core/documents/documentStartRules.js')
const rolloutDoc = await read('../docs/audits/document-start-phase-0.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase0'],
  'node scripts/document-start-phase0.test.mjs',
  'package.json should expose the document-start Phase 0 audit.',
)

assert.equal(DOCUMENT_START_PACKET_TYPES.mandate, 'mandate')
assert.equal(DOCUMENT_START_PACKET_TYPES.otp, 'otp')
assert.equal(DOCUMENT_START_DOCUMENT_KINDS.addendum, 'addendum')
assert.equal(DOCUMENT_START_SOURCE_MODES.saved, 'saved_details')
assert.equal(DOCUMENT_START_SOURCE_MODES.manual, 'manual_details')
assert.equal(DOCUMENT_START_SOURCE_MODES.onboarding, 'send_onboarding')
assert.equal(DOCUMENT_START_MODE_OPTIONS.length, 3, 'Start document should keep three plain-language source modes.')

for (const reference of [
  'Use saved details',
  'Enter details manually',
  'Ask client to complete',
  'Use this when the client is not tech-savvy or the paperwork must go out now.',
  'seller_lead_mandate',
  'listing_mandate',
  'transaction_otp',
  'accepted_offer_otp',
  'legal_workspace_document',
  'document_library_document',
]) {
  assertIncludes(rulesSource, reference, `Document start rules should keep ${reference}.`)
}

const listingMandateRule = getDocumentStartEntryPointRule(DOCUMENT_START_ENTRY_POINTS.listingMandate)
assert.equal(listingMandateRule.packetType, DOCUMENT_START_PACKET_TYPES.mandate)
assert.deepEqual(listingMandateRule.allowedSourceModes, [
  DOCUMENT_START_SOURCE_MODES.saved,
  DOCUMENT_START_SOURCE_MODES.manual,
  DOCUMENT_START_SOURCE_MODES.onboarding,
])

const transactionOtpRule = getDocumentStartEntryPointRule(DOCUMENT_START_ENTRY_POINTS.transactionOtp)
assert.equal(transactionOtpRule.packetType, DOCUMENT_START_PACKET_TYPES.otp)
assert.deepEqual(transactionOtpRule.allowedSourceModes, [
  DOCUMENT_START_SOURCE_MODES.saved,
  DOCUMENT_START_SOURCE_MODES.manual,
  DOCUMENT_START_SOURCE_MODES.onboarding,
])

const addendumRule = getDocumentStartEntryPointRule(DOCUMENT_START_ENTRY_POINTS.legalWorkspaceDocument)
assert.equal(addendumRule.defaultDocumentKind, DOCUMENT_START_DOCUMENT_KINDS.addendum)
assert.deepEqual(addendumRule.allowedSourceModes, [
  DOCUMENT_START_SOURCE_MODES.saved,
  DOCUMENT_START_SOURCE_MODES.manual,
])

assert.equal(
  validateDocumentStartRequest({
    packetType: 'mandate',
    entryPoint: DOCUMENT_START_ENTRY_POINTS.listingMandate,
    sourceMode: DOCUMENT_START_SOURCE_MODES.manual,
    hasExistingContext: false,
  }).canStart,
  true,
  'Manual mandate creation should not require seller onboarding or an existing listing context.',
)

assert.equal(
  validateDocumentStartRequest({
    packetType: 'otp',
    entryPoint: DOCUMENT_START_ENTRY_POINTS.transactionOtp,
    sourceMode: DOCUMENT_START_SOURCE_MODES.manual,
    hasExistingContext: false,
  }).canStart,
  true,
  'Manual OTP creation should not require buyer onboarding or an existing client context.',
)

const savedWithoutContext = validateDocumentStartRequest({
  packetType: 'otp',
  entryPoint: DOCUMENT_START_ENTRY_POINTS.transactionOtp,
  sourceMode: DOCUMENT_START_SOURCE_MODES.saved,
  hasExistingContext: false,
})
assert.equal(savedWithoutContext.canStart, false)
assert.match(savedWithoutContext.issues.join(' '), /Select an existing record/)

const onboardingWithoutContact = validateDocumentStartRequest({
  packetType: 'mandate',
  entryPoint: DOCUMENT_START_ENTRY_POINTS.sellerLeadMandate,
  sourceMode: DOCUMENT_START_SOURCE_MODES.onboarding,
  hasClientContact: false,
})
assert.equal(onboardingWithoutContact.canStart, false)
assert.match(onboardingWithoutContact.issues.join(' '), /client email or phone/)

const addendumWithoutParent = validateDocumentStartRequest({
  packetType: 'otp',
  documentKind: DOCUMENT_START_DOCUMENT_KINDS.addendum,
  entryPoint: DOCUMENT_START_ENTRY_POINTS.legalWorkspaceDocument,
  sourceMode: DOCUMENT_START_SOURCE_MODES.manual,
  hasParentDocument: false,
})
assert.equal(addendumWithoutParent.canStart, false)
assert.match(addendumWithoutParent.issues.join(' '), /original document/)

const addendumWithParent = validateDocumentStartRequest({
  packetType: 'otp',
  documentKind: DOCUMENT_START_DOCUMENT_KINDS.addendum,
  entryPoint: DOCUMENT_START_ENTRY_POINTS.legalWorkspaceDocument,
  sourceMode: DOCUMENT_START_SOURCE_MODES.manual,
  hasParentDocument: true,
})
assert.equal(addendumWithParent.canStart, true)

assert.deepEqual(
  getDocumentStartRequiredFields({
    packetType: 'mandate',
    sourceMode: DOCUMENT_START_SOURCE_MODES.manual,
  }),
  ['seller_name', 'seller_contact', 'property_address', 'mandate_type', 'commission_terms'],
)

assert.deepEqual(
  getDocumentStartRequiredFields({
    packetType: 'otp',
    sourceMode: DOCUMENT_START_SOURCE_MODES.manual,
  }),
  ['buyer_details', 'seller_details', 'property_address', 'purchase_price', 'signature_parties'],
)

const addendumOptionsWithoutParent = getDocumentStartModeOptions({
  entryPoint: DOCUMENT_START_ENTRY_POINTS.legalWorkspaceDocument,
  documentKind: DOCUMENT_START_DOCUMENT_KINDS.addendum,
  hasParentDocument: false,
})
assert.equal(addendumOptionsWithoutParent.every((option) => option.disabled), true)
assert.match(addendumOptionsWithoutParent[0].disabledReason, /original document/)

for (const reference of [
  'Document-first, not onboarding-first',
  'One reusable Start Document module',
  'Do not create a second document system',
  'No raw JSON editor',
  'Manual documents must not be dead ends',
  'Addendums require an original document',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 0 rollout note should keep ${reference}.`)
}

console.log('document-start-phase0 audit passed')
