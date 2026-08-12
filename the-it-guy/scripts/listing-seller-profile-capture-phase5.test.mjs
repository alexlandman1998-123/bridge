import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION,
  syncSellerDocumentRequirements,
} from '../src/lib/sellerDocumentRequirementEngine.js'

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('shared seller requirement sync stamps retired requirements with lifecycle metadata', () => {
  const sync = syncSellerDocumentRequirements({
    id: 'listing-switch',
    sellerType: 'trust',
    sellerOnboarding: {
      status: 'in_progress',
      formData: {
        sellerType: 'trust',
        ownershipType: 'trust',
        trustName: 'Family Property Trust',
        propertyAddress: '20 Trust Avenue',
      },
    },
  }, [
    {
      id: 'company-reg',
      private_listing_id: 'listing-switch',
      requirement_key: 'company_registration',
      requirement_name: 'Company Registration Documents',
      requirement_group: 'company',
      status: 'requested',
      is_required: true,
    },
  ])
  const retired = sync.markNotApplicableRows.find((row) => row.requirement_key === 'company_registration')

  assert.ok(retired, 'Expected stale company requirement to be retired.')
  assert.equal(retired.status, 'not_applicable')
  assert.equal(retired.is_required, false)
  assert.equal(retired.retired, true)
  assert.equal(retired.retiredBySellerRequirementSync, true)
  assert.equal(retired.retirementVersion, LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION)
  assert.equal(retired.retirementReason, 'seller_requirement_model_changed')
  assert.equal(retired.generated_from.archived, true)
  assert.equal(retired.generated_from.retirement_version, LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION)
  assert.equal(retired.generated_from.retired_by, 'seller_requirement_sync')
})

await test('private listing requirement sync persists retirement metadata and audit keys', async () => {
  const source = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')

  assert.ok(source.includes('LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION'), 'Service should use the shared retirement version.')
  assert.ok(source.includes("status: 'not_applicable'"), 'Service should persist retired rows as not applicable.')
  assert.ok(source.includes('archived_by_reason'), 'Service should persist the sync reason in generated_from metadata.')
  assert.ok(source.includes('retiredRequirementKeys'), 'Service activity metadata should record which requirements were retired.')
  assert.ok(source.includes('retirementVersion'), 'Service activity metadata should record the retirement contract version.')
})

console.log('listing seller profile capture phase 5 checks passed.')
