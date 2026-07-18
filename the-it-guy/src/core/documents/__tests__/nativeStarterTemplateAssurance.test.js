import test from 'node:test'
import assert from 'node:assert/strict'

import { assessNativeStarterTemplate } from '../nativeStarterTemplateAssurance.js'

function starter(documentType, sectionCount) {
  const roles = documentType === 'mandate'
    ? ['seller', 'agent']
    : documentType === 'otp'
      ? ['purchaser_1', 'seller']
      : ['seller']
  const sections = Array.from({ length: sectionCount }, (_, index) => ({
    section_key: index === sectionCount - 1 ? 'signature_pages' : `clause_${index + 1}`,
    section_label: index === sectionCount - 1 ? 'Signatures' : `Clause ${index + 1}`,
    section_type: index === sectionCount - 1 ? 'signature_zone' : 'legal_text',
    sort_order: index,
    legal_text: index === sectionCount - 1
      ? 'The parties sign this document on the dates recorded below.'
      : `This is usable starter clause ${index + 1} and forms part of the agreement.`,
  }))
  return {
    packet_type: documentType,
    template_key: `${documentType}_default_v1`,
    template_label: `${documentType} starter`,
    template_format: 'structured',
    version_tag: 'v1',
    status: 'published',
    metadata_json: {
      inherit_organisation_branding: true,
      default_signer_roles: roles,
    },
    sections,
  }
}

test('accepts complete native mandate, OTP and addendum starters', () => {
  for (const [documentType, count] of [['mandate', 10], ['otp', 12], ['addendum', 5]]) {
    const assessment = assessNativeStarterTemplate(starter(documentType, count))
    assert.equal(assessment.ready, true, assessment.blockers.join('\n'))
  }
})

test('rejects scaffold wording and incomplete starter content', () => {
  const template = starter('mandate', 10)
  template.sections[2].legal_text = 'Update this clause with company wording.'
  template.sections.pop()

  const assessment = assessNativeStarterTemplate(template)
  assert.equal(assessment.ready, false)
  assert.match(assessment.blockers.join(' '), /at least 10 sections/)
  assert.match(assessment.blockers.join(' '), /filler copy/)
  assert.match(assessment.blockers.join(' '), /visible signature section/)
})
