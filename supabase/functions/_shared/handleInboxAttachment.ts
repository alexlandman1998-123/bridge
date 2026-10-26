import { requireInboxMailbox } from "./sharedInboxAccess.ts";
import { receivingClient, receivingCors, receivingJson } from "./inboxReceiving.ts";
export async function handleInboxAttachment(req: Request, client: () => any = receivingClient): Promise<Response> {
  if(req.method==="OPTIONS") return new Response("ok",{headers:receivingCors});
  if(req.method!=="POST") return receivingJson(405,{error:"method_not_allowed"});
  try {
    const body=await req.json(), db=client();
    const result=await db.from("shared_inbox_attachments").select("organisation_id,channel_id,filename,state,object_path").eq("id",String(body.attachmentId||"")).eq("organisation_id",String(body.organisationId||"")).maybeSingle();
    if(result.error || !result.data) throw new Error("unavailable");
    const file=result.data;
    await requireInboxMailbox(req,db,file.organisation_id,file.channel_id,"read");
    if(file.state!=="available" || !file.object_path) throw new Error("unavailable");
    const download=await db.storage.from("shared-inbox-attachments").download(file.object_path);
    if(download.error || !download.data) throw new Error("unavailable");
    const name=String(file.filename).replace(/[\r\n\x00-\x1f\x7f/\\]/g,"_").slice(0,200)||"attachment";
    return new Response(download.data,{headers:{...receivingCors,"content-type":"application/octet-stream","content-disposition":`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16)}`)}`,"x-content-type-options":"nosniff"}});
  } catch { return receivingJson(404,{error:"Attachment unavailable or mailbox access has changed."}); }
}
