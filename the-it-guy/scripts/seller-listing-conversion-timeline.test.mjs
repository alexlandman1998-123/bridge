import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const appRoot = resolve(import.meta.dirname, '..')

const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090006_private_listing_conversion_timeline.sql'),
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

test('migration exposes read-only conversion timeline RPC', () => {
  assert.match(migration, /create or replace function public\.bridge_private_listing_conversion_timeline\(/i)
  assert.match(migration, /p_private_listing_id uuid default null/i)
  assert.match(migration, /p_lead_id uuid default null/i)
  assert.match(migration, /returns jsonb/i)
  assert.match(migration, /grant execute on function public\.bridge_private_listing_conversion_timeline\(uuid, uuid\) to authenticated/i)
})

test('timeline aggregates all seller conversion history source tables', () => {
  for (const source of [
    'lead_activities',
    'lead_communication_events',
    'private_listings',
    'private_listing_seller_onboarding',
    'private_listing_activity',
    'private_listing_documents',
    'document_packets',
    'document_packet_events',
    'document_packet_signers',
    'transactions',
    'transaction_events',
  ]) {
    assert.match(migration, new RegExp(`'${source}'`, 'i'), `timeline should include ${source}`)
  }
})

test('timeline resolves context from listing or lead links', () => {
  assert.match(migration, /select l\.listing_id[\s\S]*from public\.leads l[\s\S]*where l\.lead_id = v_lead_id/i)
  assert.match(migration, /nullif\(trim\(pl\.originating_crm_lead_id\), ''\) = v_lead_id::text/i)
  assert.match(migration, /nullif\(trim\(pl\.seller_lead_id\), ''\) = v_lead_id::text/i)
  assert.match(migration, /case\s+when nullif\(trim\(coalesce\(pl\.originating_crm_lead_id, ''\)\), ''\) ~\*/i)
  assert.match(migration, /case\s+when nullif\(trim\(coalesce\(pl\.seller_lead_id, ''\)\), ''\) ~\*/i)
  assert.match(migration, /select coalesce\(array_agg\(distinct t\.id\), array\[\]::uuid\[\]\)/i)
})

test('timeline preserves source boundaries and chronological order', () => {
  assert.match(migration, /'sourceTable', source_table/i)
  assert.match(migration, /'eventType', event_type/i)
  assert.match(migration, /'sourceId', source_id/i)
  assert.match(migration, /'occurredAt', occurred_at/i)
  assert.match(migration, /order by occurred_at asc, source_table asc, source_id asc/i)
})

test('timeline RPC is read-only and access scoped', () => {
  assert.match(migration, /if not public\.bridge_is_active_member\(v_organisation_id\) then/i)
  assert.doesNotMatch(migration, /insert into public\./i)
  assert.doesNotMatch(migration, /update public\./i)
  assert.doesNotMatch(migration, /delete from public\./i)
})

test('source-of-truth contract documents timeline RPC behavior', () => {
  assert.match(sourceOfTruthContract, /bridge_private_listing_conversion_timeline\(private_listing_id,\s*lead_id\)/)
  assert.match(sourceOfTruthContract, /assembles the end-to-end seller conversion audit trail/)
  assert.match(sourceOfTruthContract, /without copying or mutating history/)
  assert.match(sourceOfTruthContract, /chronological order/)
})

test('package exposes the conversion timeline test', () => {
  assert.equal(
    packageJson.scripts['test:seller-listing-conversion-timeline'],
    'node scripts/seller-listing-conversion-timeline.test.mjs',
  )
})

console.log('seller listing conversion timeline tests passed')
