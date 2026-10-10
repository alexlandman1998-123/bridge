import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createSellerCorrectionFixture } from './fixtures/seller-document-corrections.mjs'
import { createListingSellerProfileBuilderDraft, selectListingSellerProfileBranch, buildListingSellerProfileFormPatch, buildListingSellerProfileRequirementProjection } from '../src/lib/listingSellerProfileBuilderModel.js'
import { buildListingSellerCanonicalUpdate, buildListingSellerCanonicalSavePayload, applyListingSellerCanonicalUpdateSnapshot } from '../src/services/listings/listingSellerCanonicalUpdateModel.js'

const db = new PGlite()
const migration = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const rows = async (sql, args = []) => (await db.query(sql, args)).rows
await db.exec(await readFile(new URL('./fixtures/seller-document-journey.sql', import.meta.url), 'utf8'))
await db.exec(`create function bridge_listing_seller_actor_permission(uuid,text,text) returns boolean language sql as $$select true$$;`)
await db.exec(await migration('20260924151653_listing_seller_canonical_update_phase2.sql'))
const historySql = await migration('20260924161509_listing_seller_historical_normalization_phase9.sql')
for (const name of ['bridge_normalize_historical_seller_type', 'bridge_compute_listing_seller_historical_audit']) {
  const start = historySql.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0)
  await db.exec(historySql.slice(start, historySql.indexOf('$$;', start) + 3))
}
const shapeCorrection = await migration('20261008154845_seller_history_compatible_entity_shapes.sql')

async function fixture(branch) {
  const id = randomUUID(), form = createSellerCorrectionFixture(branch).form
  const listing = { id, sellerOnboarding: { formData: form } }
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: form })
  await rows('insert into private_listings(id,seller_type,seller_canonical_facts_json) values($1,$2,$3)', [id, update.sellerType, JSON.stringify(update.canonicalFacts)])
  await rows('insert into private_listing_seller_onboarding(private_listing_id,token,form_data,canonical_facts_json,seller_type,ownership_structure) values($1,$2,$3,$4,$5,$6)',
    [id, `synthetic-${id}`, JSON.stringify(form), JSON.stringify(update.canonicalFacts), update.sellerType, update.ownershipStructure])
  await rows("insert into private_listing_documents(private_listing_id,document_type,status,generated_html) values($1,'signed_mandate','approved','FROZEN HISTORICAL SIGNED HTML')", [id])
  return applyListingSellerCanonicalUpdateSnapshot(listing, update)
}
const audit = async id => (await rows('select bridge_compute_listing_seller_historical_audit($1) as result', [id]))[0].result
const documents = id => rows('select * from private_listing_documents where private_listing_id=$1', [id])
async function save(listing, formPatch) {
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch, mutationType: 'seller_profile_capture' })
  const payload = buildListingSellerCanonicalSavePayload(update)
  const receipt = (await rows(`select save_private_listing_seller_canonical_update($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as result`,
    [listing.id, JSON.stringify(payload.formData), JSON.stringify(update.canonicalFacts), JSON.stringify(update.readiness), JSON.stringify(payload.listingPatch),
      update.onboardingStatus, update.sellerType, update.ownershipStructure, update.maritalRegime, randomUUID(), 'seller_profile_capture', 'local_history_flow_test', update.changedFields, null]))[0].result
  return { update, receipt, audit: await audit(listing.id) }
}
test.after(() => db.close())

test('historical audit correction reproduces false conflicts and retains records and permissions', async () => {
  const ids = []
  for (const branch of ['close_corporation', 'foreign_company', 'foreign_trust']) {
    const listing = await fixture(branch)
    ids.push(listing.id)
    assert.equal((await audit(listing.id)).classification, 'inconsistent')
  }
  for (const branch of ['married', 'power_of_attorney']) {
    const listing = await fixture(branch)
    ids.push(listing.id)
    await rows(`update private_listing_seller_onboarding set form_data=form_data||'{"sellerOwnershipConfirmed":true}'::jsonb where private_listing_id=$1`, [listing.id])
    assert.equal((await audit(listing.id)).classification, 'inconsistent')
  }
  const snapshot = () => rows(`select jsonb_build_object(
    'listings',(select jsonb_agg(l order by id) from private_listings l),
    'onboardings',(select jsonb_agg(o order by id) from private_listing_seller_onboarding o),
    'documents',(select jsonb_agg(d order by id) from private_listing_documents d)) as data`)
  const permissions = () => rows("select proacl::text,prosecdef,proconfig from pg_proc where proname='bridge_compute_listing_seller_historical_audit'")
  const before = await snapshot(), grants = await permissions()
  await db.exec(shapeCorrection)
  await db.exec(shapeCorrection)
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await permissions(), grants)
  for (const id of ids) assert.equal((await audit(id)).classification, 'configured')
})

