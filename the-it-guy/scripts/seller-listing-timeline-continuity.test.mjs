import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const appRoot = resolve(import.meta.dirname, '..')

const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090004_private_listing_timeline_continuity.sql'),
  'utf8',
)
const finalSignedFunction = readFileSync(
  resolve(repoRoot, 'supabase/functions/generate-final-signed-document/index.ts'),
  'utf8',
)
const sellerDocumentBridgeMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606010002_seller_document_transaction_bridge.sql'),
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

test('migration exposes service-only timeline continuity report', () => {
  assert.match(migration, /bridge_private_listing_timeline_continuity_report\(\)/i)
  assert.match(migration, /converted_listings_missing_mandate_activity/i)
  assert.match(migration, /completed_onboarding_missing_activity/i)
  assert.match(migration, /seller_documents_missing_activity/i)
  assert.match(migration, /completed_packets_missing_completion_event/i)
  assert.match(migration, /signed_signers_missing_packet_event/i)
  assert.match(migration, /mandate_activity_packet_orphans/i)
  assert.match(migration, /seller_document_activity_orphans/i)
  assert.match(migration, /duplicate_listing_milestone_activity/i)
  assert.match(migration, /lead_listing_link_missing_lead_activity/i)
  assert.match(migration, /revoke all on function public\.bridge_private_listing_timeline_continuity_report\(\) from authenticated/i)
  assert.match(migration, /grant execute on function public\.bridge_private_listing_timeline_continuity_report\(\) to service_role/i)
})

test('timeline report matches existing activity event semantics', () => {
  assert.match(finalSignedFunction, /activity_type:\s*"mandate_signed"/)
  assert.match(sellerDocumentBridgeMigration, /'seller_document_uploaded'/)
  assert.match(migration, /lower\(coalesce\(activity\.activity_type, ''\)\) = 'seller_onboarding_completed'/)
  assert.match(migration, /lower\(coalesce\(activity\.activity_type, ''\)\) = 'seller_document_uploaded'/)
  assert.match(migration, /lower\(coalesce\(activity\.activity_type, ''\)\) in \('mandate_signed', 'mandate signed'\)/)
})

test('timeline migration is diagnostic and does not backfill or delete history', () => {
  assert.doesNotMatch(migration, /insert into public\.private_listing_activity/i)
  assert.doesNotMatch(migration, /insert into public\.lead_activities/i)
  assert.doesNotMatch(migration, /insert into public\.document_packet_events/i)
  assert.doesNotMatch(migration, /delete from public\.private_listing_activity/i)
  assert.doesNotMatch(migration, /delete from public\.lead_activities/i)
  assert.doesNotMatch(migration, /delete from public\.document_packet_events/i)
})

test('source-of-truth contract documents timeline continuity behavior', () => {
  assert.match(sourceOfTruthContract, /## Timeline Continuity/)
  assert.match(sourceOfTruthContract, /Lead acquisition history remains lead-scoped/)
  assert.match(sourceOfTruthContract, /Seller listing milestones remain listing-scoped/)
  assert.match(sourceOfTruthContract, /Mandate signing history remains packet-scoped/)
  assert.match(sourceOfTruthContract, /Conversion must link these histories/)
  assert.match(sourceOfTruthContract, /bridge_private_listing_timeline_continuity_report\(\)/)
})

test('package exposes the timeline continuity test', () => {
  assert.equal(
    packageJson.scripts['test:seller-listing-timeline-continuity'],
    'node scripts/seller-listing-timeline-continuity.test.mjs',
  )
})

console.log('seller listing timeline continuity tests passed')
