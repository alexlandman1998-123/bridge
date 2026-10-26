import { requireInboxMailbox } from "./sharedInboxAccess.ts";
import { receivingClient, receivingCors, receivingJson } from "./inboxReceiving.ts";
export async function handleImapSetup(req: Request, client: () => any = receivingClient): Promise<Response> {
  if(req.method==="OPTIONS") return new Response("ok",{headers:receivingCors});
  if(req.method!=="POST") return receivingJson(405,{error:"method_not_allowed"});
  try {
    if(Number(req.headers.get("content-length"))>8192) return receivingJson(413,{error:"Settings are too large."});
    const raw=await req.text(); if(raw.length>8192) return receivingJson(413,{error:"Settings are too large."});
    const body=JSON.parse(raw), db=client(), organisationId=String(body.organisationId||""), channelId=String(body.channelId||"");
    const actor=await requireInboxMailbox(req,db,organisationId,channelId);
    const credential={host:String(body.host||"").trim().toLowerCase(),port:993,username:String(body.username||"").trim(),password:String(body.password||"")};
    if(body.port!==undefined && Number(body.port)!==993) return receivingJson(400,{error:"Use secure IMAP on port 993."});
    const result=await db.rpc("shared_inbox_configure_imap",{p_organisation_id:organisationId,p_channel_id:channelId,p_actor:actor,p_credential:credential});
    if(result.error) return receivingJson(400,{error:"Check the mailbox access, server name, username and password."});
    return receivingJson(202,result.data);
  } catch { return receivingJson(400,{error:"IMAP settings could not be saved. Check your mailbox access and settings."}); }
}
