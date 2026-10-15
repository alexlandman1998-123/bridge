import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {rentalTenancyUploadDatabase,actor,org,unit,listing,lead} from './fixtures/rentalTenancyUploadDatabase.js'
import {rentalOnboardingClient} from './fixtures/rentalOnboardingClient.js'
import {rentalApplicationFieldScenario} from './fixtures/rentalApplicationFieldScenario.js'
import {ensureRentalListingVacancy} from '../../src/services/rentals/rentalListingInventoryRepository.js'
import {prepareRentalTenantApplication,listRentalTenantApplicationChoices} from '../../src/services/rentals/rentalTenantApplicationService.js'
import {convertRentalApplicationToTenancy,getRentalTenancyHandoffContext} from '../../src/services/rentals/rentalApplicationRepository.js'
vi.mock('../../src/lib/supabaseClient.js',()=>({isSupabaseConfigured:true,supabase:null}))
let db,client,vacancyId,app,converted
const call=async(name,args)=>{const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data}
const convert=(version=app.version)=>convertRentalApplicationToTenancy({applicationId:app.id,expectedVersion:version},{client})
async function historicalStage(stage){await db.transaction(async tx=>{await tx.exec('set local session_replication_role=replica');await tx.query("update leads set raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{stage}',to_jsonb($1::text)) where lead_id=$2",[stage,lead])})}
beforeAll(async()=>{
 db=await rentalTenancyUploadDatabase();client=rentalOnboardingClient(db,{},actor,true)
 vacancyId=(await ensureRentalListingVacancy(listing,org,{client})).vacancyId
 await db.query("update rental_vacancies set status='preparing' where id=$1",[vacancyId]);await db.query("update rental_vacancies set status='marketing' where id=$1",[vacancyId])
 app=await prepareRentalTenantApplication(org,lead,vacancyId,{client})
 // This fixture is an earlier approved application. Approval, permission,
 // evidence and screening requirements are covered by the complete real API
 // acceptance suite; no approval is invented by the handoff under test.
 const data=rentalApplicationFieldScenario('joint_individuals');data.property=app.data.property
 await db.transaction(async tx=>{await tx.exec('set local session_replication_role=replica');await tx.query("update rental_applications set status='approved',application_data=$1,submitted_snapshot_json=$1,submitted_at=now() where id=$2",[JSON.stringify(data),app.id])})
},30000)
afterAll(async()=>{await db?.close()})
it('requires the fixed Placement-ready tenant journey and a current application version',async()=>{
 expect((await getRentalTenancyHandoffContext(app.id,{client})).canCreate).toBe(false)
 await expect(convert()).rejects.toThrow('Placement ready')
 await historicalStage('placement_ready')
 expect((await getRentalTenancyHandoffContext(app.id,{client})).canCreate).toBe(true)
 await expect(convert(0)).rejects.toThrow('changed')
 await expect(convert(null)).rejects.toThrow(/refresh|changed/)
 expect((await db.query('select count(*)::int total from rental_tenancies')).rows[0].total).toBe(0)
})
it('rolls back the entire tenancy, lease, unit reservation and event if its lead connection fails',async()=>{
 await db.exec(`create function test_refuse_tenancy_lead_update() returns trigger language plpgsql as $$ begin raise exception 'Local lead connection refused';end $$;create trigger test_refuse_tenancy_lead_update before update on leads for each row execute function test_refuse_tenancy_lead_update();`)
 await expect(convert()).rejects.toThrow('Local lead connection refused')
 expect((await db.query('select count(*)::int total from rental_tenancies')).rows[0].total).toBe(0)
 expect((await db.query('select status from rental_units where id=$1',[unit])).rows[0].status).toBe('vacant')
 await db.exec('drop trigger test_refuse_tenancy_lead_update on leads')
})
it('creates one real tenancy and lease on retry, retains the approved snapshot, and connects the lead',async()=>{
 const results=await Promise.all([convert(),convert()]);converted=results[0];expect(results[1].tenancy_id).toBe(converted.tenancy_id)
 expect((await db.query('select count(*)::int total from rental_leases')).rows[0].total).toBe(1)
 const saved=(await db.query('select raw_enquiry_payload from leads where lead_id=$1',[lead])).rows[0].raw_enquiry_payload
 expect(saved.stage).toBe('placement_ready');expect(saved.relationships).toMatchObject({applicationId:app.id,tenancyId:converted.tenancy_id,leaseId:converted.lease_id,vacancyId,unitId:unit,listingId:listing})
 expect((await db.query('select status,active_tenancy_id from rental_units where id=$1',[unit])).rows[0]).toEqual({status:'lease_pending',active_tenancy_id:null})
 expect((await db.query('select terms_json from rental_leases where id=$1',[converted.lease_id])).rows[0].terms_json).toMatchObject({document_mode:'uploads_only',landlord_name:'Saved Landlord'})
 expect((await listRentalTenantApplicationChoices(org,'',{client}))[0].eligible).toBe(false)
 const snapshot=(await db.query('select tenant_snapshot_json from rental_tenancies where id=$1',[converted.tenancy_id])).rows[0].tenant_snapshot_json
 expect(snapshot).toEqual((await db.query('select submitted_snapshot_json from rental_applications where id=$1',[app.id])).rows[0].submitted_snapshot_json)
 const readiness=(await db.query('select obligation_type,required_amount from rental_move_in_readiness_items order by obligation_type')).rows
 expect(readiness.map(row=>Number(row.required_amount))).toEqual([22000,11000])
})
it('rejects anonymous conversion and another agent’s lead access',async()=>{
 await db.exec('set role anon');await expect(db.query('select rental_convert_application_to_tenancy($1,$2)',[app.id,app.version])).rejects.toThrow('permission');await db.exec('reset role')
 const foreign=rentalOnboardingClient(db,{},randomUUID(),true)
 await expect(convertRentalApplicationToTenancy({applicationId:app.id,expectedVersion:app.version},{client:foreign})).rejects.toThrow(/unavailable|authorized/)
})

