import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { websitePublicationJobContext } from './listingPublicationJob.ts';
Deno.test('website job delegation requires service authority and binds the action, listing and claim', async () => {
 const calls: unknown[] = [];
 const caller = { rpc: async (name: string,args: unknown) => { calls.push([name,args]); return { data: { actorId:'actor',actorEmail:'actor@example.test',listingId:'listing',status:{status:'ready'} },error:null }; } };
 const payload = {publicationJobId:'job',publicationClaimId:'claim',listingId:'listing',action:'publish'};
 const options={caller,payload};
 assertEquals(await websitePublicationJobContext({...options,payload:{listingId:'listing'}}),null);
 await assertRejects(()=>websitePublicationJobContext({...options,caller:{rpc:async()=>({data:null,error:{code:'42501'}})}}));
 await assertRejects(()=>websitePublicationJobContext({...options,payload:{...payload,action:'unpublish'}}));
 await assertRejects(()=>websitePublicationJobContext({...options,payload:{...payload,listingId:'different'}}));
 const context=await websitePublicationJobContext(options);
 assertEquals(context?.actor.data.user.id,'actor');
 assertEquals((await context?.statusClient.rpc())?.data.status,'ready');
 assertEquals(calls.at(-1),['listing_publication_website_context',{p_job:'job',p_claim:'claim',p_partner:false}]);
});

Deno.test('delegation authorizes through the incoming credential RPC and rechecks a revoked claim', async () => {
 let allowed = true;
 let calls = 0;
 const caller = { rpc: async () => {
   calls++;
   return allowed
     ? {data:{actorId:'actor',listingId:'listing',status:{status:'published'}},error:null}
     : {data:null,error:{message:'Publication job is unavailable.'}};
 } };
 const payload = {publicationJobId:'job',publicationClaimId:'claim',listingId:'listing',action:'publish'};
 // A gateway-authorized caller does not need the same string as the function's
 // legacy service key. The service-only RPC supplies the authority boundary.
 const context = await websitePublicationJobContext({caller,payload});
 assertEquals(context?.actor.data.user.id,'actor');
 assertEquals(calls,1);
 allowed=false;
 const revoked=await context?.statusClient.rpc();
 assertEquals(revoked?.data,null);
 assertEquals(revoked?.error?.message,'Background publication access is unavailable.');
 assertEquals(calls,2);
});
