import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  resolveMandateReadiness,
  resolveMandateSellerOnboardingFormData,
} from '../src/core/documents/mandateReadiness.js'

const migration = await readFile(
  new URL('../../supabase/migrations/202608010001_seller_onboarding_progress_fast_return.sql', import.meta.url),
  'utf8',
)

const readiness = resolveMandateReadiness({
  lead: {
    sellerOnboardingStatus: 'completed',
    sellerOnboarding: {
      status: 'completed',
      submittedAt: '2026-07-31T19:20:00.000Z',
      formData: {},
      canonicalFacts: {
        seller: {
          first_name: 'Alexander',
          surname: 'Landman',
          email: 'alexanderlandman1998@gmail.com',
          phone: '0676125009',
          owner_entity_type: 'individual',
          owner_structure_type: 'individual',
          marital_status: 'single',
          marital_regime: 'single',
        },
        property: {
          address: '409 Queens Cres, Nr3',
          address_line_1: '409 Queens Cres, Nr3',
          suburb: 'Lynnwood',
          city: 'Pretoria',
          province: 'Gauteng',
          property_structure_type: 'full_title',
          property_category: 'residential',
        },
        transaction: {
          asking_price: 12000000,
          mandate_type: 'sole',
        },
      },
    },
  },
  contact: {
    firstName: 'Alexander',
    lastName: 'Landman',
    email: 'alexanderlandman1998@gmail.com',
    phone: '0676125009',
  },
  agent: {
    fullName: 'Alexander Landman',
    email: 'alex.produktive.training@arch9.test',
  },
})

assert.equal(readiness.rows.find((row) => row.key === 'property')?.ready, true)
assert.equal(readiness.rows.find((row) => row.key === 'asking_price')?.ready, true)
assert.equal(readiness.rows.find((row) => row.key === 'legal_route')?.ready, true)
assert.deepEqual(readiness.blockers, [])

const mergedFormData = resolveMandateSellerOnboardingFormData({
  sellerCanonicalFacts: {
    seller: {
      first_name: 'Alexander',
      email: 'old@example.com',
    },
    property: {
      address: 'Old lead address',
    },
    transaction: {
      asking_price: 1000000,
    },
  },
  privateListing: {
    sellerCanonicalFacts: {
      seller: {
        surname: 'Landman',
        email: 'new@example.com',
      },
      property: {
        address: '409 Queens Cres, Nr3',
        property_title_type: 'sectional_title',
      },
      transaction: {
        asking_price: 12000000,
      },
    },
  },
})

assert.equal(mergedFormData.sellerFirstName, 'Alexander')
assert.equal(mergedFormData.sellerSurname, 'Landman')
assert.equal(mergedFormData.sellerEmail, 'new@example.com')
assert.equal(mergedFormData.propertyAddress, '409 Queens Cres, Nr3')
assert.equal(mergedFormData.propertyTitleType, 'sectional_title')
assert.equal(mergedFormData.askingPrice, 12000000)

const listingPriceReadiness = resolveMandateReadiness({
  lead: {
    estimatedValue: 1000000,
    sellerOnboarding: {
      status: 'completed',
      formData: {},
      canonicalFacts: {},
    },
  },
  privateListing: {
    askingPrice: 12000000,
  },
})

assert.equal(listingPriceReadiness.facts.askingPrice, 12000000)
assert.equal(listingPriceReadiness.rows.find((row) => row.key === 'asking_price')?.ready, true)

assert.match(
  migration,
  /create or replace function public\.bridge_update_private_listing_seller_onboarding_progress\(/,
)
assert.match(migration, /'requirements', '\[\]'::jsonb/)
assert.match(migration, /'documents', '\[\]'::jsonb/)
assert.doesNotMatch(migration, /bridge_private_listing_seller_portal_payload\(p_token\)/)

console.log('canonical mandate readiness and progress fast-return contract passed')
