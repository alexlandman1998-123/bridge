import { beforeAll, afterAll, expect, it } from 'vitest'
import { rentalLandlordProfileDatabase, seedRentalLandlordProfile, org, actor } from './fixtures/rentalLandlordProfileDatabase.js'
import { landlordProfileErrors, LANDLORD_LEGAL_STRUCTURES } from '../../src/services/rentals/rentalLandlordProfileRules.js'
import { rentalLandlordRequirementDefinitions } from '../../src/services/rentals/rentalOnboardingRequirementModel.js'
let db
beforeAll(async () => { db = await rentalLandlordProfileDatabase({ sharedRules: true }) }, 30000)
afterAll(async () => { await db?.close() })
const profile = { type: 'individual', name: 'Owner', email: 'owner@example.test', idNumber: 'PASSPORT', residentialAddress: 'Road' }
const person = { id: 'first', name: 'Person', role: 'Owner', idNumber: 'PERSON-ID', residentialAddress: 'Road', ownershipShare: '50', signingAuthority: true }
const entity = { ...profile, type: 'company', registrationNumber: 'REG', authorisedSignatoryName: 'Signer', authorisedSignatoryCapacity: 'Director', authorisedSignatoryIdNumber: 'ID', authorisedSignatoryEmail: 'signer@example.test', authorityBasis: 'RES', people: [person] }
const scenarios = [profile, entity, {}, { ...entity, registrationNumber: '', people: [{ id: 'draft', email: 'person@example.test' }] }, { ...profile, maritalStatus: 'married', maritalRegime: 'unknown', hasRepresentative: 'yes', authorisedSignatoryEmail: 'invalid', resolutionDate: '2026-02-31' }, { ...profile, hasRepresentative: 'no', authorisedSignatoryEmail: 'hidden invalid', resolutionDate: 'not-date', vatRegistered: 'no', vatNumber: 'old' }, { ...profile, maritalStatus: 'Married in community' }, { ...entity, people: [{ ...person, ownershipShare: 'abc', signingAuthority: 'yes', email: 'invalid' }] }, { ...profile, people: 'invalid' }]
for (const [type] of LANDLORD_LEGAL_STRUCTURES) for (const classification of [type, 'foreign_owner', 'other_entity']) scenarios.push({ ...(type === 'individual' ? profile : entity), type: classification, legalStructure: type, otherEntityDescription: 'Reviewed ownership structure', country: 'Canada', ...(type === 'multiple_owners' ? { hasRepresentative: 'no', people: [person, { ...person, id: 'second', signingAuthority: false }] } : {}) })
for (const classification of ['foreign_owner', 'other_entity']) scenarios.push({ ...profile, type: classification, legalStructure: 'unresolved' })
it.each(scenarios.map((p, index) => [index, p]))('keeps browser and SQL draft/submission validation identical for scenario %s', async (_, p) => {
 for (const phase of ['draft', 'submission']) {
  const actual = (await db.query('select rental_private.landlord_profile_errors($1,$2) errors', [JSON.stringify(p), phase])).rows[0].errors
  expect(actual).toEqual(landlordProfileErrors(p, { phase }))
 }
})
const normalized = rows => rows.map(row => ({ subject: row.subjectId ?? row.subject_id, scope: row.scopeKey ?? row.scope_key, purpose: row.purpose, required: row.required, fingerprint: row.fingerprint })).sort((a,b) => JSON.stringify([a.scope,a.subject,a.purpose]).localeCompare(JSON.stringify([b.scope,b.subject,b.purpose])))
it.each(scenarios.filter(p => Array.isArray(p.people) || p.people == null).map((p,index) => [index,p]))('keeps persisted evidence and browser matrix identical for scenario %s', async (_, p) => {
 const data = { profile: p, portfolio: [{ id: 'p', address: 'Road', serviceType: 'managed_rental', payoutBeneficiaryType: 'third_party', occupancyStatus: 'tenanted', schemeType: 'hoa' }] }
 const actual = (await db.query('select * from rental_private.landlord_definitions($1)', [JSON.stringify(data)])).rows
 expect(normalized(actual)).toEqual(normalized(rentalLandlordRequirementDefinitions(data)))
})
async function command(seed, action, payload, source = 'agent', version = seed.snapshot.version) {
 return (await db.query('select rental_landlord_onboarding_command($1,$2,$3,$4,$5,$6,$7) result',[seed.id,version,action,JSON.stringify(payload),JSON.stringify({ organisation_id:org }),source, source === 'agent' ? actor : null])).rows[0].result
}
it('persists incomplete drafts, rejects incomplete submission atomically and submits resolved foreign owners', async () => {
 const seed = await seedRentalLandlordProfile(db)
 let saved = await command(seed,'save',{profile:{...seed.profile,type:'foreign_owner',legalStructure:'unresolved'},expectedDiscovery:seed.snapshot.discovery})
 await expect(command(seed,'submit',{declarationAccepted:true},'landlord',saved.version)).rejects.toThrow('underlying legal structure')
 const unchanged = (await db.query('select status,version from rental_landlord_onboarding where lead_id=$1',[seed.id])).rows[0]
 expect(unchanged).toEqual({status:'draft',version:saved.version})
 saved = await command(seed,'save',{profile:{...entity,name:seed.profile.name,email:seed.profile.email,type:'foreign_owner',legalStructure:'company',country:'Canada'}},'agent',saved.version)
 const submitted = await command(seed,'submit',{declarationAccepted:true},'landlord',saved.version)
 expect(submitted.status).toBe('submitted')
 await expect(command(seed,'save',{profile:{...entity,name:'Later'}},'agent',submitted.version)).rejects.toThrow('locked')
})
it('denies public access to internal validation and previous command functions', async () => {
 const rows=(await db.query("select has_function_privilege('authenticated','rental_private.landlord_profile_errors(jsonb,text)','execute') allowed,has_function_privilege('service_role','public.rental_landlord_onboarding_command_before_shared_rules(uuid,integer,text,jsonb,jsonb,text,uuid)','execute') bypass")).rows[0]
 expect(rows).toEqual({allowed:false,bypass:false})
})
it('cascades the same Client across foreign-company and company journeys without changing their legal classification', async () => {
 const seed=await seedRentalLandlordProfile(db)
 const {randomUUID}=await import('node:crypto');const id=randomUUID()
 const foreign={...seed.profile,type:'foreign_owner',legalStructure:'company',country:'Canada',notes:'Foreign private details'}
 await db.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,raw_enquiry_payload) values($1,$2,$3,$4,$5)',[id,org,seed.contact,actor,JSON.stringify({role:'landlord',classification:'rental',landlordProfile:foreign,landlordPortfolio:[]})])
 await db.query('insert into rental_landlord_onboarding(lead_id,organisation_id) values($1,$2)',[id,org])
 await command(seed,'save',{profile:{...seed.profile,name:'Aligned Company'}})
 const actual=(await db.query('select raw_enquiry_payload from leads where lead_id=$1',[id])).rows[0].raw_enquiry_payload.landlordProfile
 expect(actual).toMatchObject({name:'Aligned Company',type:'foreign_owner',legalStructure:'company',country:'Canada',notes:'Foreign private details'})
})
it('supersedes accepted ownership evidence after a control change, keeping the saved file history', async () => {
 const {randomUUID}=await import('node:crypto');const seed=await seedRentalLandlordProfile(db)
 let result=await command(seed,'save',{profile:{...entity,name:seed.profile.name,email:seed.profile.email}})
 const before=(await db.query("select r.* from rental_onboarding_requirements r join rental_onboarding_checklists c on c.id=r.checklist_id where c.landlord_lead_id=$1 and r.purpose='beneficial_ownership' and r.active",[seed.id])).rows[0]
 const documentId=randomUUID()
 await db.query("insert into rental_landlord_onboarding_documents(id,lead_id,organisation_id,requirement_id,generation,discovery_revision,storage_path,file_name,mime_type,file_size_bytes,source,status,reviewed_by,reviewed_at,review_note) values($1,$2,$3,$4,$5,$6,$7,'control.pdf','application/pdf',20,'agent','accepted',$8,now(),'Reviewed control')",[documentId,seed.id,org,before.id,before.generation,before.discovery_revision,`${org}/${seed.id}/control.pdf`,actor])
 await db.query('update rental_onboarding_requirements set current_landlord_document_id=$2 where id=$1',[before.id,documentId])
 result=await command(seed,'save',{profile:{...entity,name:seed.profile.name,email:seed.profile.email,people:[{...person,signingAuthority:false}]}},'agent',result.version)
 const after=(await db.query('select * from rental_onboarding_requirements where id=$1',[before.id])).rows[0]
 expect(after.generation).toBe(before.generation+1)
 expect(after.current_landlord_document_id).toBeNull()
 expect((await db.query('select status,generation from rental_landlord_onboarding_documents where id=$1',[documentId])).rows[0]).toEqual({status:'accepted',generation:before.generation})
 expect(result.status).toBe('draft')
})
it('leaves existing accepted entity evidence intact during migration and requests fresh review on the next save', async () => {
 const {readFileSync}=await import('node:fs');const {randomUUID}=await import('node:crypto')
 const legacy=await rentalLandlordProfileDatabase()
 try {
  const migration=name=>readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8')
  await legacy.exec(migration('20261008120849_rental_landlord_conditional_document_requirements.sql'))
  const seed=await seedRentalLandlordProfile(legacy)
  const before=(await legacy.query("select r.* from rental_onboarding_requirements r join rental_onboarding_checklists c on c.id=r.checklist_id where c.landlord_lead_id=$1 and r.purpose='beneficial_ownership' and r.active",[seed.id])).rows[0]
  const doc=randomUUID()
  await legacy.query("insert into rental_landlord_onboarding_documents(id,lead_id,organisation_id,requirement_id,generation,discovery_revision,storage_path,file_name,mime_type,file_size_bytes,source,status,reviewed_by,reviewed_at,review_note) values($1,$2,$3,$4,$5,$6,$7,'previous-control.pdf','application/pdf',20,'agent','accepted',$8,now(),'Previous review')",[doc,seed.id,org,before.id,before.generation,before.discovery_revision,`${org}/${seed.id}/previous.pdf`,actor])
  await legacy.query('update rental_onboarding_requirements set current_landlord_document_id=$2 where id=$1',[before.id,doc])
  await legacy.exec(migration('20261015100645_rental_landlord_shared_conditional_rules.sql'))
  expect((await legacy.query('select generation,current_landlord_document_id from rental_onboarding_requirements where id=$1',[before.id])).rows[0]).toEqual({generation:before.generation,current_landlord_document_id:doc})
  await legacy.query("select rental_landlord_onboarding_command($1,$2,'save',$3,$4,'agent',$5)",[seed.id,seed.snapshot.version,JSON.stringify({profile:seed.profile}),JSON.stringify({organisation_id:org}),actor])
  expect((await legacy.query('select generation,current_landlord_document_id from rental_onboarding_requirements where id=$1',[before.id])).rows[0]).toEqual({generation:before.generation+1,current_landlord_document_id:null})
  expect((await legacy.query('select status from rental_landlord_onboarding_documents where id=$1',[doc])).rows[0].status).toBe('accepted')
 } finally { await legacy.close() }
})
