import test from 'node:test'
import assert from 'node:assert/strict'
import { assessAppliedEnvelopeDispatch } from '../appliedEnvelopeDispatch.js'

const field = { signerRole: 'seller', fieldType: 'signature', pageNumber: 1, xPosition: 72, yPosition: 700, width: 180, height: 48, required: true }
const version = { transaction_pdf_persisted: true }
const layout = { status: 'applied', placement_verified: true, fields_json: [field] }

test('accepts fields matching the applied visual layout', () => {
  const materialized = { signer_role: 'seller', field_type: 'signature', page_number: 1, x_position: 72, y_position: 700, width: 180, height: 48, required: true }
  assert.equal(assessAppliedEnvelopeDispatch({ version, layout, fields: [materialized] }).ready, true)
})

test('rejects coordinate drift after layout application', () => {
  const result = assessAppliedEnvelopeDispatch({ version, layout, fields: [{ ...field, xPosition: 80 }] })
  assert.ok(result.reasons.includes('E4_APPLIED_LAYOUT_FIELD_MISMATCH'))
})

test('rejects an uncertified PDF', () => {
  const result = assessAppliedEnvelopeDispatch({ version: {}, layout, fields: [field] })
  assert.ok(result.reasons.includes('E4_CERTIFIED_PDF_REQUIRED'))
})
