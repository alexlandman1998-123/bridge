import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { contactFromFields, hmacValid, leadFields, leadgenChanges, RecordValue, text } from "../_shared/metaLeadAds.ts";

const GRAPH_VERSION = text(Deno.env.get("META_GRAPH_VERSION")) || "v23.0";
const json = (status:number, body:RecordValue) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json"}});

function client() {
  const url=text(Deno.env.get("SUPABASE_URL")), key=text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return url && key ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
}
function bytesFromBase64(value:string) { return Uint8Array.from(atob(value), c=>c.charCodeAt(0)); }
async function decrypt(ciphertext:string) {
  const keyBytes=bytesFromBase64(text(Deno.env.get("META_TOKEN_ENCRYPTION_KEY")));
  if(keyBytes.length!==32) throw new Error("Meta token encryption is not configured.");
  const parts=ciphertext.split("."); if(parts.length!==2) throw new Error("Invalid encrypted Meta token.");
  const key=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["decrypt"]);
  const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytesFromBase64(parts[0])},key,bytesFromBase64(parts[1]));
  return new TextDecoder().decode(clear);
}

Deno.serve(async (req) => {
  if(req.method==="GET") {
    const q=new URL(req.url).searchParams;
    if(text(q.get("hub.mode"))==="subscribe" && text(q.get("hub.verify_token"))===text(Deno.env.get("META_LEAD_ADS_VERIFY_TOKEN")))
      return new Response(text(q.get("hub.challenge")),{status:200});
    return json(403,{error:"Webhook verification failed."});
  }
  if(req.method!=="POST") return json(405,{error:"Method not allowed."});
  const raw=await req.text();
  if(!await hmacValid(raw,text(req.headers.get("x-hub-signature-256")),text(Deno.env.get("META_APP_SECRET"))))
    return json(401,{error:"Invalid webhook signature."});
  let payload:RecordValue; try { payload=JSON.parse(raw); } catch { return json(400,{error:"Invalid webhook JSON."}); }
  const db=client(); if(!db) return json(500,{error:"Webhook storage is not configured."});
  const changes=leadgenChanges(payload); const results:RecordValue[]=[];
  for(const change of changes) {
    const connectionResult=await db.from("meta_lead_ads_connections").select("id,organisation_id,token_ciphertext,connection_status").eq("page_id",change.pageId).maybeSingle();
    const connection=connectionResult.data;
    if(!connection || connection.connection_status!=="connected") { results.push({leadgenId:change.leadgenId,status:"ignored"}); continue; }
    const mappingResult=await db.from("meta_lead_ads_forms").select("id").eq("organisation_id",connection.organisation_id).eq("page_id",change.pageId).eq("form_id",change.formId).eq("is_active",true).maybeSingle();
    if(!mappingResult.data) { results.push({leadgenId:change.leadgenId,status:"ignored"}); continue; }
    const eventInsert=await db.from("meta_lead_ads_events").insert({leadgen_id:change.leadgenId,organisation_id:connection.organisation_id,connection_id:connection.id,form_mapping_id:mappingResult.data.id,page_id:change.pageId,form_id:change.formId,payload_json:change.raw,status:"received",attempts:1}).select("id").single();
    let eventId=text(eventInsert.data?.id);
    if(eventInsert.error?.code==="23505") {
      const existing=(await db.from("meta_lead_ads_events").select("id,status,attempts").eq("leadgen_id",change.leadgenId).maybeSingle()).data;
      if(!existing || existing.status!=="failed") { results.push({leadgenId:change.leadgenId,status:"duplicate"}); continue; }
      eventId=existing.id;
      await db.from("meta_lead_ads_events").update({status:"received",attempts:Number(existing.attempts||0)+1,error_message:null}).eq("id",eventId);
    }
    if(eventInsert.error && eventInsert.error.code!=="23505") return json(500,{error:"Failed to record Meta lead event."});
    try {
      const token=await decrypt(connection.token_ciphertext);
      const response=await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(change.leadgenId)}?fields=id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data&access_token=${encodeURIComponent(token)}`);
      const detail=await response.json() as RecordValue;
      if(!response.ok) throw new Error(text((detail.error as RecordValue)?.message)||"Meta lead retrieval failed.");
      const fields=leadFields(detail.field_data), contact=contactFromFields(fields);
      const ingested=await db.rpc("meta_ingest_lead_ad",{p_leadgen_id:change.leadgenId,p_organisation_id:connection.organisation_id,p_page_id:change.pageId,p_form_id:change.formId,p_full_name:contact.fullName,p_email:contact.email,p_phone:contact.phone,p_payload:{...detail,normalized_fields:fields}});
      if(ingested.error) throw new Error(ingested.error.message);
      await db.from("meta_lead_ads_events").update({status:"processed",crm_lead_id:ingested.data,processed_at:new Date().toISOString(),payload_json:detail,error_message:null}).eq("id",eventId);
      results.push({leadgenId:change.leadgenId,status:"processed"});
    } catch(error) {
      const message=error instanceof Error ? error.message : "Lead processing failed.";
      await db.from("meta_lead_ads_events").update({status:"failed",error_message:message}).eq("id",eventId);
      const authFailure=/token|oauth|session|permission/i.test(message);
      if(authFailure) await db.from("meta_lead_ads_connections").update({connection_status:"error",last_error_message:message,last_checked_at:new Date().toISOString()}).eq("id",connection.id);
      results.push({leadgenId:change.leadgenId,status:"failed"});
    }
  }
  return json(200,{received:true,results});
});
