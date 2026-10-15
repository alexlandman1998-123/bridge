import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { rentalJourneyAcceptanceDatabase, actor, org, property as fixtureProperty, unit as fixtureUnit } from '../tests/fixtures/rentalJourneyAcceptanceDatabase.js'
import { owner } from '../tests/fixtures/rentalLandlordProfileDatabase.js'
import { saveListingLandlord } from '../../src/services/rentals/rentalListingLandlordService.js'
import { landlordAcceptanceScenarios, landlordAcceptanceProfile } from '../tests/fixtures/rentalLandlordProfileScenarios.js'
import { handleRentalLandlordOnboarding, handlePublicRentalLandlordOnboarding } from './rentalLandlordOnboardingApi.js'
import { createRentalPropertyLandlord, createRentalPropertyMandate } from '../../src/services/rentals/rentalLandlordMandateRepository.js'
import { ensureRentalListingVacancy } from '../../src/services/rentals/rentalListingInventoryRepository.js'
import { rentalSavedRequirementProgress } from '../../src/services/rentals/rentalSavedRequirementModel.js'
import { buildRentalListingLandlordMatrix } from '../../src/services/rentals/rentalListingDocumentMatrixModel.js'
import { landlordProfileErrors } from '../../src/services/rentals/rentalLandlordProfileRules.js'
import { updateLandlordPeople } from '../../src/services/rentals/rentalLandlordSignatories.js'
vi.mock('../../src/lib/supabaseClient.js', () => ({ supabase: null, isSupabaseConfigured: true }))
const env = { SUPABASE_URL: 'https://fixture.test', SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_SERVICE_ROLE_KEY: 'fixture-server' }
const ok = (result, status = 200) => { expect(result.status, JSON.stringify(result.body)).toBe(status); return result.body }
let fixture, workspaceSequence = 0
beforeAll(async () => { fixture = await rentalJourneyAcceptanceDatabase() }, 30000)
afterAll(async () => { await fixture?.db.close() })