for (const branch of ['individual', 'married', 'multiple_owners', 'company', 'close_corporation', 'trust', 'deceased_estate', 'power_of_attorney', 'other', 'foreign_individual', 'foreign_company', 'foreign_trust']) {
  test(`saving ${branch} keeps authority, database rows and historical audit consistent`, async () => {
    const listing = await fixture('individual'), before = await documents(listing.id)
    const targetForm = createSellerCorrectionFixture(branch).form
    const draft = createListingSellerProfileBuilderDraft({ id: listing.id, sellerOnboarding: { formData: targetForm } })
    const patch = buildListingSellerProfileFormPatch(draft)
    const projection = buildListingSellerProfileRequirementProjection(draft, listing, { draft: true })
    assert.equal(projection.projectedListing.sellerCanonicalFacts.seller.owner_structure_type, branch)
    assert.ok(projection.generatedRequirements.length > 0, 'The updated owner needs a document checklist')
    const saved = await save(listing, patch)
    assert.equal(saved.update.authority.profileType, branch)
    assert.equal(saved.receipt.listing.seller_type, saved.update.sellerType)
    assert.equal(saved.receipt.onboarding.canonical_facts_json.seller.owner_structure_type, branch)
    assert.equal(saved.receipt.listing.seller_canonical_facts_json.seller.owner_structure_type, branch)
    assert.equal(saved.audit.classification, 'configured', JSON.stringify(saved.audit.evidence))
    assert.deepEqual(await documents(listing.id), before, 'Seller corrections must preserve historical signed files')
  })
}

for (const branch of ['multiple_owners', 'deceased_estate', 'power_of_attorney', 'other', 'company', 'trust']) {
  test(`correcting ${branch} to individual clears obsolete ownership aliases through the actual database merge`, async () => {
    const listing = await fixture(branch), before = await documents(listing.id)
    await rows(`update private_listing_seller_onboarding set form_data=form_data||'{"coOwners":"Retired co-owner note"}'::jsonb where private_listing_id=$1`, [listing.id])
    listing.sellerOnboarding.formData.coOwners = 'Retired co-owner note'
    const draft = selectListingSellerProfileBranch(createListingSellerProfileBuilderDraft(listing), 'individual')
    const saved = await save(listing, buildListingSellerProfileFormPatch(draft))
    assert.equal(saved.update.authority.profileType, 'individual')
    assert.equal(saved.receipt.listing.seller_type, 'individual')
    assert.deepEqual(saved.receipt.onboarding.form_data.owners, [])
    assert.equal(saved.receipt.onboarding.form_data.coOwners, '')
    assert.deepEqual(saved.receipt.onboarding.form_data.deceased_estate, {})
    assert.deepEqual(saved.receipt.onboarding.form_data.power_of_attorney, {})
    assert.deepEqual(saved.receipt.onboarding.form_data.other_entity, {})
    assert.equal(saved.audit.classification, 'configured', JSON.stringify(saved.audit.evidence))
    assert.deepEqual(await documents(listing.id), before)
  })
}

test('contact-only edits retain the current ownership and genuine disagreements remain flagged', async () => {
  const listing = await fixture('multiple_owners')
  const saved = await save(listing, { email: 'updated-contact@example.test' })
  assert.equal(saved.update.authority.profileType, 'multiple_owners')
  assert.equal(saved.audit.classification, 'configured')
  await rows(`update private_listings set seller_canonical_facts_json=jsonb_set(seller_canonical_facts_json,'{seller,owner_structure_type}','"individual"') where id=$1`, [listing.id])
  assert.equal((await audit(listing.id)).classification, 'inconsistent')
})

