import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { rentalJourneyAcceptanceDatabase, actor, org, property, unit, tenant, tenantUser, landlordUser } from '../tests/fixtures/rentalJourneyAcceptanceDatabase.js'
import { rentalApplicationFieldScenario } from '../tests/fixtures/rentalApplicationFieldScenario.js'
import { handleRentalLandlordOnboarding, handlePublicRentalLandlordOnboarding } from './rentalLandlordOnboardingApi.js'
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
import { handleRentalClientPortalAccount } from './rentalClientPortalAccountApi.js'
import { ensureRentalListingVacancy } from '../../src/services/rentals/rentalListingInventoryRepository.js'
import { prepareRentalTenantApplication, issueRentalTenantApplicationInvite } from '../../src/services/rentals/rentalTenantApplicationService.js'
import { getRentalApplicationReview, recordRentalApplicationReview, decideRentalApplication, convertRentalApplicationToTenancy } from '../../src/services/rentals/rentalApplicationRepository.js'
import { getRentalLeaseSigningWorkspace, saveRentalLeaseDraft, prepareRentalLeaseSigning } from '../../src/services/rentals/rentalLeaseSigningRepository.js'
import { rentalLeaseScheduleSigners } from '../../src/services/rentals/rentalLeaseSchedule.js'
import { uploadRentalLeaseDocument } from '../../src/services/rentals/rentalLeaseDocumentUploadService.js'
import { createRentalPropertyLandlord, createRentalPropertyMandate } from '../../src/services/rentals/rentalLandlordMandateRepository.js'
const mocks = vi.hoisted(() => ({ client: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mocks.client }))
vi.mock('../../src/lib/supabaseClient.js', () => ({ supabase: null, isSupabaseConfigured: true }))
const env = { SUPABASE_URL: 'https://fixture.test', SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_SERVICE_ROLE_KEY: 'fixture-server' }
let fixture
afterEach(async () => { await fixture?.db.close(); fixture = null })
const ok = (result, status = 200) => { expect(result.status, JSON.stringify(result.body)).toBe(status); return result.body }
const rpc = async (client, name, args) => { const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data }

