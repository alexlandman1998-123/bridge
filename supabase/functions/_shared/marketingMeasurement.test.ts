import {assertEquals, assert} from 'jsr:@std/assert';
import {signCampaignDestination} from './emailCampaignTracking.ts';
import {createCampaignTrackingHandler} from '../email-campaign-track/handler.ts';
import {createUnsubscribeHandler} from '../email-unsubscribe/handler.ts';
import {createMarketingClickHandler} from '../marketing-click/handler.ts';
const recipient='11111111-1111-4111-8111-111111111111';
const env=(key: string)=>({SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture-signing-secret'}[key]);
Deno.test('signed destination survives database outage; tampered URL never becomes a fallback',async()=>{
 const signature=await signCampaignDestination('sb_secret_fixture-signing-secret',{l:'link-token',r:recipient,t:'recipient-token',u:'https://agency.test/listing',c:'campaign',o:'org'});
 const url=new URL('https://fixture.test/?'+new URLSearchParams({l:'link-token',r:recipient,t:'recipient-token',...signature}));
 const tasks: Promise<unknown>[]=[],reports: string[]=[],calls: string[]=[];
 const handler=createCampaignTrackingHandler({env,createClient:()=>({rpc:async(name: string)=>{calls.push(name);throw Error('offline');}}),defer:task=>tasks.push(task),report:message=>reports.push(message)});
 const response=await handler(new Request(url));assertEquals(response.status,302);assertEquals(response.headers.get('location'),'https://agency.test/listing');await Promise.all(tasks);
 assertEquals(calls,['email_campaign_record_click_v2']);assertEquals(reports,['email_campaign_tracking.event_write_failed']);
 url.searchParams.set('d',btoa(JSON.stringify({u:'https://evil.test'})));
 assertEquals((await handler(new Request(url))).status,503);
});
Deno.test('legacy links redirect when event insertion fails and use only validated short-lived cache',async()=>{
 let readsFail=false;const tasks: Promise<unknown>[]=[];
 const handler=createCampaignTrackingHandler({env,createClient:()=>({rpc:async(name: string)=>name==='email_campaign_resolve_link'?(readsFail?{error:Error('offline')}:{data:'https://agency.test/listing'}):{error:Error('write failed')}}),defer:task=>tasks.push(task),report:()=>{}});
 const url=`https://fixture.test/?l=legacy&r=${recipient}&t=recipient-token`;
 assertEquals((await handler(new Request(url))).status,302);readsFail=true;assertEquals((await handler(new Request(url))).status,302);
 assertEquals((await handler(new Request(url.replace('l=legacy','l=unseen')))).status,503);await Promise.all(tasks);
});
Deno.test('GET and unconfirmed POST never unsubscribe; explicit and RFC one-click POST use recipient context',async()=>{
 const calls: any[]=[];
 const handler=createUnsubscribeHandler({env,createClient:()=>({rpc:async(name: string,args: any)=>{calls.push({name,args});return {data:true};}})});
 const url=`https://fixture.test/?token=preference-token&r=${recipient}&t=recipient-token`;
 assertEquals((await handler(new Request(url))).status,200);
 assertEquals((await handler(new Request(url,{method:'POST',body:'subscription=anything'}))).status,400);assertEquals(calls.length,0);
 for(const body of ['confirm=unsubscribe','List-Unsubscribe=One-Click'])assertEquals((await handler(new Request(url,{method:'POST',body}))).status,200);
 assertEquals(calls.length,2);assertEquals(calls[0].args.p_recipient_id,recipient);assertEquals(calls[1].args.p_source,'mailbox_one_click');
});
Deno.test('WhatsApp redirects preserve destination on write failure and attribute only owned websites',async()=>{
 const tasks: Promise<unknown>[]=[];let owned=true;
 const handler=createMarketingClickHandler({db:{rpc:async(name: string)=>name==='marketing_resolve_attribution_link'?{data:{url:'https://agency.test/property?view=1',firstParty:owned}}:{error:Error('write failed')}},defer:task=>tasks.push(task),report:()=>{}});
 const request=()=>new Request('https://fixture.test/?token=12345678901234567890123456789012');
 const first=await handler(request());assertEquals(first.status,302);assert(new URL(first.headers.get('location')!).searchParams.has('arch9_attribution'));
 owned=false;const external=await handler(request());assert(!new URL(external.headers.get('location')!).searchParams.has('arch9_attribution'));await Promise.all(tasks);
});
