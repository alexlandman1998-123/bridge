import { beforeAll, afterAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org, property, unit, vacancy, app } from '../../../../server/tests/fixtures/rentalOnboardingDatabase.js'
let db
let version = 1
const data = { entity: { type: 'joint_individuals' }, identity: { firstName: 'Alex', lastName: 'Tenant' }, people: [{ id: 'guarantor-1', role: 'guarantor', firstName: 'Sam', lastName: 'Support' }], household: { intendedOccupationDate: '2026-11-01', leasePeriodMonths: 12 }, income: { monthlyIncome: 30000 }, contacts: { email: 'a@example.test' }, property: { monthlyRent: 11000 } }
const review = async (command, payload = {}, expected = version) => {
  const result = await db.query('select rental_record_application_review($1,$2,$3,$4::jsonb) result', [app, expected, command, JSON.stringify(payload)])
  version = result.rows[0].result.version
  return result.rows[0].result
}
beforeAll(async () => {
  db = await rentalOnboardingDatabase()
  await db.query('insert into rental_applications(id,organisation_id,vacancy_id,unit_id,application_data) values($1,$2,$3,$4,$5::jsonb)', [app,org,vacancy,unit,JSON.stringify(data)])
  const links = []
  for (const [subject,purpose,type] of [['primary','identity','identity'],['primary','proof_of_income','proof_of_income'],['guarantor-1','identity','identity'],['guarantor-1','signed_consent','other'],['guarantor-1','proof_of_income','proof_of_income']]) {
    const result = await db.query('insert into rental_application_documents(application_id,organisation_id,document_type,file_name) values($1,$2,$3,$4) returning id',[app,org,type,`${purpose}.pdf`]); links.push({ documentId: result.rows[0].id, subjectId: subject, purpose })
  }
  data.documentLinks = links
  await db.query("update rental_applications set application_data=$2::jsonb,status='submitted',submitted_at=now(),submitted_snapshot_json=$2::jsonb,version=2 where id=$1",[app,JSON.stringify(data)])
  version = 2
  await db.exec(`select set_config('test.actor','${actor}',false)`)
}, 20000)
afterAll(async () => { await db?.close() })
it('rejects absent authentication, out-of-scope actors and stale saves without audit rows', async () => {
  await db.exec("select set_config('test.actor','',false)")
  await expect(review('start_review')).rejects.toThrow('Authentication')
  await db.exec("select set_config('test.actor','77777777-7777-4777-8777-777777777777',false)")
  await expect(review('start_review')).rejects.toThrow('scope')
  await db.exec(`select set_config('test.actor','${actor}',false)`)
  await expect(review('start_review',{},1)).rejects.toThrow('changed')
  expect((await db.query('select count(*)::int count from rental_application_events')).rows[0].count).toBe(0)
})
it('locks submitted answers, blocks forged review metadata and incomplete approval atomically', async () => {
  await expect(db.query("update rental_applications set application_data=application_data||'{\"income\":{\"monthlyIncome\":99999}}'::jsonb where id=$1",[app])).rejects.toThrow('answers are locked')
  await expect(db.query("update rental_applications set application_data=application_data||'{\"review\":{\"landlordDecision\":{\"outcome\":\"approved\"}}}'::jsonb where id=$1",[app])).rejects.toThrow('reviewer command')
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('consents')
  expect((await db.query('select count(*)::int count from rental_application_decisions')).rows[0].count).toBe(0)
  await expect(db.query("update rental_applications set submitted_snapshot_json='{\"identity\":{\"firstName\":\"Forged\"}}'::jsonb where id=$1",[app])).rejects.toThrow('snapshot')
  await review('start_review')
})
it('reviews exact evidence and every guarantor check, rejects invalid or expired evidence', async () => {
  await expect(review('screening',{checkType:'identity',subjectId:'outsider',status:'passed',evidenceNote:'Viewed'})).rejects.toThrow('subject')
  await expect(review('screening',{checkType:'identity',subjectId:'primary',status:'passed',evidenceNote:'Viewed',expiresAt:'2000-01-01'})).rejects.toThrow('Expired')
  await expect(review('review_document',{documentId:data.documentLinks[0].documentId,status:'accepted',note:''})).rejects.toThrow('note')
  for (const link of data.documentLinks) await review('review_document',{documentId:link.documentId,status:'accepted',note:'Original evidence reviewed'})
  for (const kind of ['identity','fica','affordability','employment','reference']) for (const subject of ['primary','guarantor-1']) await review('screening',{checkType:kind,subjectId:subject,status:'passed',evidenceNote:'Evidence reviewed',expiresAt:'2099-01-01'})
  await db.query("insert into rental_application_consents(application_id,organisation_id,consent_type,wording_version,evidence_json) select id,organisation_id,kind,'test-current',jsonb_build_object('accepted',true,'submitted_at',submitted_at) from rental_applications cross join unnest(array['privacy','credit_check','identity_verification']) kind where id=$1",[app])
  await db.query("update rental_application_documents set status='uploaded' where id=$1",[data.documentLinks[0].documentId])
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('acceptance')
  await review('review_document',{documentId:data.documentLinks[0].documentId,status:'accepted',note:'Accepted original identity evidence'})
  await db.query("update rental_application_screening_checks set result_json=jsonb_set(result_json,'{subjects,guarantor-1,expiresAt}','\"2000-01-01\"'::jsonb) where application_id=$1 and check_type='identity'",[app])
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('Current screening')
  await review('screening',{checkType:'identity',subjectId:'guarantor-1',status:'passed',evidenceNote:'Renewed identity evidence checked',expiresAt:'2099-01-01'})
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('landlord')
  await review('landlord_response',{name:'Owner',outcome:'approved',channel:'written',note:'Written approval recorded'})
})
it('reopens corrections, keeps audit and invalidates old reviews, then requires a fresh submission', async () => {
  await review('request_changes',{message:'Please correct your occupation date.'})
  const result = (await db.query('select * from rental_applications where id=$1',[app])).rows[0]
  expect(result.status).toBe('draft'); expect(result.application_data.review.requestedChanges).toContain('occupation date')
  expect((await db.query("select count(*)::int count from rental_application_documents where status='accepted'")).rows[0].count).toBe(0)
  expect((await db.query("select count(*)::int count from rental_application_screening_checks where status='passed'")).rows[0].count).toBe(0)
  await expect(review('start_review')).rejects.toThrow('submitted')
  await expect(db.query("select rental_decide_application($1,$2,'declined','Cannot proceed','{}')",[app,version])).rejects.toThrow('submitted')
  await db.exec("select set_config('test.actor','',false)")
  await db.query("update rental_applications set status='submitted',submitted_at=clock_timestamp(),submitted_snapshot_json=application_data,version=version+1 where id=$1",[app]); version++
  await db.exec(`select set_config('test.actor','${actor}',false)`)
  expect((await db.query('select application_data from rental_applications where id=$1',[app])).rows[0].application_data.review).toBeUndefined()
  for (const link of data.documentLinks) await review('review_document',{documentId:link.documentId,status:'accepted',note:'Reviewed corrected submission'})
  for (const kind of ['identity','fica','affordability','employment','reference']) for (const subject of ['primary','guarantor-1']) await review('screening',{checkType:kind,subjectId:subject,status:'passed',evidenceNote:'Checked corrected submission'})
  await review('landlord_response',{name:'Owner',outcome:'approved',channel:'written',note:'Corrected application approved'})
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('Current applicant consent')
  await db.query("insert into rental_application_consents(application_id,organisation_id,consent_type,wording_version,evidence_json) select id,organisation_id,kind,'test-resubmission',jsonb_build_object('accepted',true,'submitted_at',submitted_at) from rental_applications cross join unnest(array['privacy','credit_check','identity_verification']) kind where id=$1",[app])
  const requirement = (await db.query("select id from rental_onboarding_requirement_summaries where application_id=$1 and subject_id='primary' and purpose='identity'",[app])).rows[0]
  const eventsBefore = (await db.query('select count(*)::int n from rental_application_events where application_id=$1',[app])).rows[0].n
  await db.query("update rental_onboarding_requirements set expires_at='2000-01-01' where id=$1",[requirement.id])
  await expect(db.query("select rental_decide_application($1,$2,'approved','Reviewed evidence and owner approval','{}')",[app,version])).rejects.toThrow('Current saved evidence required')
  expect((await db.query('select count(*)::int n from rental_application_events where application_id=$1',[app])).rows[0].n).toBe(eventsBefore)
  await db.query('update rental_onboarding_requirements set expires_at=null where id=$1',[requirement.id])
  await db.query("select rental_decide_application($1,$2,'approved','Reviewed evidence and owner approval','{}')",[app,version]); version++
  await expect(db.query("update rental_applications set status='draft',version=version+1 where id=$1",[app])).rejects.toThrow('locked')
})
it('creates exactly one lease draft with full answers and the correct occupation date on retry', async () => {
  const beforeRequirements=(await db.query('select id,generation,current_document_id from rental_onboarding_requirement_summaries where application_id=$1 order by id',[app])).rows
  const beforeAssignments=(await db.query('select * from rental_onboarding_evidence_assignments order by id')).rows
  const first = (await db.query('select rental_convert_application_to_tenancy($1,$2) result',[app,version])).rows[0].result
  const retry = (await db.query('select rental_convert_application_to_tenancy($1,$2) result',[app,1])).rows[0].result
  expect((await db.query('select id,generation,current_document_id from rental_onboarding_requirement_summaries where application_id=$1 order by id',[app])).rows).toEqual(beforeRequirements)
  expect((await db.query('select * from rental_onboarding_evidence_assignments order by id')).rows).toEqual(beforeAssignments)
  expect(retry.tenancy_id).toBe(first.tenancy_id); expect(retry.idempotent).toBe(true)
  const tenancy = (await db.query('select * from rental_tenancies')).rows[0]
  expect(new Date(tenancy.intended_occupation_date).toISOString().slice(0,10)).toBe('2026-11-01'); expect(tenancy.status).toBe('draft')
  expect(tenancy.source_application_id).toBe(app)
  expect(tenancy.tenant_snapshot_json.documentLinks).toEqual(data.documentLinks)
  expect(tenancy.tenant_snapshot_json.people).toEqual(data.people); expect(tenancy.tenant_snapshot_json.contacts).toEqual(data.contacts)
  expect(tenancy.tenant_snapshot_json.review).toBeUndefined()
  expect((await db.query('select count(*)::int count from rental_leases')).rows[0].count).toBe(1)
  expect((await db.query('select status from rental_leases')).rows[0].status).toBe('draft')
  expect((await db.query("select count(*)::int count from rental_application_events where event_type='tenancy_prepared'")).rows[0].count).toBe(1)
})
it('restricts direct screening writes and document acceptance to the reviewer command', async () => {
  const permissions = (await db.query("select has_table_privilege('authenticated','rental_application_screening_checks','INSERT') screening,has_table_privilege('authenticated','rental_application_documents','UPDATE') documents,has_table_privilege('authenticated','rental_application_consents','INSERT') consent,has_function_privilege('anon','rental_record_application_review(uuid,integer,text,jsonb)','EXECUTE') anonymous")).rows[0]
  expect(permissions).toEqual({screening:false,documents:false,consent:false,anonymous:false})
})
it('keeps SQL and application document slots and screening subjects aligned across funded scenarios', async () => {
  const { rentalApplicationDocumentSlots } = await import('../rentalApplicationWizardModel.js')
  const { rentalReviewSubjects } = await import('../rentalApplicationReviewModel.js')
  for (const scenario of [
    { entity: { type: 'individual' }, income: { monthlyIncome: 25000 } },
    { entity: { type: 'joint_individuals' }, income: { monthlyIncome: 0 }, people: [{ id: 'g', role: 'guarantor', monthlyIncome: 40000 }] },
    ...['company', 'close_corporation', 'trust'].map((type) => ({ entity: { type }, income: { monthlyIncome: 50000 }, people: [{ id: 's', role: 'authorised_signatory' }] })),
  ]) {
    const sqlSlots = (await db.query('select * from rental_review_document_slots($1::jsonb)', [JSON.stringify(scenario)])).rows.map((row) => `${row.subject_id}:${row.purpose}`).sort()
    expect(sqlSlots).toEqual(rentalApplicationDocumentSlots(scenario).filter((slot) => slot.required).map((slot) => slot.key).sort())
    for (const kind of ['identity', 'fica', 'affordability', 'employment', 'reference']) {
      const sqlSubjects = (await db.query('select * from rental_review_subjects($1::jsonb,$2)', [JSON.stringify(scenario), kind])).rows.map((row) => row.subject_id).sort()
      expect(sqlSubjects).toEqual(rentalReviewSubjects(scenario, kind).map((person) => person.id).sort())
    }
  }
})
it('invalidates raw database identity edits, keeps history, and permits a fresh explicit assignment', async () => {
  const { mergeRentalApplicationData } = await import('../rentalApplicationFieldContract.js')
  const previous = { identity: { identityNumber: 'A' }, entity: { type: 'company', primaryContactRole: 'authorised_signatory' }, people: [{ id: 's', role: 'authorised_signatory', identityNumber: 'signer-A' }], documentLinks: [{ documentId: 'old', subjectId: 'primary', purpose: 'identity' }, { documentId: 'authority', subjectId: 'entity', purpose: 'authority' }] }
  for (const patch of [{ identity: { identityNumber: 'B' } }, { people: [{ ...previous.people[0], identityNumber: 'signer-B' }] }, { people: [] }, { entity: { primaryContactRole: 'trustee' } }]) {
    const next = { ...previous, ...patch }
    if (patch.entity) next.entity = { ...previous.entity, ...patch.entity }
    const actual = (await db.query('select rental_invalidate_document_assignments($1::jsonb,$2::jsonb) result', [JSON.stringify(previous), JSON.stringify(next)])).rows[0].result
    const expected = mergeRentalApplicationData(previous, patch)
    expect(actual.documentLinks).toEqual(expected.documentLinks)
    expect(actual.documentInvalidations.map((item) => item.subjectId).sort()).toEqual(expected.documentInvalidations.map((item) => item.subjectId).sort())
    const stripped = { ...actual, documentLinks: [], documentInvalidations: [] }
    const retained = (await db.query('select rental_invalidate_document_assignments($1::jsonb,$2::jsonb) result', [JSON.stringify(actual), JSON.stringify(stripped)])).rows[0].result
    expect(retained.documentLinks.sort((a, b) => a.documentId.localeCompare(b.documentId))).toEqual(actual.documentLinks.filter((link) => link.invalidated).sort((a, b) => a.documentId.localeCompare(b.documentId)))
  }
})
it('keeps rejected and superseded evidence separate from submission while blocking incomplete named people', async () => {
  const applicationId = '88888888-8888-4888-8888-888888888888'
  const initial = { schemaVersion: 'arch9_rental_application_fields_v2', identity: { identityNumber: 'A' }, entity: { type: 'individual' }, income: { monthlyIncome: 25000 } }
  await db.exec("select set_config('test.actor','',false)")
  await db.query('insert into rental_applications(id,organisation_id,vacancy_id,unit_id,application_data) values($1,$2,$3,$4,$5::jsonb)', [applicationId,org,vacancy,unit,JSON.stringify(initial)])
  const oldDocument = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,uploaded_at) values($1,$2,'identity','2026-01-01') returning id", [applicationId,org])).rows[0].id
  const newDocument = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,uploaded_at) values($1,$2,'identity','2026-02-01') returning id", [applicationId,org])).rows[0].id
  await db.query("update rental_application_documents set status='accepted' where id=$1",[oldDocument])
  await db.query("update rental_application_documents set status='rejected' where id=$1",[newDocument])
  expect((await db.query("select rental_current_document_status($1,$2::jsonb,'primary','identity') status",[applicationId,JSON.stringify(initial)])).rows[0].status).toBe('rejected')
  await db.transaction(async (tx) => {
    await tx.query("update rental_applications set status='submitted',submitted_at=now() where id=$1",[applicationId])
    expect((await tx.query("select state from rental_onboarding_requirement_summaries where application_id=$1 and subject_id='primary' and purpose='identity'", [applicationId])).rows[0].state).toBe('rejected')
    // Roll the local probe back so the following identity-edit checks stay draft-scoped.
    throw new Error('Probe complete')
  }).catch((cause) => { if (cause.message !== 'Probe complete') throw cause })
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{identity,identityNumber}','\"B\"') where id=$1",[applicationId])
  const changed = (await db.query('select application_data from rental_applications where id=$1',[applicationId])).rows[0].application_data
  expect(changed.documentInvalidations).toEqual([{ subjectId: 'primary' }])
  expect((await db.query("select rental_current_document_status($1,$2::jsonb,'primary','identity') status",[applicationId,JSON.stringify(changed)])).rows[0].status).toBeNull()
  const linked = { ...changed, documentLinks: [{ documentId: newDocument, subjectId: 'primary', purpose: 'identity' }] }
  expect((await db.query("select rental_current_document_status($1,$2::jsonb,'primary','identity') status",[applicationId,JSON.stringify(linked)])).rows[0].status).toBe('rejected')
  await db.query("update rental_applications set application_data=application_data||'{\"people\":[{\"id\":\"g\",\"role\":\"guarantor\"}]}'::jsonb where id=$1",[applicationId])
  await expect(db.query("update rental_applications set status='submitted',submitted_at=now() where id=$1",[applicationId])).rejects.toThrow('Additional person identity and contact')
})
it('matches saved SQL tenant and landlord definitions to the shared preview contract', async () => {
  const { rentalTenantRequirementDefinitions, rentalLandlordRequirementDefinitions } = await import('../rentalOnboardingRequirementModel.js')
  const compare = (rows) => rows.map((row) => JSON.stringify([row.subjectId || row.subject_id, row.scopeKey || row.scope_key, row.purpose, row.required, row.fingerprint])).sort()
  // Compare jsonb fingerprints structurally, independent of object key ordering.
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
  const normalize = (rows) => compare(rows.map((row) => ({ ...row, fingerprint: canonical(row.fingerprint) })))
  for (const type of ['individual','joint_individuals','company','close_corporation','trust']) {
    const scenario = { entity: { type }, identity: { firstName: 'Alex', identityNumber: 'A' }, income: { monthlyIncome: 30000 }, people: [{ id: 's', role: 'authorised_signatory', firstName: 'Sam', authorityBasis: 'Resolution' }] }
    const sql = (await db.query('select * from rental_private.tenant_definitions($1::jsonb)', [JSON.stringify(scenario)])).rows
    expect(normalize(sql)).toEqual(normalize(rentalTenantRequirementDefinitions(scenario)))
  }
  for (const type of ['individual','multiple_owners','company','close_corporation','trust','foreign_owner','other_entity']) {
    const scenario = { profile: { type, name: 'Owner', authorisedSignatoryName:'Director', authorisedSignatoryIdNumber:'C', authorisedSignatoryNationality:'South African', authorisedSignatoryCapacity:'Director', people: [{ id: 'co', name: 'Co-owner', role: 'owner', idNumber: 'B' }] }, portfolio: [{ id: 'p1', canonicalPropertyId: property, address:'One Road', unitNumber:'4', complexName:'Place', mandateId:'bookkeeping', mandateSignedAt:'2026-10-03' }, { id: 'p2' }] }
    const sql = (await db.query('select * from rental_private.landlord_definitions($1::jsonb)', [JSON.stringify(scenario)])).rows
    expect(normalize(sql)).toEqual(normalize(rentalLandlordRequirementDefinitions(scenario)))
  }
})
it('keeps requirement IDs and one revision on repeat saves, and does not count a rejected replacement', async () => {
  const id = '99999999-9999-4999-8999-999999999999'
  const discovery = { entity: { type: 'individual' }, identity: { identityNumber: 'A' }, income: { monthlyIncome: 25000 } }
  await db.exec("select set_config('test.actor','',false)")
  await db.query('insert into rental_applications(id,organisation_id,vacancy_id,unit_id,application_data) values($1,$2,$3,$4,$5::jsonb)', [id,org,vacancy,unit,JSON.stringify(discovery)])
  const before = (await db.query('select * from rental_onboarding_requirement_summaries where application_id=$1 order by id',[id])).rows
  await db.query('update rental_applications set application_data=application_data,version=version+1 where id=$1',[id])
  const after = (await db.query('select * from rental_onboarding_requirement_summaries where application_id=$1 order by id',[id])).rows
  expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id))
  expect(after.every((row) => row.discovery_revision===1)).toBe(true)
  const oldDoc = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,uploaded_at) values($1,$2,'identity','2026-01-01') returning id",[id,org])).rows[0].id
  const replacement = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,uploaded_at) values($1,$2,'identity','2026-02-01') returning id",[id,org])).rows[0].id
  await db.query("update rental_application_documents set status=case when id=$1 then 'accepted' else 'rejected' end where application_id=$2",[oldDoc,id])
  await db.query('update rental_applications set version=version+1 where id=$1',[id])
  const current = (await db.query("select * from rental_onboarding_requirement_summaries where application_id=$1 and purpose='identity'",[id])).rows[0]
  expect(current.state).toBe('rejected'); expect(current.current_document_id).toBe(replacement)
  await db.query('update rental_applications set version=version+1 where id=$1',[id])
  expect((await db.query('select count(*)::int n from rental_onboarding_evidence_assignments where requirement_id=$1',[current.id])).rows[0].n).toBe(1)
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{identity,identityNumber}','\"B\"'),version=version+1 where id=$1",[id])
  const changed = (await db.query("select * from rental_onboarding_requirement_summaries where id=$1",[current.id])).rows[0]
  expect(changed.id).toBe(current.id); expect(changed.generation).toBe(2); expect(changed.discovery_revision).toBe(2); expect(changed.state).toBe('missing')
  expect((await db.query('select count(*)::int n from rental_onboarding_evidence_assignments where requirement_id=$1',[current.id])).rows[0].n).toBe(1)
  const rowsBefore = (await db.query('select count(*)::int n from rental_onboarding_checklist_revisions')).rows[0].n
  await db.query('update rental_applications set application_data=$2::jsonb where id=$1 and version=-1',[id,JSON.stringify(discovery)])
  expect((await db.query('select count(*)::int n from rental_onboarding_checklist_revisions')).rows[0].n).toBe(rowsBefore)
})
it('supersedes branch requirements without deleting their IDs or resurrecting old evidence on return', async () => {
  const id = '99999999-9999-4999-8999-999999999999'
  const old = (await db.query("select * from rental_onboarding_requirement_summaries where application_id=$1 and purpose='proof_of_income' and subject_id='primary'",[id])).rows[0]
  const income = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type) values($1,$2,'proof_of_income') returning id",[id,org])).rows[0].id
  await db.query("update rental_application_documents set status='accepted' where id=$1",[income])
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{documentLinks}',$2::jsonb) where id=$1",[id,JSON.stringify([{ documentId: income, subjectId: 'primary', purpose: 'proof_of_income', source: 'agent' }])])
  expect((await db.query('select current_document_id from rental_onboarding_requirements where id=$1',[old.id])).rows[0].current_document_id).toBe(income)
  await db.query("update rental_applications set application_data=application_data||'{\"income\":{\"monthlyIncome\":0},\"people\":[{\"id\":\"g\",\"role\":\"guarantor\",\"monthlyIncome\":40000}]}'::jsonb where id=$1",[id])
  expect((await db.query('select active from rental_onboarding_requirements where id=$1',[old.id])).rows[0].active).toBe(false)
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{income,monthlyIncome}','25000') where id=$1",[id])
  const returned = (await db.query('select * from rental_onboarding_requirements where id=$1',[old.id])).rows[0]
  expect(returned.active).toBe(true); expect(returned.generation).toBe(old.generation+1)
  expect(returned.current_document_id).toBeNull()
  expect((await db.query('select count(*)::int n from rental_onboarding_evidence_assignments where requirement_id=$1',[old.id])).rows[0].n).toBe(1)
})
it('saves landlord requirements only as previews and never accepts reference text as evidence', async () => {
  const lead = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const metadata = { arch9RentalLead: true, role: 'landlord', landlordProfile: { type: 'individual', name: 'Owner', idNumber: 'A' }, landlordPortfolio: [{ id: 'one', mandateReference: 'SIGNED.pdf' }, { id: 'two', mandateReference: 'Reference only' }], landlordDocuments: [{ name: 'ID', reference: 'ID.pdf' }] }
  await db.query('insert into leads(lead_id,organisation_id,raw_enquiry_payload) values($1,$2,$3::jsonb)',[lead,org,JSON.stringify(metadata)])
  const rows = (await db.query('select * from rental_onboarding_requirement_summaries where landlord_lead_id=$1',[lead])).rows
  expect(rows.filter((row) => row.purpose==='identity')).toHaveLength(1)
  expect(rows.filter((row) => row.purpose==='signed_mandate')).toHaveLength(2)
  expect(rows.every((row) => row.mode==='preview' && row.state==='missing' && row.current_document_id===null)).toBe(true)
  await db.query('update leads set raw_enquiry_payload=raw_enquiry_payload where lead_id=$1',[lead])
  expect((await db.query('select discovery_revision from rental_onboarding_checklists where landlord_lead_id=$1',[lead])).rows[0].discovery_revision).toBe(1)
  await db.query("update leads set raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{landlordProfile,type}','\"other_entity\"') where lead_id=$1",[lead])
  expect((await db.query('select count(*)::int n from rental_onboarding_requirement_summaries where landlord_lead_id=$1 and active',[lead])).rows[0].n).toBe(0)
})
it('restricts checklist history and evidence assignments to visible parent records and denies direct writes', async () => {
  const otherOrg = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const otherLead = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  await db.query('insert into organisations(id) values($1)',[otherOrg])
  await db.query("insert into leads(lead_id,organisation_id,raw_enquiry_payload) values($1,$2,'{\"arch9RentalLead\":true,\"role\":\"landlord\",\"landlordProfile\":{\"type\":\"individual\"}}')",[otherLead,otherOrg])
  await db.exec(`select set_config('test.actor','${actor}',false); set role authenticated;`)
  expect((await db.query('select count(*)::int n from rental_onboarding_requirement_summaries where organisation_id=$1',[otherOrg])).rows[0].n).toBe(0)
  expect((await db.query('select count(*)::int n from rental_onboarding_requirement_summaries where organisation_id=$1',[org])).rows[0].n).toBeGreaterThan(0)
  await expect(db.exec("update rental_onboarding_requirements set active=false")).rejects.toThrow('permission denied')
  await expect(db.exec("select rental_private.sync_checklist(null,null,null,'{}')")).rejects.toThrow('permission denied')
  await db.exec('reset role; set role anon;')
  await expect(db.exec('select * from rental_onboarding_requirement_summaries')).rejects.toThrow('permission denied')
  await db.exec('reset role;')
})