it.each(['individual', 'joint_individuals', 'company', 'close_corporation', 'trust'])('completes the current landlord → listing → %s tenant → uploaded lease → active portals journey', async type => {
  fixture = await rentalJourneyAcceptanceDatabase()
  const { db, agent, admin, advance, scopedWork } = fixture
  mocks.client = admin
  const landlordLead = randomUUID(), tenantLead = randomUUID(), listing = randomUUID(), salesLead = randomUUID()
  await scopedWork(tx => tx.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,lead_category,stage,raw_enquiry_payload) values($1,$2,$3,$4,$5,$6,$7)', [landlordLead, org, actor, actor, 'seller', 'New Lead', JSON.stringify({ classification: 'rental', role: 'landlord', stage: 'new' })]))
  await scopedWork(tx => tx.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,lead_category,stage,raw_enquiry_payload) values($1,$2,$3,$4,$5,$6,$7)', [tenantLead, org, tenant, actor, 'buyer', 'New Lead', JSON.stringify({ classification: 'rental', role: 'tenant', stage: 'new' })]))
  await db.query("insert into leads(lead_id,organisation_id,assigned_agent_id,lead_category,stage,raw_enquiry_payload) values($1,$2,$3,'seller','Mandate Signed','{\"classification\":\"sale\",\"keep\":\"unchanged\"}')", [salesLead, org, actor])
  const salesBefore = (await db.query('select * from leads where lead_id=$1', [salesLead])).rows[0]
  await advance(landlordLead, 'contacted')
  await advance(landlordLead, 'appraisal_scheduled', { evidence: { scheduledFor: '2026-10-20T10:00:00Z' } })
  await advance(landlordLead, 'appraisal_completed', { evidence: { note: 'Property and monthly rent assessed' } })
  await advance(landlordLead, 'mandate_pending')
  const agentLandlord = (method = 'GET', body = {}) => handleRentalLandlordOnboarding({ method, headers: { Authorization: 'Bearer fixture-agent' }, body: { leadId: landlordLead, ...body }, env, clientFactory: (_url, _key, options) => options.global ? agent : admin })
  let landlord = ok(await agentLandlord()).onboarding
  landlord = ok(await agentLandlord('PATCH', { version: landlord.version, patch: { profile: { type: 'individual', name: 'Saved Landlord', email: 'owner@example.test', idNumber: 'Fixture owner ID', residentialAddress: '12 Owner Road' }, portfolio: [{ id: 'home', title: 'Acceptance home', address: '12 Accepted Road, Pretoria', canonicalPropertyId: property, canonicalUnitId: unit, ownershipType: 'sole_owner', serviceType: 'letting_only', occupancyStatus: 'vacant', schemeType: 'none' }] } })).onboarding
  const invitation = ok(await agentLandlord('POST', { action: 'create_access' }), 201)
  const publicLandlord = (method = 'GET', body = {}) => handlePublicRentalLandlordOnboarding({ method, headers: { Authorization: `Bearer ${invitation.token}` }, body, env, clientFactory: () => admin })
  const visible = ok(await publicLandlord()).onboarding
  expect(JSON.stringify(visible)).not.toMatch(/canonicalPropertyId|canonicalUnitId|assigned_agent_id/)
  for (const requirement of landlord.requirements.filter(row => row.required)) {
    const source = Buffer.from('%PDF-1.7\nFixture landlord upload\n%%EOF')
    const prepared = ok(await publicLandlord('POST', { action: 'prepare_upload', version: landlord.version, requirementId: requirement.id, generation: requirement.generation, fileName: `${requirement.purpose}.pdf`, mimeType: 'application/pdf', fileSize: source.length }), 201)
    await fixture.storeSignedUpload(prepared.uploadUrl, source, 'application/pdf')
    landlord = ok(await publicLandlord('POST', { action: 'complete_upload', version: landlord.version, ticket: prepared.ticket })).onboarding
  }
  landlord = ok(await publicLandlord('POST', { action: 'submit', version: landlord.version, declarationAccepted: true })).onboarding
  for (const document of landlord.documents) landlord = ok(await agentLandlord('POST', { action: 'review_document', version: landlord.version, patch: { documentId: document.id, status: 'accepted', note: 'Original uploaded evidence checked', completedSigned: true } })).onboarding
  await createRentalPropertyLandlord({ organisationId: org, propertyId: property, partyId: actor, ownershipShare: 100, primaryContact: true, createdBy: actor }, { client: agent })
  const signedMandate = landlord.documents.find(document => landlord.requirements.find(row => row.id === document.requirement_id)?.purpose === 'signed_mandate')
  const evidence = (await db.query('select storage_path from rental_landlord_onboarding_documents where id=$1', [signedMandate.id])).rows[0].storage_path
  const mandate = await createRentalPropertyMandate({ organisationId: org, propertyId: property, mandateStatus: 'active', authorityStatus: 'confirmed', metadata: { leadId: landlordLead, signedEvidenceReference: `rental-landlord-onboarding/${evidence}`, signedAt: new Date().toISOString() }, createdBy: actor }, { client: agent })
  landlord = ok(await agentLandlord('POST', { action: 'link_property', version: landlord.version, patch: { propertyId: 'home', mandateId: mandate.id } })).onboarding
  await advance(landlordLead, 'mandate_signed', { relationships: { propertyId: property, unitId: unit, mandateId: mandate.id } })
  await advance(landlordLead, 'listing_ready')
  await scopedWork(tx => tx.query('insert into private_listings(id,organisation_id,assigned_agent_id,title,address_line_1,city,asking_price,seller_canonical_facts_json) values($1,$2,$3,$4,$5,$6,11000,$7)', [listing, org, actor, 'Acceptance home', '12 Accepted Road', 'Pretoria', JSON.stringify({ propertyId: property, unitId: unit, rentalInfo: { rentalPriceFrequency: 'monthly', depositAmount: 22000, leasePeriodMonths: 12 } })]))
  const inventory = await ensureRentalListingVacancy(listing, org, { client: agent })
  expect((await ensureRentalListingVacancy(listing, org, { client: agent })).vacancyId).toBe(inventory.vacancyId)
  landlord = ok(await agentLandlord('POST', { action: 'link_property', version: landlord.version, patch: { propertyId: 'home', listingId: listing } })).onboarding
  expect(landlord.status).toBe('submitted')
  await advance(landlordLead, 'listing_created', { relationships: { propertyId: property, unitId: unit, mandateId: mandate.id, listingId: listing, vacancyId: inventory.vacancyId } })
  await db.query("update rental_vacancies set status='preparing' where id=$1", [inventory.vacancyId]); await db.query("update rental_vacancies set status='marketing' where id=$1", [inventory.vacancyId])

  await advance(tenantLead, 'contacted')
  await advance(tenantLead, 'qualified', { qualification: { monthlyBudget: 11000, desiredArea: 'Pretoria', occupationDate: '2026-11-01', employmentStatus: 'Employed', depositAvailable: 'Yes', screeningConsent: 'Yes', propertyNeed: 'Apartment', occupants: 2, pets: 'No pets', additionalNotes: 'Qualification call completed' }, evidence: { qualificationOutcome: 'qualified' } })
  const viewing = randomUUID(), startsAt = '2026-10-21T10:00:00Z'
  await scopedWork(tx => tx.query("insert into private_listing_activity(id,private_listing_id,activity_type,metadata) values($1,$2,'rental_viewing_scheduled',$3)", [viewing, listing, JSON.stringify({ tenantLeadId: tenantLead, startsAt })]))
  await advance(tenantLead, 'viewing_scheduled', { evidence: { viewingId: viewing, scheduledFor: startsAt } })
  await scopedWork(tx => tx.query("insert into private_listing_activity(private_listing_id,activity_type,metadata) values($1,'rental_viewing_outcome',$2)", [listing, JSON.stringify({ viewingId: viewing, tenantLeadId: tenantLead, outcome: 'attended' })]))
  await advance(tenantLead, 'viewing_completed', { evidence: { viewingId: viewing, scheduledFor: startsAt } })
  await advance(tenantLead, 'application_pending')
  let application = await prepareRentalTenantApplication(org, tenantLead, inventory.vacancyId, { client: agent })
  const appId = application.id, answers = rentalApplicationFieldScenario(type)
  const access = await issueRentalTenantApplicationInvite(application, { client: agent })
  const applicant = (method = 'GET', body = {}, token = access.token) => handlePublicRentalApplication({ method, body, token, env, clientFactory: () => admin })
  application = ok(await applicant()).application
  application = ok(await applicant('PATCH', { action: 'confirm_context', version: application.version, propertyAccepted: true, costsAccepted: true, privacyAccepted: true })).application
  application = ok(await applicant('PATCH', { version: application.version, patch: answers })).application
  await expect(advance(tenantLead, 'application_submitted')).rejects.toThrow(/submit/)
  application = ok(await applicant('PUT', { action: 'submit', version: application.version, declarationAccepted: true, consents: ['privacy', 'credit_check', 'identity_verification'] })).application
  await advance(tenantLead, 'application_submitted'); await advance(tenantLead, 'screening_pending')
  for (const requirement of application.requirements.filter(row => row.active && row.mode === 'active' && row.required && row.state !== 'accepted')) {
    const uploaded = await applicant('POST', { version: application.version, subjectId: requirement.subjectId, purpose: requirement.purpose, requirementId: requirement.id, generation: requirement.generation, fileName: 'Original supporting evidence.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('%PDF-1.7\nFixture tenant upload\n%%EOF').toString('base64') })
    if (uploaded.status !== 201) throw new Error(JSON.stringify({ type, purpose: requirement.purpose, subjectId: requirement.subjectId, entity: application.data.entity, error: uploaded.body.error }))
    application = uploaded.body.application
  }
  let review = await getRentalApplicationReview(appId, { client: agent })
  const reviewCommand = async (command, payload) => { await recordRentalApplicationReview({ applicationId: appId, expectedVersion: review.version, command, payload }, { client: agent }); review = await getRentalApplicationReview(appId, { client: agent }) }
  for (const document of review.documents) await reviewCommand('review_document', { documentId: document.id, status: 'accepted', note: 'Uploaded original checked' })
  for (const checkType of ['identity', 'affordability', 'employment', 'reference']) for (const subject of (await db.query('select subject_id from rental_review_subjects($1,$2)', [JSON.stringify(review.data), checkType])).rows) await reviewCommand('screening', { subjectId: subject.subject_id, checkType, status: 'passed', evidenceNote: 'Current submitted evidence checked', expiresAt: '2099-01-01' })
  await advance(tenantLead, 'fica_pending')
  for (const subject of (await db.query("select subject_id from rental_review_subjects($1,'fica')", [JSON.stringify(review.data)])).rows) await reviewCommand('screening', { subjectId: subject.subject_id, checkType: 'fica', status: 'passed', evidenceNote: 'Current FICA checked', expiresAt: '2099-01-01' })
  await advance(tenantLead, 'fica_complete')
  await reviewCommand('landlord_response', { name: 'Saved Landlord', outcome: 'approved', channel: 'written', note: 'Current application accepted' })
  await decideRentalApplication({ applicationId: appId, expectedVersion: review.version, decision: 'approved', reason: 'All saved evidence reviewed' }, { client: agent })
  review = await getRentalApplicationReview(appId, { client: agent })
  await expect(convertRentalApplicationToTenancy({ applicationId: appId, expectedVersion: review.version }, { client: agent })).rejects.toThrow('Placement ready')
  await advance(tenantLead, 'placement_ready')
  const converted = await convertRentalApplicationToTenancy({ applicationId: appId, expectedVersion: review.version }, { client: agent })
  expect((await convertRentalApplicationToTenancy({ applicationId: appId, expectedVersion: review.version }, { client: agent })).tenancy_id).toBe(converted.tenancy_id)
  await saveRentalLeaseDraft({ leaseId: converted.lease_id, expectedVersion: 1, terms: { lease_start_date: '2026-11-01', lease_end_date: '2027-10-31', occupation_date: '2026-11-01', monthly_rent: 11000, deposit_amount: 22000, tenant_notice_address: 'Tenant notice address', landlord_notice_address: 'Landlord notice address', landlord_name: 'Saved Landlord', primary_authority_basis: 'Current signed entity authority reviewed' } }, { client: agent })
  const signing = await getRentalLeaseSigningWorkspace(converted.tenancy_id, { client: agent })
  const file = name => ({ name, type: 'application/pdf', size: 40 })
  await uploadRentalLeaseDocument({ workspace: signing, file: file('Agency agreement.pdf') }, { client: agent })
  await prepareRentalLeaseSigning({ leaseId: converted.lease_id, expectedVersion: signing.version.version_number, signers: rentalLeaseScheduleSigners(signing.projection, signing.version.version_number) }, { client: agent })
  const signers = (await getRentalLeaseSigningWorkspace(converted.tenancy_id, { client: agent })).signers
  for (const signer of signers) await uploadRentalLeaseDocument({ workspace: signing, file: file(`${signer.signer_name} signed copy.pdf`), kind: 'signed_agreement', signerId: signer.id, confirmSigned: true }, { client: agent })
  for (const payment of (await db.query('select * from rental_move_in_readiness_items where tenancy_id=$1', [converted.tenancy_id])).rows) {
    const uploaded = await uploadRentalLeaseDocument({ workspace: signing, file: file(`${payment.obligation_type} proof.pdf`), kind: 'move_in_evidence' }, { client: agent })
    await rpc(agent, 'rental_record_move_in_readiness', { p_readiness_item_id: payment.id, p_status: 'verified', p_received_amount: Number(payment.required_amount), p_evidence_link: `${uploaded.storage_bucket}/${uploaded.storage_path}` })
  }
  const incoming = await rpc(agent, 'rental_start_incoming_inspection', { p_tenancy_id: converted.tenancy_id, p_scheduled_for: '2026-11-01T10:00:00Z' })
  for (const item of (await db.query('select * from rental_incoming_inspection_items where inspection_id=$1', [incoming.inspection_id])).rows) {
    const photo = item.item_key === 'photo_evidence'
    const uploaded = await uploadRentalLeaseDocument({ workspace: signing, file: photo ? { name: 'Handover photo.jpg', type: 'image/jpeg', size: 40 } : file(`${item.item_key}.pdf`), kind: 'move_in_evidence' }, { client: agent })
    const link = `${uploaded.storage_bucket}/${uploaded.storage_path}`
    if (photo) await rpc(agent, 'rental_link_incoming_inspection_media', { p_inspection_id: incoming.inspection_id, p_media_link: link, p_caption: 'Incoming property condition' })
    await rpc(agent, 'rental_record_incoming_inspection_item', { p_item_id: item.id, p_status: 'completed', p_note: 'Uploaded evidence checked', p_evidence_link: link })
  }
  await rpc(agent, 'rental_complete_incoming_inspection', { p_inspection_id: incoming.inspection_id, p_acknowledged_by_name: 'Saved Tenant', p_handover_notes: 'Handover completed with current uploaded evidence' })
  expect((await rpc(agent, 'rental_activate_tenancy', { p_tenancy_id: converted.tenancy_id })).status).toBe('active')

  const memberships = {}
  for (const [audience, email, userId] of [['tenant', 'tenant@example.test', tenantUser], ['landlord', 'owner@example.test', landlordUser]]) {
    const created = await rpc(agent, 'rental_client_portal_create_invitation', { p_audience: audience, p_email: email, p_tenancy_id: audience === 'tenant' ? converted.tenancy_id : null, p_property_id: audience === 'landlord' ? property : null })
    memberships[audience] = (await rpc(fixture.clientForUser(userId), 'rental_client_portal_accept_invitation', { p_token: created.token })).membership_id
    expect((await rpc(fixture.clientForUser(userId), 'rental_client_portal_accept_invitation', { p_token: created.token })).membership_id).toBe(memberships[audience])
  }
  const portal = (audience, options = {}) => handleRentalClientPortalAccount({ env, headers: { Authorization: `Bearer fixture-${audience}` }, query: { audience, membershipId: memberships[audience] }, ...options })
  const tenantView = ok(await portal('tenant')), ownerView = ok(await portal('landlord'))
  expect(tenantView.journey).toMatchObject({ tenancyStatus: 'active', leaseStatus: 'active', handover: { status: 'completed', completedItems: 5 } })
  expect(ownerView.tenancies[0].journey).toEqual(tenantView.journey)
  expect(tenantView.documents).toHaveLength(8 + signers.length)
  expect(JSON.stringify(ownerView)).not.toMatch(/identityNumber|monthlyIncome|screening|storagePath|fileAccess/)
  expect(ok(await portal('tenant', { method: 'POST', body: { action: 'open_document', documentId: tenantView.documents[0].id } })).expiresIn).toBe(300)
  const requestId = randomUUID(), maintenanceBody = { requestId, requestType: 'maintenance', maintenance: { category: 'plumbing', description: 'The kitchen tap leaks after opening it.' } }
  ok(await portal('tenant', { method: 'POST', body: maintenanceBody }), 201); ok(await portal('tenant', { method: 'POST', body: maintenanceBody }))
  expect(ok(await portal('tenant')).maintenanceRequests).toHaveLength(1)
  expect(ok(await portal('landlord')).maintenanceRequests).toHaveLength(1)
  await rpc(agent, 'rental_client_portal_revoke_membership', { p_membership_id: memberships.tenant })
  expect((await portal('tenant')).status).toBe(403)
  expect((await db.query('select * from leads where lead_id=$1', [salesLead])).rows[0]).toEqual(salesBefore)
  expect((await db.query('select raw_enquiry_payload from leads where lead_id=$1', [tenantLead])).rows[0].raw_enquiry_payload).toMatchObject({ role: 'tenant', stage: 'placement_ready', relationships: { tenancyId: converted.tenancy_id, leaseId: converted.lease_id, listingId: listing } })
  expect((await db.query('select status,active_tenancy_id from rental_units where id=$1', [unit])).rows[0]).toEqual({ status: 'occupied', active_tenancy_id: converted.tenancy_id })
}, 30000)
