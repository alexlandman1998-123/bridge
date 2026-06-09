import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildSellerOnboardingPublicationDraft,
  mergePublicationDraft,
} from '../src/services/sellerListingPublicationMapper.js'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const finalSignedFunction = readFileSync(
  resolve(repoRoot, 'supabase/functions/generate-final-signed-document/index.ts'),
  'utf8',
)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const listing = {
  id: 'listing-1',
  title: 'Listing title',
  addressLine1: '12 Listing Road',
  suburb: 'Listing Suburb',
  province: 'Western Cape',
  propertyType: 'house',
  askingPrice: 2450000,
}

test('maps seller onboarding fields into publication draft data', () => {
  const draft = buildSellerOnboardingPublicationDraft({
    listing,
    formData: {
      propertyAddress: '22 Seller Street',
      suburb: 'Green Point',
      province: 'WC',
      propertyType: 'apartment',
      askingPrice: '2800000',
      bedrooms: '3',
      bathrooms: '2.5',
      garages: '1',
      parkingCovered: '1',
      parkingOpen: '2',
      floorSize: '140',
      erfSize: '300',
      ratesTaxes: '1500',
      levies: '2400',
      propertyNotes: 'Bright north-facing apartment.',
      pool: true,
      electricFence: true,
      features: ['balcony', 'Solar'],
    },
  })

  assert.equal(draft.title, '22 Seller Street')
  assert.equal(draft.address, '22 Seller Street')
  assert.equal(draft.suburb, 'Green Point')
  assert.equal(draft.propertyType, 'apartment')
  assert.equal(draft.askingPrice, 2800000)
  assert.equal(draft.bedrooms, 3)
  assert.equal(draft.bathrooms, 2.5)
  assert.equal(draft.garages, 1)
  assert.equal(draft.parkingBays, 3)
  assert.equal(draft.floorSize, 140)
  assert.equal(draft.erfSize, 300)
  assert.equal(draft.ratesTaxes, 1500)
  assert.equal(draft.levies, 2400)
  assert.equal(draft.description, 'Bright north-facing apartment.')
  assert.deepEqual(new Set(draft.features), new Set(['balcony', 'solar', 'pool', 'electric_fence']))
  assert.equal(draft.status, 'Draft')
})

test('uses canonical facts when direct onboarding fields are absent', () => {
  const draft = buildSellerOnboardingPublicationDraft({
    listing: { id: 'listing-2' },
    formData: {
      canonicalSellerFacts: {
        property: {
          address: '4 Canonical Lane',
          suburb: 'Sandton',
          province: 'Gauteng',
          property_type: 'estate',
          floor_size: 210,
          erf_size: 500,
          rates_taxes: 2200,
          levies: 1800,
          estate_or_hoa: true,
        },
        transaction: {
          asking_price: 3100000,
        },
        compliance: {
          swimming_pool: true,
          solar_installation: true,
        },
      },
    },
  })

  assert.equal(draft.address, '4 Canonical Lane')
  assert.equal(draft.suburb, 'Sandton')
  assert.equal(draft.propertyType, 'estate')
  assert.equal(draft.askingPrice, 3100000)
  assert.equal(draft.floorSize, 210)
  assert.equal(draft.erfSize, 500)
  assert.equal(draft.ratesTaxes, 2200)
  assert.equal(draft.levies, 1800)
  assert.deepEqual(new Set(draft.features), new Set(['pool', 'solar', 'estate_or_hoa']))
})

test('merge preserves existing agent-edited publication values', () => {
  const merged = mergePublicationDraft(
    {
      title: 'Agent edited title',
      bedrooms: 4,
      features: ['agent_feature'],
      status: 'Ready',
    },
    {
      title: 'Seller title',
      address: 'Seller address',
      bedrooms: 3,
      bathrooms: 2,
      features: ['pool'],
      status: 'Draft',
    },
  )

  assert.equal(merged.title, 'Agent edited title')
  assert.equal(merged.address, 'Seller address')
  assert.equal(merged.bedrooms, 4)
  assert.equal(merged.bathrooms, 2)
  assert.deepEqual(merged.features, ['agent_feature'])
  assert.equal(merged.status, 'Ready')
})

test('signed mandate conversion syncs publication draft without media replacement path', () => {
  assert.match(finalSignedFunction, /function buildPublicationDraftFromSellerOnboarding/)
  assert.match(finalSignedFunction, /syncListingPublicationDraftFromSellerOnboarding/)
  assert.match(finalSignedFunction, /\.from\("listing_publication_data"\)/)
  assert.doesNotMatch(finalSignedFunction, /listing_media"\)\s*\.delete\(\)\s*\.eq\("listing_id"/)
})

console.log('seller listing publication mapper tests passed')