it('links a new upload to the current generation and refuses a document from another application', async () => {
  const id = '99999999-9999-4999-8999-999999999999'
  const income = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type) values($1,$2,'proof_of_income') returning id",[id,org])).rows[0].id
  const foreignDocument = data.documentLinks[0].documentId
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{documentLinks}',$2::jsonb) where id=$1",[id,JSON.stringify([{ documentId: income, subjectId: 'primary', purpose: 'proof_of_income', source: 'applicant' }, { documentId: foreignDocument, subjectId: 'primary', purpose: 'identity' }])])
  const rows = (await db.query("select * from rental_onboarding_requirement_summaries where application_id=$1 and subject_id='primary'",[id])).rows
  const current = rows.find((row) => row.purpose==='proof_of_income')
  expect(current.current_document_id).toBe(income); expect(current.state).toBe('received')
  expect(rows.find((row) => row.purpose==='identity').current_document_id).toBeNull()
  const assignment = (await db.query('select * from rental_onboarding_evidence_assignments where requirement_id=$1 and document_id=$2',[current.id,income])).rows[0]
  expect(assignment.generation).toBe(current.generation); expect(assignment.source).toBe('applicant')
  await expect(db.query('delete from rental_application_documents where id=$1',[income])).rejects.toThrow('foreign key')
  await db.query("update rental_application_documents set status='accepted' where id=$1",[income])
  expect((await db.query('select state from rental_onboarding_requirement_summaries where id=$1',[current.id])).rows[0].state).toBe('accepted')
  await db.query("update rental_onboarding_requirements set expires_at='2000-01-01' where id=$1",[current.id])
  expect((await db.query('select state from rental_onboarding_requirement_summaries where id=$1',[current.id])).rows[0].state).toBe('expired')
  const fresh = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,uploaded_at) values($1,$2,'proof_of_income','2099-01-01') returning id",[id,org])).rows[0].id
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{documentLinks}',$2::jsonb) where id=$1",[id,JSON.stringify([{ documentId: fresh, subjectId: 'primary', purpose: 'proof_of_income', source: 'agent' }])])
  const replaced = (await db.query('select state,expires_at from rental_onboarding_requirement_summaries where id=$1',[current.id])).rows[0]
  expect(replaced.state).toBe('received'); expect(replaced.expires_at).toBeNull()
})
it('resolves access from the current property branch rather than a copied checklist branch', async () => {
  const branch = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  await db.exec(`create or replace function rental_branch_access(target_org uuid,target_branch uuid) returns boolean language sql as $$ select auth.uid()='${actor}'::uuid and $1='${org}'::uuid and $2 is null $$;`)
  await db.query('update rental_properties set branch_id=$1 where id=$2',[branch,property])
  await db.exec(`select set_config('test.actor','${actor}',false); set role authenticated;`)
  expect((await db.query('select count(*)::int n from rental_onboarding_requirement_summaries where application_id=$1',[app])).rows[0].n).toBe(0)
  await db.exec('reset role;')
  await db.query('update rental_properties set branch_id=null where id=$1',[property])
})
it('rolls back the parent save atomically if its checklist scope cannot be preserved', async () => {
  const id = '99999999-9999-4999-8999-999999999999'
  const before = (await db.query('select organisation_id,version,application_data from rental_applications where id=$1',[id])).rows[0]
  const historyCount = (await db.query('select count(*)::int n from rental_onboarding_checklist_revisions')).rows[0].n
  await expect(db.query('update rental_applications set organisation_id=$2,version=version+1 where id=$1',[id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])).rejects.toThrow('organisation cannot change')
  expect((await db.query('select organisation_id,version,application_data from rental_applications where id=$1',[id])).rows[0]).toEqual(before)
  expect((await db.query('select count(*)::int n from rental_onboarding_checklist_revisions')).rows[0].n).toBe(historyCount)
})

