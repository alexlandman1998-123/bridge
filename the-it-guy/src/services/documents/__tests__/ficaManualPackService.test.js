import assert from 'node:assert/strict'
import test from 'node:test'
import { buildManualFicaPackContext, buildManualFicaPackDocument } from '../ficaManualPackService.js'

test('manual FICA pack requires party, signer and lead or transaction context', () => {
  const incomplete = buildManualFicaPackContext({ party: 'buyer', partyType: 'individual' })
  assert.equal(incomplete.complete, false)
  assert.ok(incomplete.missing.includes('signer name'))
  const document = buildManualFicaPackDocument({
    party: 'seller', partyType: 'trust', signerName: 'Toni Trustee', signerCapacity: 'Authorised trustee', leadId: 'lead-1',
  })
  assert.equal(document.requirementKey, 'seller_fica_declaration')
  assert.equal(document.source, 'agent_physical_upload')
})
