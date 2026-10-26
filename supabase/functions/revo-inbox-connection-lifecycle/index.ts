import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { requireInboxMailbox } from "../_shared/sharedInboxAccess.ts";
import { receivingClient, receivingCors, receivingJson, queueReceiving } from "../_shared/inboxReceiving.ts";
Deno.serve(withApiCredentials(async req => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:receivingCors});
  if(req.method!=="POST") return receivingJson(405,{error:"method_not_allowed"});
  try {
    const body=await req.json(), db=receivingClient(), organisationId=String(body.organisationId||""), connectionId=String(body.connectionId||"");
    if(!["disconnect","health_check"].includes(body.action)) return receivingJson(400,{error:"Choose a mailbox action."});
    const result=await db.from("revo_inbox_provider_connections").select("id,channel_id").eq("id",connectionId).eq("organisation_id",organisationId).maybeSingle();
    if(result.error || !result.data) return receivingJson(404,{error:"Mailbox connection was not found."});
    const actor=await requireInboxMailbox(req,db,organisationId,result.data.channel_id);
    if(body.action==="health_check") return receivingJson(202,await queueReceiving(req,organisationId,connectionId));
    const disconnected=await db.rpc("shared_inbox_disconnect_mailbox",{p_organisation_id:organisationId,p_connection_id:connectionId,p_actor:actor});
    if(disconnected.error) throw new Error("disconnect_failed");
    return receivingJson(200,{status:"disconnected"});
  } catch { return receivingJson(400,{error:"Mailbox action failed. Check your access and retry."}); }
}));
