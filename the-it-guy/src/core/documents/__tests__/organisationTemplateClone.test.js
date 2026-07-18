import test from 'node:test'
import assert from 'node:assert/strict'

import { buildOrganisationTemplateCloneInput } from '../organisationTemplateClone.js'

function nativeSource() {
  return {
    id: 'source-template-id',
    packet_type: 'mandate',
    module_type: 'agency',
    template_key: 'mandate_default_v1',
    template_label: 'Seller Mandate · Arch9 Starter',
    template_format: 'structured',
    version_tag: 'v4',
    status: 'published',
    metadata_json: {
      template_storage_path: 'legacy/template.docx',
      default_signer_roles: ['seller', 'agent'],
      branding: { inheritOrganisationBranding: true, accentColor: '#123456' },
    },
    sections: [
      {
        section_key: 'second_clause',
        section_label: 'Second clause',
        section_type: 'legal_text',
        sort_order: 1,
        legal_text: 'This clause remains independently editable.',
      },
      {
        section_key: 'custom_clause',
        section_label: 'Company condition',
        section_type: 'legal_text',
        sort_order: 0,
        legal_text: 'The company-specific condition applies.',
        metadata_json: { custom: true },
      },
    ],
  }
}

test('builds an independent organisation-owned native draft with lineage', () => {
  const source = nativeSource()
  const clone = buildOrganisationTemplateCloneInput(source, {
    templateLabel: 'Our Seller Mandate',
    variantLabel: 'Sole mandate',
    now: 1_800_000_000_000,
  })

  assert.equal(clone.templateLabel, 'Our Seller Mandate')
  assert.equal(clone.templateFormat, 'structured')
  assert.equal(clone.templateStatus, 'draft')
  assert.equal(clone.isActive, false)
  assert.equal(clone.isDefault, false)
  assert.equal(clone.templateStoragePath, null)
  assert.equal(clone.metadataJson.source_template_id, 'source-template-id')
  assert.equal(clone.metadataJson.clone_parent_template_id, 'source-template-id')
  assert.deepEqual(clone.sections.map((section) => section.sectionKey), ['custom_clause', 'second_clause'])
  assert.equal(clone.sections[0].metadataJson.custom, true)

  clone.sections[0].legalText = 'Changed company wording.'
  assert.equal(source.sections[1].legal_text, 'The company-specific condition applies.')
})

test('allows multiple variants with distinct keys', () => {
  const source = nativeSource()
  const first = buildOrganisationTemplateCloneInput(source, { variantLabel: 'Residential', now: 1000 })
  const second = buildOrganisationTemplateCloneInput(source, { variantLabel: 'Residential', now: 2000 })
  assert.notEqual(first.templateKey, second.templateKey)
})

test('blocks legacy DOCX cloning into the native company builder', () => {
  const source = nativeSource()
  source.template_format = 'docx'
  assert.throws(
    () => buildOrganisationTemplateCloneInput(source),
    (error) => error?.code === 'LEGACY_TEMPLATE_CLONE_BLOCKED',
  )
})
