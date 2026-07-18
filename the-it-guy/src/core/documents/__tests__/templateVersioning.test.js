import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTemplateRevisionInput,
  getTemplateRevisionNumber,
  isImmutableTemplateRevision,
  nextTemplateVersionTag,
} from '../templateVersioning.js'

function publishedTemplate() {
  return {
    id: '9f201d91-6462-4e44-91aa-4e25c97884c3',
    organisation_id: '8c928d63-36b6-4ecf-964f-301b6a6a80d5',
    packet_type: 'otp',
    module_type: 'agency',
    template_key: 'company_otp',
    template_label: 'Company OTP',
    template_format: 'structured',
    version_tag: 'v3',
    revision_number: 3,
    status: 'published',
    is_default: true,
    metadata_json: { branding: { inheritOrganisationBranding: true } },
    sections: [{
      section_key: 'sale_terms',
      section_label: 'Sale terms',
      section_type: 'legal_text',
      sort_order: 0,
      legal_text: 'The price is {{transaction.purchase_price}}.',
      placeholder_keys: ['transaction.purchase_price'],
    }],
  }
}

test('increments conventional revision tags and recognises immutable live revisions', () => {
  const source = publishedTemplate()
  assert.equal(getTemplateRevisionNumber(source), 3)
  assert.equal(nextTemplateVersionTag(source), 'v4')
  assert.equal(isImmutableTemplateRevision(source), true)
  assert.equal(isImmutableTemplateRevision({ status: 'archived', is_default: false }), true)
  assert.equal(isImmutableTemplateRevision({ status: 'draft', is_default: false }), false)
})

test('creates a distinct draft successor with stable family lineage', () => {
  const source = publishedTemplate()
  const revision = buildTemplateRevisionInput(source, {
    templateLabel: 'Company OTP 2026',
    sections: [{ sectionKey: 'sale_terms', legalText: 'Updated wording.' }],
    metadataJson: { internal_note: 'July revision' },
  }, { now: 1_800_000_000_000 })

  assert.equal(revision.versionTag, 'v4')
  assert.equal(revision.revisionNumber, 4)
  assert.equal(revision.revisionRootTemplateId, source.id)
  assert.equal(revision.revisionParentTemplateId, source.id)
  assert.equal(revision.templateStatus, 'draft')
  assert.equal(revision.isDefault, false)
  assert.equal(revision.isActive, false)
  assert.notEqual(revision.templateKey, source.template_key)
  assert.equal(revision.metadataJson.revision_parent_template_id, source.id)
  assert.equal(revision.sections[0].legalText, 'Updated wording.')
  assert.equal(source.sections[0].legal_text, 'The price is {{transaction.purchase_price}}.')
})

test('continues an existing revision family instead of starting a new one', () => {
  const source = publishedTemplate()
  source.revision_root_template_id = 'a08b31c2-d112-41a2-aacd-812ad236bd80'
  const revision = buildTemplateRevisionInput(source, {}, { now: 1234 })
  assert.equal(revision.revisionRootTemplateId, source.revision_root_template_id)
  assert.equal(revision.revisionParentTemplateId, source.id)
})
