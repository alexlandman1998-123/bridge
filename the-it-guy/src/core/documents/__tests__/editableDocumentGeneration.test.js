import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveEditableSectionManifest,
  resolveVersionPlannedSigningFields,
} from '../editableDocumentGeneration.js'
import { renderStructuredTemplate } from '../structuredTemplateRenderer.js'

test('uses edited clause text as the native document body', () => {
  const sections = resolveEditableSectionManifest({
    editableSections: [{
      key: 'special_conditions',
      label: 'Special Conditions',
      content: 'The purchaser must provide {{buyer_full_name}} with written confirmation.',
      tokens: [{ token: 'buyer_full_name', label: 'Buyer full name' }],
    }],
  })

  const rendered = renderStructuredTemplate({
    packetType: 'otp',
    title: 'Offer to Purchase',
    sections,
    placeholders: { buyer_full_name: 'Example Buyer' },
  })

  assert.match(rendered.html, /The purchaser must provide/)
  assert.match(rendered.html, /Example Buyer/)
  assert.match(rendered.html, /with written confirmation\./)
  assert.doesNotMatch(rendered.html, /\{\{buyer_full_name\}\}/)
})

test('preserves template signature and initials blocks for signing preparation', () => {
  const sections = resolveEditableSectionManifest({
    editableSections: [{
      key: 'signatures',
      label: 'Signatures',
      content: 'Signed by the parties.',
      signingFields: [
        { signerRole: 'seller', fieldType: 'signature', pageNumber: 2, xPosition: 70, yPosition: 690, width: 168, height: 44 },
        { signerRole: 'purchaser_1', fieldType: 'initial', pageNumber: 1, xPosition: 480, yPosition: 748, width: 44, height: 18 },
      ],
    }],
  })
  const fields = resolveVersionPlannedSigningFields({ section_manifest_json: sections })

  assert.deepEqual(fields.map((field) => [field.signerRole, field.fieldType, field.pageNumber]), [
    ['seller', 'signature', 2],
    ['purchaser_1', 'initial', 1],
  ])
})
