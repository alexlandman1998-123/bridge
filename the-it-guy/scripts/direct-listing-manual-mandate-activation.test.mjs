import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const guardRemovalMigrationSource = readFileSync(new URL('../../supabase/migrations/202608250001_remove_listing_mandate_activation_guards.sql', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Quick Add active-listing readiness is not mandate-upload gated', () => {
  assert.doesNotMatch(agentListingsSource, /function canQuickListingActivateWithMandateStatus/)
  assert.match(agentListingsSource, /signed: manualMandateFileSelected/)
  assert.doesNotMatch(agentListingsSource, /Upload the signed hard-copy mandate before marking the listing Active\./)
  assert.doesNotMatch(agentListingsSource, /Manual evidence cannot finalize a mandate or activate this listing/)
  assert.doesNotMatch(agentListingsSource, /requires canonical packet completion before the listing can activate/)
})

test('database mandate activation guards are removed', () => {
  assert.match(guardRemovalMigrationSource, /drop trigger if exists trg_private_listing_mandate_completion_phase0/)
  assert.match(guardRemovalMigrationSource, /drop trigger if exists trg_listing_publication_mandate_completion_phase0/)
  assert.match(guardRemovalMigrationSource, /drop trigger if exists trg_listing_external_publication_mandate_completion_phase0/)
  assert.match(guardRemovalMigrationSource, /drop function if exists public\.bridge_require_completed_or_manual_mandate_phase0/)
})
