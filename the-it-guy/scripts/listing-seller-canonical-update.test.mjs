import { readSellerOnboardingReview, recordSellerOnboardingReview, SELLER_ONBOARDING_REVIEW_STATUS } from '../src/core/documents/sellerOnboardingReview.js'
import { createSellerOnboardingCorrectionControl } from '../src/core/documents/sellerOnboardingCorrectionControl.js'
import { getSellerMandatePreparationIssues } from '../src/lib/sellerMandateCapture.js'
import assert from 'node:assert/strict'
import { createListingSellerProfileBuilderDraft, buildListingSellerProfileFormPatch, selectListingSellerProfileBranch } from '../src/lib/listingSellerProfileBuilderModel.js'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

import {
  applyListingSellerCanonicalUpdateSnapshot,
  buildListingSellerCanonicalUpdate,
  buildListingSellerCanonicalSavePayload,
  isMatchingSellerCanonicalSaveReceipt,
  LISTING_SELLER_CANONICAL_UPDATE_VERSION,
} from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { limitSellerCanonicalSaveWait, saveListingSellerCanonicalUpdate } from '../src/services/listings/listingSellerCanonicalUpdateService.js'
import { buildSellerLeadSigningPackTermsPatch, createSellerLeadAgentOnboardingDraft } from '../src/lib/sellerLeadManualCaptureModel.js'
import { buildSellerOnboardingSigningPackSnapshot } from '../src/core/documents/sellerOnboardingSigningPackSnapshot.js'
import { buildSellerPostOnboardingDrafts } from '../src/core/documents/sellerPostOnboardingDrafts.js'
import { createSellerOnboardingManualSigningPack, createSellerOnboardingSigningCopyPack } from '../src/core/documents/sellerOnboardingManualSigningPack.js'
import { createSellerReviewedDocumentVersions, buildSellerReviewedDocumentVersionIndex, verifySellerReviewedDocumentVersion } from '../src/core/documents/sellerReviewedDocumentVersions.js'
import { createSellerOnboardingFormalPackApproval } from '../src/core/documents/sellerOnboardingFormalPackApproval.js'
import { requireSellerMandateWording } from '../src/core/documents/sellerMandateDocumentMarkup.js'

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`)
      throw error
    })
}

await test('stale seller saves return a non-retryable conflict without writes, while valid saves and replay retain RLS', async () => {
  const db = new PGlite()
  const actor = '11111111-1111-4111-8111-111111111111'
  const owned = '22222222-2222-4222-8222-222222222222'
  const foreign = '33333333-3333-4333-8333-333333333333'
  const mutation = '44444444-4444-4444-8444-444444444444'
  const initial = '2026-10-01T00:00:00Z'
  const signature = 'public.save_private_listing_seller_canonical_update(uuid,jsonb,jsonb,jsonb,jsonb,text,text,text,text,uuid,text,text,text[],timestamptz)'
  const [original, correction] = await Promise.all([
    readFile(new URL('../../supabase/migrations/20260924151653_listing_seller_canonical_update_phase2.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/migrations/20261006095510_seller_save_non_retryable_conflict.sql', import.meta.url), 'utf8'),
  ])
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth; create schema extensions;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      -- Token entropy is irrelevant to this isolated conflict fixture.
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;
      grant usage on schema auth,extensions to authenticated;
      create table private_listings(id uuid primary key, owner_id uuid, seller_type text,
        seller_onboarding_status text, seller_canonical_facts_json jsonb,
        seller_canonical_fact_readiness_json jsonb, seller_canonical_facts_updated_at timestamptz,
        address_line_1 text, asking_price numeric, mandate_type text, updated_at timestamptz);
      create table private_listing_seller_onboarding(id uuid primary key default gen_random_uuid(),
        private_listing_id uuid unique references private_listings(id), token text,
        form_data jsonb, status text, seller_type text, ownership_structure text, marital_regime text,
        canonical_facts_json jsonb, canonical_fact_readiness_json jsonb,
        canonical_facts_updated_at timestamptz, submitted_at timestamptz, updated_at timestamptz);
      create table private_listing_activity(id uuid primary key default gen_random_uuid(),
        private_listing_id uuid references private_listings(id), activity_type text, activity_title text,
        activity_description text, performed_by uuid, visibility text, metadata jsonb);
      alter table private_listings enable row level security;
      alter table private_listing_seller_onboarding enable row level security;
      alter table private_listing_activity enable row level security;
      grant select,insert,update on private_listings,private_listing_seller_onboarding,private_listing_activity to authenticated;
      create policy owned_listing on private_listings to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
      create policy owned_onboarding on private_listing_seller_onboarding to authenticated
        using(exists(select 1 from private_listings p where p.id=private_listing_id))
        with check(exists(select 1 from private_listings p where p.id=private_listing_id));
      create policy owned_activity on private_listing_activity to authenticated
        using(exists(select 1 from private_listings p where p.id=private_listing_id))
        with check(performed_by=auth.uid() and exists(select 1 from private_listings p where p.id=private_listing_id));
      insert into private_listings(id,owner_id,updated_at) values('${owned}','${actor}','${initial}'),('${foreign}','${foreign}','${initial}');
    `)
    await db.exec(original)
    const definition = async () => (await db.query('select prosrc,prosecdef,proacl::text as acl,proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0]
    const before = await definition()
    const enterActor = () => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false);`)
    const save = async (id, expected, mutationId = mutation) => (await db.query(
      `select public.save_private_listing_seller_canonical_update($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10::uuid,$11,$12,$13::text[],$14::timestamptz) as receipt`,
      [id, '{"sellerFirstName":"Updated"}', '{"seller":{"name":"Updated Owner"}}', '{}', '{"askingPrice":"1250000"}', 'in_progress', 'individual', null, null, mutationId, 'seller_edit', 'test_fixture', ['sellerFirstName'], expected],
    )).rows[0].receipt
    const state = async () => (await db.query(`select jsonb_build_object(
      'listing',(select to_jsonb(p) from private_listings p where id=$1),
      'onboarding',(select jsonb_agg(o) from private_listing_seller_onboarding o),
      'activity',(select jsonb_agg(a) from private_listing_activity a)) as snapshot`, [owned])).rows[0].snapshot
    await enterActor()
    const untouched = await state()
    await assert.rejects(save(owned, '2026-09-30T00:00:00Z'), error => error.code === '40001')
    await db.exec('reset role')
    await db.exec(correction)
    const after = await definition()
    assert.equal(after.prosrc, before.prosrc.replace("errcode = '40001'", "errcode = 'PT409'"))
    assert.equal(after.prosecdef, false)
    assert.deepEqual(after.proconfig, before.proconfig)
    assert.equal(after.acl, before.acl)
    await enterActor()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(save(owned, '2026-09-30T00:00:00Z'), error => error.code === 'PT409' && /changed after you opened/.test(error.message))
      assert.deepEqual(await state(), untouched)
    }
    await assert.rejects(save(foreign, initial), error => error.code === 'P0002')
    const saved = await save(owned, initial)
    assert.equal(saved.idempotentReplay, false)
    assert.equal(saved.listing.asking_price, 1250000)
    assert.equal(saved.onboarding.form_data.sellerFirstName, 'Updated')
    const committed = await state()
    const replay = await save(owned, initial)
    assert.equal(replay.idempotentReplay, true)
    assert.deepEqual(await state(), committed)
    await assert.rejects(save(owned, initial, '55555555-5555-4555-8555-555555555555'), error => error.code === 'PT409')
    assert.deepEqual(await state(), committed)
    await db.exec('reset role')
    await db.exec(correction)
    assert.deepEqual(await definition(), after)
  } finally {
    await db.close()
  }
})

const listing = {
  id: '11111111-1111-4111-8111-111111111111',
  organisationId: '22222222-2222-4222-8222-222222222222',
  updatedAt: '2026-09-24T12:00:00.000Z',
  sellerType: 'individual',
  sellerOnboardingStatus: 'in_progress',
  sellerOnboarding: {
    status: 'in_progress',
    formData: {
      sellerProfileCaptureSource: 'listing_seller_profile_capture',
      ownerEntityType: 'natural_person',
      ownerStructureType: 'individual',
      sellerFirstName: 'Old',
      sellerSurname: 'Owner',
      email: 'old@example.com',
      propertyAddress: '10 Example Road',
    },
  },
}

await test('releases a stalled seller profile save without claiming it failed', async () => {
  await assert.rejects(
    limitSellerCanonicalSaveWait(new Promise(() => {}), 5),
    (error) => error.code === 'SELLER_PROFILE_SAVE_TIMEOUT' && /may have completed/.test(error.message),
  )
})

await test('the existing seller client handles PT409 once and keeps the reload-before-saving conflict', async () => {
  const source = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
  const start = source.indexOf('export async function savePrivateListingSellerCanonicalUpdate(')
  const end = source.indexOf('\nexport async function ', start + 1)
  assert.ok(start >= 0 && end > start)
  let calls = 0
  const scope = {
    requireClient: () => ({ rpc: () => {
      calls += 1
      return { abortSignal: async () => ({ error: {
        code: 'PT409',
        message: 'This seller record changed after you opened it. Reload the listing and review the latest details before saving.',
      } }) }
    } }),
    normalizeUuid: value => value,
    normalizeText: value => String(value || '').trim(),
    normalizeNullableText: value => String(value || '').trim() || null,
    buildListingSellerCanonicalSavePayload,
    runSellerCanonicalRequest: request => request(new AbortController().signal),
    SELLER_CANONICAL_SAVE_TIMEOUT_MS: 1000,
    isMissingRpcError: () => false,
    isSellerOnboardingCompletionTimeoutError: () => false,
  }
  const save = Function(...Object.keys(scope), `${source.slice(start, end).replace(/^export /, '')}\nreturn savePrivateListingSellerCanonicalUpdate`)(...Object.values(scope))
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: { sellerFirstName: 'Updated' },
    mutationId: '33333333-3333-4333-8333-333333333333' })
  await assert.rejects(save(update), error => error.code === 'SELLER_UPDATE_CONFLICT' && error.recoverable === true && /Reload the listing/.test(error.message))
  assert.equal(calls, 1)
  assert.equal(listing.sellerOnboarding.formData.sellerFirstName, 'Old')
})

await test('builds one canonical seller mutation with provenance and optimistic concurrency', () => {
  const update = buildListingSellerCanonicalUpdate({
    listing,
    formPatch: { sellerFirstName: 'New', firstName: 'New' },
    mutationId: '33333333-3333-4333-8333-333333333333',
    mutationType: 'seller_contact_edit',
    now: '2026-09-24T13:00:00.000Z',
  })

  assert.equal(update.version, LISTING_SELLER_CANONICAL_UPDATE_VERSION)
  assert.equal(update.expectedUpdatedAt, listing.updatedAt)
  assert.equal(update.nextFormData.sellerSurname, 'Owner')
  assert.equal(update.authority.profileType, 'individual')
  assert.equal(update.requirementsAffected, false)
  assert.deepEqual(update.changedFields, ['firstName', 'sellerFirstName'])
  assert.equal(update.canonicalFacts.context.canonical_update.mutation_id, update.mutationId)
})

await test('sends changed fields without resending existing documents and preserves clears and normalized aliases', () => {
  const savedForm = {
    ...listing.sellerOnboarding.formData,
    sellerPostOnboardingDrafts: { documents: [{ generatedHtml: 'saved draft'.repeat(50000) }] },
    sellerOnboardingManualSigningPack: { documents: [{ versionId: 'old-version', generatedHtml: 'signed copy'.repeat(50000) }] },
    phone: 'old phone', sellerPhone: 'old phone', mobile: 'old phone',
  }
  const update = buildListingSellerCanonicalUpdate({
    listing: { ...listing, sellerOnboarding: { status: 'in_progress', formData: savedForm } },
    formPatch: { phone: '', notes: 'Updated note' },
    mutationId: '33333333-3333-4333-8333-333333333333',
  })
  const payload = buildListingSellerCanonicalSavePayload(update)
  assert.equal(payload.formData.phone, '')
  assert.equal(payload.formData.sellerPhone, '')
  assert.equal(payload.formData.mobile, '')
  assert.equal(payload.formData.notes, 'Updated note')
  assert.equal(payload.formData.sellerPostOnboardingDrafts, undefined)
  assert.equal(payload.formData.sellerOnboardingManualSigningPack, undefined)
  assert.equal(payload.listingPatch.sellerCanonicalFacts, undefined)
  assert.ok(JSON.stringify(payload).length < JSON.stringify(update.nextFormData).length / 10)
  assert.deepEqual({ ...savedForm, ...payload.formData }, update.nextFormData)
})

await test('timeout confirmation requires the exact mutation and frozen document contents on both saved records', () => {
  const update = buildListingSellerCanonicalUpdate({ listing,
    formPatch: { sellerOnboardingManualSigningPack: { documents: [{ versionId: 'prepared-copy', generatedHtml: 'Exact approved HTML' }] } },
    mutationId: '33333333-3333-4333-8333-333333333333',
  })
  const receipt = {
    listing: { id: listing.id, seller_canonical_facts_json: update.canonicalFacts,
      seller_onboarding_status: update.onboardingStatus, seller_type: update.sellerType,
      address_line_1: update.listingPatch.addressLine1, mandate_type: update.listingPatch.mandateType },
    onboarding: { id: 'onboarding-1', private_listing_id: listing.id, status: update.onboardingStatus,
      canonical_facts_json: update.canonicalFacts, form_data: update.nextFormData },
  }
  assert.equal(isMatchingSellerCanonicalSaveReceipt(receipt, update), true)
  const reversedKeys = Object.fromEntries(Object.entries(update.canonicalFacts).reverse())
  assert.equal(isMatchingSellerCanonicalSaveReceipt({ ...receipt, listing: { ...receipt.listing, seller_canonical_facts_json: reversedKeys } }, update), true)
  for (const changed of [
    { ...receipt, listing: { ...receipt.listing, id: 'different-listing' } },
    { ...receipt, onboarding: { ...receipt.onboarding, canonical_facts_json: {} } },
    { ...receipt, onboarding: { ...receipt.onboarding, status: 'rejected' } },
    { ...receipt, listing: { ...receipt.listing, address_line_1: 'Later listing edit' } },
    { ...receipt, onboarding: { ...receipt.onboarding, form_data: { ...update.nextFormData,
      sellerOnboardingManualSigningPack: { documents: [{ versionId: 'later-copy', generatedHtml: 'Changed' }] } } } },
  ]) assert.equal(isMatchingSellerCanonicalSaveReceipt(changed, update), false)
})

await test('marks authority and ownership changes for document requirement resync', () => {
  const update = buildListingSellerCanonicalUpdate({
    listing,
    formPatch: {
      ownerEntityType: 'company',
      ownerStructureType: 'company',
      sellerType: 'company',
      companyName: 'Example Holdings',
      authorisedSignatoryName: 'Alex Director',
    },
    mutationId: '44444444-4444-4444-8444-444444444444',
  })

  assert.equal(update.authority.profileType, 'company')
  assert.equal(update.sellerType, 'company')
  assert.equal(update.requirementsAffected, true)
  assert.equal(update.listingPatch.requirementsAffected, true)
})

await test('does not turn a contact-only edit into an individual ownership confirmation', () => {
  const unknownListing = {
    id: listing.id,
    sellerType: 'individual',
    sellerOnboarding: { status: 'not_started', formData: {} },
  }
  const update = buildListingSellerCanonicalUpdate({
    listing: unknownListing,
    formPatch: { fullName: 'Contact Only', email: 'contact@example.com' },
    mutationId: '77777777-7777-4777-8777-777777777777',
  })

  assert.equal(update.authority.identified, false)
  assert.equal(update.readiness.ownerStructureType, false)
  assert.equal(update.canonicalFacts.seller.full_name, 'Contact Only')
  assert.equal(update.canonicalFacts.seller.owner_structure_type, undefined)
})

await test('applies the same committed snapshot to the local listing projection', () => {
  const update = buildListingSellerCanonicalUpdate({
    listing,
    formPatch: { notes: 'Access by appointment only.' },
    mutationId: '55555555-5555-4555-8555-555555555555',
    now: '2026-09-24T14:00:00.000Z',
  })
  const snapshot = applyListingSellerCanonicalUpdateSnapshot(listing, update)

  assert.equal(snapshot.sellerOnboarding.formData.notes, 'Access by appointment only.')
  assert.equal(snapshot.sellerCanonicalFacts.context.canonical_update.mutation_id, update.mutationId)
  assert.equal(update.requirementsAffected, false)
})

await test('uses one canonical persistence call and treats CRM as a warning-only projection', async () => {
  let persistenceCalls = 0
  const result = await saveListingSellerCanonicalUpdate({
    listing: { ...listing, sellerLeadId: 'lead-1' },
    formPatch: { email: 'new@example.com', sellerEmail: 'new@example.com' },
    mutationId: '66666666-6666-4666-8666-666666666666',
    organisationId: listing.organisationId,
  }, {
    savePrivateListingSellerCanonicalUpdate: async (update) => {
      persistenceCalls += 1
      return { listing: applyListingSellerCanonicalUpdateSnapshot(listing, update), receipt: { mutationId: update.mutationId }, syncedRequirements: [] }
    },
    fetchAgencyCrmLeadWorkspace: async () => ({ contacts: [{ contactId: 'contact-1' }] }),
    updateAgencyCrmContactRecord: async () => { throw new Error('CRM offline') },
  })

  assert.equal(persistenceCalls, 1)
  assert.equal(result.listing.seller.email, 'new@example.com')
  assert.equal(result.warnings[0].code, 'CRM_CONTACT_SYNC_FAILED')
})

await test('returns the committed seller snapshot when requirement projection needs retry', async () => {
  const committedListing = { ...listing, updatedAt: '2026-09-24T15:00:00.000Z' }
  const result = await saveListingSellerCanonicalUpdate({
    listing,
    formPatch: { ownerStructureType: 'company', sellerType: 'company' },
    mutationId: '88888888-8888-4888-8888-888888888888',
    syncLinkedCrmContact: false,
  }, {
    savePrivateListingSellerCanonicalUpdate: async () => {
      const error = new Error('Seller details were saved, but document requirements need a retry.')
      error.code = 'SELLER_REQUIREMENT_SYNC_FAILED'
      error.committed = true
      error.listing = committedListing
      throw error
    },
  })

  assert.equal(result.receipt.committed, true)
  assert.equal(result.listing.updatedAt, committedListing.updatedAt)
  assert.equal(result.warnings[0].code, 'SELLER_REQUIREMENT_SYNC_FAILED')
})

for (const refreshedChecklist of [false, true]) {
await test(`a seller save retains loaded media and branding with checklist refresh ${refreshedChecklist}`, async () => {
  const existingListing = { ...listing, heroImageUrl: 'https://example.test/photo.jpg', branding: { organisationName: 'Saved Agency' },
    assignedAgentName: 'Listing Agent', listingPublicationData: { status: 'Published' } }
  const checklist = { documentRequirements: [{ id: 'saved-requirement', status: 'approved' }], documents: [{ id: 'saved-document' }], readinessSummary: { ready: true } }
  const result = await saveListingSellerCanonicalUpdate({ listing: existingListing, formPatch: { notes: 'Pack ready' },
    syncLinkedCrmContact: false, includeRequirementsAndDocuments: false }, {
    savePrivateListingSellerCanonicalUpdate: async () => ({ snapshotOnly: true, receipt: {},
      requirementSyncResult: refreshedChecklist ? { listing: checklist } : null,
      listing: { updatedAt: '2026-10-05T07:00:00Z', heroImageUrl: '', branding: {}, assignedAgentName: '', listingPublicationData: null,
        ...(refreshedChecklist ? checklist : {}),
        sellerOnboarding: { id: 'saved-onboarding-id' } } }),
  })
  assert.equal(result.listing.updatedAt, '2026-10-05T07:00:00Z')
  assert.equal(result.listing.heroImageUrl, existingListing.heroImageUrl)
  assert.deepEqual(result.listing.branding, existingListing.branding)
  assert.equal(result.listing.assignedAgentName, existingListing.assignedAgentName)
  assert.deepEqual(result.listing.listingPublicationData, existingListing.listingPublicationData)
  assert.equal(result.listing.sellerOnboarding.id, 'saved-onboarding-id')
  assert.equal(result.listing.sellerOnboarding.formData.notes, 'Pack ready')
  if (refreshedChecklist) {
    assert.deepEqual(result.listing.documentRequirements, checklist.documentRequirements)
    assert.deepEqual(result.listing.documents, checklist.documents)
    assert.deepEqual(result.listing.readinessSummary, checklist.readinessSummary)
  }
})
}

await test('wires listing seller editors to the canonical service and an atomic RLS RPC', async () => {
  const [page, privateListingService, migration] = await Promise.all([
    readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/migrations/20260924151653_listing_seller_canonical_update_phase2.sql', import.meta.url), 'utf8'),
  ])

  assert.ok(page.match(/saveListingSellerCanonicalUpdate\(/g)?.length >= 3)
  assert.ok(privateListingService.includes("client.rpc('save_private_listing_seller_canonical_update'"))
  assert.ok(migration.includes('security invoker'))
  assert.ok(migration.includes('for update'))
  assert.ok(migration.includes("activity_type = 'seller_canonical_update'"))
  assert.ok(migration.includes('p_expected_updated_at'))
  assert.ok(migration.includes('revoke all on function public.save_private_listing_seller_canonical_update'))
})

console.log('listing seller canonical update checks passed.')

// Execute the actual React action with its closure supplied explicitly. Real
// payload, document and save models run; remote writes and dispatch are fixtures.
const leadPageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const leadPreparationAction = leadPageSource.slice(
  leadPageSource.indexOf('  async function sendSellerLeadSigningPack() {'),
  leadPageSource.indexOf('  function handleSellerJourneyAction(', leadPageSource.indexOf('  async function sendSellerLeadSigningPack() {')),
)

async function runLeadPreparation({ mandateType = 'dual', digital = false, saveError = null, warning = null, priorListing = null, askingPrice = '2000000', generatedListing = null, needsRefresh = false } = {}) {
  const events = { saves: [], sends: [], errors: [], listingWrites: [] }
  const originalForm = { ...listing.sellerOnboarding.formData, otherAgencyName: 'Old Agency', coAgencyName: 'Old Agency',
    askingPrice: '1000000', mandateType: 'sole', propertyDisclosure: { comments: 'Retain this explanation.' } }
  const currentListing = priorListing || { ...listing, sellerOnboarding: { status: 'completed', formData: originalForm } }
  const scope = {
    getSellerMandatePreparationIssues,
    selectedLeadLinkedListingId: listing.id, selectedLeadLinkedListing: currentListing,
    selectedLead: { leadId: 'lead-1', sellerOnboarding: { formData: { ...originalForm, sellerSurname: 'Stale CRM' } } },
    sellerSigningPackSaving: false, sellerSigningPackNeedsRefresh: needsRefresh, SELLER_PORTAL_SIGNING_ENABLED: true,
    sellerSigningPackTerms: { mandateType, otherAgencyName: mandateType === 'dual' ? 'Updated Agency' : '',
      askingPrice, startDate: '2026-10-01', endDate: '2026-12-01', protectionPeriod: '0', protectionPeriodDays: '30',
      commissionBasis: 'fixed', commissionPercentage: '5', commissionAmount: '75000', vatHandling: 'inclusive' },
    sellerOnboardingDocumentRoutes: Object.fromEntries(['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form'].map(key => [key, digital ? 'digital_pack' : 'manual_upload'])),
    currentAgent: { id: '33333333-3333-4333-8333-333333333333', fullName: 'Test Agent' },
    currentWorkspace: { branding: { organisationName: 'Test Agency' } }, organisationId: listing.organisationId,
    normalizeText: value => String(value ?? '').trim(), isValidEmail: value => String(value).includes('@'),
    getLeadSellerOnboardingFormData: lead => lead.sellerOnboarding.formData,
    getSellerLeadReviewFormData: (lead, row) => ({ ...lead.sellerOnboarding.formData, ...row.sellerOnboarding.formData }),
    selectedSellerDisclosureComplete: false,
    readSellerOnboardingReview: () => ({ status: 'approved' }), SELLER_ONBOARDING_REVIEW_STATUS: { approved: 'approved' },
    getSellerLeadOnboardingReviewChecklist: () => ({ ready: true }),
    getSellerLeadSigningRecipients: () => [{ id: 'owner-1', name: 'Old Owner', email: 'owner@example.test', role: 'Seller' }],
    requireSellerMandateWording, buildSellerLeadSigningPackTermsPatch, buildListingSellerCanonicalUpdate,
    buildSellerOnboardingSigningPackSnapshot, buildSellerPostOnboardingDrafts, createSellerOnboardingFormalPackApproval,
    createSellerOnboardingManualSigningPack, createSellerOnboardingSigningCopyPack,
    createSellerReviewedDocumentVersions, buildSellerReviewedDocumentVersionIndex,
    resolveOnboardingBranding: () => ({ organisationName: 'Test Agency' }),
    createSellerOnboardingSigningLifecycle: value => value,
    SELLER_ONBOARDING_SIGNING_STAGES: { packPrepared: 'pack_prepared', manualAwaitingUpload: 'manual_awaiting_upload' },
    getPrivateListing: async () => { throw new Error('Unexpected fallback read') },
    persistSellerProfileOnboardingFormData: async () => { throw new Error('Preparation used a split onboarding write') },
    saveListingSellerCanonicalUpdate: async input => saveListingSellerCanonicalUpdate(input, {
      savePrivateListingSellerCanonicalUpdate: async (update, options) => {
        events.saves.push(update)
        events.saveOptions = options
        if (saveError) throw saveError
        events.committed = applyListingSellerCanonicalUpdateSnapshot(currentListing, update)
        if (warning) throw Object.assign(new Error(warning), { committed: true, code: 'SELLER_READBACK_FAILED', listing: events.committed })
        return { listing: events.committed, receipt: { committed: true }, syncedRequirements: [] }
      },
    }),
    setSelectedLeadHydratedListing: row => { events.hydrated = row },
    sendSellerDocumentForSignature: async (_id, key) => { events.sends.push(key); return { sentCount: 1 } },
    listSellerPortalSigningRequests: async () => ({ documents: [] }), setSellerPortalSigningRequests: () => {},
    updatePrivateListing: async (_id, patch) => { events.listingWrites.push(patch); return generatedListing },
    updateAgencyCrmLeadRecord: async () => {}, patchSelectedLeadRecord: () => {},
    setSellerSigningPackError: message => { if (message) events.errors.push(message) },
    setSellerSigningPackNeedsRefresh: value => { events.needsRefresh = value },
    setSellerSigningPackNotice: value => { events.notice = value },
    setSellerSigningPackProgress: () => {}, setSellerSigningPackSaving: () => {}, setSellerSigningPackModalOpen: () => {},
    setMessage: () => {}, scheduleRecordsReload: () => {},
  }
  await Function(...Object.keys(scope), `${leadPreparationAction}\nreturn sendSellerLeadSigningPack()`)(...Object.values(scope))
  return events
}

for (const mandateType of ['sole', 'open', 'dual']) {
  for (const digital of [false, true]) {
    await test(`actual lead preparation saves matching ${mandateType} terms before ${digital ? 'digital dispatch' : 'manual download'}`, async () => {
      const events = await runLeadPreparation({ mandateType, digital })
      assert.deepEqual(events.errors, [])
      assert.equal(events.saves.length, 1)
      assert.equal(events.saveOptions.forceRequirementSync, true)
      assert.deepEqual(events.listingWrites, [{ mandateStatus: 'generated' }])
      assert.equal(events.sends.length, digital ? 3 : 0)
      const update = events.saves[0]
      assert.equal(update.expectedUpdatedAt, listing.updatedAt)
      assert.equal(update.canonicalFacts.transaction.asking_price, 2000000)
      assert.equal(update.canonicalFacts.transaction.mandate_type, mandateType)
      assert.equal(update.canonicalFacts.transaction.mandate_start_date, '2026-10-01')
      assert.equal(update.nextFormData.commissionPercentage, '')
      assert.equal(update.nextFormData.commissionAmount, '75000')
      assert.equal(update.nextFormData.protectionPeriodDays, '0')
      assert.equal(update.nextFormData.sellerSurname, 'Owner', 'Current saved listing wins over lagging CRM')
      assert.equal(update.nextFormData.propertyDisclosure.comments, 'Retain this explanation.')
      const reopenedLead = createSellerLeadAgentOnboardingDraft({ formData: events.committed.sellerOnboarding.formData })
      const reopenedListing = createListingSellerProfileBuilderDraft(events.hydrated)
      assert.equal(reopenedLead.otherAgencyName, mandateType === 'dual' ? 'Updated Agency' : '')
      assert.equal(reopenedListing.otherAgencyName, reopenedLead.otherAgencyName)
      assert.equal(events.committed.askingPrice, '2000000')
      const pack = update.nextFormData.sellerOnboardingManualSigningPack
      const mandate = pack.documents.find(document => document.key === 'signed_mandate')
      assert.equal(mandate.mandateTerms.otherAgencyName, reopenedLead.otherAgencyName)
      assert.equal(mandate.mandateTerms.askingPrice, '2000000')
      if (mandateType === 'dual') assert.ok(mandate.generatedHtml.includes('Updated Agency'))
      for (const document of pack.documents) assert.equal(await verifySellerReviewedDocumentVersion(document), true)
    })
  }
}

for (const message of ['Database write failed', 'This seller record changed after you opened it.', 'The seller save request timed out and its completion could not be confirmed.']) {
  await test(`actual preparation stops before dispatch or local success when ${message}`, async () => {
    const events = await runLeadPreparation({ digital: true, saveError: new Error(message) })
    assert.deepEqual(events.errors, [message])
    assert.equal(events.committed, undefined)
    assert.equal(events.hydrated, undefined)
    assert.deepEqual(events.sends, [])
    assert.deepEqual(events.listingWrites, [])
  })
}

await test('actual preparation preserves a committed save but blocks dispatch until readback warning is resolved', async () => {
  const events = await runLeadPreparation({ digital: true, warning: 'Reload before sending documents.' })
  assert.deepEqual(events.errors, ['Reload before sending documents.'])
  assert.equal(events.hydrated.askingPrice, '2000000')
  assert.deepEqual(events.sends, [])
  assert.deepEqual(events.listingWrites, [])
})

await test('preparing amended terms retains the previous frozen copies unchanged', async () => {
  const first = await runLeadPreparation()
  const originals = structuredClone(first.committed.sellerOnboarding.formData.sellerOnboardingManualSigningPack.documents)
  const amended = await runLeadPreparation({ priorListing: first.committed, askingPrice: '3000000' })
  assert.deepEqual(amended.errors, [])
  const pack = amended.committed.sellerOnboarding.formData.sellerOnboardingManualSigningPack
  assert.deepEqual(pack.versionHistory.at(-1).documents, originals)
  const current = pack.documents.find(document => document.key === 'signed_mandate')
  assert.equal(current.mandateTerms.askingPrice, '3000000')
  assert.notEqual(current.versionId, originals.find(document => document.key === 'signed_mandate').versionId)
  for (const original of pack.versionHistory.at(-1).documents) assert.equal(await verifySellerReviewedDocumentVersion(original), true)
})

await test('partial edits regenerate complete facts and synchronize every reopened form alias', () => {
  const current = { ...listing, sellerEmail: 'old@example.com', sellerOnboardingFormData: { sellerFirstName: 'Stale' },
    sellerOnboarding: { form_data: { sellerFirstName: 'Stale' }, formData: { ...listing.sellerOnboarding.formData, fullName: 'Old Owner', sellerName: 'Old Owner', sellerEmail: 'old@example.com', incomeTaxNumber: 'TAX-123', propertyDisclosure: { answers: { roof: 'good' } } } } }
  const update = buildListingSellerCanonicalUpdate({ listing: current, formPatch: { sellerFirstName: 'Latest', email: '' }, suppliedCanonicalFacts: { seller: { first_name: 'Partial' } } })
  assert.equal(update.canonicalFacts.seller.name, 'Latest Owner')
  assert.equal(update.canonicalFacts.seller.tax_number, 'TAX-123')
  assert.equal(update.canonicalFacts.seller.email, '')
  assert.equal(update.contact.email, '')
  assert.equal(update.nextFormData.sellerEmail, '')
  assert.equal(update.nextFormData.canonicalSellerFacts.seller.name, 'Latest Owner')
  assert.deepEqual(update.nextFormData.propertyDisclosure, { answers: { roof: 'good' } })
  const snapshot = applyListingSellerCanonicalUpdateSnapshot(current, update)
  assert.equal(createListingSellerProfileBuilderDraft(snapshot).sellerFirstName, 'Latest')
  assert.equal(createListingSellerProfileBuilderDraft(snapshot).email, '')
  assert.equal(snapshot.sellerOnboardingFormData.sellerFirstName, 'Latest')
  assert.equal(snapshot.seller_onboarding.form_data.sellerFirstName, 'Latest')
})

await test('changing company ownership clears retired fields and keeps the contact separate', async () => {
  const company = { ...listing, sellerOnboarding: { formData: {
    ownerEntityType: 'company', ownerStructureType: 'company', companyName: 'Old Holdings',
    companyRegistrationNumber: 'CO-123', companyAuthorityBasis: 'Old resolution', companyDirectors: [{ name: 'Old', surname: 'Director' }],
    authorisedSignatoryName: 'Old Director', primaryContactName: 'Pat Contact', email: 'pat@example.com', propertyAddress: '10 Example Road',
  } } }
  const draft = selectListingSellerProfileBranch(createListingSellerProfileBuilderDraft(company), 'trust')
  Object.assign(draft, { trustName: 'New Trust', trustRegistrationNumber: 'IT-456', authorisedTrusteeName: 'Sam Trustee', trustees: [{ name: 'Sam', surname: 'Trustee' }] })
  const update = buildListingSellerCanonicalUpdate({ listing: company, formPatch: buildListingSellerProfileFormPatch(draft) })
  assert.equal(update.listingPatch.sellerName, 'New Trust')
  assert.equal(update.contact.fullName, 'Pat Contact')
  assert.equal(update.nextFormData.companyName, '')
  assert.deepEqual(update.nextFormData.companyDirectors, [])
  const reopened = createListingSellerProfileBuilderDraft(applyListingSellerCanonicalUpdateSnapshot(company, update))
  assert.equal(reopened.branch, 'trust')
  assert.equal(reopened.companyName, '')
  assert.equal(reopened.companyAuthorityBasis, '')
  assert.equal(reopened.primaryContactName, 'Pat Contact')
  let capturedContact
  let contactUpdate
  await saveListingSellerCanonicalUpdate({ listing: { ...company, sellerLeadId: 'lead-1' }, organisationId: listing.organisationId,
    formPatch: { primaryContactName: 'New Contact' } }, {
    savePrivateListingSellerCanonicalUpdate: async (value) => {
      contactUpdate = value
      return { listing: applyListingSellerCanonicalUpdateSnapshot(company, value), receipt: {} }
    },
    fetchAgencyCrmLeadWorkspace: async () => ({ contacts: [{ contactId: 'contact-1' }] }),
    updateAgencyCrmContactRecord: async (_org, _id, value) => { capturedContact = value },
  })
  assert.equal(capturedContact.firstName, 'New')
  assert.equal(capturedContact.lastName, 'Contact')
  assert.equal(contactUpdate.canonicalFacts.seller.name, 'Old Holdings')
  assert.equal(contactUpdate.nextFormData.sellerFirstName, 'New')
  assert.equal(contactUpdate.nextFormData.sellerSurname, 'Contact')
  assert.equal(createListingSellerProfileBuilderDraft(applyListingSellerCanonicalUpdateSnapshot(company, contactUpdate)).primaryContactName, 'New Contact')
})

await test('a signing-pack conflict offers refresh and never retries or sends', async () => {
  const events = await runLeadPreparation({ digital: true, saveError: Object.assign(new Error('Seller record changed.'), { code: 'SELLER_UPDATE_CONFLICT' }) })
  assert.equal(events.needsRefresh, true)
  assert.equal(events.saves.length, 1)
  assert.deepEqual(events.sends, [])
  assert.deepEqual(events.listingWrites, [])
  const blocked = await runLeadPreparation({ digital: true, needsRefresh: true })
  assert.deepEqual(blocked.saves, [], 'The stale pack must not be submitted again before refresh.')
})

await test('the final generated listing timestamp becomes the next workspace snapshot', async () => {
  const generatedListing = { ...listing, updatedAt: '2026-10-09T07:10:01Z', mandateStatus: 'generated' }
  const events = await runLeadPreparation({ generatedListing })
  assert.deepEqual(events.errors, [])
  assert.equal(events.hydrated, generatedListing)
})

const reviewAction = leadPageSource.slice(
  leadPageSource.indexOf('  async function saveSellerLeadOnboardingReview('),
  leadPageSource.indexOf('\n  function getSellerLeadSigningRecipients('),
)
async function runOnboardingReview({ error = null } = {}) {
  const events = { errors: [], saves: [], leads: [] }
  const before = { ...listing, sellerOnboarding: { status: 'completed', formData: listing.sellerOnboarding.formData } }
  const committedTimestamp = '2026-10-09T07:10:00.123456Z'
  const scope = {
    selectedLeadLinkedListingId: listing.id, selectedLeadLinkedListing: before,
    selectedLead: { leadId: 'fixture-lead' }, sellerOnboardingReviewSaving: false,
    currentAgent: { id: 'fixture-agent' }, organisationId: listing.organisationId,
    sellerOnboardingCorrectionReason: '', normalizeText: value => String(value ?? '').trim(),
    readSellerOnboardingReview, recordSellerOnboardingReview, SELLER_ONBOARDING_REVIEW_STATUS,
    createSellerOnboardingCorrectionControl, createSellerOnboardingSigningLifecycle: value => value,
    SELLER_ONBOARDING_SIGNING_STAGES: { agentReviewApproved: 'agent_review_approved', correctionRequested: 'correction_requested' },
    getSellerLeadReviewFormData: () => before.sellerOnboarding.formData,
    getSellerLeadOnboardingReviewChecklist: () => ({ ready: true }),
    saveListingSellerCanonicalUpdate: input => saveListingSellerCanonicalUpdate(input, {
      savePrivateListingSellerCanonicalUpdate: async update => {
        events.saves.push(update)
        if (error) throw error
        return { listing: { ...applyListingSellerCanonicalUpdateSnapshot(before, update), updatedAt: committedTimestamp }, receipt: { committed: true }, syncedRequirements: [] }
      },
    }),
    persistSellerProfileOnboardingFormData: () => { throw Error('Review must not make a separate onboarding write.') },
    setSelectedLeadHydratedListing: value => { events.hydrated = value },
    patchSelectedLeadRecord: patch => { events.leads.push(patch) }, updateAgencyCrmLeadRecord: async () => {},
    setSellerOnboardingReviewSaving: value => { events.saving = value },
    setSellerOnboardingReviewError: value => { if (value) events.errors.push(value) },
    setMessage: () => {}, scheduleRecordsReload: () => {},
  }
  events.ok = await Function(...Object.keys(scope), `${reviewAction}; return saveSellerLeadOnboardingReview('approved')`)(...Object.values(scope))
  return events
}

await test('approving onboarding hands the exact committed timestamp and facts to pack preparation', async () => {
  const review = await runOnboardingReview()
  assert.equal(review.ok, true)
  assert.equal(review.saving, false)
  assert.deepEqual(review.errors, [])
  assert.equal(review.saves.length, 1)
  assert.equal(review.hydrated.updatedAt, '2026-10-09T07:10:00.123456Z')
  assert.equal(review.leads[0].sellerOnboarding.formData, review.hydrated.sellerOnboarding.formData)
  assert.equal(readSellerOnboardingReview(review.hydrated.sellerOnboarding.formData.sellerOnboardingReview).status, 'approved')
  const pack = await runLeadPreparation({ priorListing: review.hydrated })
  assert.deepEqual(pack.errors, [])
  assert.equal(pack.saves[0].expectedUpdatedAt, review.hydrated.updatedAt, 'The pack must use the approval receipt timestamp rather than the timestamp before approval.')
})

await test('a failed review does not claim approval or replace the listing snapshot', async () => {
  const events = await runOnboardingReview({ error: Object.assign(new Error('Review changed.'), { code: 'SELLER_UPDATE_CONFLICT' }) })
  assert.equal(events.ok, false)
  assert.deepEqual(events.errors, ['Review changed.'])
  assert.equal(events.hydrated, undefined)
  assert.deepEqual(events.leads, [])
  assert.equal(events.saving, false)
})

const refreshAction = leadPageSource.slice(
  leadPageSource.indexOf('  async function refreshSellerSigningPackRecord('),
  leadPageSource.indexOf('\n  async function sendSellerLeadSigningPack('),
)
const latestStart = leadPageSource.indexOf('function retainLatestSellerListing(')
const latestEnd = leadPageSource.indexOf('\nfunction getWorkspacePropertyPostalCode(', latestStart)
const retainLatestSellerListing = Function(`${leadPageSource.slice(latestStart, latestEnd)}; return retainLatestSellerListing`)()
for (const failRead of [false, true]) {
  await test(`conflict refresh preserves mandate inputs and performs only a read (read failure: ${failRead})`, async () => {
    const latest = { ...listing, updatedAt: '2026-10-09T07:11:00Z', sellerOnboarding: { formData: { ...listing.sellerOnboarding.formData, sellerFirstName: 'Latest' } } }
    const events = { current: listing, needsRefresh: true, reads: 0 }
    const mandateEntries = { askingPrice: '10700000', commissionPercentage: '4.5', startDate: '2026-10-01', endDate: '2027-04-01' }
    const originalEntries = structuredClone(mandateEntries)
    const scope = {
      sellerSigningPackSaving: false, selectedLeadLinkedListingId: listing.id,
      normalizeText: value => String(value ?? '').trim(), retainLatestSellerListing,
      sellerSigningPackTerms: mandateEntries,
      getPrivateListing: async (id, options) => {
        events.reads++
        assert.equal(id, listing.id)
        assert.equal(options.includeRequirementsAndDocuments, false)
        if (failRead) throw Error('Refresh unavailable')
        return latest
      },
      setSelectedLeadHydratedListing: callback => { events.current = callback(events.current) },
      setSellerSigningPackSaving: value => { events.saving = value },
      setSellerSigningPackNeedsRefresh: value => { events.needsRefresh = value },
      setSellerSigningPackError: value => { events.error = value }, setSellerSigningPackProgress: () => {},
      setSellerSigningPackNotice: value => { events.notice = value },
      setSellerSigningPackTerms: () => { throw Error('Must preserve the user mandate entries.') },
      saveListingSellerCanonicalUpdate: () => { throw Error('Refresh must not save.') },
      sendSellerDocumentForSignature: () => { throw Error('Refresh must not dispatch.') },
    }
    await Function(...Object.keys(scope), `${refreshAction}; return refreshSellerSigningPackRecord()`)(...Object.values(scope))
    assert.deepEqual(mandateEntries, originalEntries)
    assert.equal(events.reads, 1)
    assert.equal(events.saving, false)
    assert.equal(events.needsRefresh, failRead)
    assert.equal(events.current, failRead ? listing : latest)
    assert.match(failRead ? events.error : events.notice, failRead ? /Refresh unavailable/ : /Review the seller details and required signers before approving again/)
    if (!failRead) assert.equal(events.error, '', 'A successful refresh should show a notice rather than a red error.')
  })
}
assert.ok(leadPageSource.includes('Refresh seller information and keep mandate entries'))
assert.ok(leadPageSource.includes('disabled={sellerSigningPackSaving || sellerSigningPackNeedsRefresh}'))
