import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../../../../supabase/migrations/20260927122535_seller_physical_signing_version_review.sql', import.meta.url), 'utf8')
const listingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const requirementId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const versionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const versionDigest = 'sha256:current'

test('physical seller document review requires the current frozen version', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.private_listing_document_requirements (
        id uuid primary key, private_listing_id uuid not null, requirement_key text not null
      );
      create table public.private_listing_seller_onboarding (
        private_listing_id uuid not null, form_data jsonb not null, updated_at timestamptz not null default now()
      );
      create table public.private_listing_documents (
        id uuid primary key, private_listing_id uuid not null, requirement_id uuid,
        document_type text not null, status text not null, storage_path text,
        reviewed_signing_version_id uuid, reviewed_signing_version_digest text,
        reviewed_by uuid, reviewed_at timestamptz, review_reason text
      );
    `)
    await db.exec(migration)
    await db.query('insert into public.private_listing_document_requirements values ($1, $2, $3)', [requirementId, listingId, 'signed_fica_declaration'])
    const mandateRequirement = '66666666-6666-4666-8666-666666666666'
    const disclosureRequirement = '77777777-7777-4777-8777-777777777777'
    await db.query('insert into public.private_listing_document_requirements values ($1, $2, $3)', [mandateRequirement, listingId, 'signed_mandate'])
    await db.query('insert into public.private_listing_document_requirements values ($1, $2, $3)', [disclosureRequirement, listingId, 'signed_disclosure_form'])
    await db.query('insert into public.private_listing_seller_onboarding (private_listing_id, form_data) values ($1, $2)', [listingId, JSON.stringify({ sellerOnboardingManualSigningPack: { documents: [
      { key: 'signed_fica_declaration', versionId, versionDigest },
      { key: 'signed_mandate', versionId, versionDigest },
      { key: 'signed_disclosure_form', versionId, versionDigest },
    ] } })])

    const insert = (id, reviewedId = versionId, digest = versionDigest) => db.query(
      'insert into public.private_listing_documents values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, listingId, requirementId, 'signed_fica_declaration', 'uploaded', 'signed.pdf', reviewedId, digest],
    )
    const approve = (id, reason = 'All required signatures checked') => db.query(
      'update public.private_listing_documents set status = $2, reviewed_by = $3, reviewed_at = now(), review_reason = $4 where id = $1',
      [id, 'approved', 'abababab-abab-4aba-8aba-abababababab', reason],
    )

    const matching = '11111111-1111-4111-8111-111111111111'
    await insert(matching)
    await approve(matching)
    assert.equal((await db.query('select status from public.private_listing_documents where id = $1', [matching])).rows[0].status, 'approved')

    for (const [id, linkedRequirement, type] of [
      ['88888888-8888-4888-8888-888888888888', mandateRequirement, 'signed_mandate'],
      ['99999999-9999-4999-8999-999999999999', disclosureRequirement, 'signed_disclosure_form'],
    ]) {
      await db.query('insert into public.private_listing_documents values ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, listingId, linkedRequirement, type, 'uploaded', 'signed.pdf', versionId, versionDigest])
      await approve(id)
      assert.equal((await db.query('select status from public.private_listing_documents where id = $1', [id])).rows[0].status, 'approved')
    }

    const stale = '22222222-2222-4222-8222-222222222222'
    await insert(stale, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'sha256:older')
    await assert.rejects(approve(stale), /does not match the current reviewed physical signing copy/)

    const unversioned = '33333333-3333-4333-8333-333333333333'
    await insert(unversioned, null, null)
    await assert.rejects(approve(unversioned), /does not match the current reviewed physical signing copy/)

    const noAttestation = '12121212-1212-4121-8121-121212121212'
    await insert(noAttestation)
    await assert.rejects(approve(noAttestation, ''), /lacks a recorded signature review/)

    assert.equal((await db.query('select status from public.private_listing_documents where id = $1', [stale])).rows[0].status, 'uploaded')
    assert.equal((await db.query('select status from public.private_listing_documents where id = $1', [unversioned])).rows[0].status, 'uploaded')

    // Portal signing finalizes through a separate evidence-checked insert.
    const portal = '44444444-4444-4444-8444-444444444444'
    await db.query('insert into public.private_listing_documents values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [portal, listingId, requirementId, 'signed_fica_declaration', 'approved', null, versionId, versionDigest])
    assert.equal((await db.query('select status from public.private_listing_documents where id = $1', [portal])).rows[0].status, 'approved')

    // Existing standalone signed uploads remain reviewable without a new pack.
    const legacyListing = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const legacyRequirement = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const legacyDocument = '55555555-5555-4555-8555-555555555555'
    await db.query('insert into public.private_listing_document_requirements values ($1, $2, $3)', [legacyRequirement, legacyListing, 'signed_mandate'])
    await db.query('insert into public.private_listing_documents values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [legacyDocument, legacyListing, legacyRequirement, 'signed_mandate', 'uploaded', 'legacy.pdf', null, null])
    await approve(legacyDocument)
    assert.equal((await db.query('select status from public.private_listing_documents where id = $1', [legacyDocument])).rows[0].status, 'approved')
  } finally {
    await db.close()
  }
})
