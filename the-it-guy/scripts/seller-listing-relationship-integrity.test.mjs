import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const appRoot = resolve(import.meta.dirname, '..')

const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090002_private_listing_relationship_integrity.sql'),
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

test('migration guards future lead and transaction listing references', () => {
  assert.match(migration, /add constraint leads_listing_id_private_listings_fkey/i)
  assert.match(migration, /foreign key \(listing_id\)\s+references public\.private_listings\(id\)\s+on delete set null\s+not valid/i)
  assert.match(migration, /add constraint transactions_listing_id_private_listings_fkey/i)
  assert.match(migration, /information_schema\.columns[\s\S]*table_name = 'leads'[\s\S]*column_name = 'listing_id'[\s\S]*udt_name = 'uuid'/i)
  assert.match(migration, /information_schema\.columns[\s\S]*table_name = 'transactions'[\s\S]*column_name = 'listing_id'[\s\S]*udt_name = 'uuid'/i)
})

test('migration exposes service-only orphan and duplicate report', () => {
  assert.match(migration, /bridge_private_listing_relationship_integrity_report\(\)/i)
  assert.match(migration, /lead_listing_orphans/i)
  assert.match(migration, /transaction_listing_orphans/i)
  assert.match(migration, /private_listing_originating_lead_orphans/i)
  assert.match(migration, /private_listing_seller_lead_orphans/i)
  assert.match(migration, /duplicate_active_originating_leads/i)
  assert.match(migration, /duplicate_active_seller_leads/i)
  assert.match(migration, /revoke all on function public\.bridge_private_listing_relationship_integrity_report\(\) from authenticated/i)
  assert.match(migration, /grant execute on function public\.bridge_private_listing_relationship_integrity_report\(\) to service_role/i)
})

test('text lead links are monitored rather than destructively converted', () => {
  assert.doesNotMatch(migration, /alter table public\.private_listings[\s\S]*alter column seller_lead_id type uuid/i)
  assert.doesNotMatch(migration, /alter table public\.private_listings[\s\S]*alter column originating_crm_lead_id type uuid/i)
  assert.match(migration, /nullif\(trim\(pl\.originating_crm_lead_id\), ''\) ~\* v_uuid_regex/i)
  assert.match(migration, /nullif\(trim\(pl\.seller_lead_id\), ''\) ~\* v_uuid_regex/i)
})

test('source-of-truth contract documents relationship integrity behavior', () => {
  assert.match(sourceOfTruthContract, /## Relationship Integrity/)
  assert.match(sourceOfTruthContract, /`leads\.listing_id` and `transactions\.listing_id` are UUID links/)
  assert.match(sourceOfTruthContract, /Future writes are guarded by `NOT VALID` foreign keys/)
  assert.match(sourceOfTruthContract, /text compatibility links for now/)
  assert.match(sourceOfTruthContract, /bridge_private_listing_relationship_integrity_report\(\)/)
})

test('package exposes the relationship integrity test', () => {
  assert.equal(
    packageJson.scripts['test:seller-listing-relationship-integrity'],
    'node scripts/seller-listing-relationship-integrity.test.mjs',
  )
})

console.log('seller listing relationship integrity tests passed')
