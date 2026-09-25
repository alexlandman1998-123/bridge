import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildListingSellerHistoricalNormalization } from '../src/services/listings/listingSellerHistoricalNormalizationModel.js'
import { auditOrganisationSellerHistory, getListingSellerHistoricalNormalization, previewListingSellerHistoricalNormalization } from '../src/services/listings/listingSellerHistoricalNormalizationService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const migrationPath = path.join(root, 'supabase/migrations/20260924161509_listing_seller_historical_normalization_phase9.sql')

test('normalization model exposes remediation for uncertain and pending records', () => {
  const conflict = buildListingSellerHistoricalNormalization({ classification: 'inconsistent', requiresAgentReview: true })
  assert.equal(conflict.actionLabel, 'Review conflicts')
  assert.equal(conflict.tone, 'danger')

  const pending = buildListingSellerHistoricalNormalization({
    classification: 'configured', normalizationStatus: 'backfilled_pending_confirmation', inferredProfileType: 'trust',
  })
  assert.equal(pending.requiresReview, true)
  assert.equal(pending.requirementsRebuildAllowed, false)
  assert.match(pending.description, /before the document checklist changes/i)
})

test('audit read and batch preview use non-mutating RPC contracts', async () => {
  const calls = []
  const client = { rpc: async (name, args) => {
    calls.push([name, args])
    if (name === 'bridge_get_listing_seller_historical_audit') return { data: { listingId: 'listing-1', classification: 'unconfigured', requiresAgentReview: true }, error: null }
    return { data: { applied: false, results: [] }, error: null }
  } }
  const audit = await getListingSellerHistoricalNormalization('listing-1', client)
  const preview = await previewListingSellerHistoricalNormalization(['listing-1', 'listing-1'], client)
  await auditOrganisationSellerHistory('org-1', { limit: 20, offset: 5 }, client)
  assert.equal(audit.classification, 'unconfigured')
  assert.equal(preview.applied, false)
  assert.deepEqual(calls[1][1], { p_listing_ids: ['listing-1'], p_apply: false })
  assert.deepEqual(calls[2], ['bridge_audit_listing_seller_history', { p_organisation_id: 'org-1', p_limit: 20, p_offset: 5 }])
})

test('migration preserves history and gates backfill and requirement rebuilds', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /classification in \('configured','unconfigured','ambiguous','inconsistent'\)/)
  assert.match(sql, /source_snapshot jsonb not null/)
  assert.match(sql, /source_fingerprint text not null/)
  assert.match(sql, /bridge_audit_listing_seller_history/)
  assert.match(sql, /v_audit - 'sourceSnapshot'/)
  assert.match(sql, /if p_apply then\s+insert into public\.private_listing_seller_normalization_audits/i)
  assert.match(sql, /and v_canonical_type is null/)
  assert.match(sql, /'status','pending_confirmation'/)
  assert.match(sql, /'requirementsRebuilt',false/)
  assert.match(sql, /with \(security_invoker = true\)/)
  assert.match(sql, /immutable_signed_history/)
  assert.doesNotMatch(sql, /update\s+public\.private_listing_documents/i)
  assert.doesNotMatch(sql, /update\s+public\.private_listing_document_requirements/i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.private_listing_documents/i)
})

test('seller workspace shows the remediation action in both seller states', async () => {
  const page = await readFile(path.join(root, 'the-it-guy/src/pages/AgentListingDetail.jsx'), 'utf8')
  const occurrences = page.match(/<ListingSellerHistoricalNormalizationBanner/g) || []
  assert.equal(occurrences.length, 2)
  assert.match(page, /Review the historical seller record/)
})
