import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
const mocks = vi.hoisted(() => ({ p24Sync:vi.fn(),ppSync:vi.fn(),existing:false }))
vi.mock('../services/property24ListingSyncService.js',() => ({ recordProperty24ListingSync:mocks.p24Sync }))
vi.mock('../services/privatePropertyListingSyncService.js',async original => ({ ...await original(),recordPrivatePropertyListingSync:mocks.ppSync }))
vi.mock('../services/privatePropertyAgencyConfigService.js',() => ({
  resolvePrivatePropertyAgencyConfig:async()=>({ ready:true,config:{ branchGuid:'branch',baseUrl:'https://portal.test' } }),
  resolvePrivatePropertyCredentials:async()=>({ missingSecrets:[],redacted:{},username:'fixture',password:'fixture' }),
}))
vi.mock('../services/privatePropertyGoLiveReadinessService.js',() => ({ buildPrivatePropertyGoLiveReadinessReport:async()=>({ ready:true,status:'READY',environment:'sandbox',blockers:[],warnings:[],checks:[],agencyConfig:{ branchGuid:'branch' },agentMapping:{} }) }))
vi.mock('../services/privatePropertyListingPreviewService.js',() => ({
 fetchArch9ListingForPrivatePropertyPreview:async()=>({ listing:{ listing_category:'rental' },existingSync:mocks.existing ? { property_id:'property',branch_guid:'branch' } : null }),
 createPrivatePropertyArch9ListingPreview:()=>({ canPreview:true,summary:{ propertyId:'property',branchId:'branch',listingType:'Rental' },payloadPreview:{ address:{} },listingXml:'<PropertyId>property</PropertyId>' }),
}))
vi.mock('../services/privatePropertyListingRecoveryService.js',() => ({ inspectPrivatePropertyListingRecovery:async()=>({ checked:false,blockers:[] }) }))
import { beginRentalPublicationAttempt,getRentalPublicationAttempt,updateRentalPublicationAttempt } from '../services/rentalPublicationAttemptService.js'
import { applyControlledProperty24StatusUpdate } from '../property24/workflowService.js'
import { updatePrivatePropertyListingStatus } from '../services/privatePropertyListingStatusUpdateService.js'
import { applyProperty24ListingPublish } from '../property24/publishService.js'
import { runPrivatePropertyControlledPublishRehearsal } from '../services/privatePropertyControlledPublishService.js'
import { reconcileRentalProperty24Publication,reconcileRentalPrivatePropertyPublication } from '../services/rentalPublicationReconciliationService.js'
const listingId='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222'
let db,client
function query(table) {
  let mode='select',payload,filters=[],sort='',limit=''
  const params=[]
  const add=value=>{ params.push(value);return `$${params.length}` }
  const run=async()=>{
    try {
      let sql
      const where=filters.length ? ` where ${filters.join(' and ')}` : ''
      if(mode==='insert') {
        const entries=Object.entries(payload)
        sql=`insert into ${table}(${entries.map(([key])=>key).join(',')}) values(${entries.map(([,value])=>add(value && typeof value==='object' ? JSON.stringify(value) : value)).join(',')}) returning *`
      } else if(mode==='update') sql=`update ${table} set ${Object.entries(payload).map(([key,value])=>`${key}=${add(value && typeof value==='object' ? JSON.stringify(value) : value)}`).join(',')}${where} returning *`
      else sql=`select * from ${table}${where}${sort}${limit}`
      const result=await db.query(sql,params)
      return { data:result.rows,error:null }
    } catch(error) { return { data:null,error } }
  }
  const builder={ select:()=>builder,upsert:value=>{mode='insert';payload=value;return builder},insert:value=>{mode='insert';payload=value;return builder},update:value=>{mode='update';payload=value;return builder},
    eq:(key,value)=>{filters.push(`${key}=${add(value)}`);return builder},in:(key,values)=>{filters.push(`${key} in (${values.map(add).join(',')})`);return builder},
    order:(key,{ascending})=>{sort=` order by ${key} ${ascending?'asc':'desc'}`;return builder},limit:value=>{limit=` limit ${value}`;return builder},
    single:async()=>{const result=await run();return {...result,data:result.data?.[0] || null}},maybeSingle:async()=>{const result=await run();return {...result,data:result.data?.[0] || null}},
    then:(resolve,reject)=>run().then(resolve,reject) }
  return builder
}
beforeEach(async()=>{
 vi.clearAllMocks();mocks.existing=false
 mocks.p24Sync.mockResolvedValue({sync:{private_listing_id:listingId,listing_number:123},listing:{id:listingId,property24_reference:'123',property24_status:'published'}})
 mocks.ppSync.mockResolvedValue({sync:{id:'sync'},listing:{id:listingId},arch9Status:'draft'})
 db=new PGlite()
 await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;
 create table private_listings(id uuid primary key,organisation_id uuid,listing_category text);
 insert into private_listings values('${listingId}','${org}','rental');
 create function bridge_can_access_private_listing(l uuid) returns boolean language sql as $$select exists(select 1 from private_listings where id=l and organisation_id=nullif(current_setting('test.org',true),'')::uuid)$$;
 grant select on private_listings to authenticated,service_role;`)
 await db.exec(await readFile(new URL('../../../supabase/migrations/20261004155515_rental_publication_attempt_recovery.sql',import.meta.url),'utf8'))
 client={from:table=>query(table)}
})
afterEach(async()=>{await db.close()})
const config={listingId,agencyId:'42',agentId:'17',environment:'production'}
const preview={summary:{listingType:'Rental'},payload:{sourceReference:'source-rental',rentalInfo:{rate:12000}}}
const p24=()=>({saveListing:vi.fn(async()=>({status:200,data:{listingNumber:123}})),checkListingOnPortal:vi.fn(async()=>({status:200,data:true})),fetchListingReconciliation:vi.fn(async()=>({data:[{listingNumber:123,sourceReference:'source-rental'}]}))})
const send=portal=>applyProperty24ListingPublish({supabase:client,property24:portal,config,preview})
const pp=()=>({updateListing:vi.fn(async()=>({status:200,data:'<UpdateListingResult>Successful Ref: T12345</UpdateListingResult>'})),getListingStatus:vi.fn(async()=>({data:'<GetListingStatusResult>ToLet</GetListingStatusResult>'})),getListingsDetails:vi.fn(async()=>({data:'<GetListingsDetailsResult>&lt;PropertyId&gt;property&lt;/PropertyId&gt;&lt;Ref&gt;T12345&lt;/Ref&gt;</GetListingsDetailsResult>'}))})
const sendPP=portal=>runPrivatePropertyControlledPublishRehearsal({client,listingId,environment:'sandbox',apply:true,recordSync:true,privateProperty:portal})
it('blocks another P24 send after a timeout, then repairs by exact source reference without publishing',async()=>{
 const portal=p24();portal.saveListing.mockRejectedValueOnce(new Error('Request timed out'))
 expect((await send(portal)).status).toBe('UNCERTAIN')
 await expect(send(portal)).rejects.toMatchObject({code:'RENTAL_PUBLICATION_PENDING'})
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
 expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('RECONCILED')
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
 expect(await getRentalPublicationAttempt(client,listingId,'property24','production')).toBeNull()
})
it('retains an accepted P24 reference before local sync fails',async()=>{
 const portal=p24();mocks.p24Sync.mockRejectedValueOnce(new Error('Database write failed'))
 expect((await send(portal)).status).toBe('UNCERTAIN')
 expect((await getRentalPublicationAttempt(client,listingId,'property24','production')).receipt).toMatchObject({accepted:true,reference:'123'})
 await expect(send(portal)).rejects.toMatchObject({code:'RENTAL_PUBLICATION_PENDING'})
 expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('RECONCILED')
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
})
it('does not interpret absent, ambiguous or failed provider reads as safe to resend',async()=>{
 const portal=p24();portal.saveListing.mockRejectedValue(new Error('Network failure'));await send(portal)
 for(const rows of [[],[{listingNumber:123,sourceReference:'source-rental'},{listingNumber:456,sourceReference:'source-rental'}]]) {
  portal.fetchListingReconciliation.mockResolvedValueOnce({data:rows})
  expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('UNCERTAIN')
 }
 portal.fetchListingReconciliation.mockRejectedValueOnce(new Error('Provider unavailable'))
 expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('UNCERTAIN')
 await expect(send(portal)).rejects.toMatchObject({code:'RENTAL_PUBLICATION_PENDING'})
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
})
it('permits only one concurrent send and prevents a different payload bypassing its pending slot',async()=>{
 const portal=p24();let finish
 portal.saveListing.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const first=send(portal)
 await vi.waitFor(()=>expect(portal.saveListing).toHaveBeenCalledTimes(1))
 await expect(applyProperty24ListingPublish({supabase:client,property24:portal,config,preview:{...preview,payload:{...preview.payload,newPrice:14000}}})).rejects.toMatchObject({code:'RENTAL_PUBLICATION_PENDING'})
 finish({status:200,data:{listingNumber:123}});expect((await first).status).toBe('SUBMITTED')
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
})
it('fails before sending if the durable journal is unavailable',async()=>{
 await db.exec('drop table rental_publication_attempts')
 const portal=p24();await expect(send(portal)).rejects.toMatchObject({code:'RENTAL_PUBLICATION_JOURNAL_UNAVAILABLE'})
 expect(portal.saveListing).not.toHaveBeenCalled()
})
it('releases definite rejections but keeps server failures uncertain',async()=>{
 const portal=p24();portal.saveListing.mockRejectedValueOnce(Object.assign(new Error('Bad request'),{status:400})).mockRejectedValueOnce(Object.assign(new Error('Provider error'),{status:503}))
 expect((await send(portal)).status).toBe('FAILED')
 expect(await getRentalPublicationAttempt(client,listingId,'property24','production')).toBeNull()
 expect((await send(portal)).status).toBe('UNCERTAIN')
})
it('reconciles a timed-out new PP submission using the exact property and branch IDs',async()=>{
 const portal=pp();portal.updateListing.mockRejectedValueOnce(new Error('Request timed out'))
 expect((await sendPP(portal)).status).toBe('UNCERTAIN')
 await expect(sendPP(portal)).rejects.toMatchObject({code:'RENTAL_PUBLICATION_PENDING'})
 expect((await reconcileRentalPrivatePropertyPublication({client,listingId,environment:'sandbox',secrets:{},privateProperty:portal})).status).toBe('RECONCILED')
 expect(portal.getListingsDetails).toHaveBeenCalledWith({branchGuid:'branch',uniqueListingId:'property'})
 expect(portal.updateListing).toHaveBeenCalledTimes(1)
})
it('keeps accepted PP receipts after local failure and does not silently resend an existing uncertain update',async()=>{
 const portal=pp();mocks.ppSync.mockRejectedValueOnce(new Error('Database unavailable'))
 expect((await sendPP(portal)).status).toBe('UNCERTAIN')
 expect((await getRentalPublicationAttempt(client,listingId,'private_property','sandbox')).receipt.accepted).toBe(true)
 expect((await reconcileRentalPrivatePropertyPublication({client,listingId,environment:'sandbox',secrets:{},privateProperty:portal})).status).toBe('RECONCILED')
 mocks.existing=true;portal.updateListing.mockRejectedValueOnce(new Error('Request timed out'))
 expect((await sendPP(portal)).status).toBe('UNCERTAIN')
 expect((await reconcileRentalPrivatePropertyPublication({client,listingId,environment:'sandbox',secrets:{},privateProperty:portal})).status).toBe('UNCERTAIN')
 expect(portal.updateListing).toHaveBeenCalledTimes(2)
})
it('protects journal writes from browsers and keeps organisation reads scoped',async()=>{
 const attempt=await beginRentalPublicationAttempt({client,listingId,channel:'property24',environment:'production',identity:{agencyId:'42'},payload:{}})
 await db.exec(`set role authenticated;select set_config('test.org','${org}',false);`)
 expect((await db.query('select * from rental_publication_attempts')).rows).toHaveLength(1)
 await expect(db.exec(`update rental_publication_attempts set state='accepted' where id='${attempt.id}'`)).rejects.toThrow('permission denied')
 await db.exec("select set_config('test.org','33333333-3333-4333-8333-333333333333',false)")
 expect((await db.query('select * from rental_publication_attempts')).rows).toHaveLength(0)
 await db.exec('reset role;set role anon')
 await expect(db.query('select * from rental_publication_attempts')).rejects.toThrow('permission denied')
 await db.exec('reset role')
 await updateRentalPublicationAttempt(client,attempt,{state:'accepted'})
})

it('blocks stale create previews prepared before an earlier confirmed submission finished',async()=>{
 const portal=p24();expect((await send(portal)).status).toBe('SUBMITTED')
 await expect(send(portal)).rejects.toMatchObject({code:'RENTAL_PUBLICATION_STALE_CANDIDATE'})
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
})
it('keeps P24 withdrawal pending while the provider still reports live',async()=>{
 const portal=p24();portal.updateListingStatus=vi.fn(async()=>({status:200,data:{}}))
 const report=await applyControlledProperty24StatusUpdate({supabase:client,property24:portal,config,listingNumber:'123',listingStatus:'Withdrawn'})
 expect(report.status).toBe('UNCERTAIN')
 portal.fetchListingReconciliation.mockResolvedValueOnce({data:[{listingNumber:123,status:'Active'}]})
 expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('UNCERTAIN')
 portal.fetchListingReconciliation.mockResolvedValueOnce({data:[{listingNumber:123,status:'Withdrawn'}]})
 portal.checkListingOnPortal.mockResolvedValueOnce({status:200,data:false})
 expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('RECONCILED')
 expect(portal.updateListingStatus).toHaveBeenCalledTimes(1)
})
it('retains PP withdrawal evidence until the observed portal status matches',async()=>{
 await db.exec(`create table private_property_listing_syncs(private_listing_id uuid,environment text,property_id text,branch_guid text,listing_type text,private_property_ref text);
 insert into private_property_listing_syncs values('${listingId}','sandbox','property','branch','Rental','T12345')`)
 const portal=pp();portal.listingStatusUpdate=vi.fn(async()=>({status:200,data:'<ListingStatusUpdateResult>Successful</ListingStatusUpdateResult>'}))
 await expect(updatePrivatePropertyListingStatus({client,listingId,environment:'sandbox',propertyStatus:'Inactive',privateProperty:portal})).rejects.toMatchObject({code:'RENTAL_PUBLICATION_PENDING'})
 expect((await reconcileRentalPrivatePropertyPublication({client,listingId,environment:'sandbox',secrets:{},privateProperty:portal})).status).toBe('UNCERTAIN')
 portal.getListingStatus.mockResolvedValueOnce({data:'<GetListingStatusResult>Inactive</GetListingStatusResult>'})
 expect((await reconcileRentalPrivatePropertyPublication({client,listingId,environment:'sandbox',secrets:{},privateProperty:portal})).status).toBe('RECONCILED')
 expect(portal.listingStatusUpdate).toHaveBeenCalledTimes(1)
})

it('keeps the original slot protected when saving the accepted receipt fails',async()=>{
 await db.exec(`create function reject_receipt() returns trigger language plpgsql as $$begin raise exception 'fixture receipt write failed';end$$;
 create trigger reject_receipt before update on rental_publication_attempts for each row execute function reject_receipt()`)
 const portal=p24();expect((await send(portal)).status).toBe('UNCERTAIN')
 const attempt=await getRentalPublicationAttempt(client,listingId,'property24','production')
 expect(attempt.state).toBe('dispatching')
 await expect(send(portal)).rejects.toMatchObject({code:'RENTAL_PUBLICATION_PENDING'})
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
 await db.exec('drop trigger reject_receipt on rental_publication_attempts')
 expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('RECONCILED')
})
it('does not call a provider when the listing changed category after preview',async()=>{
 await db.exec("update private_listings set listing_category='sales'")
 const portal=p24();await expect(send(portal)).rejects.toThrow('changed during publishing')
 expect(portal.saveListing).not.toHaveBeenCalled()
})
it('keeps a response without a usable listing number uncertain and recovers by exact source',async()=>{
 const portal=p24();portal.saveListing.mockResolvedValueOnce({status:200,data:{acknowledged:true}})
 expect((await send(portal)).status).toBe('UNCERTAIN')
 expect((await getRentalPublicationAttempt(client,listingId,'property24','production')).receipt.reference).toBe('')
 expect((await reconcileRentalProperty24Publication({client,property24:portal,config})).status).toBe('RECONCILED')
 expect(portal.saveListing).toHaveBeenCalledTimes(1)
})
