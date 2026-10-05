import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const sql = await fs.readFile(new URL('./sql/seller-mvp-acceptance-audit.sql', import.meta.url), 'utf8')
const db = new PGlite()
try {
  await db.exec(`
    create table private_listings(id uuid primary key, listing_type text, seller_canonical_facts_json jsonb);
    create table private_listing_seller_onboarding(id uuid primary key, private_listing_id uuid, status text, form_data jsonb, canonical_facts_json jsonb);
    create table private_listing_document_requirements(private_listing_id uuid, requirement_key text);
    create table private_listing_documents(private_listing_id uuid, status text);
    create table private_listing_seller_portal_signing_documents(id uuid primary key, private_listing_id uuid, status text, signed_at timestamptz);
    create table private_listing_seller_portal_signature_evidence(signing_document_id uuid);
  `)
  const expected = new Map()
  async function seed(action, { form = {}, onboarding = {}, listing = onboarding, status = 'completed', portal = '', evidence = false } = {}) {
    const id = randomUUID()
    expected.set(id, action)
    await db.query('insert into private_listings values($1,null,$2)', [id, JSON.stringify(listing)])
    await db.query('insert into private_listing_seller_onboarding values($1,$2,$3,$4,$5)', [randomUUID(), id, status, JSON.stringify(form), JSON.stringify(onboarding)])
    if (portal) {
      const documentId = randomUUID()
      await db.query('insert into private_listing_seller_portal_signing_documents values($1,$2,$3,null)', [documentId, id, portal])
      if (evidence) await db.query('insert into private_listing_seller_portal_signature_evidence values($1)', [documentId])
    }
    return id
  }
  await seed('review_completed_capture', { form: { sellerFirstName: 'Synthetic Seller' } })
  await seed('finish_capture_before_canonical_save', { form: { seller_first_name: 'Synthetic Seller' }, status: 'in_progress' })
  await seed('review_canonical_conflict', { onboarding: { seller: { name: 'Synthetic A' } }, listing: { seller: { name: 'Synthetic B' } } })
  await seed('metadata_difference_no_content_repair', { onboarding: { seller: { name: 'Synthetic A' }, context: { source: 'onboarding' } }, listing: { seller: { name: 'Synthetic A' }, context: { source: 'listing' } } })
  const approved = await seed('review_conflict_preserve_frozen_copies', { onboarding: { seller: { name: 'Synthetic A' } }, listing: {}, form: { sellerOnboardingManualSigningPack: { documents: [{ key: 'signed_mandate', versionId: 'synthetic-version', generatedHtml: 'IMMUTABLE HTML' }] } } })
  const signed = await seed('review_conflict_preserve_frozen_copies', { onboarding: { seller: { name: 'Synthetic A' } }, listing: {}, portal: 'sent', evidence: true })
  await seed('outside_seller_sale_scope', { listing: { listingType: 'Rental', rentalInfo: {} }, status: 'not_started' })
  await seed('regenerate_unsigned_draft_on_review', { form: { seller_onboarding_manual_signing_pack: { documents: [{ key: 'signed_mandate', generatedHtml: 'UNAPPROVED DRAFT' }] } } })
  await seed('confirm_legal_owner', { form: { ownerStructureType: 'company' } })
  const compatibility = []
  for (const mandateType of ['sole', 'exclusive', 'open', 'dual']) {
    for (const status of ['prepared', 'sent', 'partially_signed', 'signed', 'reviewed']) {
      const id = await seed('preserve_legacy_mandate_review_replacement', { portal: status, evidence: status === 'partially_signed',
        form: { seller_onboarding_manual_signing_pack: { documents: [{ key: 'signed_mandate', mandateTerms: { mandateType },
          versionId: 'unchanged-legacy-version', versionDigest: 'unchanged-legacy-digest', generatedHtml: 'UNCHANGED LEGACY HTML' }] } } })
      compatibility.push(id)
    }
  }
  const historyOnly = await seed('review_legacy_copy_preserve_evidence', { form: { sellerOnboardingManualSigningPack: {
    documents: [{ key: 'signed_mandate', generatedHtml: 'CURRENT UNSIGNED DRAFT' }],
    versionHistory: [{ documents: [{ key: 'signed_mandate', versionId: 'old-approved-version', generatedHtml: 'OLD APPROVED HTML' }] }] } } })
  for (const version of [1, 2]) await seed('review_mandate_compatibility_preserve_copies', { form: { sellerOnboardingManualSigningPack: {
    documents: [{ key: 'signed_mandate', versionId: 'captured-version', versionDigest: 'captured-digest', mandateTerms: { mandateCapture: { version } } }] } } })
  await seed('review_mandate_compatibility_preserve_copies', { form: { mandateCapture: { version: 2, futureSchedule: 'Retain original value' } } })
  await seed('review_mandate_compatibility_preserve_copies', { form: { sellerOnboardingManualSigningPack: {
    documents: [{ key: 'signed_mandate', versionId: 'full-version', versionDigest: 'full-digest', templateVersion: 'seller-mandate-dual-2026-10-04-v1' }] } } })
  const tables = ['private_listings', 'private_listing_seller_onboarding', 'private_listing_documents', 'private_listing_seller_portal_signing_documents', 'private_listing_seller_portal_signature_evidence']
  const snapshot = async () => Promise.all(tables.map(async table => (await db.query(`select jsonb_agg(to_jsonb(row)) as rows from ${table} row`)).rows))
  const before = await snapshot()
  const rows = (await db.exec(sql)).find(result => result.rows?.length)?.rows

  test('actual SQL classifies capture, canonical conflicts, rental scope and unsigned drafts', () => {
    assert.equal(rows.length, expected.size)
    for (const row of rows) {
      assert.equal(row.recommended_action, expected.get(row.listing_id))
      assert.equal(row.automatic_repair_allowed, false)
    }
  })
  test('approved HTML and even partial signature evidence require preservation', () => {
    assert.equal(rows.find(row => row.listing_id === approved).has_approved_copies, true)
    assert.equal(rows.find(row => row.listing_id === signed).has_signed_history, true)
    for (const id of compatibility) assert.equal(rows.find(row => row.listing_id === id).has_approved_copies, true)
    assert.equal(rows.find(row => row.listing_id === historyOnly).has_approved_copies, true)
    assert.equal(rows.find(row => row.listing_id === historyOnly).has_copy_history, true)
  })
  test('review output cannot leak captured names, HTML or signature values', () => {
    assert.ok(!JSON.stringify(rows).includes('Synthetic A'))
    assert.ok(!JSON.stringify(rows).includes('IMMUTABLE HTML'))
  })
  test('the read-only SQL leaves source facts, copies and evidence untouched', async () => {
    assert.deepEqual(await snapshot(), before)
  })
} finally {
  // Node runs registered tests after module evaluation; close after their work.
  test.after(async () => db.close())
}
