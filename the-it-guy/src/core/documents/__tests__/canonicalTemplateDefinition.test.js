import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCanonicalTemplateDefinition,
  validateCanonicalTemplateDefinition,
} from '../canonicalTemplateDefinition.js'

test('normalizes a native mandate into the canonical editable template contract', () => {
  const definition = buildCanonicalTemplateDefinition({
    id: 'template-1',
    organisation_id: 'organisation-1',
    packet_type: 'mandate',
    module_type: 'agency',
    template_key: 'seller_mandate',
    template_label: 'Seller Mandate',
    template_format: 'structured',
    version_tag: 'v3',
    status: 'published',
    metadata_json: {
      branding: { accentColor: '#123456' },
      default_signer_roles: [{ role: 'seller', label: 'Property seller' }],
    },
    sections: [
      {
        section_key: 'terms',
        section_label: 'Mandate terms',
        sort_order: 10,
        legal_text: 'The mandate is granted by {{seller.full_name}}.',
        placeholder_keys: ['seller.full_name'],
        condition_json: { field: 'mandate_type', equals: 'sole' },
      },
      {
        section_key: 'signatures',
        section_label: 'Signatures',
        sort_order: 20,
        legal_text: 'Signed by the parties.',
        metadata_json: {
          planned_signing_fields: [{ signerRole: 'agent', fieldType: 'signature' }],
        },
      },
    ],
  })

  assert.equal(definition.schemaVersion, 1)
  assert.equal(definition.name, 'Seller Mandate')
  assert.equal(definition.documentType, 'mandate')
  assert.equal(definition.organisationId, 'organisation-1')
  assert.deepEqual(definition.version, { tag: 'v3', number: 3 })
  assert.equal(definition.status, 'active')
  assert.equal(definition.sourceMode, 'native')
  assert.deepEqual(definition.sections.map((section) => [section.key, section.order]), [['terms', 0], ['signatures', 1]])
  assert.deepEqual(definition.mergeFields, ['seller.full_name'])
  assert.deepEqual(definition.defaultSignerRoles.map((role) => role.role), ['seller', 'agent'])
  assert.equal(definition.branding.accentColor, '#123456')
  assert.equal(validateCanonicalTemplateDefinition(definition).valid, true)
})

test('normalizes legacy records without making DOCX the authoritative definition', () => {
  const definition = buildCanonicalTemplateDefinition({
    packet_type: 'otp',
    template_key: 'legacy_otp',
    template_label: 'Legacy OTP',
    template_format: 'docx',
    is_active: true,
    sections: [{ section_key: 'sale', section_label: 'Sale', legal_text: 'Property sold as described.' }],
  })

  assert.equal(definition.sourceMode, 'legacy_docx')
  assert.equal(definition.status, 'active')
  assert.equal(definition.sections[0].content, 'Property sold as described.')
})

test('rejects duplicate section keys', () => {
  const definition = buildCanonicalTemplateDefinition({
    packet_type: 'otp',
    template_label: 'OTP',
    sections: [
      { section_key: 'terms', section_label: 'Terms', legal_text: 'One' },
      { section_key: 'terms', section_label: 'Terms again', legal_text: 'Two' },
    ],
  })

  const validation = validateCanonicalTemplateDefinition(definition)
  assert.equal(validation.valid, false)
  assert.match(validation.blockers.join(' '), /Duplicate template section key/)
})
