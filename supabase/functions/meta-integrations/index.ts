import { META_ADMIN_ROLES, META_STAFF_ROLES } from '../_shared/metaIntegrationCore.js';
import { createClient } from 'supabase';
import { createMetaIntegrationHandler } from './handler.js';
import { decryptMetaToken, encryptMetaToken } from '../_shared/metaCredentials.ts';
import { readMetaIntegrationPayload } from '../_shared/whatsappInboxMessaging.js';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const env=(name:string)=>Deno.env.get(name)?.trim()||'';
const ADMIN=new Set(META_ADMIN_ROLES);
const STAFF=new Set(META_STAFF_ROLES);

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  if(req.method!=='POST') return new Response(JSON.stringify({error:'Method not allowed.'}),{status:405,headers});
  try {
    const url=env('SUPABASE_URL'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
    if(!url||!serviceKey||!anon) throw new Error('Meta integration storage is not configured.');
    const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const graphVersion=env('META_GRAPH_VERSION')||'v23.0';
    if(!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('Invalid Meta API version configuration.');
    async function graph(token:string,path:string,payload?:unknown) {
      const response=await fetch(`https://graph.facebook.com/${graphVersion}/${path}`,{method:payload===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      if(!response.ok||body.error) throw Object.assign(new Error(`Meta: ${String(body.error?.message||'Request failed').split(token).join('[redacted]').slice(0,500)}`),{definitive:response.status>=400&&response.status<500});
      return body;
    }
    const handler=createMetaIntegrationHandler({db,graph,encrypt:encryptMetaToken,decrypt:decryptMetaToken,
      config:{appId:env('META_APP_ID')||'1010066162083846',whatsappConfigId:env('META_WHATSAPP_LOGIN_CONFIG_ID')||'1078235214654031',graphVersion,storageOrigin:new URL(url).origin},
      hash:async(value:string|Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value).buffer:new Uint8Array(value).buffer))).map(b=>b.toString(16).padStart(2,'0')).join(''),
      uploadMedia:async(token:string,phoneId:string,file:{bytes:Uint8Array;mimeType:string;filename:string})=>{
        const form=new FormData();form.set('messaging_product','whatsapp');form.set('type',file.mimeType);form.set('file',new Blob([new Uint8Array(file.bytes).buffer],{type:file.mimeType}),file.filename);
        const response=await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form,signal:AbortSignal.timeout(30000)});
        const body=await response.json();
        if(!response.ok||body.error)throw Object.assign(new Error('Meta could not upload this attachment.'),{definitive:response.status>=400&&response.status<500});
        return body;
      },
      authorize:async(authorization:string,org:string)=>{
        const token=authorization.replace(/^Bearer\s+/i,'');
        if(!token||token===serviceKey) return null;
        const {data,error}=await db.auth.getUser(token);
        if(error||!data.user) return null;
        const member=await db.from('organisation_users').select('role,status').eq('organisation_id',org).eq('user_id',data.user.id).maybeSingle();
        if(member.error||member.data?.status!=='active'||!STAFF.has(member.data.role)) return null;
        return {canConnectOwn:true,userId:data.user.id,isAdmin:ADMIN.has(member.data.role),userDb:createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})};
      },
      exchangeCode:async(code:string)=>{
        const response=await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env('META_APP_ID')||'1010066162083846',client_secret:env('META_APP_SECRET'),code}),signal:AbortSignal.timeout(15000)});
        const body=await response.json();
        if(!response.ok||!body.access_token) throw new Error('Meta could not exchange the WhatsApp authorization code. Start the connection again.');
        return body.access_token;
      },
      loadListing:async(actor:any,org:string,id:string)=>{
        const listing=await actor.userDb.from('private_listings').select('id,organisation_id,title,description,asking_price,suburb,city,listing_status,is_active,bridge_listing_public_url,property24_listing_url,private_property_listing_url,updated_at').eq('organisation_id',org).eq('id',id).maybeSingle();
        if(listing.error||!listing.data) return null;
        const publication=await actor.userDb.from('listing_publication_data').select('title,description,asking_price,suburb,updated_at').eq('listing_id',id).maybeSingle();
        if(publication.error) throw new Error('Saved public listing details could not be loaded.');
        const media=await actor.userDb.from('listing_media').select('id,media_type,file_url,sort_order,is_cover').eq('listing_id',id).eq('media_type','image').order('is_cover',{ascending:false}).order('sort_order').limit(50);
        if(media.error) throw new Error('Listing photos could not be loaded.');
        const saved=publication.data;
        return {listing:{...listing.data,...(saved?{title:saved.title,description:saved.description,asking_price:saved.asking_price,suburb:saved.suburb}:{}),updated_at:`${listing.data.updated_at}:${saved?.updated_at||''}`},media:media.data||[]};
      },
      assertPublishable:async(actor:any,_org:string,id:string)=>{
        const check=await actor.userDb.rpc('assert_seller_onboarding_draft_reviewed',{p_listing_id:id});
        if(check.error) throw new Error(check.error.message||'Review this listing before publishing.');
      },
      downloadMedia:async(token:string,id:string)=>{
        const asset=await graph(token,`${id}`);
        let mediaUrl=new URL(asset.url);
        const allowed=(host:string)=>['facebook.com','fbcdn.net','fbsbx.com'].some(domain=>host===domain||host.endsWith(`.${domain}`));
        let response:Response|undefined;
        for(let redirect=0;redirect<3;redirect++){
          if(mediaUrl.protocol!=='https:'||mediaUrl.username||mediaUrl.password||!allowed(mediaUrl.hostname)) throw new Error('Meta returned an unsupported attachment address.');
          response=await fetch(mediaUrl,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(15000)});
          if(response.status<300||response.status>=400) break;
          const target=response.headers.get('location'); if(!target) throw new Error('Attachment redirect was incomplete.');
          mediaUrl=new URL(target,mediaUrl);
        }
        if(!response?.ok||!response.body) throw new Error('The attachment could not be downloaded.');
        const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
        if(!/^(image\/(jpeg|png|webp|gif)|audio\/(mpeg|ogg|mp4|wav)|video\/mp4|application\/pdf|text\/plain)$/.test(mime)) throw new Error('This attachment format cannot be downloaded from the inbox yet.');
        const reader=response.body.getReader(),chunks:Uint8Array[]=[]; let size=0;
        try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>8*1024*1024)throw new Error('Inbox downloads are limited to 8 MB.');chunks.push(item.value);}}finally{await reader.cancel();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        let binary='';for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));
        return {mimeType:mime,base64:btoa(binary)};
      },
    });
    return new Response(JSON.stringify(await handler(await readMetaIntegrationPayload(req),req.headers.get('authorization')||'')),{headers});
  } catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:'Meta integration request failed.'}),{status:400,headers});}
});
