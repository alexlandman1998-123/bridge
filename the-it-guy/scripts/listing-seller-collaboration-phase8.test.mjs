import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../supabase/migrations/20260924160026_listing_seller_collaboration_permissions_phase8.sql', root), 'utf8')
const page = await readFile(new URL('src/pages/SellerCollaborationPortal.jsx', root), 'utf8')
const panel = await readFile(new URL('src/components/listings/ListingSellerCollaborationPanel.jsx', root), 'utf8')

test('seller tables are RLS protected and not directly writable by portal users', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.private_listing_seller_participants from public, anon, authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*private_listing_seller_participants to authenticated/i)
})

test('approval is canonical and conflicts check all concurrent records', () => {
  assert.match(migration, /save_private_listing_seller_canonical_update/)
  assert.match(migration, /v_participant\.record_version <> v_request\.base_participant_version/)
  assert.match(migration, /v_listing\.updated_at is distinct from v_request\.base_listing_updated_at/)
  assert.match(migration, /v_onboarding_updated_at is distinct from v_request\.base_onboarding_updated_at/)
})

test('participant payload is allowlisted and does not return shared onboarding data', () => {
  const payloadFunction = migration.slice(migration.indexOf('bridge_listing_seller_participant_payload'), migration.indexOf('bridge_submit_listing_seller_change'))
  assert.match(payloadFunction, /visibleSections/)
  assert.doesNotMatch(payloadFunction, /to_jsonb\(v_onboarding\)/)
  assert.doesNotMatch(payloadFunction, /seller_canonical_facts_json/)
  assert.match(payloadFunction, /participantId/)
})

test('both seller and agent surfaces expose safe proposal and retry workflows', () => {
  assert.match(page, /Submit for review/)
  assert.match(page, /Other sellers’ identity, financial and compliance/)
  assert.match(page, /information is not included/)
  assert.match(panel, /Approve reviewed values/)
  assert.match(panel, /The failure is recorded and can be retried/)
  assert.match(migration, /bridge_retry_listing_seller_notification/)
  assert.match(migration, /outside your assigned seller access/)
})
