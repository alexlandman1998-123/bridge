import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLegalDocumentEditorSection } from '../legalDocumentEditorScope.js'
import {
  LEGAL_DOCUMENT_EDITOR_SITUATION_GROUPS,
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

test('separates conditional clauses into onboarding answer groups', () => {
  const situations = listLegalDocumentEditorSituations()
  const groupKeys = new Set(LEGAL_DOCUMENT_EDITOR_SITUATION_GROUPS.map((group) => group.key))

  assert.deepEqual([...groupKeys], ['party', 'property', 'sale'])
  assert.ok(situations.every((situation) => groupKeys.has(situation.groupKey)))
  assert.equal(situations.find((situation) => situation.key === 'company')?.groupKey, 'party')
  assert.equal(situations.find((situation) => situation.key === 'sectional_title')?.groupKey, 'property')
  assert.equal(situations.find((situation) => situation.key === 'finance')?.groupKey, 'sale')
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
