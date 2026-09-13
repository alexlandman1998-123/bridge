import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFicaComplianceCertificateModel } from '../ficaComplianceCertificateModel.js'
import { renderFicaComplianceCertificateMarkup } from '../ficaComplianceCertificateMarkup.js'

test('FICA certificate only contains the approved summary, never sensitive evidence', () => {
  const input = {
    certificateReference: 'FICA-123', party: { name: 'Alex Buyer', role: 'buyer', idNumber: 'ID-SECRET' }, transaction: { reference: 'TX-9', propertyAddress: '1 Private Road' },
    provider: { name: 'Knowledge Factory', reference: 'KF-9', overallStatus: 'clear', expiresAt: '2027-01-01', rawPayload: 'RAW-SECRET', checkSummary: [{ label: 'Sanctions screening', status: 'clear' }] },
    approval: { reviewerName: 'Compliance Team', approvedAt: '2026-09-13' }, generatedAt: '2026-09-13', supportingDocuments: ['PASSPORT-SECRET'],
  }
  const model = buildFicaComplianceCertificateModel(input)
  const markup = renderFicaComplianceCertificateMarkup(input)
  assert.equal(JSON.stringify(model).includes('ID-SECRET'), false)
  assert.equal(JSON.stringify(model).includes('RAW-SECRET'), false)
  assert.equal(markup.includes('ID-SECRET'), false)
  assert.equal(markup.includes('RAW-SECRET'), false)
  assert.equal(markup.includes('PASSPORT-SECRET'), false)
  assert.match(markup, /FICA Compliance Certificate/)
})
