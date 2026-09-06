import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { contactFromFields, leadFields, RecordValue, text } from "../_shared/metaLeadAds.ts";

const GRAPH_VERSION=text(Deno.env.get("META_GRAPH_VERSION"))||"v23.0";
const APP_ID=text(Deno.env.get("META_APP_ID"))||"1010066162083846";
const LOGIN_CONFIG_ID=text(Deno.env.get("META_LEAD_ADS_LOGIN_CONFIG_ID"));
const CORS={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,x-client-info,apikey,content-type","access-control-allow-methods":"GET,POST,OPTIONS"};
const json=(status:number,body:RecordValue)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"content-type":"application/json"}});
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
async function sha256(value:string){const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return [...b].map(v=>v.toString(16).padStart(2,"0")).join("");}
function serviceClient(){const u=text(Deno.env.get("SUPABASE_URL")),k=text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));return u&&k?createClient(u,k,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
function callbackUrl(){return `${text(Deno.env.get("SUPABASE_URL")).replace(/\/$/,"")}/functions/v1/meta-lead-ads-admin`;}
async function encrypt(token:string){const kb=Uint8Array.from(atob(text(Deno.env.get("META_TOKEN_ENCRYPTION_KEY"))),c=>c.charCodeAt(0));if(kb.length!==32)throw new Error("Meta token encryption is not configured.");const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey("raw",kb,"AES-GCM",false,["encrypt"]);const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(token)));return `${base64(iv)}.${base64(cipher)}`;}
async function decrypt(ciphertext:string){const kb=Uint8Array.from(atob(text(Deno.env.get("META_TOKEN_ENCRYPTION_KEY"))),c=>c.charCodeAt(0)),[a,b]=ciphertext.split(".");const key=await crypto.subtle.importKey("raw",kb,"AES-GCM",false,["decrypt"]);return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:Uint8Array.from(atob(a),c=>c.charCodeAt(0))},key,Uint8Array.from(atob(b),c=>c.charCodeAt(0))));}
async function graph(path:string,token:string,init?:RequestInit){const join=path.includes("?")?"&":"?";const r=await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}${join}access_token=${encodeURIComponent(token)}`,init);const body=await r.json() as RecordValue;if(!r.ok)throw new Error(text((body.error as RecordValue)?.message)||"Meta API request failed.");return body;}
function requestedDate(value:unknown,label:string){const raw=text(value);if(!raw)return null;const date=new Date(raw);if(Number.isNaN(date.getTime()))throw new Error(`${label} must be a valid ISO-8601 date.`);return date;}
function inRange(value:unknown,from:Date|null,to:Date|null){const date=new Date(text(value));if(Number.isNaN(date.getTime()))return false;return (!from||date>=from)&&(!to||date<=to);}
async function actor(req:Request,db:any,organisationId:string){const jwt=text(req.headers.get("authorization")).replace(/^Bearer\s+/i,"");const user=(await db.auth.getUser(jwt)).data.user;if(!user)throw new Error("Unauthenticated.");const member=await db.from("organisation_users").select("role,status").eq("organisation_id",organisationId).eq("user_id",user.id).maybeSingle();if(!member.data||member.data.status!=="active"||!["principal","owner","director","admin","super_admin","developer","agency_admin"].includes(member.data.role))throw new Error("Organisation administrator access required.");return user.id;}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS}); const db=serviceClient();if(!db)return json(500,{error:"Service is not configured."});
  const url=new URL(req.url), code=text(url.searchParams.get("code")), state=text(url.searchParams.get("state"));
  if(req.method==="GET"&&code&&state){
    const stateHash=await sha256(state), stateRow=await db.from("meta_lead_ads_oauth_states").select("*").eq("state_hash",stateHash).is("consumed_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
    if(!stateRow.data)return json(400,{error:"OAuth state is invalid or expired."});
    await db.from("meta_lead_ads_oauth_states").update({consumed_at:new Date().toISOString()}).eq("state_hash",stateHash);
    const params=new URLSearchParams({client_id:APP_ID,client_secret:text(Deno.env.get("META_APP_SECRET")),redirect_uri:callbackUrl(),code});
    const tokenResponse=await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`),tokenBody=await tokenResponse.json() as RecordValue;
    if(!tokenResponse.ok)return json(400,{error:"Meta authorisation failed."});
    const encrypted=await encrypt(text(tokenBody.access_token));
    await db.from("meta_lead_ads_oauth_states").update({token_ciphertext:encrypted}).eq("state_hash",stateHash);
    return Response.redirect(`${stateRow.data.return_url}${stateRow.data.return_url.includes("?")?"&":"?"}meta_authorized=1&state=${encodeURIComponent(state)}`,302);
  }
  if(req.method!=="POST")return json(405,{error:"Method not allowed."});
  let body:RecordValue;try{body=await req.json();}catch{return json(400,{error:"Invalid JSON."});}const action=text(body.action),org=text(body.organisationId);let userId:string;
  try{userId=await actor(req,db,org);}catch(error){return json(403,{error:error instanceof Error?error.message:"Forbidden."});}
  try{
    if(action==="start_authorization"){
      const raw=base64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g,""),returnUrl=text(body.returnUrl);if(!/^https:\/\/app\.arch9\.co\.za(?:\/|$)/.test(returnUrl)&&!/^http:\/\/localhost:\d+(?:\/|$)/.test(returnUrl))return json(400,{error:"Invalid return URL."});
      if(!LOGIN_CONFIG_ID)return json(500,{error:"Meta Lead Ads login configuration is not configured."});
      await db.from("meta_lead_ads_oauth_states").insert({state_hash:await sha256(raw),organisation_id:org,requested_by:userId,return_url:returnUrl,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
      const q=new URLSearchParams({client_id:APP_ID,redirect_uri:callbackUrl(),state:raw,response_type:"code",config_id:LOGIN_CONFIG_ID});return json(200,{authorizationUrl:`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${q}`});
    }
    if(action==="list"){
      const rows=await db.from("meta_lead_ads_connections").select("id,page_id,page_name,business_id,connection_status,last_error_message,last_checked_at,connected_at").eq("organisation_id",org);return json(200,{connections:rows.data||[]});
    }
    if(action==="complete_authorization"||action==="connect_page"){
      const rawState=text(body.state),stateRow=(await db.from("meta_lead_ads_oauth_states").select("*").eq("state_hash",await sha256(rawState)).eq("organisation_id",org).eq("requested_by",userId).not("consumed_at","is",null).gt("expires_at",new Date().toISOString()).maybeSingle()).data;
      if(!stateRow?.token_ciphertext)return json(400,{error:"Authorisation session is invalid or expired."});
      const userToken=await decrypt(stateRow.token_ciphertext),pagesBody=await graph("me/accounts?fields=id,name,access_token,tasks&limit=200",userToken),pages=Array.isArray(pagesBody.data)?pagesBody.data as RecordValue[]:[];
      if(action==="complete_authorization")return json(200,{pages:pages.map(p=>({id:p.id,name:p.name,tasks:p.tasks}))});
      const page=pages.find(p=>text(p.id)===text(body.pageId));if(!page||!text(page.access_token))return json(400,{error:"Selected Page is not available to this Meta account."});
      const saved=await db.from("meta_lead_ads_connections").upsert({organisation_id:org,page_id:text(page.id),page_name:text(page.name),token_ciphertext:await encrypt(text(page.access_token)),connection_status:"connected",connected_by:userId,connected_at:new Date().toISOString(),disconnected_at:null,last_error_message:null},{onConflict:"organisation_id,page_id"}).select("id,page_id,page_name,connection_status").single();
      if(saved.error)throw new Error(saved.error.message);await db.from("meta_lead_ads_oauth_states").update({token_ciphertext:null}).eq("state_hash",stateRow.state_hash);return json(200,{connection:saved.data});
    }
    const connectionId=text(body.connectionId),row=(await db.from("meta_lead_ads_connections").select("*").eq("id",connectionId).eq("organisation_id",org).maybeSingle()).data;if(!row)return json(404,{error:"Connection not found."});
    if(action==="preview_import"){
      const formId=text(body.formId),mapping=(await db.from("meta_lead_ads_forms").select("id,form_id,form_name,page_id,lead_type,is_active").eq("connection_id",row.id).eq("organisation_id",org).eq("form_id",formId).eq("is_active",true).maybeSingle()).data;
      if(!mapping||text(mapping.page_id)!==text(row.page_id))return json(404,{error:"An enabled form mapping for this Page is required before previewing an import."});
      const requestedFrom=requestedDate(body.requestedFrom,"Start date"),requestedTo=requestedDate(body.requestedTo,"End date");
      if(requestedFrom&&requestedTo&&requestedFrom>requestedTo)return json(400,{error:"Start date must be before end date."});
      const current=(await db.from("meta_lead_ads_imports").select("id,status").eq("organisation_id",org).eq("form_mapping_id",mapping.id).in("status",["previewing","ready","importing","paused"]).maybeSingle()).data;
      if(current&&["importing","paused"].includes(text(current.status)))return json(409,{error:"This form already has an import in progress. Resume or complete it before creating another preview."});
      const token=await decrypt(row.token_ciphertext),response=await graph(`${mapping.form_id}/leads?fields=id,created_time&limit=100`,token),leads=Array.isArray(response.data)?response.data as RecordValue[]:[];
      const scoped=leads.filter(lead=>text(lead.id)&&inRange(lead.created_time,requestedFrom,requestedTo));
      const leadIds=scoped.map(lead=>text(lead.id)),references=leadIds.map(id=>`meta-leadgen:${id}`);
      const existingLeads=references.length?(await db.from("leads").select("source_reference_id").eq("organisation_id",org).in("source_reference_id",references)).data||[]:[];
      const existingEvents=leadIds.length?(await db.from("meta_lead_ads_events").select("leadgen_id").eq("organisation_id",org).in("leadgen_id",leadIds)).data||[]:[];
      const known=new Set([...existingLeads.map((lead:RecordValue)=>text(lead.source_reference_id).replace(/^meta-leadgen:/,"")),...existingEvents.map((event:RecordValue)=>text(event.leadgen_id))]);
      const duplicateCount=scoped.filter(lead=>known.has(text(lead.id))).length, newCount=scoped.length-duplicateCount;
      const paging=response.paging&&typeof response.paging==="object"?response.paging as RecordValue:{},cursors=paging.cursors&&typeof paging.cursors==="object"?paging.cursors as RecordValue:{};
      const previewComplete=!text(paging.next),metadata={preview:{sample_limit:100,complete:previewComplete,next_after:text(cursors.after)||null,returned_count:leads.length,matched_count:scoped.length,previewed_at:new Date().toISOString()}};
      const values={organisation_id:org,connection_id:row.id,form_mapping_id:mapping.id,page_id:row.page_id,form_id:mapping.form_id,requested_from:requestedFrom?.toISOString()||null,requested_to:requestedTo?.toISOString()||null,status:"ready",next_cursor:null,discovered_count:0,imported_count:0,duplicate_count:0,invalid_count:0,failed_count:0,suppress_notifications:true,requested_by:userId,started_at:null,completed_at:null,last_error_message:null,metadata_json:metadata};
      const saved=current?await db.from("meta_lead_ads_imports").update(values).eq("id",current.id).select("id,status,discovered_count,duplicate_count").single():await db.from("meta_lead_ads_imports").insert(values).select("id,status,discovered_count,duplicate_count").single();
      if(saved.error)throw new Error(saved.error.message);
      return json(200,{import:{id:saved.data.id,status:saved.data.status,formId:mapping.form_id,formName:mapping.form_name,leadType:text(mapping.lead_type)||"buyer",requestedFrom:requestedFrom?.toISOString()||null,requestedTo:requestedTo?.toISOString()||null,previewed:scoped.length,newLeads:newCount,duplicates:duplicateCount,complete:previewComplete,hasMore:!previewComplete}});
    }
    if(action==="process_import_batch"){
      const importId=text(body.importId),job=(await db.from("meta_lead_ads_imports").select("*").eq("id",importId).eq("organisation_id",org).eq("connection_id",row.id).maybeSingle()).data;
      if(!job)return json(404,{error:"Import job not found."});
      if(!["ready","paused"].includes(text(job.status)))return json(409,{error:"Import job is not ready to process."});
      const claim=await db.from("meta_lead_ads_imports").update({status:"importing",started_at:job.started_at||new Date().toISOString(),last_error_message:null}).eq("id",job.id).in("status",["ready","paused"]).select("*").maybeSingle();
      if(claim.error)throw new Error(claim.error.message);if(!claim.data)return json(409,{error:"This import batch is already being processed."});
      const activeJob=claim.data,firstBatch=!job.started_at,mapping=(await db.from("meta_lead_ads_forms").select("id,form_id,form_name,page_id,is_active").eq("id",activeJob.form_mapping_id).eq("organisation_id",org).eq("connection_id",row.id).eq("is_active",true).maybeSingle()).data;
      if(!mapping||text(mapping.form_id)!==text(activeJob.form_id)||text(mapping.page_id)!==text(row.page_id)){await db.from("meta_lead_ads_imports").update({status:"failed",last_error_message:"The selected form is no longer enabled for this Page."}).eq("id",activeJob.id);return json(409,{error:"The selected form is no longer enabled for this Page."});}
      let processed=0,duplicates=0,invalid=0,failed=0,nextCursor:string|null=null,complete=false;
      try{
        const token=await decrypt(row.token_ciphertext),after=text(activeJob.next_cursor),path=`${mapping.form_id}/leads?fields=id,created_time,form_id,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name&limit=25${after?`&after=${encodeURIComponent(after)}`:""}`;
        const response=await graph(path,token),items=Array.isArray(response.data)?response.data as RecordValue[]:[],from=activeJob.requested_from?new Date(text(activeJob.requested_from)):null,to=activeJob.requested_to?new Date(text(activeJob.requested_to)):null;
        const candidateIds=items.map(item=>text(item.id)).filter(Boolean),references=candidateIds.map(id=>`meta-leadgen:${id}`);
        const existingLeads=references.length?(await db.from("leads").select("source_reference_id").eq("organisation_id",org).in("source_reference_id",references)).data||[]:[];
        const existingEvents=candidateIds.length?(await db.from("meta_lead_ads_events").select("leadgen_id").eq("organisation_id",org).in("leadgen_id",candidateIds)).data||[]:[];
        const known=new Set([...existingLeads.map((lead:RecordValue)=>text(lead.source_reference_id).replace(/^meta-leadgen:/,"")),...existingEvents.map((event:RecordValue)=>text(event.leadgen_id))]);
        for(const detail of items){
          const leadgenId=text(detail.id),createdAt=text(detail.created_time);if(!leadgenId||!createdAt||!inRange(createdAt,from,to)){if(leadgenId&&!createdAt){invalid++;await db.from("meta_lead_ads_events").upsert({leadgen_id:leadgenId,organisation_id:org,connection_id:row.id,form_mapping_id:mapping.id,page_id:row.page_id,form_id:mapping.form_id,import_id:activeJob.id,ingestion_source:"historical",status:"ignored",attempts:1,payload_json:{id:leadgenId},error_message:"Meta lead has no valid submission time."},{onConflict:"leadgen_id",ignoreDuplicates:true});}continue;}
          if(known.has(leadgenId)){duplicates++;await db.from("meta_lead_ads_events").upsert({leadgen_id:leadgenId,organisation_id:org,connection_id:row.id,form_mapping_id:mapping.id,page_id:row.page_id,form_id:mapping.form_id,import_id:activeJob.id,ingestion_source:"historical",meta_created_at:createdAt,status:"duplicate",attempts:1,payload_json:{id:leadgenId,created_time:createdAt}},{onConflict:"leadgen_id",ignoreDuplicates:true});continue;}
          try{
            const fields=leadFields(detail.field_data),contact=contactFromFields(fields),ingested=await db.rpc("meta_ingest_lead_ad",{p_leadgen_id:leadgenId,p_organisation_id:org,p_page_id:row.page_id,p_form_id:mapping.form_id,p_full_name:contact.fullName,p_email:contact.email,p_phone:contact.phone,p_payload:{...detail,normalized_fields:fields},p_ingestion_source:"historical",p_meta_created_at:createdAt,p_import_id:activeJob.id});
            if(ingested.error)throw new Error(ingested.error.message);
            const event=await db.from("meta_lead_ads_events").upsert({leadgen_id:leadgenId,organisation_id:org,connection_id:row.id,form_mapping_id:mapping.id,page_id:row.page_id,form_id:mapping.form_id,crm_lead_id:ingested.data,import_id:activeJob.id,ingestion_source:"historical",meta_created_at:createdAt,status:"processed",attempts:1,payload_json:detail,processed_at:new Date().toISOString(),error_message:null},{onConflict:"leadgen_id",ignoreDuplicates:true});if(event.error)throw new Error(event.error.message);processed++;
          }catch(error){failed++;const message=error instanceof Error?error.message:"Historical lead processing failed.";await db.from("meta_lead_ads_events").upsert({leadgen_id:leadgenId,organisation_id:org,connection_id:row.id,form_mapping_id:mapping.id,page_id:row.page_id,form_id:mapping.form_id,import_id:activeJob.id,ingestion_source:"historical",meta_created_at:createdAt,status:"failed",attempts:1,payload_json:detail,error_message:message},{onConflict:"leadgen_id",ignoreDuplicates:true});}
        }
        const paging=response.paging&&typeof response.paging==="object"?response.paging as RecordValue:{},cursors=paging.cursors&&typeof paging.cursors==="object"?paging.cursors as RecordValue:{};nextCursor=text(cursors.after)||null;complete=!text(paging.next);
        const updated=await db.from("meta_lead_ads_imports").update({status:complete?"completed":"paused",next_cursor:complete?null:nextCursor,imported_count:(firstBatch?0:Number(activeJob.imported_count||0))+processed,duplicate_count:(firstBatch?0:Number(activeJob.duplicate_count||0))+duplicates,invalid_count:(firstBatch?0:Number(activeJob.invalid_count||0))+invalid,failed_count:(firstBatch?0:Number(activeJob.failed_count||0))+failed,discovered_count:(firstBatch?0:Number(activeJob.discovered_count||0))+processed+duplicates+invalid+failed,completed_at:complete?new Date().toISOString():null,last_error_message:null}).eq("id",activeJob.id).select("id,status,imported_count,duplicate_count,invalid_count,failed_count,next_cursor").single();if(updated.error)throw new Error(updated.error.message);
        return json(200,{import:{...updated.data,complete,processed,duplicates,invalid,failed,hasMore:!complete}});
      }catch(error){const message=error instanceof Error?error.message:"Historical import batch failed.";const disconnected=/token|oauth|session|permission/i.test(message);await db.from("meta_lead_ads_imports").update({status:"paused",last_error_message:message}).eq("id",activeJob.id);if(disconnected)await db.from("meta_lead_ads_connections").update({connection_status:"error",last_error_message:message,last_checked_at:new Date().toISOString()}).eq("id",row.id);return json(502,{error:message});}
    }
    if(action==="list_forms"){
      const token=await decrypt(row.token_ciphertext),graphForms=(await graph(`${row.page_id}/leadgen_forms?fields=id,name,status&limit=200`,token)).data||[];
      const mappings=(await db.from("meta_lead_ads_forms").select("form_id,branch_id,assigned_agent_id,lead_type,is_active").eq("connection_id",row.id).eq("organisation_id",org)).data||[];
      const byFormId=new Map(mappings.map((mapping:RecordValue)=>[text(mapping.form_id),mapping]));
      return json(200,{forms:(graphForms as RecordValue[]).map((form)=>{const mapping=byFormId.get(text(form.id));return {...form,selected:Boolean(mapping?.is_active),branchId:mapping?.branch_id||null,assignedAgentId:mapping?.assigned_agent_id||null,leadType:text(mapping?.lead_type)||"buyer"};})});
    }
    if(action==="select_forms"){
      const forms=Array.isArray(body.forms)?body.forms as RecordValue[]:[],token=await decrypt(row.token_ciphertext);
      for(const form of forms){
        const branchId=text(form.branchId),agentId=text(form.assignedAgentId),leadType=text(form.leadType)==="seller"?"seller":"buyer";
        if(branchId){const branch=(await db.from("organisation_branches").select("id").eq("id",branchId).eq("organisation_id",org).maybeSingle()).data;if(!branch)throw new Error("Selected branch does not belong to this organisation.");}
        if(agentId){const member=(await db.from("organisation_users").select("user_id").eq("user_id",agentId).eq("organisation_id",org).eq("status","active").maybeSingle()).data;if(!member)throw new Error("Selected agent does not belong to this organisation.");}
        const saved=await db.from("meta_lead_ads_forms").upsert({connection_id:row.id,organisation_id:org,page_id:row.page_id,form_id:text(form.id),form_name:text(form.name),branch_id:branchId||null,assigned_agent_id:agentId||null,lead_type:leadType,is_active:true},{onConflict:"organisation_id,form_id"});if(saved.error)throw new Error(saved.error.message);
      }
      await graph(`${row.page_id}/subscribed_apps`,token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({subscribed_fields:"leadgen"})});return json(200,{connected:true,formsSelected:forms.length});
    }
    if(action==="disconnect"){const token=await decrypt(row.token_ciphertext);await graph(`${row.page_id}/subscribed_apps`,token,{method:"DELETE"}).catch(()=>null);await db.from("meta_lead_ads_connections").update({connection_status:"disconnected",disconnected_at:new Date().toISOString(),token_ciphertext:await encrypt(crypto.randomUUID())}).eq("id",row.id);return json(200,{disconnected:true});}
    return json(400,{error:"Unsupported action."});
  }catch(error){return json(502,{error:error instanceof Error?error.message:"Meta operation failed."});}
});
