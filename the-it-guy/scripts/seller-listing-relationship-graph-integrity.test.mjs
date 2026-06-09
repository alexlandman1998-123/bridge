import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const appRoot = resolve(import.meta.dirname, '..')

const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090005_private_listing_relationship_graph_integrity.sql'),
  'utf8',
)
const idempotencyMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090001_private_listing_conversion_idempotency.sql'),
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

test('extended graph migration is diagnostic and indexes compatibility links', () => {
  assert.match(migration, /create index if not exists private_listings_seller_profile_id_idx/i)
  assert.match(migration, /create index if not exists private_listings_property_profile_id_idx/i)
  assert.match(migration, /create index if not exists leads_converted_transaction_id_idx/i)
  assert.doesNotMatch(migration, /foreign key \(seller_profile_id\)/i)
  assert.doesNotMatch(migration, /foreign key \(property_profile_id\)/i)
})

test('extended graph report covers organisation and backlink integrity', () => {
  assert.match(migration, /bridge_private_listing_relationship_graph_integrity_report\(\)/i)
  assert.match(migration, /lead_listing_organisation_mismatches/i)
  assert.match(migration, /transaction_listing_organisation_mismatches/i)
  assert.match(migration, /private_listing_originating_lead_organisation_mismatches/i)
  assert.match(migration, /private_listing_seller_lead_organisation_mismatches/i)
  assert.match(migration, /lead_contact_organisation_mismatches/i)
  assert.match(migration, /transaction_seller_contact_organisation_mismatches/i)
  assert.match(migration, /listing_mandate_packet_organisation_mismatches/i)
  assert.match(migration, /lead_mandate_packet_organisation_mismatches/i)
  assert.match(migration, /lead_transaction_listing_mismatches/i)
  assert.match(migration, /transactions_without_listing_backlink_to_lead/i)
  assert.match(migration, /duplicate_transactions_per_listing/i)
})

test('extended graph report keeps text lead links compatible with existing idempotency guard', () => {
  assert.match(idempotencyMigration, /private_listings_one_active_originating_lead_idx/i)
  assert.match(idempotencyMigration, /private_listings_one_active_seller_lead_idx/i)
  assert.match(migration, /nullif\(trim\(pl\.originating_crm_lead_id\), ''\) ~\* v_uuid_regex/i)
  assert.match(migration, /nullif\(trim\(pl\.seller_lead_id\), ''\) ~\* v_uuid_regex/i)
  assert.match(migration, /l\.lead_id::text = nullif\(trim\(pl\.originating_crm_lead_id\), ''\)/i)
  assert.match(migration, /l\.lead_id::text = nullif\(trim\(pl\.seller_lead_id\), ''\)/i)
})

test('extended graph report is service-only', () => {
  assert.match(migration, /revoke all on function public\.bridge_private_listing_relationship_graph_integrity_report\(\) from authenticated/i)
  assert.match(migration, /grant execute on function public\.bridge_private_listing_relationship_graph_integrity_report\(\) to service_role/i)
})

test('source-of-truth contract documents graph integrity behavior', () => {
  assert.match(sourceOfTruthContract, /bridge_private_listing_relationship_graph_integrity_report\(\)/)
  assert.match(sourceOfTruthContract, /lead\/listing\/transaction organisation mismatches/)
  assert.match(sourceOfTruthContract, /converted lead transaction links pointing at a different listing/)
  assert.match(sourceOfTruthContract, /multiple transactions attached to the same listing/)
  assert.match(sourceOfTruthContract, /remain compatibility links until the canonical seller\/property profile tables are/)
})

test('package exposes the graph integrity test', () => {
  assert.equal(
    packageJson.scripts['test:seller-listing-relationship-graph-integrity'],
    'node scripts/seller-listing-relationship-graph-integrity.test.mjs',
  )
})

console.log('seller listing relationship graph integrity tests passed')