it('enables RLS on every ledger table and keeps trigger helpers and the summary access constrained', async () => {
  const tables = (await db.query("select count(*)::int n,bool_and(relrowsecurity) protected from pg_class where relname in ('rental_onboarding_checklists','rental_onboarding_requirements','rental_onboarding_checklist_revisions','rental_onboarding_evidence_assignments')")).rows[0]
  expect(tables).toEqual({ n: 4, protected: true })
  const permissions = (await db.query("select has_schema_privilege('authenticated','rental_private','USAGE') private_schema,has_function_privilege('authenticated','rental_private.pick(jsonb,text[])','EXECUTE') helpers,has_table_privilege('authenticated','rental_onboarding_checklist_revisions','UPDATE') rewrite_history,has_table_privilege('anon','rental_onboarding_requirements','SELECT') anonymous")).rows[0]
  expect(permissions).toEqual({ private_schema: false, helpers: false, rewrite_history: false, anonymous: false })
  expect((await db.query("select reloptions from pg_class where relname='rental_onboarding_requirement_summaries'")).rows[0].reloptions).toContain('security_invoker=true')
})
it('rolls back forged requirement generations together with their proposed assignments', async () => {
  const id = '99999999-9999-4999-8999-999999999999'
  const before = (await db.query('select application_data,version from rental_applications where id=$1',[id])).rows[0]
  const r = (await db.query("select * from rental_onboarding_requirement_summaries where application_id=$1 and subject_id='primary' and purpose='identity'",[id])).rows[0]
  const document = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type) values($1,$2,'identity') returning id",[id,org])).rows[0].id
  const link = { documentId: document, subjectId: 'primary', purpose: 'identity', requirementId: r.id, generation: r.generation + 10, source: 'applicant' }
  await expect(db.query("update rental_applications set application_data=jsonb_set(application_data,'{documentLinks}',coalesce(application_data->'documentLinks','[]') || $2::jsonb),version=version+1 where id=$1",[id,JSON.stringify([link])])).rejects.toThrow('requirement changed')
  expect((await db.query('select application_data,version from rental_applications where id=$1',[id])).rows[0]).toEqual(before)
  expect((await db.query('select count(*)::int n from rental_onboarding_evidence_assignments where document_id=$1',[document])).rows[0].n).toBe(0)
  link.generation = r.generation
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{documentLinks}',coalesce(application_data->'documentLinks','[]') || $2::jsonb),version=version+1 where id=$1",[id,JSON.stringify([link])])
  expect((await db.query('select current_document_id from rental_onboarding_requirement_summaries where id=$1',[r.id])).rows[0].current_document_id).toBe(document)
  const summary = (await db.query('select requirements from rental_application_review_summaries where id=$1',[id])).rows[0].requirements
  expect(summary.find((item) => item.id === r.id).generation).toBe(r.generation)
  expect(summary.find((item) => item.id === r.id).fingerprint_json).toBeUndefined()
})
it('allows details submission with expired evidence while retaining the outstanding requirement', async () => {
  await db.exec("select set_config('test.actor','',false)")
  const id = '99999999-9999-4999-8999-999999999999'
  const r = (await db.query("select * from rental_onboarding_requirement_summaries where application_id=$1 and subject_id='primary' and purpose='identity'",[id])).rows[0]
  await db.query("update rental_onboarding_requirements set expires_at='2000-01-01' where id=$1",[r.id])
  const before = (await db.query('select status,version from rental_applications where id=$1',[id])).rows[0]
  await db.query("update rental_applications set status='submitted',submitted_at=now(),version=version+1 where id=$1",[id])
  expect((await db.query('select status,version from rental_applications where id=$1',[id])).rows[0]).toEqual({ status: 'submitted', version: before.version + 1 })
  expect((await db.query('select state from rental_onboarding_requirement_summaries where id=$1',[r.id])).rows[0].state).toBe('expired')
  await db.query('update rental_onboarding_requirements set expires_at=null where id=$1',[r.id])
})

