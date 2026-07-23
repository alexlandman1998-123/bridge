import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const server = await createServer({ root: PROJECT_ROOT, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const service = await server.ssrLoadModule('/src/services/bondReferralTermsService.js')
  const originatorOrganisationId = '11111111-1111-4111-8111-111111111111'
  const agencyOrganisationId = '22222222-2222-4222-8222-222222222222'
  const applicationId = '33333333-3333-4333-8333-333333333333'

  const terms = service.normalizeBondReferralTerms({
    id: '44444444-4444-4444-8444-444444444444',
    originatorOrganisationId,
    agencyOrganisationId,
    version: 3,
    calculationBasis: 'originator_commission',
    rateType: 'percentage',
    percentage: 25,
    status: 'accepted',
  })
  assert.equal(terms.status, 'accepted')
  assert.equal(terms.calculationBasis, 'originator_commission')
  assert.equal(service.calculateBondReferralCommission(terms, { bondAmount: 1000000, grossCommission: 19500 }), 4875)

  const grossBondTerms = service.normalizeBondReferralTerms({
    originatorOrganisationId,
    agencyOrganisationId,
    calculationBasis: 'gross_bond_amount',
    rateType: 'percentage',
    percentage: 0.3,
  })
  assert.equal(service.calculateBondReferralCommission(grossBondTerms, { bondAmount: 1000000, grossCommission: 19500 }), 3000)

  const entry = service.buildBondReferralLedgerEntry({
    terms,
    application: { id: applicationId, bondAmount: 1000000, grossCommission: 19500 },
    beneficiary: { type: 'agency', id: agencyOrganisationId, name: 'Harcourts Bedfordview' },
  })
  assert.equal(entry.applicationId, applicationId)
  assert.equal(entry.termVersion, 3)
  assert.equal(entry.amountExpected, 4875)
  assert.equal(entry.status, 'expected')

  console.log('bondReferralTermsService tests passed')
} finally {
  await server.close()
}
