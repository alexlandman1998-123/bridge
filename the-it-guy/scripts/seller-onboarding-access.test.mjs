import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildSellerLeadManualCapturePayload, buildSellerLeadSigningPackTermsPatch } from '../src/lib/sellerLeadManualCaptureModel.js'
import { buildListingSellerCanonicalUpdate, applyListingSellerCanonicalUpdateSnapshot } from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { buildSellerSigningPlan } from '../src/lib/sellerSigningPlanModel.js'
import { buildSellerOnboardingSigningPackSnapshot } from '../src/core/documents/sellerOnboardingSigningPackSnapshot.js'
import { buildSellerPostOnboardingDrafts } from '../src/core/documents/sellerPostOnboardingDrafts.js'
import { createSellerOnboardingSigningCopyPack } from '../src/core/documents/sellerOnboardingManualSigningPack.js'
import { createSellerReviewedDocumentVersions, verifySellerReviewedDocumentVersion } from '../src/core/documents/sellerReviewedDocumentVersions.js'
import { buildSellerDocumentSourceOfTruth } from '../src/services/sellerDocumentRequirementsService.js'

const migration = readFileSync(new URL('../../supabase/migrations/20261001092739_seller_onboarding_access_enforcement.sql', import.meta.url), 'utf8')
const completionMigration = readFileSync(new URL('../../supabase/migrations/20260906163555_corrective_seller_onboarding_receipt.sql', import.meta.url), 'utf8')
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const listingA = uuid(1), listingB = uuid(2), agentA = uuid(11), agentB = uuid(12), adminA = uuid(13), outsider = uuid(14)

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated;
    create function extensions.digest(text, text) returns bytea language sql immutable as $$select sha256(convert_to($1, 'UTF8'))$$;
    create table private_listings (
      id uuid primary key, organisation_id uuid, assigned_agent_id uuid,
      listing_status text default 'seller_lead', seller_onboarding_status text default 'not_started',
      seller_type text, seller_canonical_facts_json jsonb default '{}', seller_canonical_fact_readiness_json jsonb default '{}',
      seller_canonical_facts_updated_at timestamptz, updated_at timestamptz,
      originating_crm_lead_id uuid, seller_lead_id uuid
    );
    create table private_listing_seller_onboarding (
      id uuid primary key default gen_random_uuid(), private_listing_id uuid not null references private_listings(id),
      token text unique not null, token_expires_at timestamptz, seller_portal_token text,
      seller_portal_password_hash text, seller_portal_access_token_hash text,
      seller_portal_recovery_token_hash text, seller_portal_invite_token_hash text,
      seller_portal_invite_consumed_at timestamptz, seller_portal_invite_expires_at timestamptz,
      seller_portal_access_token_expires_at timestamptz, seller_portal_link_expires_at timestamptz,
      seller_portal_link_active boolean default true, status text default 'not_started',
      form_data jsonb default '{}', seller_type text, ownership_structure text, marital_regime text,
      canonical_facts_json jsonb default '{}', canonical_fact_readiness_json jsonb default '{}',
      canonical_facts_updated_at timestamptz, updated_at timestamptz, submitted_at timestamptz
    );
    -- This fixture supplies the existing listing permission contract; the
    -- migration under test must not replace or broaden that helper.
    create function bridge_can_access_private_listing(target_listing_id uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
      select coalesce((select assigned_agent_id = auth.uid() or
        (organisation_id = '${uuid(21)}' and auth.uid() = '${adminA}')
        from public.private_listings where id = target_listing_id), false)
    $$;
    create function bridge_private_listing_seller_portal_link_is_active(o jsonb, l jsonb) returns boolean
    language sql stable as $$select coalesce((o->>'seller_portal_link_active')::boolean,true)
      and (o->>'seller_portal_link_expires_at' is null or (o->>'seller_portal_link_expires_at')::timestamptz > now())$$;
    grant all on private_listing_seller_onboarding to anon, authenticated;
    alter table private_listing_seller_onboarding enable row level security;
    create policy private_listing_seller_onboarding_mutate_member on private_listing_seller_onboarding for all to authenticated using (true) with check (true);
    create policy private_listing_seller_onboarding_select_token on private_listing_seller_onboarding for select to anon using (token is not null);
    create policy unexpected_historical_allow on private_listing_seller_onboarding for all to public using (true) with check (true);
    insert into private_listings(id, organisation_id, assigned_agent_id) values
      ('${listingA}','${uuid(21)}','${agentA}'), ('${listingB}','${uuid(22)}','${agentB}');
    insert into private_listing_seller_onboarding(id,private_listing_id,token,seller_portal_token,form_data,
      seller_portal_password_hash,seller_portal_access_token_hash,seller_portal_invite_token_hash,seller_portal_recovery_token_hash) values
      ('${uuid(31)}','${listingA}','token-a','stable-a','{"sellerName":"Owner A","currentStep":2}', 'password-secret','access-secret','invite-secret','recovery-secret'),
      ('${uuid(32)}','${listingB}','token-b','stable-b','{"sellerName":"Owner B"}', null,null,null,null);
    insert into private_listing_seller_onboarding(id,private_listing_id,token,token_expires_at,seller_portal_token) values
      ('${uuid(33)}','${listingB}','expired',now()-interval '1 second','stable-expired-legacy');
  `)
  await db.exec(completionMigration)
  await db.exec(migration)
  return db
}
async function actor(db, role, id = '') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
  await db.exec(`set role ${role}`)
}
async function rpc(db, name, token, data = undefined) {
  const args = data === undefined ? [token] : [token, JSON.stringify(data)]
  const sqlArgs = data === undefined ? '$1' : '$1, p_form_data := $2::jsonb'
  return (await db.query(`select public.${name}(${sqlArgs}) result`, args)).rows[0].result
}

test('policies remove historical bypasses; assigned agents/admins remain scoped for CRUD', async () => {
  const db = await fixture()
  try {
    assert.equal((await db.query("select count(*)::int n from pg_policies where tablename='private_listing_seller_onboarding'")).rows[0].n, 1)
    for (const statement of ['select * from private_listing_seller_onboarding', "update private_listing_seller_onboarding set status='completed'", 'delete from private_listing_seller_onboarding', `insert into private_listing_seller_onboarding(private_listing_id,token) values ('${listingA}','forged')`]) {
      await actor(db, 'anon')
      await assert.rejects(db.query(statement), /permission denied/)
    }
    for (const user of [agentA, adminA]) {
      await actor(db, 'authenticated', user)
      assert.deepEqual((await db.query('select token from private_listing_seller_onboarding')).rows, [{ token: 'token-a' }])
      assert.equal((await db.query("update private_listing_seller_onboarding set seller_type='company' where token='token-a' returning id")).rows.length, 1)
      assert.equal((await db.query("update private_listing_seller_onboarding set seller_type='forged' where token='token-b' returning id")).rows.length, 0)
      await assert.rejects(db.query('update private_listing_seller_onboarding set private_listing_id=$1 where token=$2', [listingB, 'token-a']), /row-level security/)
      await assert.rejects(db.query('insert into private_listing_seller_onboarding(private_listing_id,token) values ($1,$2)', [listingB, 'forged']), /row-level security/)
      assert.equal((await db.query("delete from private_listing_seller_onboarding where token='token-b' returning id")).rows.length, 0)
      await db.query('insert into private_listing_seller_onboarding(private_listing_id,token) values ($1,$2)', [listingA, 'agent-created'])
      assert.equal((await db.query("delete from private_listing_seller_onboarding where token='agent-created' returning id")).rows.length, 1)
    }
    await actor(db, 'authenticated', agentB)
    assert.deepEqual((await db.query('select distinct private_listing_id from private_listing_seller_onboarding')).rows, [{ private_listing_id: listingB }])
    await actor(db, 'authenticated', outsider)
    assert.equal((await db.query('select * from private_listing_seller_onboarding')).rows.length, 0)
    assert.equal((await db.query("update private_listing_seller_onboarding set status='completed' returning id")).rows.length, 0)
  } finally { await db.close() }
})

test('exact valid tokens read/save/submit; invalid or expired tokens cannot; canonical drafts persist atomically', async () => {
  const db = await fixture()
  try {
    for (const role of ['anon', 'authenticated']) {
      await actor(db, role, role === 'authenticated' ? outsider : '')
      for (const token of ['', 'wrong', 'expired', 'stable-a']) {
        assert.equal(await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', token), null)
        assert.equal(await rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', token, { sellerName: 'forged' }), null)
        assert.equal(await rpc(db, 'bridge_complete_private_listing_seller_onboarding', token, {}), null)
        assert.equal(await rpc(db, 'bridge_get_private_listing_seller_onboarding_completion', token), null)
      }
      const row = await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', 'token-a')
      assert.equal(row.private_listing_id, listingA)
      assert.equal(row.form_data.sellerName, 'Owner A')
      assert.doesNotMatch(JSON.stringify(row), /password-secret|access-secret|invite-secret|recovery-secret/)
      const facts = { seller: { name: 'Owner A' }, property: { existingBond: false } }
      const progress = await rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', 'token-a', {
        currentStep: 3, canonicalSellerFacts: facts, canonicalSellerFactReadiness: { ready: false }, marker: role,
      })
      assert.equal(progress.onboarding.form_data.currentStep, 3)
      assert.equal(progress.onboarding.form_data.sellerName, 'Owner A')
      assert.deepEqual(progress.onboarding.canonical_facts_json, facts)
      assert.deepEqual(progress.listing.seller_canonical_facts_json, facts)
      assert.doesNotMatch(JSON.stringify(progress.onboarding), /password-secret|access-secret|invite-secret|recovery-secret/)
      const receipt = await rpc(db, 'bridge_complete_private_listing_seller_onboarding', 'token-a', { currentStep: 4, canonicalSellerFacts: facts })
      assert.equal(receipt.listingId, listingA)
      assert.equal(receipt.status, 'completed')
      assert.deepEqual(await rpc(db, 'bridge_get_private_listing_seller_onboarding_completion', 'token-a'), receipt)
      const reloaded = await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', 'token-a')
      assert.equal(reloaded.form_data.currentStep, 4)
      assert.equal(reloaded.status, 'completed')
      assert.equal((await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', 'token-b')).form_data.sellerName, 'Owner B')
    }
    await actor(db, 'authenticated', agentA)
    await db.query("update private_listing_seller_onboarding set seller_portal_link_active=false where token='token-a'")
    await actor(db, 'anon')
    assert.equal(await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', 'token-a'), null)
  } finally { await db.close() }
})

test('private resolver rejects expired onboarding links and preserves independent stable-link validity', async () => {
  const db = await fixture()
  try {
    assert.equal((await db.query("select token_valid from bridge_resolve_private_listing_seller_portal_token('expired')")).rows[0].token_valid, false)
    assert.equal((await db.query("select token_valid from bridge_resolve_private_listing_seller_portal_token('stable-expired-legacy')")).rows[0].token_valid, true)
    for (const role of ['anon', 'authenticated']) {
      await actor(db, role, outsider)
      await assert.rejects(db.query("select * from bridge_resolve_private_listing_seller_portal_token('token-a')"), /permission denied/)
    }
  } finally { await db.close() }
})


test('a listing update failure rolls back the token draft instead of leaving partial saved data', async () => {
  const db = await fixture()
  try {
    await db.exec(`create function reject_listing_update() returns trigger language plpgsql as $$begin raise exception 'simulated listing failure'; end$$;
      create trigger reject_listing_update before update on private_listings for each row execute function reject_listing_update();`)
    await actor(db, 'anon')
    await assert.rejects(rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', 'token-a', { currentStep: 99 }), /simulated listing failure/)
    const reloaded = await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', 'token-a')
    assert.equal(reloaded.form_data.currentStep, 2)
    assert.equal(reloaded.status, 'not_started')
  } finally { await db.close() }
})

test('step-only progress does not overwrite either existing canonical snapshot', async () => {
  const db = await fixture()
  try {
    await db.query("update private_listings set seller_canonical_facts_json=$1 where id=$2", [{ property: { address: 'Existing listing address' } }, listingA])
    await db.query("update private_listing_seller_onboarding set canonical_facts_json=$1 where token='token-a'", [{ seller: { name: 'Existing owner' } }])
    await actor(db, 'anon')
    const saved = await rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', 'token-a', { currentStep: 3 })
    assert.deepEqual(saved.listing.seller_canonical_facts_json, { property: { address: 'Existing listing address' } })
    assert.deepEqual(saved.onboarding.canonical_facts_json, { seller: { name: 'Existing owner' } })
  } finally { await db.close() }
})

test('agent canonical save persists listing and onboarding together, rejects stale edits and rolls back failed writes', async () => {
  const db = await fixture()
  try {
    await installCanonicalSave(db)
    await actor(db, 'authenticated', agentA)
    const save = (mutation, expected = null) => db.query(`select save_private_listing_seller_canonical_update(
      $1::uuid, '{"sellerFirstName":"Updated","email":"","propertyDisclosure":{"answers":{"roof":"good"}}}'::jsonb,
      '{"seller":{"name":"Updated Owner","email":""}}'::jsonb, '{}'::jsonb, '{"askingPrice":2500000}'::jsonb,
      'in_progress', 'individual', 'individual', 'single', $2::uuid, 'seller_edit', 'test', array['email'], $3::timestamptz) result`, [listingA, mutation, expected])
    const receipt = (await save(uuid(101))).rows[0].result
    assert.equal(receipt.listing.seller_canonical_facts_json.seller.name, 'Updated Owner')
    assert.equal(receipt.onboarding.form_data.email, '')
    assert.equal(receipt.onboarding.canonical_facts_json.seller.email, '')
    assert.equal(receipt.onboarding.form_data.currentStep, 2)
    assert.deepEqual(receipt.onboarding.form_data.propertyDisclosure, { answers: { roof: 'good' } })
    assert.equal((await save(uuid(101))).rows[0].result.idempotentReplay, true)
    await assert.rejects(save(uuid(102), '2000-01-01T00:00:00Z'), /changed after you opened/)
    await actor(db, 'authenticated', agentB)
    await assert.rejects(save(uuid(103)), /not found or is no longer available/)
    await actor(db, 'postgres')
    await db.exec(`create function reject_test_onboarding_write() returns trigger language plpgsql as $$begin raise exception 'test write rejected'; end$$;
      create trigger reject_onboarding before update on private_listing_seller_onboarding for each row execute function reject_test_onboarding_write();`)
    await actor(db, 'authenticated', agentA)
    await assert.rejects(save(uuid(104)), /test write rejected/)
    assert.equal(new Date((await db.query('select updated_at from private_listings where id=$1', [listingA])).rows[0].updated_at).toISOString(), new Date(receipt.listing.updated_at).toISOString())
    assert.equal((await db.query("select count(*)::int n from private_listing_activity where private_listing_id=$1", [listingA])).rows[0].n, 1)
  } finally { await db.close() }
})

async function installCanonicalSave(db) {
    await db.exec(`
      alter table private_listings add column address_line_1 text, add column asking_price numeric, add column mandate_type text;
      create table private_listing_activity (id uuid default gen_random_uuid(), private_listing_id uuid, activity_type text, activity_title text,
        activity_description text, performed_by uuid, visibility text, metadata jsonb);
      create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('ab', $1), 'hex')$$;
      grant usage on schema extensions to authenticated;
      grant select, update on private_listings to authenticated;
      grant select, insert on private_listing_activity to authenticated;
      alter table private_listings enable row level security;
      create policy listing_member on private_listings for all to authenticated using (bridge_can_access_private_listing(id)) with check (bridge_can_access_private_listing(id));
    `)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260924151653_listing_seller_canonical_update_phase2.sql', import.meta.url), 'utf8'))
}

test('prepared mandate terms persist in both database snapshots and rollback together on onboarding failure', async () => {
  const db = await fixture()
  try {
    await installCanonicalSave(db)
    await actor(db, 'authenticated', agentA)
    const listing = { id: listingA, sellerOnboarding: { formData: {
      ownerStructureType: 'individual', sellerFirstName: 'Pat', sellerSurname: 'Owner', askingPrice: '1000000',
      sellerOnboardingManualSigningPack: { versionHistory: [{ documents: [{ versionId: uuid(800), generatedHtml: 'Previously approved copy' }] }] },
    } } }
    const terms = buildSellerLeadSigningPackTermsPatch({ mandateType: 'dual', otherAgencyName: 'Updated Agency', askingPrice: '2000000',
      startDate: '2026-10-01', endDate: '2026-12-01', protectionPeriod: '0', commissionBasis: 'fixed', commissionAmount: '75000' })
    const save = update => db.query(`select save_private_listing_seller_canonical_update(
      $1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,'completed',$6,$7,$8,$9::uuid,
      'seller_signing_pack_preparation','seller_lead_signing_pack',$10::text[],null) result`,
      [listingA, JSON.stringify(update.nextFormData), JSON.stringify(update.canonicalFacts), JSON.stringify(update.readiness),
        JSON.stringify(update.listingPatch), update.sellerType, update.ownershipStructure, update.maritalRegime,
        update.mutationId, update.changedFields])
    await save(buildListingSellerCanonicalUpdate({ listing, formPatch: terms, onboardingStatus: 'completed', mutationId: uuid(801) }))
    const readback = async () => ({
      listing: (await db.query('select asking_price,mandate_type,seller_canonical_facts_json from private_listings where id=$1', [listingA])).rows[0],
      onboarding: (await db.query('select form_data,canonical_facts_json from private_listing_seller_onboarding where private_listing_id=$1', [listingA])).rows[0],
    })
    const saved = await readback()
    assert.equal(Number(saved.listing.asking_price), 2000000)
    assert.equal(saved.listing.mandate_type, 'dual')
    assert.equal(saved.onboarding.form_data.otherAgencyName, 'Updated Agency')
    assert.equal(saved.onboarding.form_data.coAgencyName, 'Updated Agency')
    assert.equal(saved.onboarding.canonical_facts_json.transaction.asking_price, 2000000)
    assert.deepEqual(saved.listing.seller_canonical_facts_json, saved.onboarding.canonical_facts_json)
    assert.deepEqual(saved.onboarding.form_data.sellerOnboardingManualSigningPack, listing.sellerOnboarding.formData.sellerOnboardingManualSigningPack)
    await actor(db, 'postgres')
    await db.exec(`create function reject_preparation_write() returns trigger language plpgsql as $$begin raise exception 'preparation rejected'; end$$;
      create trigger reject_preparation before update on private_listing_seller_onboarding for each row execute function reject_preparation_write();`)
    await actor(db, 'authenticated', agentA)
    await assert.rejects(save(buildListingSellerCanonicalUpdate({ listing, formPatch: { ...terms, askingPrice: '3000000', otherAgencyName: 'Rejected Agency' }, mutationId: uuid(802) })), /preparation rejected/)
    assert.deepEqual(await readback(), saved)
  } finally { await db.close() }
})

// Application projections + real PostgreSQL save/readback/review boundaries. No
// Supabase client, email transport, storage upload or remote connection is used.
test('manual seller matrix survives persisted capture, listing edit and reviewed physical copies', async (t) => {
  const db = await fixture()
  try {
    await installCanonicalSave(db)
    await db.exec(`
      create table private_listing_document_requirements (id uuid primary key, private_listing_id uuid, requirement_key text);
      create table private_listing_documents (id uuid primary key, private_listing_id uuid, requirement_id uuid,
        document_type text, status text, storage_path text, reviewed_signing_version_id uuid,
        reviewed_signing_version_digest text, reviewed_by uuid, reviewed_at timestamptz, review_reason text);
      grant select, insert, update on private_listing_document_requirements, private_listing_documents to authenticated;
    `)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260927122535_seller_physical_signing_version_review.sql', import.meta.url), 'utf8'))
    const owner = (name, id) => ({ name, idNumber: id, email: '', signingAuthority: true })
    const scenarios = [
      ['individual', {}, 'Pat Owner', 1],
      ['married', { maritalStatus: 'married_in_community', spouseName: 'Sam Spouse', spouseIdNumber: 'SPOUSE-ID' }, 'Pat Owner', 2],
      ['married', { maritalStatus: 'married_out_of_community', spouseName: 'Sam Spouse' }, 'Pat Owner', 1],
      ['multiple_owners', { multipleOwners: [owner('Same Owner', 'OWNER-A'), owner('Same Owner', 'OWNER-B'), owner('Third Owner', 'OWNER-C')] }, 'Third Owner', 3],
      ['company', { companyName: 'Local Holdings', companyRegistrationNumber: 'CO-123', authorisedSignatoryName: 'Robin Director', companyAuthorityBasis: 'Resolution' }, 'Local Holdings', 1],
      ['close_corporation', { companyName: 'Local CC', companyRegistrationNumber: 'CC-123', authorisedSignatoryName: 'Robin Member' }, 'Local CC', 1],
      ['trust', { trustName: 'Family Trust', trustRegistrationNumber: 'IT-123', trustees: [owner('Robin Trustee', 'TRUSTEE-A'), owner('Other Trustee', 'TRUSTEE-B')], authorisedTrusteeName: 'Robin Trustee', trustAuthorityBasis: 'Trustee resolution' }, 'Family Trust', 1],
      ['deceased_estate', { deceasedEstateName: 'Estate Late Pat', estateReferenceNumber: 'EST-123', executorName: 'Robin Executor' }, 'Estate Late Pat', 1],
      ['power_of_attorney', { powerOfAttorneyPrincipalName: 'Pat Principal', powerOfAttorneyPrincipalIdNumber: 'PR-123', powerOfAttorneyName: 'Robin Attorney' }, 'Pat Principal', 1],
      ['foreign_individual', { idNumber: '', foreignPassportNumber: 'PP-123', foreignOwnerCountry: 'United Kingdom' }, 'Pat Owner', 1],
      ['foreign_company', { companyName: 'Foreign Holdings', foreignRegistrationNumber: 'FC-123', foreignOwnerCountry: 'United Kingdom', authorisedSignatoryName: 'Robin Director' }, 'Foreign Holdings', 1],
      ['foreign_trust', { trustName: 'Foreign Trust', foreignRegistrationNumber: 'FT-123', foreignOwnerCountry: 'United Kingdom', authorisedTrusteeName: 'Robin Trustee' }, 'Foreign Trust', 1],
      ['other', { otherEntityName: 'Community Association', otherEntityRegistrationNumber: 'OT-123', otherAuthorityDetails: 'Constitution and resolution', primaryContactName: 'Robin Representative' }, 'Community Association', 1],
    ]
    let sequence = 1000
    await actor(db, 'authenticated', agentA)
    for (const [branch, details, legalName, signerCount] of scenarios) {
      await t.test(`${branch} ${details.maritalStatus || ''}`.trim(), async () => {
        // Reset only synthetic data; each case starts without retired answers.
        await db.query("update private_listing_seller_onboarding set form_data='{}', canonical_facts_json='{}' where private_listing_id=$1", [listingA])
        let listing = { id: listingA, sellerOnboarding: { formData: {} } }
        const captured = buildSellerLeadManualCapturePayload({ listing, form: {
          sellerOwnershipRoute: branch, ownerStructureType: branch,
          sellerFirstName: 'Pat', sellerSurname: 'Owner', primaryContactName: 'Pat Owner',
          idNumber: 'OWNER-123', email: '', phone: '', propertyAddress: '1 Synthetic Road',
          ratesTaxes: 0, bondStatus: 'unknown', incomeTaxNumber: 'TAX-123',
          ...details,
        } })
        async function save(formPatch) {
          const update = buildListingSellerCanonicalUpdate({ listing, formPatch, mutationId: uuid(sequence++) })
          const result = (await db.query(`select save_private_listing_seller_canonical_update(
            $1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,'in_progress',$6,$7,$8,
            $9::uuid,'seller_edit','local_acceptance',$10::text[],null) result`,
          [listingA, JSON.stringify(update.nextFormData), JSON.stringify(update.canonicalFacts), JSON.stringify(update.readiness),
            JSON.stringify(update.listingPatch), update.sellerType, update.authority.profileType, '', update.mutationId, update.changedFields])).rows[0].result
          const persisted = (await db.query('select form_data,canonical_facts_json from private_listing_seller_onboarding where private_listing_id=$1', [listingA])).rows[0]
          const persistedListing = (await db.query('select seller_canonical_facts_json from private_listings where id=$1', [listingA])).rows[0]
          assert.deepEqual(persisted.canonical_facts_json, persistedListing.seller_canonical_facts_json)
          listing = applyListingSellerCanonicalUpdateSnapshot(listing, update)
          listing.sellerOnboarding.formData = persisted.form_data
          return result
        }
        await save({ ...captured.formPatch, propertyDisclosure: { responses: {}, comments: 'Captured explanation survives.' } })
        await save({ ratesTaxes: 0, email: '', bondStatus: 'no' })
        const formData = listing.sellerOnboarding.formData
        assert.equal(formData.email, '')
        assert.equal(formData.ratesTaxes, 0)
        assert.equal(formData.bondStatus, 'no')
        assert.equal(formData.propertyDisclosure.comments, 'Captured explanation survives.')
        const plan = buildSellerSigningPlan({ sellerType: branch, form: formData })
        assert.equal(plan.manualReady, true)
        assert.equal(plan.ready, false, 'Manual fixtures have no delivery addresses')
        assert.equal(plan.recipients.length, signerCount)
        if (branch === 'multiple_owners') assert.equal(new Set(plan.recipients.map(signer => signer.id)).size, 3)
        const generatedAt = '2026-10-01T10:00:00.000Z'
        const branding = { organisationName: 'Synthetic Agency' }
        const drafts = buildSellerPostOnboardingDrafts({ formData, listing, branding, generatedAt })
        for (const mandateType of ['sole', 'open', 'dual']) {
          const signingPack = buildSellerOnboardingSigningPackSnapshot({ formData, listing, recipients: plan.recipients,
            mandate: { mandateType, otherAgencyName: 'Second Synthetic Agency', askingPrice: 1000000 }, branding, generatedAt })
          const approval = { status: 'approved', signingRoute: 'manual_upload', selectedDocuments: ['fica', 'mandate'],
            commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } }
          const manual = createSellerOnboardingSigningCopyPack({ formalPackApproval: approval, signingPack, postOnboardingDrafts: drafts, formData, generatedAt })
          const frozen = await createSellerReviewedDocumentVersions({ manualSigningPack: manual, formalPackApproval: approval, signingPack, actor: agentA, approvedAt: generatedAt })
          assert.equal(frozen.documents.length, 3)
          for (const doc of frozen.documents) {
            assert.ok(doc.generatedHtml.includes(legalName), `${branch}/${doc.key} legal owner missing`)
            assert.equal(doc.requiredSigners.length, signerCount)
            assert.equal(await verifySellerReviewedDocumentVersion(doc), true)
          }
          await save({ sellerOnboardingManualSigningPack: frozen })
          const uploaded = []
          for (const doc of frozen.documents) {
            const requirementId = uuid(sequence++), documentId = uuid(sequence++)
            await db.query('insert into private_listing_document_requirements values ($1,$2,$3)', [requirementId, listingA, doc.key])
            await db.query("insert into private_listing_documents values ($1,$2,$3,$4,'uploaded','synthetic-signed.pdf',$5,$6,null,null,null)",
              [documentId, listingA, requirementId, doc.key, doc.versionId, doc.versionDigest])
            await db.query("update private_listing_documents set status='approved',reviewed_by=$2,reviewed_at=now(),review_reason='All required wet-ink signatures checked' where id=$1", [documentId, agentA])
            uploaded.push((await db.query('select * from private_listing_documents where id=$1', [documentId])).rows[0])
          }
          const projected = buildSellerDocumentSourceOfTruth({ listing: { ...listing,
            documentRequirements: uploaded.map(doc => ({ id: doc.requirement_id, key: doc.document_type, is_required: true })), documents: uploaded } })
          for (const doc of frozen.documents) {
            const row = projected.rows.find(row => row.key === doc.key)
            assert.equal(row?.status, 'approved', `${branch}/${mandateType}/${doc.key} review projection`)
            assert.equal(row?.complete, true)
          }
        }
      })
    }
  } finally { await db.close() }
})