test('ordinary contact and mandate edits cannot flatten a conflicting stored onboarding owner model', async () => {
  const listing = await fixture('individual')
  listing.sellerOnboarding.storedCanonicalFacts = { seller: { owner_structure_type: 'multiple_owners' } }
  for (const formPatch of [{ email: 'contact@example.test' }, { ...listing.sellerOnboarding.formData, mandateType: 'open' }]) {
    assert.throws(() => buildListingSellerCanonicalUpdate({ listing, formPatch }), /Review and confirm the legal owners/)
  }
  const draft = createListingSellerProfileBuilderDraft(listing)
  const reviewed = await save(listing, buildListingSellerProfileFormPatch(draft))
  assert.equal(reviewed.audit.classification, 'configured', 'An explicit profile review may confirm the current chosen type')
})

test('confirming joint ownership retains both captured owners when the saved form still says individual', async () => {
  const listing = await fixture('multiple_owners'), before = await documents(listing.id)
  const staleType = { ownerStructureType: 'individual', sellerLegalType: 'individual', sellerType: 'individual', ownershipType: 'individual' }
  Object.assign(listing.sellerOnboarding.formData, staleType)
  listing.sellerCanonicalFacts.seller.owner_structure_type = 'individual'
  listing.sellerCanonicalFacts.seller.legal_type = 'individual'
  await rows(`update private_listings set seller_type='individual',seller_canonical_facts_json=$2 where id=$1`,
    [listing.id, JSON.stringify(listing.sellerCanonicalFacts)])
  await rows(`update private_listing_seller_onboarding set seller_type='individual',form_data=form_data||$2::jsonb where private_listing_id=$1`,
    [listing.id, JSON.stringify(staleType)])
  assert.equal((await audit(listing.id)).classification, 'inconsistent')

  const initial = createListingSellerProfileBuilderDraft(listing)
  const capturedOwners = structuredClone(initial.multipleOwners)
  assert.equal(initial.branch, 'individual')
  const reviewed = selectListingSellerProfileBranch(initial, 'multiple_owners')
  assert.deepEqual(reviewed.multipleOwners, initial.multipleOwners, 'Choosing joint ownership must retain the captured co-owner')
  const saved = await save(listing, buildListingSellerProfileFormPatch(reviewed))
  assert.equal(saved.audit.classification, 'configured')
  assert.equal(saved.receipt.listing.seller_canonical_facts_json.seller.owner_structure_type, 'multiple_owners')
  assert.equal(saved.receipt.onboarding.canonical_facts_json.seller.owner_structure_type, 'multiple_owners')
  assert.deepEqual(saved.receipt.onboarding.form_data.owners, capturedOwners)
  assert.equal(saved.receipt.listing.seller_canonical_facts_json.seller.owners.length, 2)
  assert.equal(saved.update.authority.signatoryPolicy.mode, 'all_owners_unless_delegated')
  assert.deepEqual(await documents(listing.id), before, 'Confirming joint ownership must preserve frozen signed history')
})

test('compatible entity families still reject unrelated populated entity details', async () => {
  const listing = await fixture('foreign_company')
  await rows(`update private_listing_seller_onboarding set form_data=form_data||'{"trustName":"Conflicting trust"}'::jsonb where private_listing_id=$1`, [listing.id])
  assert.equal((await audit(listing.id)).classification, 'inconsistent')
})

test('confirming a represented or married individual does not create a conflict with its coarse legacy legal type', async () => {
  for (const branch of ['married', 'power_of_attorney']) {
    const listing = await fixture('individual')
    const form = createSellerCorrectionFixture(branch).form
    const draft = createListingSellerProfileBuilderDraft({ id: listing.id, sellerOnboarding: { formData: form } })
    const saved = await save(listing, { ...buildListingSellerProfileFormPatch(draft), sellerOwnershipConfirmed: true })
    assert.equal(saved.receipt.listing.seller_type, 'individual')
    assert.equal(saved.audit.classification, 'configured')
    assert.equal(saved.audit.requirementsRebuildAllowed, true)
  }
})
