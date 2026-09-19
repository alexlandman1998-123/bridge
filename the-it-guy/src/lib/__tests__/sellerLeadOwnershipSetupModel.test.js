import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SELLER_LEAD_OWNERSHIP_ROUTES,
  applySellerLeadOwnershipRoute,
  prepareSellerOnboardingRoute,
  resolveSellerLeadOwnershipRoute,
} from '../sellerLeadOwnershipSetupModel.js'

test('seller lead routes reuse listing routes and add the missing POA route', () => {
  assert.equal(SELLER_LEAD_OWNERSHIP_ROUTES.some((route) => route.value === 'company'), true)
  assert.equal(SELLER_LEAD_OWNERSHIP_ROUTES.some((route) => route.value === 'trust'), true)
  assert.equal(SELLER_LEAD_OWNERSHIP_ROUTES.some((route) => route.value === 'power_of_attorney'), true)
})

test('selecting a seller lead route writes the canonical ownership fields', () => {
  const company = applySellerLeadOwnershipRoute({ firstName: 'Jane' }, 'company')
  const poa = applySellerLeadOwnershipRoute({}, 'power_of_attorney')

  assert.deepEqual(company, {
    firstName: 'Jane',
    sellerOwnershipRoute: 'company',
    ownershipType: 'company',
    ownershipRouteConfirmed: true,
    ownership_route_confirmed: true,
    ownershipDeclarationPending: false,
    ownership_declaration_pending: false,
    ownerEntityType: 'company',
    ownerStructureType: 'company',
    sellerLegalType: 'company',
  })
  assert.equal(resolveSellerLeadOwnershipRoute(poa), 'power_of_attorney')
})

test('preparing onboarding preserves known facts and locks the agent-selected legal route', () => {
  const prepared = prepareSellerOnboardingRoute({
    formData: { sellerFirstName: 'Jane', ownerEntityType: 'natural_person' },
    canonicalSellerFacts: { seller: { company_name: 'Kingdom Holdings (Pty) Ltd' } },
    subject: {
      kind: 'company',
      ownership: { entityType: 'company', structureType: 'company', ownershipType: 'company' },
    },
    lockedAt: '2026-09-19T10:30:00.000Z',
  })

  assert.equal(prepared.sellerFirstName, 'Jane')
  assert.equal(prepared.ownerEntityType, 'company')
  assert.equal(prepared.sellerOwnershipRoute, 'company')
  assert.equal(prepared.ownershipRouteLocked, true)
  assert.equal(prepared.ownershipRouteLockedAt, '2026-09-19T10:30:00.000Z')
  assert.equal(prepared.canonicalSellerFacts.seller.company_name, 'Kingdom Holdings (Pty) Ltd')
})

test('preparing onboarding permits generic fact collection when legal ownership is not known yet', () => {
  const prepared = prepareSellerOnboardingRoute({
    formData: { sellerFirstName: 'Alex' },
    subject: { kind: 'unknown' },
  })

  assert.equal(prepared.sellerFirstName, 'Alex')
  assert.equal(prepared.ownershipDeclarationPending, true)
  assert.equal(prepared.ownershipRouteLocked, false)
  assert.equal(prepared.ownershipRouteConfirmed, false)
  assert.equal(prepared.ownershipType, '')
})
