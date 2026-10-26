import { createClient } from "supabase";
import { supabaseServiceKey } from "./apiCredentials.ts";
export const receivingCors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,x-client-info,apikey,content-type", "access-control-allow-methods": "POST,OPTIONS", "cache-control": "no-store" };
export const receivingJson = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...receivingCors, "content-type": "application/json" } });
export function receivingClient(authorization?: string) {
  const url = Deno.env.get("SUPABASE_URL"), key = supabaseServiceKey();
  if (!url || !key) throw new Error("server_unavailable");
  return createClient(url,key,{ auth: {persistSession:false,autoRefreshToken:false}, ...(authorization ? {global:{headers:{Authorization:authorization}}} : {}) });
}
export async function queueReceiving(req: Request, organisationId: string, connectionId: string) {
  if (!req.headers.get("authorization")) throw new Error("Sign in before syncing a mailbox.");
  // The request JWT determines auth.uid() and RLS even though the API key is
  // server-side. The RPC itself checks management of this exact mailbox.
  const result = await receivingClient(req.headers.get("authorization")!).rpc("shared_inbox_request_sync",{p_organisation_id:organisationId,p_connection_id:connectionId});
  if (result.error) throw new Error("Mailbox could not be queued. Check its connection and your access.");
  return result.data;
}
