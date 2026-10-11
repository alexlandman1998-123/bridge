import { buildCanonicalSellerOnboardingPayload } from '../src/services/documents/sellerOnboardingFactTransformer.js'
import { buildSpecialistSalesFacts, getSpecialistSalesListingSchema } from '../src/services/listings/specialistSalesListingSchema.js'
import { buildListingSellerInformationModel } from '../src/services/listings/listingSellerInformationModel.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { uuid, listingA, listingB, agentA, agentB, adminA, outsider, fixture, actor, rpc, installCanonicalSave, guardedFixture, transactionSellerFixture } from './fixtures/seller-alignment-database.mjs'
import { buildSellerLeadAgentOnboardingSubmission, createSellerLeadAgentOnboardingDraft, buildSellerLeadManualCapturePayload, buildSellerLeadSigningPackTermsPatch } from '../src/lib/sellerLeadManualCaptureModel.js'
import { PROPERTY_DISCLOSURE_QUESTIONS, isPropertyDisclosureDigitallyComplete } from '../src/lib/propertyDisclosure.js'
import { buildListingSellerCanonicalUpdate, applyListingSellerCanonicalUpdateSnapshot, applyListingSellerOnboardingSaveSnapshot, getSellerOnboardingSaveRevision } from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { buildSellerSigningPlan } from '../src/lib/sellerSigningPlanModel.js'
import { buildSellerOnboardingSigningPackSnapshot } from '../src/core/documents/sellerOnboardingSigningPackSnapshot.js'
import { buildSellerPostOnboardingDrafts } from '../src/core/documents/sellerPostOnboardingDrafts.js'
import { createSellerOnboardingSigningCopyPack } from '../src/core/documents/sellerOnboardingManualSigningPack.js'
import { createSellerReviewedDocumentVersions, verifySellerReviewedDocumentVersion } from '../src/core/documents/sellerReviewedDocumentVersions.js'
import { buildSellerDocumentSourceOfTruth } from '../src/services/sellerDocumentRequirementsService.js'

