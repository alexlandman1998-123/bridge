import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSellerDocumentSourceOfTruth } from '../sellerDocumentRequirementsService.js'
import { buildSellerReadinessSummary } from '../sellerReadinessService.js'

test('seller readiness sends an agent to ownership setup before onboarding when the route is unresolved', () => {
  const readiness = buildSellerReadinessSummary({
    lead: {
      leadCategory: 'seller',
      stage: 'Contacted',
      sellerName: 'Alex Landman',
      sellerEmail: 'alex@example.com',
    },
    contact: { firstName: 'Alex', lastName: 'Landman', email: 'alex@example.com' },
    listing: {},
  })

  assert.equal(readiness.nextAction.id, 'setup_seller_ownership')
  assert.equal(readiness.blockers.some((item) => item.id === 'seller_ownership_setup_required'), true)
  assert.equal(readiness.actions.find((item) => item.id === 'send_seller_onboarding')?.disabled, true)
})

test('document source exposes the same company legal owner and signer context', () => {
  const source = buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'listing-1',
      sellerCanonicalFacts: {
        seller: {
          owner_entity_type: 'company',
          owner_structure_type: 'company',
          first_name: 'Jane',
          surname: 'Smith',
          email: 'jane@example.com',
          company: {
            name: 'Kingdom Holdings (Pty) Ltd',
            registration_number: '2020/123456/07',
            authorised_signatory: { name: 'John Doe' },
          },
        },
      },
    },
  })

  assert.deepEqual(source.sellerSubject, {
    kind: 'company',
    legalOwnerName: 'Kingdom Holdings (Pty) Ltd',
    primaryContactName: 'Jane Smith',
    requiredSignerNames: ['John Doe'],
    authorityRequirement: 'Company resolution and authorised signatory',
    onboardingReady: true,
    requiredSetupFields: [],
  })
  assert.equal(source.rows.every((row) => row.sellerSubject.kind === 'company'), true)
})