const landlordLead = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
let landlordVersion = 0
const landlordCommand = async (command, payload = {}, options = {}) => {
  const result = (await db.query('select rental_landlord_onboarding_command($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) result', [landlordLead, options.version ?? landlordVersion, command, JSON.stringify(payload), JSON.stringify(options.scope || {organisation_id:org,branch_id:null}), options.source || 'agent', options.source === 'landlord' ? null : actor])).rows[0].result
  landlordVersion = result.version
  return result
}
const landlordRows = async () => (await db.query('select * from rental_onboarding_requirement_summaries where landlord_lead_id=$1 order by scope_key,purpose',[landlordLead])).rows
const landlordFile = async (row, id) => {
  const payload = { id, requirementId:row.id,generation:row.generation,storagePath:`${org}/${landlordLead}/${id}.pdf`,fileName:'evidence.pdf',mimeType:'application/pdf',fileSize:123 }
  await landlordCommand('complete_upload',payload)
  return payload
}
it('saves landlord discovery with a version and rejects stale edits, direct writes and scope moves atomically', async () => {
  await db.query('insert into leads(lead_id,organisation_id,raw_enquiry_payload) values($1,$2,$3::jsonb)',[landlordLead,org,JSON.stringify({rentalCrm:{arch9RentalLead:true,role:'landlord',landlordProfile:{type:'individual',name:'Owner',email:'owner@example.test',idNumber:'A'},landlordPortfolio:[{id:'home',address:'One Road',canonicalPropertyId:property},{id:'other',address:'Two Road'}]}})])
  await landlordCommand('save')
  expect(landlordVersion).toBe(1)
  expect((await landlordRows()).filter((row) => row.purpose==='property_disclosure')).toHaveLength(2)
  await expect(landlordCommand('save',{profile:{name:'Stale'}},{version:0})).rejects.toThrow('changed')
  await expect(landlordCommand('save',{expectedDiscovery:{profile:{},portfolio:[]}})).rejects.toThrow('discovery changed')
  await expect(landlordCommand('save',{}, {scope:{organisation_id:org,branch_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}})).rejects.toThrow('scope changed')
  await expect(db.query("update leads set raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{rentalCrm,landlordProfile,name}','\"Overwrite\"') where lead_id=$1",[landlordLead])).rejects.toThrow('versioned onboarding')
  expect((await db.query('select count(*)::int n from rental_landlord_onboarding_events where lead_id=$1',[landlordLead])).rows[0].n).toBe(1)
})
it('keeps landlord evidence per property and makes committed completion receipts idempotent', async () => {
  const row=(await landlordRows()).find((r) => r.scope_key==='property:home' && r.purpose==='property_disclosure')
  const payload=await landlordFile(row,'abababab-abab-4bab-8bab-abababababab')
  const version=landlordVersion
  await landlordCommand('complete_upload',payload,{version:0})
  expect(landlordVersion).toBe(version)
  const rows=await landlordRows()
  expect(rows.find((r) => r.id===row.id).state).toBe('received')
  expect(rows.find((r) => r.scope_key==='property:other' && r.purpose==='property_disclosure').state).toBe('missing')
  await expect(landlordCommand('complete_upload',{...payload,id:'acacacac-acac-4cac-8cac-acacacacacac',generation:row.generation+1})).rejects.toThrow('requirement changed')
  expect((await db.query('select count(*)::int n from rental_landlord_onboarding_documents where lead_id=$1',[landlordLead])).rows[0].n).toBe(1)
})
it('requires agent acceptance of the current signed disclosure before activating a mandate', async () => {
  const create=() => db.query("insert into rental_property_mandates(organisation_id,property_id,mandate_status,metadata_json) values($1,$2,'active',$3::jsonb)",[org,property,JSON.stringify({leadId:landlordLead})])
  await expect(create()).rejects.toThrow('prescribed disclosure')
  await expect(landlordCommand('review_document',{documentId:'abababab-abab-4bab-8bab-abababababab',status:'accepted',note:'Reviewed',completedSigned:true},{source:'landlord'})).rejects.toThrow('Agent review')
  await expect(landlordCommand('review_document',{documentId:'abababab-abab-4bab-8bab-abababababab',status:'accepted',note:'Reviewed'})).rejects.toThrow('completed and signed')
  await landlordCommand('review_document',{documentId:'abababab-abab-4bab-8bab-abababababab',status:'accepted',note:'Prescribed form checked',completedSigned:true})
  await create()
  await expect(db.query("insert into rental_property_mandates(organisation_id,property_id,mandate_status) values($1,$2,'active')",[org,property])).rejects.toThrow('prescribed disclosure')
  const row=(await landlordRows()).find((r) => r.scope_key==='property:home' && r.purpose==='property_disclosure')
  await db.query("update rental_onboarding_requirements set expires_at='2000-01-01' where id=$1",[row.id])
  await expect(create()).rejects.toThrow('prescribed disclosure')
  await db.query('update rental_onboarding_requirements set expires_at=null where id=$1',[row.id])
  await landlordFile(row,'adadadad-adad-4dad-8dad-adadadadadad')
  await landlordCommand('review_document',{documentId:'adadadad-adad-4dad-8dad-adadadadadad',status:'rejected',note:'Replacement incomplete'})
  expect((await landlordRows()).find((r) => r.id===row.id).state).toBe('rejected')
  await expect(create()).rejects.toThrow('prescribed disclosure')
  await expect(landlordCommand('review_document',{documentId:'abababab-abab-4bab-8bab-abababababab',status:'accepted',note:'Older form',completedSigned:true})).rejects.toThrow('Only current')
})
it('supersedes changed property evidence while retaining identity and document history', async () => {
  const before=await landlordRows();const row=before.find((r) => r.purpose==='property_disclosure' && r.scope_key==='property:home')
  const identity=before.find((r) => r.purpose==='identity')
  await landlordFile(identity,'aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae')
  await landlordCommand('save',{portfolio:[{id:'home',address:'Changed Road',canonicalPropertyId:property},{id:'other',address:'Two Road'}]})
  const after=await landlordRows()
  expect(after.find((r) => r.id===row.id)).toMatchObject({generation:row.generation+1,state:'missing',current_landlord_document_id:null})
  expect(after.find((r) => r.id===identity.id)).toMatchObject({generation:identity.generation,state:'received',current_landlord_document_id:'aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae'})
  expect(after.find((r) => r.purpose==='property_disclosure' && r.scope_key==='property:other').generation).toBe(1)
  expect((await db.query('select count(*)::int n from rental_landlord_onboarding_documents where requirement_id=$1',[row.id])).rows[0].n).toBe(2)
})
it('locks submitted landlord details, preserves the declaration and reopens only through an agent correction', async () => {
  await expect(landlordCommand('submit',{}, {source:'landlord'})).rejects.toThrow('declaration')
  await landlordCommand('submit',{declarationAccepted:true},{source:'landlord'})
  await expect(landlordCommand('save')).rejects.toThrow('locked')
  await expect(landlordCommand('request_changes',{message:'Please correct address'},{source:'landlord'})).rejects.toThrow('Agent correction')
  await landlordCommand('request_changes',{message:'Please correct address'})
  const state=(await db.query('select * from rental_landlord_onboarding where lead_id=$1',[landlordLead])).rows[0]
  expect(state.status).toBe('draft');expect(state.declaration_json).toBeNull()
  const declaration=(await db.query("select payload_json from rental_landlord_onboarding_events where lead_id=$1 and command='submit'",[landlordLead])).rows[0].payload_json
  expect(declaration.accepted).toBe(true);expect(declaration.discovery.portfolio[0].address).toBe('Changed Road')
})
it('protects landlord records and private storage from anonymous and direct client writes', async () => {
  expect((await db.query("select count(*)::int n,bool_and(relrowsecurity) protected from pg_class where relname in ('rental_landlord_onboarding','rental_landlord_onboarding_documents','rental_landlord_onboarding_access','rental_landlord_onboarding_events')")).rows[0]).toEqual({n:4,protected:true})
  await db.exec(`select set_config('test.actor','${actor}',false); set role authenticated;`)
  expect((await db.query('select count(*)::int n from rental_landlord_onboarding where lead_id=$1',[landlordLead])).rows[0].n).toBe(1)
  await expect(db.exec("update rental_landlord_onboarding_documents set status='accepted'")).rejects.toThrow('permission denied')
  await expect(db.exec('select * from rental_landlord_onboarding_access')).rejects.toThrow('permission denied')
  await expect(landlordCommand('save')).rejects.toThrow('permission denied')
  await db.exec("reset role; select set_config('test.actor','77777777-7777-4777-8777-777777777777',false); set role authenticated;")
  expect((await db.query('select count(*)::int n from rental_landlord_onboarding_documents')).rows[0].n).toBe(0)
  await db.exec('reset role;set role anon;')
  await expect(db.exec('select * from rental_landlord_onboarding')).rejects.toThrow('permission denied')
  await db.exec('reset role;')
  expect((await db.query("select public,file_size_limit from storage.buckets where id='rental-landlord-onboarding'")).rows[0]).toEqual({public:false,file_size_limit:8388608})
})
it('returns discovery, version and current property evidence together through the server-only snapshot',async () => {
 const result=(await db.query('select rental_landlord_onboarding_snapshot($1,$2::jsonb) result',[landlordLead,JSON.stringify({organisation_id:org,branch_id:null})])).rows[0].result
 expect(result.version).toBe(landlordVersion);expect(result.payload.rentalCrm.landlordPortfolio[0].address).toBe('Changed Road')
 expect(result.requirements.find((r) => r.scope_key==='property:home' && r.purpose==='property_disclosure').current_landlord_document_id).toBeNull()
 expect(result.documents).toHaveLength(3);expect(result.documents[0].storage_path).toBeUndefined()
 await expect(db.query('select rental_landlord_onboarding_snapshot($1,$2::jsonb)',[landlordLead,JSON.stringify({organisation_id:org,branch_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'})])).rejects.toThrow('scope changed')
 expect((await db.query("select has_function_privilege('authenticated','rental_landlord_onboarding_snapshot(uuid,jsonb)','EXECUTE') permitted")).rows[0].permitted).toBe(false)
})

it('links a submitted landlord property without reopening discovery or duplicating fulfilled evidence',async () => {
 const before=await landlordRows();const r=before.find((row) => row.scope_key==='property:home' && row.purpose==='property_disclosure')
 await landlordFile(r,'afafafaf-afaf-4faf-8faf-afafafafafaf')
 await landlordCommand('review_document',{documentId:'afafafaf-afaf-4faf-8faf-afafafafafaf',status:'accepted',note:'Current form checked',completedSigned:true})
 const mandate=(await db.query("insert into rental_property_mandates(organisation_id,property_id,mandate_status,metadata_json) values($1,$2,'active',$3::jsonb) returning id",[org,property,JSON.stringify({leadId:landlordLead})])).rows[0].id
 const listing='10101010-1010-4010-8010-101010101010'
 await db.query('insert into private_listings(id,organisation_id) values($1,$2)',[listing,org])
 await landlordCommand('submit',{declarationAccepted:true},{source:'landlord'})
 const stateBefore=(await db.query('select declaration_json from rental_landlord_onboarding where lead_id=$1',[landlordLead])).rows[0].declaration_json
 const requirementsBefore=await landlordRows()
 const link=async (payload,version=landlordVersion) => (await db.query('select rental_landlord_onboarding_link_property($1,$2,$3::jsonb,$4::jsonb,$5) result',[landlordLead,version,JSON.stringify(payload),JSON.stringify({organisation_id:org,branch_id:null}),actor])).rows[0].result
 await expect(link({propertyId:'other',mandateId:mandate})).rejects.toThrow('linked managed property')
 await expect(link({propertyId:'home',mandateId:mandate},0)).rejects.toThrow('changed; reopen')
 await expect(link({propertyId:'home',mandateId:mandate},null)).rejects.toThrow('changed; reopen')
 const result=await link({propertyId:'home',mandateId:mandate,listingId:listing});landlordVersion=result.version
 expect(result.status).toBe('submitted')
 const retry=await link({propertyId:'home',mandateId:mandate,listingId:listing},0)
 expect(retry.version).toBe(result.version)
 expect((await db.query('select declaration_json from rental_landlord_onboarding where lead_id=$1',[landlordLead])).rows[0].declaration_json).toEqual(stateBefore)
 expect((await landlordRows()).map((row) => [row.id,row.generation,row.current_landlord_document_id])).toEqual(requirementsBefore.map((row) => [row.id,row.generation,row.current_landlord_document_id]))
 expect((await db.query("select count(*)::int n from rental_landlord_onboarding_events where lead_id=$1 and command='link_property'",[landlordLead])).rows[0].n).toBe(1)
 expect((await db.query("select has_function_privilege('authenticated','rental_landlord_onboarding_link_property(uuid,integer,jsonb,jsonb,uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false)
})