test('assisted disclosure drafts and completed intake round-trip through the real token RPCs without signing', async () => {
  const db = await fixture()
  try {
    await actor(db, 'authenticated', agentA)
    const partial = buildSellerLeadAgentOnboardingSubmission({ saveAsDraft: true, capturedBy: agentA,
      draft: { propertyDisclosure: { responses: { electrical_faults: { answer: 'yes', note: 'Seller reports a fault.' } }, comments: 'Agent captured by phone.', remoteControlsQuantity: 0 } } })
    await rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', 'token-a', partial.formData)
    const reopened = await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', 'token-a')
    const draft = createSellerLeadAgentOnboardingDraft({ formData: reopened.form_data })
    assert.equal(draft.propertyDisclosure.responses.electrical_faults.note, 'Seller reports a fault.')
    assert.equal(draft.propertyDisclosure.remoteControlsQuantity, '0')
    assert.equal(reopened.form_data.sellerDisclosureCapture.status, 'draft')
    const completed = buildSellerLeadAgentOnboardingSubmission({ capturedBy: agentA, existingFormData: reopened.form_data,
      draft: { ...draft, branch: 'individual', sellerFirstName: 'Jane', sellerSurname: 'Owner', phone: '0820000000',
        idNumber: '8001015009087', dateOfBirth: '1980-01-01', nationality: 'South African', residentialAddress: '1 Main Road',
        incomeTaxNumber: '12345', saResident: 'yes', maritalStatus: 'single', popiConsentAccepted: true,
        propertyAddress: '1 Main Road', propertySuburb: 'Sandton', propertyCity: 'Johannesburg', propertyProvince: 'Gauteng',
        ratesTaxes: '0', leviesNotApplicable: true, waterBillingType: 'municipal', occupation: 'Teacher', sourceOfFunds: 'Salary', politicallyExposedPerson: 'no',
        propertyDisclosure: { ...draft.propertyDisclosure, responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map(question => [question.key, question.key === 'electrical_faults' ? draft.propertyDisclosure.responses.electrical_faults : { answer: 'no', note: '' }])) } } })
    assert.deepEqual(completed.errors, [])
    await rpc(db, 'bridge_complete_private_listing_seller_onboarding', 'token-a', { ...completed.formData, completionMode: 'agent_assisted', completedBy: agentA })
    const saved = await rpc(db, 'bridge_get_private_listing_seller_onboarding_form', 'token-a')
    assert.equal(saved.status, 'completed')
    assert.equal(saved.form_data.sellerDisclosureCapture.capturedBy, agentA)
    assert.equal(saved.form_data.sellerDisclosureCapture.status, 'awaiting_seller_review_and_signature')
    assert.equal(Object.values(saved.form_data.propertyDisclosure.responses).filter(response => response.answer).length, 20)
    assert.equal(saved.form_data.propertyDisclosure.signature, '')
    assert.equal(saved.form_data.propertyDisclosure.declarationAccepted, false)
    assert.equal(isPropertyDisclosureDigitallyComplete(saved.form_data.propertyDisclosure), false)
    assert.equal(saved.form_data.propertyDisclosureStatus, 'pending_seller_completion')
  } finally { await db.close() }
})

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
          const approval = { status: 'approved', signingRoute: 'manual_upload', selectedDocuments: ['disclosure', 'fica', 'mandate'],
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

const revisionOf = (onboarding) => ({ onboardingId: onboarding.id, updatedAt: onboarding.updated_at })
async function savedState(db) {
  await actor(db, 'postgres')
  return (await db.query('select to_jsonb(l) listing, to_jsonb(o) onboarding from private_listings l join private_listing_seller_onboarding o on o.private_listing_id=l.id where l.id=$1', [listingA])).rows[0]
}
async function guardedAgentSave(db, baseline, mutation, name) {
  await actor(db, 'authenticated', agentA)
  return (await db.query(`select save_private_listing_seller_canonical_update(
    $1::uuid,$2::jsonb,$3::jsonb,'{}'::jsonb,'{}'::jsonb,'in_progress','individual','individual','single',
    $4::uuid,'seller_edit','test',array['sellerName'],$5::timestamptz) result`, [listingA,
    { sellerName: name, __sellerSave: revisionOf(baseline.onboarding) }, { seller: { name } }, mutation, baseline.listing.updated_at])).rows[0].result
}
async function guardedProgress(db, baseline, form = {}) {
  await actor(db, 'anon')
  return rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', 'token-a', { ...form, __sellerSave: revisionOf(baseline.onboarding) })
}
async function guardedProfile(db, baseline, form = {}, status = 'in_progress') {
  await actor(db, 'authenticated', agentA)
  return (await db.query(`select save_private_listing_seller_onboarding_profile(
    $1::uuid,'token-a',$2::jsonb,$3::jsonb,$4,'individual','individual','single') result`,
  [listingA, form, revisionOf(baseline.onboarding), status])).rows[0].result
}

test('guarded seller and agent saves reject both stale interleavings without losing the committed data', async () => {
  const db = await guardedFixture()
  try {
    const original = await savedState(db)
    const agentSaved = await guardedAgentSave(db, original, uuid(501), 'Agent update')
    await assert.rejects(guardedProgress(db, original, { sellerName: 'Old seller draft' }), error => error.code === 'PT409')
    const afterConflict = await savedState(db)
    assert.equal(afterConflict.onboarding.form_data.sellerName, 'Agent update')
    assert.deepEqual(afterConflict.listing.seller_canonical_facts_json, agentSaved.listing.seller_canonical_facts_json)
    const sellerSaved = await guardedProgress(db, afterConflict, { sellerName: 'Seller update', canonicalSellerFacts: { seller: { name: 'Seller update' } } })
    await assert.rejects(guardedAgentSave(db, afterConflict, uuid(502), 'Older agent draft'), error => error.code === 'PT409')
    const latest = await savedState(db)
    assert.equal(latest.onboarding.form_data.sellerName, 'Seller update')
    assert.deepEqual(latest.listing.seller_canonical_facts_json, sellerSaved.listing.seller_canonical_facts_json)
    assert.equal(latest.onboarding.form_data.__sellerSave, undefined)
    assert.equal((await db.query("select count(*)::int n from private_listing_activity where activity_type='seller_canonical_update'")).rows[0].n, 1)
  } finally { await db.close() }
})

test('guarded submission rejects stale forms and a late draft cannot reopen completed onboarding', async () => {
  const db = await guardedFixture()
  try {
    const original = await savedState(db)
    await guardedAgentSave(db, original, uuid(503), 'Latest agent details')
    await actor(db, 'anon')
    await assert.rejects(rpc(db, 'bridge_complete_private_listing_seller_onboarding', 'token-a', {
      sellerName: 'Stale submission', __sellerSave: revisionOf(original.onboarding),
    }), error => error.code === 'PT409')
    const baseline = await savedState(db)
    await actor(db, 'anon')
    const receipt = await rpc(db, 'bridge_complete_private_listing_seller_onboarding', 'token-a', {
      sellerName: 'Latest agent details', __sellerSave: revisionOf(baseline.onboarding),
    })
    assert.equal(receipt.status, 'completed')
    await assert.rejects(guardedProgress(db, baseline, { sellerName: 'Late autosave' }), error => error.code === 'PT409')
    const completed = await savedState(db)
    await assert.rejects(guardedProgress(db, completed, { currentStep: 1 }), error => error.code === 'PT409')
    const edited = await guardedProfile(db, completed, { ...completed.onboarding.form_data, phone: '0820000000' }, 'in_progress')
    assert.equal(edited.status, 'completed')
    const final = await savedState(db)
    assert.equal(final.listing.seller_onboarding_status, 'completed')
    assert.equal(final.onboarding.submitted_at, completed.onboarding.submitted_at)
    assert.equal(final.onboarding.form_data.sellerName, 'Latest agent details')
  } finally { await db.close() }
})

test('staff profile saves compare the editor revision, commit canonical facts together and reject obsolete tokens', async () => {
  const db = await guardedFixture()
  try {
    const original = await savedState(db)
    const facts = { seller: { name: 'New profile' } }
    const saved = await guardedProfile(db, original, { sellerName: 'New profile', canonicalSellerFacts: facts })
    assert.equal(saved.form_data.sellerName, 'New profile')
    assert.doesNotMatch(JSON.stringify(saved), /password-secret|access-secret|invite-secret|recovery-secret/)
    await assert.rejects(guardedProfile(db, original, { sellerName: 'Old profile' }), error => error.code === 'PT409')
    const latest = await savedState(db)
    assert.deepEqual(latest.listing.seller_canonical_facts_json, facts)
    assert.deepEqual(latest.onboarding.canonical_facts_json, facts)
    const nextEditor = applyListingSellerOnboardingSaveSnapshot({ ...original.listing, sellerOnboarding: original.onboarding }, saved)
    assert.equal(nextEditor.updatedAt, latest.listing.updated_at)
    const nextRevision = getSellerOnboardingSaveRevision(nextEditor)
    const nextReceipt = await guardedAgentSave(db, { listing: { updated_at: nextEditor.updatedAt }, onboarding: { id: nextRevision.onboardingId, updated_at: nextRevision.updatedAt } }, uuid(506), 'Next deliberate edit')
    assert.equal(nextReceipt.onboarding.form_data.sellerName, 'Next deliberate edit')
    await actor(db, 'anon')
    await assert.rejects(rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', 'token-a', { sellerName: 'Legacy client without version' }), error => error.code === 'PT409')
    for (const token of ['wrong', 'expired', 'stable-a']) {
      assert.equal(await rpc(db, 'bridge_update_private_listing_seller_onboarding_progress', token, { __sellerSave: revisionOf(latest.onboarding) }), null)
    }
    await assert.rejects(db.query("select seller_save_private.bridge_update_private_listing_seller_onboarding_progress('token-a')"), /permission denied/)
    await assert.rejects(db.query("select save_private_listing_seller_onboarding_profile($1,'token-a','{}','{}','in_progress',null,null,null)", [listingA]), /permission denied/)
    await actor(db, 'authenticated', outsider)
    await assert.rejects(db.query("select save_private_listing_seller_onboarding_profile($1,'token-a','{}','{}','in_progress',null,null,null)", [listingA]), /not found or is no longer available/)
  } finally { await db.close() }
})

test('onboarding-only changes conflict with an agent editor even when listing updated_at is unchanged', async () => {
  const db = await guardedFixture()
  try {
    const original = await savedState(db)
    await db.query("update private_listing_seller_onboarding set form_data=form_data || '{\"email\":\"new@example.test\"}', updated_at=clock_timestamp() where token='token-a'")
    await assert.rejects(guardedAgentSave(db, original, uuid(504), 'Older contact'), error => error.code === 'PT409')
    const latest = await savedState(db)
    assert.equal(latest.onboarding.form_data.email, 'new@example.test')
    assert.deepEqual(latest.listing, original.listing)
  } finally { await db.close() }
})

test('guarded draft and profile writes roll back both records if either write fails', async () => {
  const db = await guardedFixture()
  try {
    const original = await savedState(db)
    await db.exec(`create function reject_listing_projection() returns trigger language plpgsql as $$begin raise exception 'test projection failure'; end$$;
      create trigger reject_listing_projection before update on private_listings for each row execute function reject_listing_projection();`)
    await assert.rejects(guardedProgress(db, original, { sellerName: 'Uncommitted draft' }), /test projection failure/)
    await assert.rejects(guardedProfile(db, original, { sellerName: 'Uncommitted profile' }), /test projection failure/)
    const latest = await savedState(db)
    assert.deepEqual(latest, original)
  } finally { await db.close() }
})

test('only an explicit staff correction reopens submitted onboarding; subsequent seller drafts save with its new revision', async () => {
  const db = await guardedFixture()
  try {
    const initial = await savedState(db)
    await actor(db, 'anon')
    await rpc(db, 'bridge_complete_private_listing_seller_onboarding', 'token-a', { __sellerSave: revisionOf(initial.onboarding), sellerName: 'Submitted owner' })
    const completed = await savedState(db)
    const agentEdit = await guardedAgentSave(db, completed, uuid(505), 'Correct contact')
    assert.equal(agentEdit.onboarding.status, 'completed')
    const baseline = await savedState(db)
    await actor(db, 'authenticated', agentA)
    await db.query(`select save_private_listing_seller_onboarding_profile($1,'token-a',$2::jsonb,$3::jsonb,'in_progress',null,null,null,false,true)`,
      [listingA, baseline.onboarding.form_data, revisionOf(baseline.onboarding)])
    const reopened = await savedState(db)
    assert.equal(reopened.onboarding.status, 'in_progress')
    assert.equal(reopened.onboarding.submitted_at, null)
    const saved = await guardedProgress(db, reopened, { sellerName: 'Seller correction' })
    assert.equal(saved.onboarding.form_data.sellerName, 'Seller correction')
  } finally { await db.close() }
})

test('profile creation checks the absence of an onboarding row under the listing lock', async () => {
  const db = await guardedFixture()
  try {
    await db.query('insert into private_listings(id,organisation_id,assigned_agent_id) values($1,$2,$3)', [uuid(3), uuid(21), agentA])
    await actor(db, 'authenticated', agentA)
    const create = () => db.query(`select save_private_listing_seller_onboarding_profile($1,'new-token', '{"sellerName":"New owner"}',
      '{"onboardingId":null,"updatedAt":null}', 'not_started','individual','individual',null) result`, [uuid(3)])
    const saved = (await create()).rows[0].result
    assert.equal(saved.form_data.sellerName, 'New owner')
    await assert.rejects(create(), error => error.code === 'PT409')
    assert.equal((await db.query('select count(*)::int n from private_listing_seller_onboarding where private_listing_id=$1', [uuid(3)])).rows[0].n, 1)
  } finally { await db.close() }
})

async function transactionSellerContext(db) {
  return (await db.query('select bridge_get_transaction_seller_edit_context($1) result', [uuid(801)])).rows[0].result
}
async function saveTransactionSeller(db, context, patch, mutation = uuid(805)) {
  return (await db.query('select bridge_save_transaction_seller_details($1,$2::jsonb,$3::jsonb,$4) result', [uuid(801), context.revision, patch, mutation])).rows[0].result
}
async function transactionSellerState(db) {
  await db.exec('reset role')
  return { capture: (await db.query('select form_data,canonical_facts_json,updated_at from private_listing_seller_onboarding where id=$1', [uuid(31)])).rows[0],
    listing: (await db.query('select seller_canonical_facts_json,updated_at from private_listings where id=$1', [listingA])).rows[0],
    transaction: (await db.query('select * from transactions')).rows,
    participants: (await db.query('select * from transaction_participants order by id')).rows,
    form: (await db.query('select * from onboarding_form_data')).rows,
    receipts: (await db.query('select * from seller_save_private.transaction_receipts')).rows }
}

test('transaction and seller portal saves reject both stale interleavings and update all current contact projections', async () => {
  const db = await transactionSellerFixture()
  try {
    const original = await transactionSellerContext(db)
    const baseline = await savedState(db)
    await guardedProgress(db, baseline, { ...baseline.onboarding.form_data, email: 'portal@example.com', canonicalSellerFacts: { seller: { name: 'Owner A', contact: { email: 'portal@example.com', phone: 'old-phone' } } } })
    await actor(db, 'authenticated', agentA)
    await assert.rejects(saveTransactionSeller(db, original, { phone: 'stale-phone' }), e => e.code === 'PT409')
    const refreshed = await transactionSellerContext(db)
    const agentBaseline = await savedState(db)
    await actor(db, 'authenticated', agentA)
    const receipt = await saveTransactionSeller(db, refreshed, { email: '', phone: 'transaction-phone' })
    assert.equal(receipt.details.email, '')
    assert.equal(receipt.details.phone, 'transaction-phone')
    assert.notDeepEqual(receipt.revision, original.revision)
    await assert.rejects(guardedAgentSave(db, agentBaseline, uuid(806), 'Stale agent'), e => e.code === 'PT409')
    const state = await transactionSellerState(db)
    assert.equal(state.capture.form_data.otherSavedFact, 'keep')
    assert.equal(state.capture.form_data.phone, 'transaction-phone')
    assert.equal(state.capture.canonical_facts_json.seller.contact.phone, 'transaction-phone')
    assert.deepEqual(state.capture.canonical_facts_json, state.listing.seller_canonical_facts_json)
    assert.equal(state.transaction[0].seller_phone, 'transaction-phone')
    assert.equal(state.participants[0].participant_phone, 'transaction-phone')
    assert.equal(state.participants[0].participant_email, null)
    assert.equal(state.form[0].form_data.seller_phone, 'transaction-phone')
    assert.equal(state.form[0].form_data.__bridge_transaction_parties.seller.people[0].phone, 'transaction-phone')
    assert.equal(state.form[0].form_data.__bridge_transaction_parties.seller.people[0].identityNumber, 'saved-id')
    assert.equal(state.form[0].form_data.unrelated, 'preserve')
    assert.equal(state.form[0].form_data.__bridge_transaction_parties.buyer.people[0].name, 'Buyer')
  } finally { await db.close() }
})

test('projection failure rolls back authority, transaction, participants, form and receipt', async () => {
  const db = await transactionSellerFixture()
  try {
    const context = await transactionSellerContext(db)
    const before = await transactionSellerState(db)
    await db.exec(`create function reject_seller_projection() returns trigger language plpgsql as $$begin if new.participant_phone='reject-me' then raise exception 'projection failed'; end if; return new; end$$;
      create trigger fail_seller_projection before update on transaction_participants for each row execute function reject_seller_projection();`)
    await actor(db, 'authenticated', agentA)
    await assert.rejects(saveTransactionSeller(db, context, { phone: 'reject-me' }), /projection failed/)
    assert.deepEqual(await transactionSellerState(db), before)
    assert.equal((await db.query('select count(*)::int n from seller_save_private.authorised_commands')).rows[0].n, 0)
  } finally { await db.close() }
})

test('confirmed retry returns the original receipt without overwriting a later seller save', async () => {
  const db = await transactionSellerFixture()
  try {
    const context = await transactionSellerContext(db)
    const receipt = await saveTransactionSeller(db, context, { phone: 'first-phone' })
    const baseline = await savedState(db)
    await guardedProgress(db, baseline, { ...baseline.onboarding.form_data, phone: 'newer-phone' })
    await actor(db, 'authenticated', agentA)
    assert.deepEqual(await saveTransactionSeller(db, context, { phone: 'first-phone' }), receipt)
    await assert.rejects(saveTransactionSeller(db, context, { phone: 'different-phone' }), e => e.code === 'PT409')
    assert.equal((await transactionSellerContext(db)).details.phone, 'newer-phone')
  } finally { await db.close() }
})

test('transaction primary contact updates preserve the other owner and block ambiguous source links', async () => {
  const db = await transactionSellerFixture({ multi: true, linked: false })
  try {
    const context = await transactionSellerContext(db)
    const before = await transactionSellerState(db)
    await actor(db, 'authenticated', agentA)
    await saveTransactionSeller(db, context, { phone: 'primary-phone' })
    const after = await transactionSellerState(db)
    assert.deepEqual(after.participants[1], before.participants[1])
    assert.deepEqual(after.form[0].form_data.__bridge_transaction_parties.seller.people[1], before.form[0].form_data.__bridge_transaction_parties.seller.people[1])
    assert.equal(after.participants[0].participant_phone, 'primary-phone')
  } finally { await db.close() }
  const linked = await transactionSellerFixture({ multi: true })
  try {
    const context = await transactionSellerContext(linked)
    assert.match(context.blockedReason, /source needs review/)
    await assert.rejects(saveTransactionSeller(linked, context, { phone: 'no-guess' }), e => e.code === 'PT409')
    await linked.exec('reset role')
    await linked.exec('begin')
    await linked.query('select seller_save_private.authorise($1)', [uuid(801)])
    await linked.query("update transaction_participants set seller_source_onboarding_id=$1,seller_source_contact_key='primary_contact' where id=$2", [uuid(31),uuid(802)])
    await linked.exec('delete from seller_save_private.authorised_commands; commit')
    const before = await transactionSellerState(linked)
    await actor(linked, 'authenticated', agentA)
    const reviewed = await transactionSellerContext(linked)
    assert.equal(reviewed.blockedReason, null)
    await saveTransactionSeller(linked, reviewed, { phone: 'reviewed-primary-phone' })
    const after = await transactionSellerState(linked)
    assert.deepEqual(after.participants[1], before.participants[1])
    assert.deepEqual(after.form[0].form_data.__bridge_transaction_parties.seller.people[1], before.form[0].form_data.__bridge_transaction_parties.seller.people[1])
  } finally { await linked.close() }
})

test('server enforces seller field permissions and blocks legacy writes and forged command flags', async () => {
  const db = await transactionSellerFixture()
  try {
    const context = await transactionSellerContext(db)
    await assert.rejects(saveTransactionSeller(db, context, { name: 'Unreviewed legal name' }), e => e.code === '42501')
    await assert.rejects(saveTransactionSeller(db, context, { organisation_id: uuid(22) }), e => e.code === '22023')
    await assert.rejects(db.query('update transactions set seller_phone=$1 where id=$2', ['bypass',uuid(801)]), e => e.code === 'PT409')
    await assert.rejects(db.query('update transaction_participants set participant_phone=$1 where id=$2', ['bypass',uuid(802)]), e => e.code === 'PT409')
    await assert.rejects(db.query("update onboarding_form_data set form_data=jsonb_set(form_data,'{__bridge_transaction_parties,seller,name}','\"bypass\"')"), e => e.code === 'PT409')
    await assert.rejects(db.query('insert into seller_save_private.authorised_commands values(pg_current_xact_id(),$1)', [uuid(801)]), /permission denied/)
    await assert.rejects(db.query('select seller_save_private.authorise($1)', [uuid(801)]), /permission denied/)
    await assert.rejects(db.query("insert into transaction_participants(id,transaction_id,role_type,seller_source_onboarding_id,seller_source_contact_key) values($1,$2,'seller',$3,'primary_contact')", [uuid(850),uuid(801),uuid(31)]), e => e.code === 'PT409')
    await actor(db, 'authenticated', outsider)
    await assert.rejects(transactionSellerContext(db), e => e.code === '42501')
    await assert.rejects(saveTransactionSeller(db, context, { phone: 'outsider' }), e => e.code === '42501')
    await db.exec("reset role; update organisation_users set status='inactive'")
    await actor(db, 'authenticated', agentA)
    await assert.rejects(transactionSellerContext(db), e => e.code === '42501')
    await actor(db, 'anon')
    await assert.rejects(transactionSellerContext(db), /permission denied/)
  } finally { await db.close() }
})

test('workflow status commands merge current capture fields and never regress a later stage', async () => {
  const db = await transactionSellerFixture()
  try {
    const context = await transactionSellerContext(db)
    await saveTransactionSeller(db, context, { phone: 'new-contact' })
    const result = (await db.query("select bridge_advance_seller_workflow($1,'mandate_signed') result", [listingA])).rows[0].result
    assert.equal(result.form_data.phone, 'new-contact')
    assert.equal(result.form_data.otherSavedFact, 'keep')
    assert.equal(result.form_data.sellerWorkflow.stage, 'documents_prepared')
    const later = (await db.query("select bridge_advance_seller_workflow($1,'fica_requested') result", [listingA])).rows[0].result
    assert.equal(later.form_data.sellerWorkflow.stage, 'documents_prepared')
    assert.equal(later.form_data.sellerWorkflow.history.length, 1)
    await assert.rejects(db.query("select bridge_advance_seller_workflow($1,'replace_profile')", [listingA]), e => e.code === '22023')
    await actor(db, 'authenticated', outsider)
    await assert.rejects(db.query("select bridge_advance_seller_workflow($1,'fica_requested')", [listingA]), e => e.code === '42501')
  } finally { await db.close() }
})

test('seller link preparation rejects stale or unguarded forms and cannot reopen completed capture', async () => {
  const db = await transactionSellerFixture()
  try {
    const baseline = await savedState(db)
    const context = await transactionSellerContextAfterActor(db)
    await saveTransactionSeller(db, context, { phone: 'new-contact' })
    const prepare = async (revision, form = baseline.onboarding.form_data) => (await db.query("select bridge_prepare_seller_onboarding_link($1,'token-a',now()+interval '1 day',$2::jsonb,'individual','individual','single',$3) result",
      [listingA,{ ...form, __sellerSave: revision },agentA])).rows[0].result
    await assert.rejects(prepare(revisionOf(baseline.onboarding)), e => e.code === 'PT409')
    await assert.rejects(prepare(undefined), e => e.code === 'PT409')
    const current = await savedState(db)
    await actor(db, 'authenticated', agentA)
    const deferred = await prepare({ ...revisionOf(current.onboarding), deferStatusTransition: true }, current.onboarding.form_data)
    assert.equal(deferred.onboarding.status, current.onboarding.status)
    assert.equal(deferred.onboarding.form_data.__sellerSave, undefined)
    const beforeSent = await savedState(db)
    await actor(db, 'authenticated', agentA)
    const sent = await prepare(revisionOf(beforeSent.onboarding), beforeSent.onboarding.form_data)
    assert.equal(sent.onboarding.status, 'sent')
    assert.equal(sent.onboarding.form_data.phone, 'new-contact')
    const latest = await savedState(db)
    await actor(db, 'anon')
    await rpc(db,'bridge_complete_private_listing_seller_onboarding','token-a',{ ...latest.onboarding.form_data, __sellerSave: revisionOf(latest.onboarding) })
    const completed = await savedState(db)
    await actor(db, 'authenticated', agentA)
    const receipt = await prepare(revisionOf(completed.onboarding))
    assert.equal(receipt.onboarding.status, 'completed')
    assert.equal(receipt.onboarding.form_data.phone, 'new-contact')
    assert.equal(receipt.onboarding.seller_portal_password_hash, undefined)
    await assert.rejects(db.query("select seller_save_private.prepare_link_before_guard($1,'token-a',now(),'{}',null,null,null,null)",[listingA]), /permission denied/)
  } finally { await db.close() }
})
async function transactionSellerContextAfterActor(db) {
  await actor(db, 'authenticated', agentA)
  return transactionSellerContext(db)
}

test('the transaction API routes seller-only saves through the guarded command before any table writes', async () => {
  const source = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
  const start = source.indexOf('export async function updateTransactionStakeholderContacts(')
  const body = source.slice(start, source.indexOf('\nexport ', start + 10)).replace('export async function', 'async function')
  const client = { from() { throw new Error('unguarded table access') } }
  const calls = []
  const handler = new Function('requireClient','saveTransactionSellerDetails',`${body}; return updateTransactionStakeholderContacts`)(() => client, async (args) => { calls.push(args); return { confirmed: true } })
  const context = { details: { phone: 'shown' }, revision: { transactionUpdatedAt: 'original' } }
  assert.deepEqual(await handler({ transactionId: uuid(801), sellerOnly: true, sellerPhone: 'new', sellerSaveContext: context, sellerMutationId: uuid(805) }), { confirmed: true })
  assert.equal(calls[0].context, context)
  assert.equal(calls[0].mutationId, uuid(805))
  assert.equal(calls[0].client, client)
  await assert.rejects(handler({ transactionId: uuid(801), sellerPhone: 'legacy edit' }), /seller details editor/)
  assert.equal(calls.length, 1)
})

test('a seller-only save preserves a newer listing operation; an actual property edit requires its displayed revision', async () => {
  const db = await transactionSellerFixture()
  try {
    const baseline = await savedState(db)
    await db.query("update private_listings set asking_price=999,address_line_1='New listing address',updated_at=clock_timestamp() where id=$1", [listingA])
    await actor(db, 'authenticated', agentA)
    const save = async (changedFields, mutation) => db.query(`select save_private_listing_seller_canonical_update($1,$2::jsonb,$3::jsonb,'{}','{"askingPrice":1,"addressLine1":"Old address"}','in_progress','individual','individual','single',$4,'seller_edit','test',$5::text[],$6)`,
      [listingA,{ ...baseline.onboarding.form_data, email: 'corrected@example.com', __sellerSave: revisionOf(baseline.onboarding) },baseline.onboarding.canonical_facts_json,mutation,changedFields,baseline.listing.updated_at])
    await assert.rejects(save(['askingPrice'],uuid(820)), e => e.code === 'PT409')
    await save(['email'],uuid(821))
    const current = await savedState(db)
    assert.equal(current.listing.asking_price,999)
    assert.equal(current.listing.address_line_1,'New listing address')
    assert.equal(current.onboarding.form_data.email,'corrected@example.com')
  } finally { await db.close() }
})


test('current transaction seller profile reads the linked capture after saves instead of stale deal summaries', async () => {
  const db = await transactionSellerFixture()
  try {
    const original = await transactionSellerContext(db)
    await saveTransactionSeller(db, original, { phone: 'current-phone', email: '' })
    const result = (await db.query('select bridge_get_transaction_seller_profile($1) result', [uuid(801)])).rows[0].result
    assert.equal(result.status, 'current')
    assert.equal(result.listing.sellerOnboarding.formData.phone, 'current-phone')
    const shared = buildListingSellerInformationModel(result.listing)
    assert.equal(shared.draft.phone, 'current-phone')
    assert.equal(shared.draft.email, '')
    assert.equal(JSON.stringify(result).includes('password_hash'), false)
    assert.equal(JSON.stringify(result).includes('seller_portal_token'), false)
    assert.equal(JSON.stringify(result).includes('__bridge_transaction_parties'), false)
  } finally { await db.close() }
})

test('current transaction profile follows full captured identity fields independently of its old contact snapshot', async () => {
  const db = await transactionSellerFixture()
  try {
    await db.exec('reset role')
    const form = { ownerStructureType: 'trust', trustName: 'Current Trust', trustRegistrationNumber: 'TRUST-REG', primaryContactName: 'Current Office', email: 'office@example.com', trustees: [{ id: 'saved-trustee', name: 'Dina', surname: 'Trustee', nationality: 'ZA', residentialAddress: 'Saved Home' }], saResident: 'yes', taxResident: 'no', incomeTaxNumber: 'saved-tax' }
    await db.query('update private_listing_seller_onboarding set form_data=$1::jsonb where id=$2', [form, uuid(31)])
    await actor(db, 'authenticated', agentA)
    const result = (await db.query('select bridge_get_transaction_seller_profile($1) result', [uuid(801)])).rows[0].result
    const model = buildListingSellerInformationModel(result.listing)
    assert.equal(model.profileType, 'trust')
    assert.equal(model.draft.trustRegistrationNumber, 'TRUST-REG')
    assert.equal(model.draft.trustees[0].id, 'saved-trustee')
    assert.equal(model.draft.trustees[0].residentialAddress, 'Saved Home')
    assert.equal(model.draft.saResident, 'yes'); assert.equal(model.draft.taxResident, 'no')
  } finally { await db.close() }
})

test('current profile rejects unauthorised and anonymous callers and exposes no cross-agency facts', async () => {
  const db = await transactionSellerFixture()
  try {
    await actor(db, 'authenticated', outsider)
    await assert.rejects(db.query('select bridge_get_transaction_seller_profile($1)', [uuid(801)]), /access denied/i)
    await actor(db, 'anon', agentA)
    await assert.rejects(db.query('select bridge_get_transaction_seller_profile($1)', [uuid(801)]), /permission denied/i)
    await db.exec('reset role')
    await db.query('update transactions set organisation_id=$1 where id=$2', [uuid(22), uuid(801)])
    await actor(db, 'authenticated', agentA)
    const result = (await db.query('select bridge_get_transaction_seller_profile($1) result', [uuid(801)])).rows[0].result
    assert.deepEqual(result, { status: 'relationship_review_required' })
  } finally { await db.close() }
})

test('current profile retains supported legacy entity aliases and excludes unrelated capture payloads', async () => {
  const db = await transactionSellerFixture()
  try {
    await db.exec('reset role')
    const form = {
      ownerStructureType: 'company', company: {
        name: 'Legacy Company', registration_number: 'LEGACY-REG', registered_address: 'Legacy Address',
        directors: [{ id: 'legacy-saved-director', name: 'Dina', surname: 'Director', residential_address: 'Director Home' }],
        signing_token: 'nested-secret',
      },
      company_authority_basis: 'Saved resolution', primary_contact_name: 'Current Office',
      seller_portal_token: 'form-secret', signature: 'signature-evidence', askingPrice: 123,
    }
    const olderFacts = { seller: { company: { name: 'Old Company', registration_number: 'OLD-REG', registered_address: 'Old Address', directors: [{ id: 'old-director', name: 'Old Director' }] } } }
    await db.query('update private_listing_seller_onboarding set form_data=$1::jsonb,canonical_facts_json=$2::jsonb where id=$3', [form, olderFacts, uuid(31)])
    await actor(db, 'authenticated', agentA)
    const result = (await db.query('select bridge_get_transaction_seller_profile($1) result', [uuid(801)])).rows[0].result
    const model = buildListingSellerInformationModel(result.listing)
    assert.equal(model.draft.companyName, 'Legacy Company')
    assert.equal(model.draft.companyRegistrationNumber, 'LEGACY-REG')
    assert.equal(model.draft.companyRegisteredAddress, 'Legacy Address')
    assert.equal(model.draft.companyDirectors[0].id, 'legacy-saved-director')
    assert.equal(model.draft.companyDirectors[0].residentialAddress, 'Director Home')
    assert.equal(model.draft.companyAuthorityBasis, 'Saved resolution')
    assert.equal(model.draft.primaryContactName, 'Current Office')
    for (const excluded of ['form-secret', 'nested-secret', 'signature-evidence', 'askingPrice']) {
      assert.equal(JSON.stringify(result).includes(excluded), false)
    }
  } finally { await db.close() }
})

test('ambiguous linked captures never select a latest winner for transaction profile display', async () => {
  const db = await transactionSellerFixture()
  try {
    await db.exec('reset role; drop index seller_capture_listing_unique')
    await db.query("insert into private_listing_seller_onboarding(private_listing_id,token,form_data) values($1,'ambiguous-profile-capture',$2::jsonb)", [listingA, { email: 'different@example.com' }])
    await actor(db, 'authenticated', agentA)
    const result = (await db.query('select bridge_get_transaction_seller_profile($1) result', [uuid(801)])).rows[0].result
    assert.deepEqual(result, { status: 'relationship_review_required' })
  } finally { await db.close() }
})

test('unlinked profile reads only its own saved transaction seller capture', async () => {
  const db = await transactionSellerFixture({ linked: false })
  try {
    const result = (await db.query('select bridge_get_transaction_seller_profile($1) result', [uuid(801)])).rows[0].result
    assert.equal(result.status, 'transaction_capture')
    assert.equal(result.partyProfile.people[0].id, uuid(802))
    assert.equal(result.listing, undefined)
    assert.equal(JSON.stringify(result).includes('Buyer'), false)
  } finally { await db.close() }
})


test('specialist sale values survive guarded SQL saves, readback, partial saves and explicit clearing in every category', async () => {
  const db = await guardedFixture()
  try {
    for (const category of ['residential', 'commercial', 'industrial', 'retail', 'agricultural', 'mixed_use', 'vacant_land']) {
      const specialist = buildSpecialistSalesFacts({ grossLettableArea: '1250.5', zoning: 'Business 4', parking: '18 bays', listingTerms: 'Vacant occupation', warehouseOrFactoryArea: '2200.5', yardSize: '900.5', powerSupply: '250 kVA', loadingAccess: true, farmSize: '42.5', waterSupplyOrRights: 'Borehole rights', agriculturalUse: 'Citrus', erfSize: '500.5' })
      const form = { sellerName: 'Saved Owner', propertyCategory: category, ...specialist }
      const baseline = await savedState(db)
      form.canonicalSellerFacts = buildCanonicalSellerOnboardingPayload(form).canonicalSellerFacts
      await guardedProfile(db, baseline, form)
      const saved = await savedState(db)
      for (const { key } of getSpecialistSalesListingSchema(category).fields) {
        assert.equal(saved.onboarding.form_data[key], specialist[key], `${category}/${key} raw save`)
        assert.equal(saved.listing.seller_canonical_facts_json.property.specialistFacts[key], specialist[key], `${category}/${key} readback`)
      }
      await assert.rejects(guardedProfile(db, baseline, { ...form, zoning: 'Stale overwrite' }), { code: 'PT409' })
      const partial = buildCanonicalSellerOnboardingPayload({ sellerName: 'Contact correction' }, { sellerCanonicalFacts: saved.listing.seller_canonical_facts_json }).canonicalSellerFacts
      assert.deepEqual(partial.property.specialistFacts, specialist, `${category} preserves absent controls`)
      const cleared = { ...form, ...buildSpecialistSalesFacts() }
      cleared.canonicalSellerFacts = buildCanonicalSellerOnboardingPayload(cleared, { sellerCanonicalFacts: saved.listing.seller_canonical_facts_json }).canonicalSellerFacts
      await guardedProfile(db, saved, cleared)
      const reopened = await savedState(db)
      assert.deepEqual(reopened.listing.seller_canonical_facts_json.property.specialistFacts, buildSpecialistSalesFacts(), `${category} clears instead of restoring old facts`)
    }
  } finally { await db.close() }
})

// The new migration delegates all token/password/session decisions to the
// existing protected readers. This fixture supplies their access contract only.
test('protected seller readers share live document progress without exposing recipients or changing access', async () => {
  const db = await guardedFixture()
  try {
    await actor(db, 'postgres')
    await db.exec(`create table private_listing_seller_portal_signing_documents(id uuid primary key,private_listing_id uuid,document_key text,version_id uuid,status text,created_at timestamptz default now(),sent_at timestamptz,signed_at timestamptz,reviewed_at timestamptz,revoked_at timestamptz,revoke_reason text,reviewed_html text);
      create table private_listing_seller_portal_signing_recipients(id uuid,signing_document_id uuid,status text,email text,token_hash text);
      revoke all on private_listing_seller_portal_signing_documents,private_listing_seller_portal_signing_recipients from public,anon,authenticated;
      insert into private_listing_seller_portal_signing_documents(id,private_listing_id,document_key,version_id,status,reviewed_html) values
      ('${uuid(901)}','${listingA}','signed_fica_declaration','${uuid(911)}','partially_signed','private HTML'),
      ('${uuid(902)}','${listingB}','signed_mandate','${uuid(912)}','sent','other listing HTML'),
      ('${uuid(903)}','${listingA}','internal_document','${uuid(913)}','sent','internal HTML');
      insert into private_listing_seller_portal_signing_recipients values ('${uuid(921)}','${uuid(901)}','signed','private@example.test','secret-hash'),('${uuid(922)}','${uuid(901)}','pending','another@example.test','another-secret');
      update private_listing_seller_onboarding set form_data='{"sellerOnboardingCompletion":{"informationOnly":true},"sellerOnboardingManualSigningPack":{"documents":[{"key":"signed_fica_declaration","versionId":"${uuid(911)}","signingRoute":"digital_pack","generatedHtml":"private reviewed copy"}]}}' where id='${uuid(31)}';`)
    for (const name of ['bridge_private_listing_seller_portal_payload','bridge_private_listing_seller_portal_core_payload']) await db.exec(`create function public.${name}(p_token text,p_access_token text default null,p_require_access boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$begin
      if p_token='invalid' then return null; end if;
      if p_require_access and (p_token <> 'token-a' or p_access_token is distinct from 'session-a') then return '{"authRequired":true,"sessionExpired":true}'::jsonb; end if;
      return jsonb_build_object('listing',jsonb_build_object('id','${listingA}'),'onboarding',jsonb_build_object('id','${uuid(31)}','private_listing_id','${listingA}'),'requirements','[]'::jsonb,'documents','[]'::jsonb);
      end$$;`)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261011111846_seller_portal_document_progress.sql', import.meta.url), 'utf8'))
    await actor(db, 'anon')
    for (const name of ['bridge_private_listing_seller_portal_payload','bridge_private_listing_seller_portal_core_payload']) {
      const read = async (token, access, required) => (await db.query(`select public.${name}($1,$2,$3) as result`, [token,access,required])).rows[0].result
      assert.equal(await read('invalid','session-a',true), null)
      assert.deepEqual(await read('token-a','expired-session',true), { authRequired: true, sessionExpired: true })
      assert.equal((await read('token-a',null,false)).sellerPortalSigningRequests, undefined, 'Public intake does not acquire private signing progress')
      const payload = await read('token-a','session-a',true)
      assert.equal(payload.sellerPortalSigningRequests.length, 1)
      const current = payload.sellerPortalSigningRequests[0]
      assert.equal(current.status, 'partially_signed'); assert.equal(current.signer_count, 2); assert.equal(current.signed_count, 1)
      assert.equal(current.version_id, uuid(911))
      assert.equal(payload.sellerDocumentWorkspace.informationOnly, true)
      assert.equal(payload.sellerDocumentWorkspace.documents[0].versionId, uuid(911))
      assert.doesNotMatch(JSON.stringify(payload), /secret-hash|@example|HTML|reviewed copy|internal_document/)
    }
    await assert.rejects(db.query('select * from private_listing_seller_portal_signing_recipients'), error => error.code === '42501')
    await assert.rejects(db.query(`select seller_document_progress_private.with_document_progress('{}'::jsonb,true)`), error => error.code === '42501')
    await actor(db,'postgres')
    await db.exec(`update private_listing_seller_portal_signing_documents set status='reviewed' where id='${uuid(901)}'`)
    await actor(db,'anon')
    const { rows: [latest] } = await db.query("select public.bridge_private_listing_seller_portal_core_payload('token-a','session-a',true) as result")
    assert.equal(latest.result.sellerPortalSigningRequests[0].status, 'reviewed', 'Refresh reads current review evidence')
    await actor(db,'postgres')
    await db.exec(`update private_listing_seller_onboarding set form_data='{"sellerOnboardingCompletion":{"informationOnly":"legacy-invalid"},"sellerOnboardingManualSigningPack":{"documents":null}}' where id='${uuid(31)}'`)
    await actor(db,'anon')
    const legacy = (await db.query("select public.bridge_private_listing_seller_portal_core_payload('token-a','session-a',true) as result")).rows[0].result
    assert.equal(legacy.sellerDocumentWorkspace.informationOnly, false)
    assert.deepEqual(legacy.sellerDocumentWorkspace.documents, [])
    assert.equal(legacy.sellerPortalSigningRequests[0].status, 'reviewed', 'Malformed legacy workflow metadata does not break protected reads')
  } finally { await db.close() }
})
