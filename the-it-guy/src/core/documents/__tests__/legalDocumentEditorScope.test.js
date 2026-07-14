import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyLegalDocumentEditorSection,
  listScopedLegalDocumentSectionEntries,
} from '../legalDocumentEditorScope.js'

const sections = [
  { sectionKey: 'parties', sectionLabel: 'Parties' },
  { sectionKey: 'buyer_company_authority_pack', sectionLabel: 'Company buyer' },
  { sectionKey: 'special_term', conditionJson: { enabled: true, field: 'property_type', operator: 'equals' } },
  { sectionKey: 'signature_pages', metadataJson: { planned_signing_fields: [{ signer_role: 'seller' }] } },
]

test('classifies standard, situation and signing sections from the shared contract', () => {
  assert.equal(classifyLegalDocumentEditorSection(sections[0], { packetType: 'otp' }).isStandard, true)
  assert.equal(classifyLegalDocumentEditorSection(sections[1], { packetType: 'otp' }).isSituation, true)
  assert.equal(classifyLegalDocumentEditorSection(sections[2], { packetType: 'otp' }).isSituation, true)
  assert.equal(classifyLegalDocumentEditorSection(sections[3], { packetType: 'otp' }).isSigning, true)
})

test('keeps original section indexes when creating focused editor lists', () => {
  assert.deepEqual(
    listScopedLegalDocumentSectionEntries(sections, { scope: 'situations', packetType: 'otp', situationKey: 'company' }).map((entry) => entry.index),
    [1],
  )
  assert.deepEqual(
    listScopedLegalDocumentSectionEntries(sections, { scope: 'signing', packetType: 'otp' }).map((entry) => entry.index),
    [3],
  )
})

test('requires a plain-language situation choice before showing conditional wording', () => {
  assert.deepEqual(listScopedLegalDocumentSectionEntries(sections, { scope: 'situations', packetType: 'otp' }), [])
})

test('keeps sections selectable when a template has no signing setup yet', () => {
  const withoutSigning = sections.slice(0, 3)
  assert.equal(listScopedLegalDocumentSectionEntries(withoutSigning, { scope: 'signing', packetType: 'otp' }).length, 3)
})

test('does not treat an explicitly disabled condition as situation wording', () => {
  const section = { sectionKey: 'optional_note', conditionJson: { enabled: false, field: 'property_type', operator: 'equals' } }
  assert.equal(classifyLegalDocumentEditorSection(section, { packetType: 'otp' }).isStandard, true)
})
