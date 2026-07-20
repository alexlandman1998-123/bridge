import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canMoveLegalDocumentSection,
  canRemoveLegalDocumentSection,
  sanitizeLegalDocumentSectionPatch,
} from '../legalDocumentEditorProtection.js'

const protectedSection = {
  sectionKey: 'seller_company_authority_pack',
  sectionLabel: 'Company seller',
  legalText: 'Original wording',
  conditionJson: { enabled: true, field: 'seller_entity_type', operator: 'equals', value: 'company' },
  metadataJson: { conditional_pack: true, condition_rule_locked: true },
}

test('allows wording edits while rejecting protected conditional-pack changes', () => {
  const patch = sanitizeLegalDocumentSectionPatch(protectedSection, {
    legalText: 'Agency-approved wording',
    sectionLabel: 'Renamed section',
    sectionKey: 'renamed_section',
    sortOrder: 99,
    conditionJson: { enabled: false },
  })

  assert.deepEqual(patch, { legalText: 'Agency-approved wording' })
})

test('prevents protected conditional packs from being removed or reordered', () => {
  const standardBefore = { sectionKey: 'introduction', legalText: 'Introduction' }
  const standardAfter = { sectionKey: 'mandate_terms', legalText: 'Terms' }
  const sections = [standardBefore, protectedSection, standardAfter]

  assert.equal(canRemoveLegalDocumentSection(protectedSection), false)
  assert.equal(canMoveLegalDocumentSection(sections, 1, 0), false)
  assert.equal(canMoveLegalDocumentSection(sections, 0, 1), false)
})

test('keeps standard wording fully editable and movable', () => {
  const section = { sectionKey: 'introduction', sectionLabel: 'Introduction', legalText: 'Original' }
  const patch = {
    sectionLabel: 'Purpose',
    legalText: 'Updated standard wording',
    conditionJson: { enabled: true, field: 'custom_flag', operator: 'equals', value: 'yes' },
  }

  assert.deepEqual(sanitizeLegalDocumentSectionPatch(section, patch), patch)
  assert.equal(canRemoveLegalDocumentSection(section), true)
  assert.equal(canMoveLegalDocumentSection([section, { sectionKey: 'terms' }], 0, 1), true)
})

test('blocks rule edits on condition-locked custom sections without blocking wording', () => {
  const section = {
    sectionKey: 'locked_custom_clause',
    metadataJson: { condition_rule_locked: true },
  }
  assert.deepEqual(
    sanitizeLegalDocumentSectionPatch(section, {
      legalText: 'Updated wording',
      condition_json: { enabled: false },
    }),
    { legalText: 'Updated wording' },
  )
})
