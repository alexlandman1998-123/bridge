import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBuyerFicaDeclarationSigningState,
  getBuyerFicaDeclarationSigners,
  isBuyerFicaDeclarationSigned,
} from '../buyerFicaDeclarationSigning.js'

test('buyer FICA declaration requires each natural-person purchaser to sign', () => {
  const state = buildBuyerFicaDeclarationSigningState({
    purchasers: [{ first_name: 'Ava', last_name: 'Buyer' }, { first_name: 'Noah', last_name: 'Buyer' }],
  })
  assert.equal(state.signers.length, 2)
  assert.equal(isBuyerFicaDeclarationSigned(state), false)
  const signed = { ...state, acknowledgementAccepted: true, signers: state.signers.map((item) => ({ ...item, signature: item.name, signedAt: '2026-09-13T10:00:00.000Z' })) }
  assert.equal(isBuyerFicaDeclarationSigned(signed), true)
})

test('company and trust declarations use the captured authorised representative', () => {
  assert.equal(getBuyerFicaDeclarationSigners({ purchaserEntityType: 'company', company: { authorised_signatory_name: 'Ada Director' } })[0].roleLabel, 'Authorised signatory')
  assert.equal(getBuyerFicaDeclarationSigners({ purchaserEntityType: 'trust', trust: { authorised_trustee_name: 'Toni Trustee' } })[0].roleLabel, 'Authorised trustee')
})