async function workspace(scenario) {
  const { db, scopedWork, agent, admin } = fixture
  const id = randomUUID(), contact = randomUUID(), property = randomUUID(), unit = randomUUID()
  const full = landlordAcceptanceProfile(scenario, id)
  // Each scenario has its own permanent Client/contact/property and unit. Tests
  // never rely on a standing mandate, reviewed evidence or completed journey.
  full.phone = `082${String(++workspaceSequence).padStart(7, '0')}`
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,last_name,email,phone) values($1,$2,$3,$4,$5,$6,$7)', [contact, org, actor, 'Acceptance', id, full.email, full.phone])
  await scopedWork(tx => tx.query('insert into rental_properties(id,organisation_id,assigned_manager_id,created_by,name,address_line_1,city,address_normalized) values($1,$2,$3,$3,$4,$5,$6,$7)', [property, org, actor, `Home ${id}`, `12 ${id} Road`, 'Pretoria', id]))
  await scopedWork(tx => tx.query("insert into rental_units(id,organisation_id,property_id,unit_label,status) values($1,$2,$3,'MAIN','vacant')", [unit, org, property]))
  const initial = { type: scenario.type, ...(scenario.type !== scenario.structure ? { legalStructure: scenario.structure } : {}), name: full.name, email: full.email, phone: full.phone }
  await scopedWork(tx => tx.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,lead_category,stage,raw_enquiry_payload) values($1,$2,$3,$4,$5,$6,$7)', [id, org, contact, actor, 'seller', 'New Lead', JSON.stringify({ classification: 'rental', role: 'landlord', stage: 'new', landlordProfile: initial })]))
  const agentRequest = (method = 'GET', body = {}) => handleRentalLandlordOnboarding({ method, headers: { Authorization: 'Bearer fixture-agent' }, body: { leadId: id, ...body }, env, clientFactory: (_url, _key, options) => options.global ? agent : admin })
  const invitation = ok(await agentRequest('POST', { action: 'create_access' }), 201)
  const landlordRequest = (method = 'GET', body = {}) => handlePublicRentalLandlordOnboarding({ method, headers: { Authorization: `Bearer ${invitation.token}` }, body, env, clientFactory: () => admin })
  const clientId = (await db.query("select client_id from agency_client_links where source_kind='lead' and source_id=$1", [id])).rows[0].client_id
  const portfolio = [{ id: 'home', title: 'Acceptance home', address: `12 ${id} Road, Pretoria`, canonicalPropertyId: property, canonicalUnitId: unit, ownershipType: scenario.structure === 'multiple_owners' ? 'joint_owners' : 'sole_owner', serviceType: 'letting_only', occupancyStatus: 'vacant', schemeType: 'none' }]
  return { id, contact, property, unit, full, portfolio, clientId, agentRequest, landlordRequest }
}
async function persistedState(item) {
  const { db } = fixture
  return {
    lead: (await db.query('select raw_enquiry_payload from leads where lead_id=$1', [item.id])).rows[0],
    onboarding: (await db.query('select version,status,declaration_json from rental_landlord_onboarding where lead_id=$1', [item.id])).rows[0],
    client: (await db.query('select * from agency_client_profiles where id=$1', [item.clientId])).rows[0],
    contact: (await db.query('select * from contacts where contact_id=$1', [item.contact])).rows[0],
  }
}
async function upload(item, current, requirement) {
  const source = Buffer.from('%PDF-1.7\nIsolated acceptance evidence\n%%EOF')
  const body = { action: 'prepare_upload', version: current.version, requirementId: requirement.id, generation: requirement.generation, fileName: `${requirement.purpose}.pdf`, mimeType: 'application/pdf', fileSize: source.length }
  const prepared = ok(await item.landlordRequest('POST', body), 201)
  await fixture.storeSignedUpload(prepared.uploadUrl, source, 'application/pdf')
  const completion = { action: 'complete_upload', version: current.version, ticket: prepared.ticket }
  const saved = ok(await item.landlordRequest('POST', completion))
  // The same receipt remains idempotent after its version has advanced.
  expect(ok(await item.landlordRequest('POST', completion)).documentId).toBe(saved.documentId)
  return saved.onboarding
}
async function review(item, current, documentId, status = 'accepted', completedSigned = true) {
  return ok(await item.agentRequest('POST', { action: 'review_document', version: current.version, patch: { documentId, status, completedSigned, note: status === 'accepted' ? 'Uploaded original checked' : 'Please supply a legible current original' } })).onboarding
}
async function mandate(item, evidence = 'missing/file.pdf') {
  return createRentalPropertyMandate({ organisationId: org, propertyId: item.property, mandateStatus: 'active', authorityStatus: 'confirmed', metadata: { leadId: item.id, signedEvidenceReference: evidence, signedAt: '2026-10-15T10:00:00Z' }, createdBy: actor }, { client: fixture.agent })
}