let leaseWorkspace,signers,agreement
const file=(name='agreement.pdf')=>({name,type:'application/pdf',size:24})
const scopedWork=work=>db.transaction(async tx=>{await tx.query("select set_config('test.actor',$1,true)",[actor]);await tx.exec('set local role authenticated');return work(tx)})
function storageClient(){
 const storage={from:bucket=>({
  upload:async(path,source,options)=>{try{await scopedWork(tx=>tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,JSON.stringify({size:source.size,mimetype:options.contentType})]));return {data:{path}}}catch(error){return {error}}},
  createSignedUrl:async path=>{const row=await scopedWork(tx=>tx.query('select name from storage.objects where bucket_id=$1 and name=$2',[bucket,path]));return row.rows.length?{data:{signedUrl:`https://local.test/private/${path}`}}:{error:new Error('File unavailable')}}
 })}
 return rentalOnboardingClient(db,storage,actor,true)
}
it('saves the terms but refuses signing before a real uploaded agreement is linked to this version',async()=>{
 const {saveRentalLeaseDraft,getRentalLeaseSigningWorkspace,prepareRentalLeaseSigning}=await import('../../src/services/rentals/rentalLeaseSigningRepository.js')
 const {rentalLeaseScheduleSigners}=await import('../../src/services/rentals/rentalLeaseSchedule.js')
 const saved=await saveRentalLeaseDraft({leaseId:converted.lease_id,expectedVersion:1,terms:{lease_start_date:'2026-11-01',lease_end_date:'2027-10-31',occupation_date:'2026-11-01',monthly_rent:11000,deposit_amount:22000,tenant_notice_address:'Tenant notice',landlord_name:'Saved Landlord',landlord_notice_address:'Landlord notice',agreement_document_link:'https://forged.test/agreement.pdf'}},{client})
 leaseWorkspace=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client})
 expect(leaseWorkspace.version.version_number).toBe(saved.version_number)
 expect(leaseWorkspace.version.terms_json.agreement_document_link).toBeUndefined()
 expect(leaseWorkspace.uploads).toEqual([])
 await expect(prepareRentalLeaseSigning({leaseId:converted.lease_id,expectedVersion:saved.version_number,signers:rentalLeaseScheduleSigners(leaseWorkspace.projection,saved.version_number)},{client})).rejects.toThrow('Upload and review')
})
it('requires fresh payment verification when changed lease terms change a required amount',async()=>{
 const {recordRentalMoveInReadiness}=await import('../../src/services/rentals/rentalTenancyMoveInRepository.js')
 const {saveRentalLeaseDraft,getRentalLeaseSigningWorkspace}=await import('../../src/services/rentals/rentalLeaseSigningRepository.js')
 const item=(await db.query("select * from rental_move_in_readiness_items where obligation_type='deposit'")).rows[0]
 await expect(recordRentalMoveInReadiness({readinessItemId:item.id,status:'verified',receivedAmount:22000,evidenceLink:'https://forged.test/payment.pdf'},{client})).rejects.toThrow('Upload payment evidence')
 const {uploadRentalLeaseDocument}=await import('../../src/services/rentals/rentalLeaseDocumentUploadService.js')
 const proof=await uploadRentalLeaseDocument({workspace:leaseWorkspace,file:file('deposit-proof.pdf'),kind:'move_in_evidence'},{client:storageClient()})
 await recordRentalMoveInReadiness({readinessItemId:item.id,status:'verified',receivedAmount:22000,evidenceLink:`${proof.storage_bucket}/${proof.storage_path}`},{client})
 await saveRentalLeaseDraft({leaseId:converted.lease_id,expectedVersion:leaseWorkspace.version.version_number,terms:{...leaseWorkspace.version.terms_json,lease_start_date:'2026-11-01',lease_end_date:'2027-10-31',occupation_date:'2026-11-01',monthly_rent:11000,deposit_amount:27000}},{client})
 const updated=(await db.query('select * from rental_move_in_readiness_items where id=$1',[item.id])).rows[0]
 expect(Number(updated.required_amount)).toBe(27000);expect(updated.status).toBe('partial');expect(updated.reviewed_at).toBeNull();expect(updated.evidence_link).toBe(`${proof.storage_bucket}/${proof.storage_path}`)
 leaseWorkspace=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client})
})
it('keeps an upload recoverable after a lost save response, without uploading or linking a duplicate',async()=>{
 const {uploadRentalLeaseDocument,getRentalLeaseDocumentUrl}=await import('../../src/services/rentals/rentalLeaseDocumentUploadService.js')
 const {getRentalLeaseSigningWorkspace}=await import('../../src/services/rentals/rentalLeaseSigningRepository.js')
 const dbClient=storageClient(),uploadSpy=vi.spyOn(dbClient.storage,'from'),original=dbClient.rpc
 let receipt
 dbClient.rpc=async(...args)=>{const result=await original(...args);if(!result.error)return {error:new Error('Local response lost after commit')};return result}
 try{await uploadRentalLeaseDocument({workspace:leaseWorkspace,file:file()},{client:dbClient})}catch(error){receipt=error.uploadReceipt}
 expect(receipt).toBeTruthy()
 dbClient.rpc=original
 agreement=await uploadRentalLeaseDocument({workspace:leaseWorkspace,receipt},{client:dbClient})
 expect(agreement.idempotent).toBe(true)
 expect((await db.query("select count(*)::int total from storage.objects where bucket_id='rental-lease-files'")).rows[0].total).toBe(2)
 expect((await db.query('select count(*)::int total from rental_lease_document_uploads')).rows[0].total).toBe(2)
 expect(await getRentalLeaseDocumentUrl(agreement,{client:dbClient})).toContain('https://local.test/private/')
 expect(uploadSpy).toHaveBeenCalled()
 leaseWorkspace=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client})
 expect(leaseWorkspace.uploads[0].id).toBe(agreement.id)
})
it('binds each signed upload to the reviewed version and person, with atomic signature recording',async()=>{
 const {prepareRentalLeaseSigning,getRentalLeaseSigningWorkspace,recordRentalLeaseSignature}=await import('../../src/services/rentals/rentalLeaseSigningRepository.js')
 const {rentalLeaseScheduleSigners}=await import('../../src/services/rentals/rentalLeaseSchedule.js')
 const {uploadRentalLeaseDocument}=await import('../../src/services/rentals/rentalLeaseDocumentUploadService.js')
 await prepareRentalLeaseSigning({leaseId:converted.lease_id,expectedVersion:leaseWorkspace.version.version_number,signers:rentalLeaseScheduleSigners(leaseWorkspace.projection,leaseWorkspace.version.version_number)},{client})
 leaseWorkspace=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client});signers=leaseWorkspace.signers
 expect(signers).toHaveLength(3)
 await expect(recordRentalLeaseSignature({signerId:signers[0].id,documentLink:'https://forged.test/signed.pdf'},{client})).rejects.toThrow('Upload the signed agreement')
 const dbClient=storageClient()
 await expect(uploadRentalLeaseDocument({workspace:leaseWorkspace,file:file('signed.pdf'),kind:'signed_agreement',signerId:signers[0].id,confirmSigned:false},{client:dbClient})).rejects.toThrow('Confirm')
 await db.exec(`create function test_refuse_signature() returns trigger language plpgsql as $$ begin raise exception 'Local signature write refused';end $$;create trigger test_refuse_signature before update on rental_lease_signers for each row execute function test_refuse_signature();`)
 let receipt
 try{await uploadRentalLeaseDocument({workspace:leaseWorkspace,file:file('signed.pdf'),kind:'signed_agreement',signerId:signers[0].id,confirmSigned:true},{client:dbClient})}catch(error){expect(error.message).toContain('Local signature write refused');receipt=error.uploadReceipt}
 expect(receipt).toBeTruthy();expect((await db.query('select count(*)::int total from rental_lease_document_uploads')).rows[0].total).toBe(2)
 expect((await db.query('select status from rental_lease_signers where id=$1',[signers[0].id])).rows[0].status).toBe('pending')
 await db.exec('drop trigger test_refuse_signature on rental_lease_signers')
 await expect(uploadRentalLeaseDocument({workspace:leaseWorkspace,receipt,kind:'signed_agreement',signerId:signers[1].id,confirmSigned:true},{client:dbClient})).rejects.toThrow('different lease version or person')
 const signed=await uploadRentalLeaseDocument({workspace:leaseWorkspace,receipt,kind:'signed_agreement',signerId:signers[0].id,confirmSigned:true},{client:dbClient})
 expect(signed.leaseStatus).not.toBe('signed')
 expect((await uploadRentalLeaseDocument({workspace:leaseWorkspace,receipt,kind:'signed_agreement',signerId:signers[0].id,confirmSigned:true},{client:dbClient})).idempotent).toBe(true)
 for(const signer of signers.slice(1))await uploadRentalLeaseDocument({workspace:leaseWorkspace,file:file(`${signer.signer_role}.pdf`),kind:'signed_agreement',signerId:signer.id,confirmSigned:true},{client:dbClient})
 leaseWorkspace=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client});expect(leaseWorkspace.lease.status).toBe('signed')
 expect((await db.query('select count(*)::int total from rental_lease_signing_events where event_type=\'lease_signed\'')).rows[0].total).toBe(1)
})
it('keeps activation blocked until payment evidence and incoming handover are complete',async()=>{
 const {activateRentalTenancy,recordRentalMoveInReadiness,startRentalIncomingInspection}=await import('../../src/services/rentals/rentalTenancyMoveInRepository.js')
 await expect(activateRentalTenancy(converted.tenancy_id,{client})).rejects.toThrow('readiness is incomplete')
 const readiness=(await db.query('select * from rental_move_in_readiness_items')).rows
 const {uploadRentalLeaseDocument}=await import('../../src/services/rentals/rentalLeaseDocumentUploadService.js')
 for(const item of readiness){const proof=await uploadRentalLeaseDocument({workspace:leaseWorkspace,file:file(`${item.obligation_type}.pdf`),kind:'move_in_evidence'},{client:storageClient()});await recordRentalMoveInReadiness({readinessItemId:item.id,status:'verified',receivedAmount:Number(item.required_amount),evidenceLink:`${proof.storage_bucket}/${proof.storage_path}`},{client})}
 await expect(activateRentalTenancy(converted.tenancy_id,{client})).rejects.toThrow(/inspection|handover|move-in/)
 const inspection=await startRentalIncomingInspection(converted.tenancy_id,null,{client})
 const items=(await db.query('select id,item_key from rental_incoming_inspection_items where inspection_id=$1',[inspection.inspection_id])).rows
 await expect(call('rental_record_incoming_inspection_item',{p_item_id:items[0].id,p_status:'completed',p_note:'Wrong proof',p_evidence_link:`rental-lease-files/${agreement.storage_path}`})).rejects.toThrow('Choose uploaded evidence')
 for(const item of items){
  const photo=item.item_key==='photo_evidence',source=photo?{name:'condition.jpg',type:'image/jpeg',size:24}:file(`${item.item_key}.pdf`)
  const uploaded=await uploadRentalLeaseDocument({workspace:leaseWorkspace,file:source,kind:'move_in_evidence'},{client:storageClient()})
  const reference=`${uploaded.storage_bucket}/${uploaded.storage_path}`
  if(photo){await call('rental_link_incoming_inspection_media',{p_inspection_id:inspection.inspection_id,p_media_link:reference,p_caption:'Incoming condition'});expect((await call('rental_link_incoming_inspection_media',{p_inspection_id:inspection.inspection_id,p_media_link:reference,p_caption:'Incoming condition'})).idempotent).toBe(true)}
  const args={p_item_id:item.id,p_status:'completed',p_note:'Verified handover',p_evidence_link:reference}
  await call('rental_record_incoming_inspection_item',args);expect((await call('rental_record_incoming_inspection_item',args)).idempotent).toBe(true)
 }
 await call('rental_complete_incoming_inspection',{p_inspection_id:inspection.inspection_id,p_acknowledged_by_name:'Saved Tenant',p_handover_notes:'Incoming evidence checked'})
 const active=await activateRentalTenancy(converted.tenancy_id,{client});expect(active.status).toBe('active')
 expect((await activateRentalTenancy(converted.tenancy_id,{client})).idempotent).toBe(true)
 expect((await db.query('select status,active_tenancy_id from rental_units where id=$1',[unit])).rows[0]).toEqual({status:'occupied',active_tenancy_id:converted.tenancy_id})
 expect((await db.query('select status from rental_vacancies where id=$1',[vacancyId])).rows[0].status).toBe('let')
})

it('denies forged storage paths and direct receipt writes and rejects stale version registration',async()=>{
 const id=randomUUID(),path=`${randomUUID()}/${converted.lease_id}/${leaseWorkspace.version.id}/${id}.pdf`
 const forged=await storageClient().storage.from('rental-lease-files').upload(path,file(),{contentType:'application/pdf'})
 expect(forged.error.message).toMatch(/row-level security/)
 const stale=await client.rpc('rental_register_lease_document',{p_lease_id:converted.lease_id,p_expected_version:leaseWorkspace.version.version_number-1,p_upload_id:id,p_kind:'agreement',p_signer_id:null,p_storage_path:path,p_file_name:'wrong.pdf',p_confirm_signed:false,p_evidence_note:null})
 expect(stale.error.message).toContain('version changed')
 const denied=await client.from('rental_lease_document_uploads').insert({id,organisation_id:org}).select().single();expect(denied.error.message).toContain('permission denied')
})
