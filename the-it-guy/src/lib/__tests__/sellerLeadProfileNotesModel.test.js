import assert from 'node:assert/strict'
import test from 'node:test'

import { getSellerProfileNarrativeNotes } from '../sellerLeadProfileNotesModel.js'

test('canvassing conversion metadata is not a seller disclosure', () => {
  assert.equal(getSellerProfileNarrativeNotes('Canvassing Method: Cold Call | Source: Cold Call | Canvassing Prospect ID: 123'), '')
})

test('keeps genuine notes while filtering conversion metadata', () => {
  assert.equal(
    getSellerProfileNarrativeNotes('Seller disclosed a leak | Canvassing Method: Cold Call | Source: Cold Call'),
    'Seller disclosed a leak',
  )
})

test('uses another narrative source if the first contains only metadata', () => {
  assert.equal(getSellerProfileNarrativeNotes('Source: Cold Call', 'Owner requests a morning call'), 'Owner requests a morning call')
})