it.each(landlordAcceptanceScenarios)('$label: saves, reopens, clears, resolves competing edits, corrects evidence and hands off one exact listing', async scenario => {
  const item = await workspace(scenario)
  const { db } = fixture
  let current = ok(await item.agentRequest()).onboarding
  expect(current.capabilities.profileConsistency).toBe(true)
  const partial = { ...item.full, residentialAddress: '', idNumber: '', registrationNumber: '', people: item.full.people.length ? [{ id: 'unfinished-person', name: '', signingAuthority: false }] : [], primarySignatoryId: '', authorisedSignatoryName: '', authorisedSignatoryIdNumber: '' }
  current = ok(await item.agentRequest('PATCH', { version: current.version, expectedDiscovery: current.data, patch: { profile: partial, portfolio: item.portfolio } })).onboarding
  expect(ok(await item.agentRequest()).onboarding.data.profile).toEqual(partial)
  const partialState = await persistedState(item)
  expect((await item.landlordRequest('POST', { action: 'submit', version: current.version, declarationAccepted: true })).status).toBe(400)
  expect(await persistedState(item)).toEqual(partialState)

  current = ok(await item.agentRequest('PATCH', { version: current.version, expectedDiscovery: current.data, patch: { profile: item.full } })).onboarding
  expect(landlordProfileErrors(current.data.profile, { phase: 'submission' })).toEqual([])
  const beforeInvalid = await persistedState(item)
  expect((await item.agentRequest('PATCH', { version: current.version, expectedDiscovery: current.data, patch: { profile: { email: 'unfinished@' } } })).status).toBe(400)
  expect(await persistedState(item)).toEqual(beforeInvalid)
  const publicView = ok(await item.landlordRequest()).onboarding
  expect(publicView.data.profile.notes).toBeUndefined()
  expect(publicView.data.portfolio[0].canonicalPropertyId).toBeUndefined()
  // Clear actual stored answers through the invited form. Private data remains
  // attached by stable person ID; a blank email is a deliberate clear.
  let cleared = { ...publicView.data.profile, email: '', taxNumber: '', vatRegistered: 'no', vatNumber: '', notes: 'PUBLIC overwrite attempt' }
  cleared = updateLandlordPeople(cleared, cleared.people.map(person => ({ ...person, email: '', internalReference: 'PUBLIC overwrite attempt' })))
  current = ok(await item.landlordRequest('PATCH', { version: current.version, patch: { profile: cleared } })).onboarding
  current = ok(await item.agentRequest()).onboarding
  expect(current.data.profile).toMatchObject({ email: '', taxNumber: '', vatRegistered: 'no', vatNumber: '', notes: 'PRIVATE agent notes' })
  for (const person of current.data.profile.people) expect(person).toMatchObject({ email: '', internalReference: 'PRIVATE person reference' })
  expect((await persistedState(item)).client).toMatchObject({ id: item.clientId, primary_email: null })
  expect((await persistedState(item)).contact.email).toBe('')

  const competing = structuredClone(current)
  current = ok(await item.agentRequest('PATCH', { version: current.version, expectedDiscovery: current.data, patch: { profile: { name: `${item.full.name} corrected` } } })).onboarding
  const committed = await persistedState(item)
  expect((await item.landlordRequest('PATCH', { version: competing.version, patch: { profile: { name: 'Stale overwrite' } } })).status).toBe(409)
  expect((await item.agentRequest('PATCH', { version: current.version, expectedDiscovery: competing.data, patch: { profile: { name: 'Wrong discovery overwrite' } } })).status).toBe(409)
  expect(await persistedState(item)).toEqual(committed)
  // Explicitly choosing the draft uses fresh discovery and preserves remote data.
  current = ok(await item.agentRequest('PATCH', { version: current.version, expectedDiscovery: current.data, patch: { profile: { taxNumber: 'Chosen corrected tax' } } })).onboarding
  expect(current.data.profile.name).toBe(`${item.full.name} corrected`)
  expect(current.data.profile.email).toBe('')

  // The declaration cannot be forged by staff, and it locks both editors.
  expect((await item.agentRequest('POST', { action: 'submit', version: current.version, declarationAccepted: true })).status).toBe(400)
  current = ok(await item.landlordRequest('POST', { action: 'submit', version: current.version, declarationAccepted: true })).onboarding
  const declared = await persistedState(item)
  expect(declared.onboarding.declaration_json.discovery.profile.taxNumber).toBe('Chosen corrected tax')
  for (const request of [item.agentRequest, item.landlordRequest]) expect((await request('PATCH', { version: current.version, patch: { profile: { name: 'Locked edit' } } })).status).toBe(409)
  expect(await persistedState(item)).toEqual(declared)
  expect((await item.landlordRequest('POST', { action: 'request_changes', version: current.version, patch: { message: 'Self-unlock attempt' } })).status).toBe(400)
  expect(await persistedState(item)).toEqual(declared)
  current = ok(await item.agentRequest('POST', { action: 'request_changes', version: current.version, patch: { message: 'Please correct the identity reference and upload legible evidence.' } })).onboarding
  expect(current.status).toBe('draft')
  expect(ok(await item.landlordRequest()).onboarding.requestedChanges).toContain('correct the identity')
  expect((await db.query("select count(*)::int count from rental_landlord_onboarding_events where lead_id=$1 and command='submit' and payload_json->>'accepted'='true'", [item.id])).rows[0].count).toBe(1)

  for (const stage of ['contacted', 'appraisal_scheduled', 'appraisal_completed', 'mandate_pending']) await fixture.advance(item.id, stage, stage === 'appraisal_scheduled' ? { evidence: { scheduledFor: '2026-10-20T10:00:00Z' } } : { evidence: { note: 'Property and rental appraisal completed' } })
  await createRentalPropertyLandlord({ organisationId: org, propertyId: item.property, partyId: item.contact, ownershipShare: 100, primaryContact: true, createdBy: actor }, { client: fixture.agent })
  await expect(mandate(item)).rejects.toThrow(/disclosure/i)
  await expect(fixture.advance(item.id, 'mandate_signed')).rejects.toThrow(/signed mandate/i)
  // Uploads use real signed tickets, byte metadata and SQL assignment checks.
  for (const requirement of current.requirements.filter(row => row.active && row.required)) current = await upload(item, current, requirement)
  expect(current.requirements.filter(row => row.active && row.required).every(row => row.state === 'received')).toBe(true)
  expect(rentalSavedRequirementProgress(current.requirements).approvalComplete).toBe(false)
  const disclosure = current.requirements.find(row => row.purpose === 'property_disclosure')
  expect((await item.landlordRequest('POST', { action: 'review_document', version: current.version, patch: { documentId: disclosure.documentId, status: 'accepted', note: 'Forged review', completedSigned: true } })).status).toBe(400)
  expect((await item.agentRequest('POST', { action: 'review_document', version: current.version, patch: { documentId: disclosure.documentId, status: 'accepted', note: 'Unsigned prescribed disclosure', completedSigned: false } })).status).toBe(400)
  const identity = current.requirements.find(row => row.purpose === 'identity' && row.subjectId === (scenario.structure === 'individual' ? 'primary' : 'person-one'))
  current = await review(item, current, identity.documentId, 'rejected')
  expect(current.requirements.find(row => row.id === identity.id).state).toBe('rejected')
  const rejectedId = identity.documentId
  current = await upload(item, current, current.requirements.find(row => row.id === identity.id))
  expect(current.documents.find(row => row.id === rejectedId).status).toBe('rejected')
  expect((await item.agentRequest('POST', { action: 'review_document', version: current.version, patch: { documentId: rejectedId, status: 'accepted', note: 'Old replacement', completedSigned: true } })).status).toBe(400)
  for (const requirement of current.requirements.filter(row => row.active && row.required)) current = await review(item, current, requirement.documentId)
  expect(current.requirements.filter(row => row.active && row.required).every(row => row.state === 'accepted')).toBe(true)

  // A changed identity retires its accepted generation, retaining file/review history.
  const previousIdentity = current.requirements.find(row => row.id === identity.id)
  const corrected = scenario.structure === 'individual'
    ? { ...current.data.profile, idNumber: 'CORRECTED-PASSPORT' }
    : updateLandlordPeople(current.data.profile, current.data.profile.people.map((person, index) => index ? person : { ...person, idNumber: 'CORRECTED-PASSPORT' }))
  current = ok(await item.agentRequest('PATCH', { version: current.version, expectedDiscovery: current.data, patch: { profile: corrected } })).onboarding
  const retired = current.requirements.find(row => row.id === identity.id)
  expect(retired.generation).toBe(previousIdentity.generation + 1)
  expect(retired.documentId).toBeNull()
  expect(current.documents.find(row => row.id === previousIdentity.documentId).status).toBe('accepted')
  expect((await item.agentRequest('POST', { action: 'review_document', version: current.version, patch: { documentId: previousIdentity.documentId, status: 'accepted', note: 'Stale generation', completedSigned: true } })).status).toBe(400)
  for (const requirement of current.requirements.filter(row => row.active && row.required && row.state !== 'accepted')) {
    current = await upload(item, current, requirement)
    current = await review(item, current, current.requirements.find(row => row.id === requirement.id).documentId)
  }
  current = ok(await item.landlordRequest('POST', { action: 'submit', version: current.version, declarationAccepted: true })).onboarding
  expect(current.requestedChanges).toBe('')
  expect(current.requirements.filter(row => row.active && row.required).every(row => row.state === 'accepted')).toBe(true)
  // The expanded landlord matrix is still a policy preview. Reviewing its
  // originals must not silently promote it into an active compliance approval.
  expect(rentalSavedRequirementProgress(current.requirements).approvalComplete).toBe(false)
  const currentMandate = current.requirements.find(row => row.purpose === 'signed_mandate')
  const storagePath = (await db.query('select storage_path from rental_landlord_onboarding_documents where id=$1', [currentMandate.documentId])).rows[0].storage_path
  const savedMandate = await mandate(item, `rental-landlord-onboarding/${storagePath}`)
  current = ok(await item.agentRequest('POST', { action: 'link_property', version: current.version, patch: { propertyId: 'home', mandateId: savedMandate.id } })).onboarding
  await fixture.advance(item.id, 'mandate_signed', { relationships: { propertyId: item.property, unitId: item.unit, mandateId: savedMandate.id } })
  await fixture.advance(item.id, 'listing_ready')
  const listing = randomUUID(), p = current.data.profile
  await fixture.scopedWork(tx => tx.query('insert into private_listings(id,organisation_id,assigned_agent_id,title,address_line_1,city,asking_price,seller_canonical_facts_json) values($1,$2,$3,$4,$5,$6,11000,$7)', [listing, org, actor, 'Acceptance listing', `12 ${item.id} Road`, 'Pretoria', JSON.stringify({ propertyId: item.property, unitId: item.unit, landlordLeadId: item.id, landlordContactId: item.contact, landlordName: p.name, landlordEmail: p.email, landlordPhone: p.phone, landlordType: p.type, rentalInfo: { rentalPriceFrequency: 'monthly', depositAmount: 22000, leasePeriodMonths: 12 }, rentalCaptureDraft: { version: 1, form: { landlordName: p.name, monthlyRent: '11000', keepPropertyAnswer: 'KEEP' } } })]))
  const wrongListing = randomUUID()
  await fixture.scopedWork(tx => tx.query('insert into private_listings(id,organisation_id,assigned_agent_id,title,address_line_1,city,asking_price,seller_canonical_facts_json) values($1,$2,$3,$4,$5,$6,11000,$7)', [wrongListing, org, actor, 'Different property', `Unrelated ${item.id} Road`, 'Pretoria', JSON.stringify({ propertyId: fixtureProperty, unitId: fixtureUnit, landlordLeadId: item.id })]))
  const beforeWrongHandoff = await persistedState(item)
  const wrongHandoff = await item.agentRequest('POST', { action: 'link_property', version: current.version, patch: { propertyId: 'home', listingId: wrongListing } })
  expect(wrongHandoff.status, wrongHandoff.body.error).toBe(400)
  expect(await persistedState(item)).toEqual(beforeWrongHandoff)
  const inventory = await ensureRentalListingVacancy(listing, org, { client: fixture.agent })
  const link = { action: 'link_property', version: current.version, patch: { propertyId: 'home', listingId: listing } }
  current = ok(await item.agentRequest('POST', link)).onboarding
  expect(ok(await item.agentRequest('POST', link)).onboarding.version).toBe(current.version)
  expect((await ensureRentalListingVacancy(listing, org, { client: fixture.agent })).vacancyId).toBe(inventory.vacancyId)
  await fixture.advance(item.id, 'listing_created', { relationships: { propertyId: item.property, unitId: item.unit, mandateId: savedMandate.id, listingId: listing, vacancyId: inventory.vacancyId } })
  const reopened = ok(await item.agentRequest()).onboarding
  expect(reopened.data.profile).toEqual(current.data.profile)
  expect(reopened.data.portfolio[0]).toMatchObject({ canonicalPropertyId: item.property, canonicalUnitId: item.unit, mandateId: savedMandate.id, listingId: listing })
  const matrix = buildRentalListingLandlordMatrix({ id: listing }, { id: item.id }, reopened)
  expect(matrix.manualReviewReason).toBeFalsy()
  expect(matrix.rows.filter(row => row.active && row.required).every(row => row.state === 'accepted')).toBe(true)
  expect((await persistedState(item)).client).toMatchObject({ id: item.clientId, name: p.name, primary_email: null })
  expect((await db.query('select count(*)::int count from rental_landlord_onboarding_events where lead_id=$1 and command=\'submit\'', [item.id])).rows[0].count).toBe(2)

  // Use the actual listing editor save service against the same real API/SQL.
  // Its dependencies only replace transport/read adapters, not capture logic.
  const getListing = async () => (await db.query('select * from private_listings where id=$1', [listing])).rows[0]
  const requestOnboarding = async (_leadId, method = 'GET', body = {}) => {
    const result = await item.agentRequest(method, body)
    if (result.status !== 200) throw new Error(result.body.error)
    return result.body
  }
  const staleWrite = vi.fn(() => { throw new Error('Unexpected second contact/listing write') })
  const dependencies = {
    getListing, requestOnboarding, updateListing: staleWrite, updateContact: staleWrite,
    readContact: async () => {
      const saved = (await persistedState(item)).contact
      return { name: [saved.first_name, saved.last_name].filter(Boolean).join(' '), email: saved.email, phone: saved.phone }
    },
  }
  const values = { landlordName: p.name, landlordEmail: p.email, landlordPhone: p.phone, landlordType: p.type }
  const linkedLead = { id: item.id, role: 'landlord', relationships: { listingId: listing } }
  const context = { organisationId: org, mode: 'profile', contactId: item.contact, linkedLead, onboarding: reopened }
  await expect(saveListingLandlord(listing, values, context, dependencies)).rejects.toThrow(/locked/)
  current = ok(await item.agentRequest('POST', { action: 'request_changes', version: current.version, patch: { message: 'Correct the profile from the listing editor' } })).onboarding
  const edited = { ...current.data.profile, name: `Listing edit ${item.id}`, taxNumber: '' }
  const savedListing = await saveListingLandlord(listing, { ...values, landlordName: edited.name }, { ...context, onboarding: current, discovery: { profile: edited } }, dependencies)
  expect(staleWrite).not.toHaveBeenCalled()
  expect(savedListing.seller_canonical_facts_json).toMatchObject({ landlordName: edited.name, landlordEmail: '', landlordType: scenario.type, rentalCaptureDraft: { form: { landlordName: edited.name, monthlyRent: '11000', keepPropertyAnswer: 'KEEP' } } })
  expect(ok(await item.landlordRequest()).onboarding.data.profile).toMatchObject({ name: edited.name, type: scenario.type, taxNumber: '' })
  expect((await persistedState(item)).client).toMatchObject({ id: item.clientId, name: edited.name, primary_email: null })

  // An authorised edit in Clients also projects back through this exact lead
  // and listing, retaining its legal structure, signatory and private answers.
  const client = (await persistedState(item)).client
  await db.transaction(async tx => {
    await tx.query("select set_config('test.actor',$1,true)", [owner])
    await tx.exec('set local role authenticated')
    await tx.query('select agency_client_update($1,$2,$3,$4::text[],$5::text[])', [client.id, client.version, `Client edit ${item.id}`, [], [edited.phone]])
  })
  const aligned = ok(await item.agentRequest()).onboarding
  expect(aligned.data.profile).toMatchObject({ ...edited, name: `Client edit ${item.id}`, phone: `27${edited.phone.slice(1)}` })
  expect((await getListing()).seller_canonical_facts_json).toMatchObject({ landlordName: aligned.data.profile.name, landlordEmail: '', landlordPhone: aligned.data.profile.phone, landlordType: scenario.type })
  const beforeStaleClient = await persistedState(item)
  await expect(db.transaction(async tx => {
    await tx.query("select set_config('test.actor',$1,true)", [owner])
    await tx.exec('set local role authenticated')
    await tx.query('select agency_client_update($1,$2,$3,$4::text[],$5::text[])', [client.id, client.version, 'Stale Clients overwrite', [], [edited.phone]])
  })).rejects.toThrow(/changed/)
  expect(await persistedState(item)).toEqual(beforeStaleClient)
}, 30000)

it.each(['foreign_owner', 'other_entity'])('%s: retains an unresolved draft, denies submission and provides no listing-ready evidence matrix', async type => {
  const item = await workspace({ type, structure: 'unresolved' })
  let current = ok(await item.agentRequest()).onboarding
  current = ok(await item.agentRequest('PATCH', { version: current.version, patch: { profile: { type, legalStructure: 'unresolved', name: item.full.name, phone: item.full.phone, notes: 'Needs review' }, portfolio: item.portfolio } })).onboarding
  expect(ok(await item.agentRequest()).onboarding.data.profile.legalStructure).toBe('unresolved')
  const before = await persistedState(item)
  expect((await item.landlordRequest('POST', { action: 'submit', version: current.version, declarationAccepted: true })).status).toBe(400)
  await expect(fixture.advance(item.id, 'mandate_signed')).rejects.toThrow()
  expect(await persistedState(item)).toEqual(before)
  const matrix = buildRentalListingLandlordMatrix({ id: 'uncreated' }, { id: item.id }, current)
  expect(matrix.manualReviewReason).toBeTruthy()
  expect(rentalSavedRequirementProgress(current.requirements).approvalComplete).toBe(false)
})
