import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const appRoot = resolve(import.meta.dirname, '..')

const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090001_private_listing_conversion_idempotency.sql'),
  'utf8',
)
const finalSignedFunction = readFileSync(
  resolve(repoRoot, 'supabase/functions/generate-final-signed-document/index.ts'),
  'utf8',
)
const sourceOfTruthContract = readFileSync(
  resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('migration enforces one active listing per originating CRM lead', () => {
  assert.match(migration, /create unique index if not exists private_listings_one_active_originating_lead_idx/i)
  assert.match(migration, /organisation_id,\s*\(\s*nullif\(trim\(originating_crm_lead_id\), ''\)/i)
  assert.match(migration, /coalesce\(listing_status, ''\) <> 'withdrawn'/i)
  assert.match(migration, /coalesce\(listing_visibility, ''\) <> 'archived'/i)
})

test('migration enforces one active listing per seller lead', () => {
  assert.match(migration, /create unique index if not exists private_listings_one_active_seller_lead_idx/i)
  assert.match(migration, /organisation_id,\s*\(\s*nullif\(trim\(seller_lead_id\), ''\)/i)
})

test('signed mandate conversion searches all canonical lead/listing links before insert', () => {
  assert.match(finalSignedFunction, /const linkedListingId = normalizeText\(existingListingId \|\| lead\?\.listing_id\)/)
  assert.match(finalSignedFunction, /fetchSignedMandateListingById/)
  assert.match(finalSignedFunction, /column: "originating_crm_lead_id"/)
  assert.match(finalSignedFunction, /column: "seller_lead_id"/)
})

test('signed mandate conversion recovers from duplicate insert conflicts', () => {
  assert.match(finalSignedFunction, /function isUniqueViolation/)
  assert.match(finalSignedFunction, /normalizeText\(details\.code\) === "23505"/)
  assert.match(finalSignedFunction, /if \(!isUniqueViolation\(insert\.error\)\) throw insert\.error/)
  assert.match(finalSignedFunction, /listing = await findExistingSignedMandateListing/)
  assert.match(finalSignedFunction, /existingListingFound = true/)
})

test('signed mandate conversion preserves branch attribution on fallback listing creation', () => {
  assert.match(finalSignedFunction, /SIGNED_MANDATE_LISTING_SELECT =\s*\n\s*"[^"]*branch_id/)
  assert.match(finalSignedFunction, /\.select\("lead_id, organisation_id, branch_id, assigned_branch_id, assigned_agent_id/)
  assert.match(finalSignedFunction, /function resolveSignedMandateBranchId/)
  assert.match(finalSignedFunction, /listing\?\.branch_id[\s\S]*lead\?\.branch_id[\s\S]*lead\?\.assigned_branch_id[\s\S]*sourceContext\.branchId[\s\S]*sourceLead\.branch_id/)
  assert.match(finalSignedFunction, /branch_id: branchId,\s*\n\s*seller_lead_id:/)
  assert.match(finalSignedFunction, /organisation_id: organisationId,\s*\n\s*branch_id: branchId,\s*\n\s*assigned_agent_id:/)
  assert.match(finalSignedFunction, /branchId: branchId \|\| null/)
  assert.match(finalSignedFunction, /branch_id: branchId \|\| sourceContext\.branch_id \|\| null/)
})

test('converted listings own operational fields after mandate signed', () => {
  assert.match(finalSignedFunction, /function listingAlreadyOwnsOperationalFields/)
  assert.match(finalSignedFunction, /"mandate_signed", "active", "under_offer", "transaction_created", "sold", "withdrawn"/)
  assert.match(finalSignedFunction, /const listingOwnsOperationalFields = listingAlreadyOwnsOperationalFields\(listing\.listing_status\)/)
  assert.match(finalSignedFunction, /title: listingOwnsOperationalFields \? normalizeText\(listing\.title\) \|\| null : firstMissingText\(listing\.title, title\)/)
  assert.match(finalSignedFunction, /address_line_1: listingOwnsOperationalFields \? normalizeText\(listing\.address_line_1\) \|\| null : firstMissingText\(listing\.address_line_1, address\)/)
  assert.match(finalSignedFunction, /asking_price: listingOwnsOperationalFields \? normalizeNumber\(listing\.asking_price\) : firstMissingNumber\(listing\.asking_price, askingPrice\)/)
})

test('source-of-truth contract documents post-conversion ownership', () => {
  assert.match(sourceOfTruthContract, /Seller Lead to Listing Source of Truth/)
  assert.match(sourceOfTruthContract, /After a listing reaches `mandate_signed` or later/)
  assert.match(sourceOfTruthContract, /must not\s+backfill or overwrite listing-owned operational fields from a later-edited lead/)
  assert.match(sourceOfTruthContract, /Seller Lead as the acquisition record/)
  assert.match(sourceOfTruthContract, /Listing as the\s+operational marketing record/)
})

test('package exposes the conversion idempotency test', () => {
  assert.equal(
    packageJson.scripts['test:seller-listing-conversion-idempotency'],
    'node scripts/seller-listing-conversion-idempotency.test.mjs',
  )
})

console.log('seller listing conversion idempotency tests passed')
