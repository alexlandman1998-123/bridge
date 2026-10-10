import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { websitePublicationJobContext } from './listingPublicationJob.ts';
Deno.test('website job delegation requires service authority and binds the action, listing and claim', async () => {
 const calls: unknown[] = [];
 const admin = { rpc: async (name: string,args: unknown) => { calls.push([name,args]); return { data: { actorId:'actor',actorEmail:'actor@example.test',listingId:'listing',status:{status:'ready'} },error:null }; } };
 const payload = {publicationJobId:'job',publicationClaimId:'claim',listingId:'listing',action:'publish'};
 const options={admin,token:'service',serviceKey:'service',payload};
 assertEquals(await websitePublicationJobContext({...options,payload:{listingId:'listing'}}),null);
 await assertRejects(()=>websitePublicationJobContext({...options,token:'user'}));
 await assertRejects(()=>websitePublicationJobContext({...options,payload:{...payload,action:'unpublish'}}));
 await assertRejects(()=>websitePublicationJobContext({...options,payload:{...payload,listingId:'different'}}));
 const context=await websitePublicationJobContext(options);
 assertEquals(context?.actor.data.user.id,'actor');
 assertEquals((await context?.statusClient.rpc())?.data.status,'ready');
 assertEquals(calls.at(-1),['listing_publication_website_context',{p_job:'job',p_claim:'claim',p_partner:false}]);
});
