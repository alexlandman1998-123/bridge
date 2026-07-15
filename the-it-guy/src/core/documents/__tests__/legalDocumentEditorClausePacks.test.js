import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLegalDocumentEditorSection } from '../legalDocumentEditorScope.js'
import {
  listLegalDocumentEditorSituations,
  sectionMatchesLegalDocumentEditorSituation,
} from '../legalDocumentEditorSituations.js'

test('exposes the day-to-day South African OTP situations in the editor', () => {
  const keys = listLegalDocumentEditorSituations().map((situation) => situation.key)

  assert.ok(keys.includes('estate_hoa'))
  assert.ok(keys.includes('occupation_lease'))
  assert.ok(keys.includes('linked_sale'))
  assert.ok(keys.includes('tax_vat'))
})

test('classifies canonical Phase 3 clause sections as situation wording', () => {
  const sections = [
    { section_key: 'property_estate_hoa_pack' },
    { section_key: 'existing_lease_pack' },
    { section_key: 'linked_property_sale_pack' },
    { section_key: 'vat_inclusive_tax_pack' },
  ]

  for (const section of sections) {
    assert.equal(classifyLegalDocumentEditorSection(section, { packetType: 'otp' }).isSituation, true)
  }
})

test('routes a conditional section to the plain-language editor situation', () => {
  const section = {
    section_key: 'property_estate_hoa_pack',
    condition_json: {
      enabled: true,
      rule: { field: 'legal_active_clause_packs', operator: 'contains', value: 'property_estate_hoa_pack' },
    },
  }

  assert.equal(sectionMatchesLegalDocumentEditorSituation(section, 'estate_hoa'), true)
  assert.equal(sectionMatchesLegalDocumentEditorSituation(section, 'tax_vat'), false)
})
