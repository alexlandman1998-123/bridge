import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const migrationSource = readFileSync(new URL('../../supabase/migrations/202608120001_manual_mandate_listing_activation.sql', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('manual mandate upload can satisfy Quick Add active-listing readiness', () => {
  assert.match(agentListingsSource, /function canQuickListingActivateWithMandateStatus\(mandateStatus = '', form = \{\}\)/)
  assert.match(agentListingsSource, /isQuickListingManualMandateReportedStatus\(mandateStatus\) && Boolean\(normalizeText\(form\?\.manualMandateFileName\)\)/)
  assert.match(agentListingsSource, /signed: manualMandateFileSelected/)
  assert.match(agentListingsSource, /Upload the signed hard-copy mandate before marking the listing Active\./)
  assert.doesNotMatch(agentListingsSource, /Manual evidence cannot finalize a mandate or activate this listing/)
  assert.doesNotMatch(agentListingsSource, /requires canonical packet completion before the listing can activate/)
})

test('database guard accepts manual evidence and hard-copy pending capture', () => {
  assert.match(migrationSource, /bridge_listing_has_manual_mandate_evidence_phase0/)
  assert.match(migrationSource, /manual_mandate_evidence/)
  assert.match(migrationSource, /signed_mandate/)
  assert.match(migrationSource, /storage_path/)
  assert.match(migrationSource, /file_url/)
  assert.match(migrationSource, /signed_external_pending_upload/)
  assert.match(migrationSource, /p_allow_pending_manual/)
  assert.match(migrationSource, /not v_public_distribution_requested/)
})
