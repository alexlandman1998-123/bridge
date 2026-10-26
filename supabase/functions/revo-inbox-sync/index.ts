import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { queueReceiving, receivingCors, receivingJson } from "../_shared/inboxReceiving.ts";
Deno.serve(withApiCredentials(async req => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:receivingCors});
  if(req.method!=="POST") return receivingJson(405,{error:"method_not_allowed"});
  try {
    const body=await req.json();
    return receivingJson(202,await queueReceiving(req,String(body.organisationId||""),String(body.connectionId||"")));
  } catch { return receivingJson(400,{error:"Mailbox could not be queued. Check its connection and your access."}); }
}));
