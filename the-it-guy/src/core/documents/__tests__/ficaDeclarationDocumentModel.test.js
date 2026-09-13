import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFicaDeclarationDocumentModel,
  getBuyerFicaDeclarationRequirement,
} from '../ficaDeclarationDocumentModel.js'
import { buildFicaDeclarationDocumentMarkup } from '../ficaDeclarationDocumentMarkup.js'

test('renders a standalone buyer FICA declaration with transaction, entity and signature details', () => {
  const model = buildFicaDeclarationDocumentModel({
    partyType: 'buyer',
    party: {
      name: 'Alex Buyer',
      entityType: 'company',
      idNumber: '8001015009087',
      email: 'alex@example.test',
      entity: { name: 'Buyer Holdings (Pty) Ltd', registrationNumber: '2026/123456/07', authorityBasis: 'Director resolution' },
    },
    transaction: { reference: 'TXN-123' },
    property: { address: '1 Main Road, Cape Town' },
    documentRequirements: [{ label: 'Company registration', status: 'required' }],
    signing: { signers: [{ name: 'Alex Buyer', roleLabel: 'Authorised signatory', status: 'Signed', signedAt: '2026-09-13T10:00:00Z', signature: 'Alex Buyer' }] },
    branding: { organisationName: 'Arch9 Test Agency' },
  })
  const html = buildFicaDeclarationDocumentMarkup(model)

  assert.equal(model.title, 'Buyer FICA Declaration')
  assert.match(html, /Buyer FICA Declaration/)
  assert.match(html, /Buyer Holdings \(Pty\) Ltd/)
  assert.match(html, /TXN-123/)
  assert.match(html, /Company registration/)
  assert.match(html, /Alex Buyer/)
  assert.doesNotMatch(html, /Declaration by Seller - Annexure A/)
})

test('keeps supplied seller sections and renders a separate seller declaration', () => {
  const model = buildFicaDeclarationDocumentModel({
    partyType: 'seller',
    sections: [
      { title: 'Seller', rows: [{ label: 'Seller name', value: 'Sam Seller' }] },
      { title: 'Entity / Authority', rows: [{ label: 'Authority basis', value: 'Power of attorney' }] },
    ],
    declaration: { wording: 'Approved declaration wording.', wordingVersion: 'seller-fica-v2' },
  })
  const html = buildFicaDeclarationDocumentMarkup(model)

  assert.equal(model.title, 'Seller FICA Declaration')
  assert.match(html, /Sam Seller/)
  assert.match(html, /Approved declaration wording\./)
  assert.match(html, /seller-fica-v2/)
  assert.doesNotMatch(html, /Disclosure question/)
})

test('exposes the phase-two buyer declaration requirement without adding it to existing onboarding screens', () => {
  assert.deepEqual(getBuyerFicaDeclarationRequirement(), {
    key: 'buyer_fica_declaration',
    label: 'Buyer FICA Declaration',
    documentType: 'buyer_fica_declaration',
    category: 'fica_declaration',
    source: 'buyer_onboarding.fica_declaration',
    systemGenerated: true,
  })
})
