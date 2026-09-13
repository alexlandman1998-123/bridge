import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

const REVO_ORGANISATION_ID = "322c3853-2d82-4413-97e6-b4cd8bc32a7c";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,x-client-info,apikey,content-type", "access-control-allow-methods": "POST,OPTIONS" };
const text = (value: unknown) => String(value ?? "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const now = () => new Date().toISOString();

function serviceClient() {
  const url = text(Deno.env.get("SUPABASE_URL"));
  const key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
function microsoftConfig() {
  const clientId = text(Deno.env.get("REVO_MICROSOFT_CLIENT_ID"));
  const clientSecret = text(Deno.env.get("REVO_MICROSOFT_CLIENT_SECRET"));
  const tenant = text(Deno.env.get("REVO_MICROSOFT_TENANT_ID")) || "organizations";
  if (!clientId || !clientSecret) throw new Error("Microsoft 365 connection is not configured yet.");
  return { clientId, clientSecret, tenant };
}
function googleConfig() {
  const clientId = text(Deno.env.get("REVO_GOOGLE_CLIENT_ID"));
  const clientSecret = text(Deno.env.get("REVO_GOOGLE_CLIENT_SECRET"));
  if (!clientId || !clientSecret) throw new Error("Google Workspace connection is not configured yet.");
  return { clientId, clientSecret };
}
function microsoftScopes(kind: string) { return ["openid", "profile", "offline_access", ...(kind === "delegated_shared_mailbox" ? ["Mail.ReadWrite.Shared", "Mail.Send.Shared"] : ["Mail.ReadWrite", "Mail.Send"])].join(" "); }
function safeCode(error: unknown) { return error instanceof Error ? error.message.replace(/[^a-z0-9_]/gi, "_").slice(0, 120) : "connection_check_failed"; }

async function requireRevoAdmin(req: Request, db: any, organisationId: string) {
  if (organisationId !== REVO_ORGANISATION_ID) throw new Error("This provider connection is only available for Revo.");
  const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const user = (await db.auth.getUser(bearer)).data.user;
  if (!user) throw new Error("Sign in before managing a mailbox connection.");
  const membership = await db.from("organisation_users").select("role,status").eq("organisation_id", organisationId).eq("user_id", user.id).maybeSingle();
  if (!membership.data || membership.data.status !== "active" || !["principal", "owner", "director", "admin", "super_admin", "agency_admin"].includes(text(membership.data.role).toLowerCase())) throw new Error("Revo organisation administrator access is required.");
  return user.id;
}
async function recordEvent(db: any, connection: Record<string, unknown>, actorUserId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await db.from("revo_inbox_connection_events").insert({ organisation_id: connection.organisation_id, connection_id: connection.id, actor_user_id: actorUserId, event_type: eventType, metadata_json: metadata });
}
async function refreshMicrosoft(connection: any, credential: any) {
  const config = microsoftConfig();
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: text(credential.refresh_token), scope: microsoftScopes(text(connection.connection_kind)) });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const token = await response.json();
  if (!response.ok || !text(token.access_token) || !text(token.refresh_token)) throw new Error("microsoft_refresh_failed");
  return { provider: "microsoft_365", access_token: token.access_token, refresh_token: token.refresh_token, expires_in: Number(token.expires_in || 0), token_type: text(token.token_type), scope: text(token.scope) };
}
async function refreshGoogle(credential: any) {
  const config = googleConfig();
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: text(credential.refresh_token) });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const token = await response.json();
  if (!response.ok || !text(token.access_token)) throw new Error("google_refresh_failed");
  return { provider: "google_workspace", access_token: token.access_token, refresh_token: text(token.refresh_token) || text(credential.refresh_token), expires_in: Number(token.expires_in || 0), token_type: text(token.token_type), scope: text(token.scope) || text(credential.scope) };
}
async function verifyMailbox(connection: any, accessToken: string) {
  if (connection.provider_key === "microsoft_365") {
    const account = await fetch("https://graph.microsoft.com/v1.0/me?$select=id", { headers: { authorization: `Bearer ${accessToken}` } });
    if (!account.ok) throw new Error("microsoft_health_check_failed");
    if (connection.connection_kind === "delegated_shared_mailbox") {
      const mailbox = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(connection.mailbox_address)}/mailFolders/inbox?$select=id`, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!mailbox.ok) throw new Error("microsoft_shared_mailbox_check_failed");
    }
    return;
  }
  const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!profile.ok) throw new Error("google_health_check_failed");
  if (connection.connection_kind === "delegated_shared_mailbox") {
    const mailbox = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(connection.mailbox_address)}/profile`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!mailbox.ok) throw new Error("google_delegated_mailbox_check_failed");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const db = serviceClient();
  if (!db) return json(500, { error: "Server configuration is unavailable." });
  let activeConnection: any = null;
  let lifecycleAction = "";
  let activeActorUserId = "";
  try {
    const body = await req.json();
    const organisationId = text(body.organisationId);
    const actorUserId = await requireRevoAdmin(req, db, organisationId);
    const action = text(body.action);
    lifecycleAction = action;
    const connectionId = text(body.connectionId);
    if (!connectionId || !["health_check", "disconnect"].includes(action)) return json(400, { error: "Choose a connection and lifecycle action." });
    const result = await db.from("revo_inbox_provider_connections").select("*").eq("id", connectionId).eq("organisation_id", organisationId).maybeSingle();
    const connection = result.data;
    if (!connection || !["microsoft_365", "google_workspace"].includes(connection.provider_key)) return json(404, { error: "Mailbox connection was not found." });
    activeConnection = connection;
    activeActorUserId = actorUserId;
    if (action === "disconnect") {
      const credentialResult = await db.rpc("revo_read_inbox_connection_credential", { p_connection_id: connection.id });
      const credential = credentialResult.data || {};
      if (connection.provider_key === "google_workspace" && text(credential.refresh_token)) {
        await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: text(credential.refresh_token) }) });
      }
      const cleared = await db.rpc("revo_clear_inbox_connection_credential", { p_connection_id: connection.id });
      if (cleared.error) throw new Error("credential_clear_failed");
      const update = await db.from("revo_inbox_provider_connections").update({ status: "disconnected", disconnected_at: now(), disconnected_by: actorUserId, last_error_code: null }).eq("id", connection.id);
      if (update.error) throw new Error("disconnect_update_failed");
      await recordEvent(db, connection, actorUserId, "disconnected", { providerRevocationRequested: connection.provider_key === "google_workspace" });
      return json(200, { status: "disconnected" });
    }
    if (connection.status !== "connected") return json(409, { error: "Only a connected mailbox can be health checked." });
    const credentialResult = await db.rpc("revo_read_inbox_connection_credential", { p_connection_id: connection.id });
    if (credentialResult.error || !credentialResult.data || !text(credentialResult.data.refresh_token)) throw new Error("credential_unavailable");
    const credential = credentialResult.data;
    const nextCredential = connection.provider_key === "microsoft_365" ? await refreshMicrosoft(connection, credential) : await refreshGoogle(credential);
    const stored = await db.rpc("revo_store_inbox_connection_credential", { p_connection_id: connection.id, p_secret: nextCredential });
    if (stored.error) throw new Error("credential_rotation_failed");
    await verifyMailbox(connection, nextCredential.access_token);
    const update = await db.from("revo_inbox_provider_connections").update({ status: "connected", last_verified_at: now(), last_error_code: null, granted_scopes: text(nextCredential.scope).split(/\s+/).filter(Boolean) }).eq("id", connection.id);
    if (update.error) throw new Error("health_update_failed");
    await recordEvent(db, connection, actorUserId, "token_refreshed", {});
    await recordEvent(db, connection, actorUserId, "health_checked", {});
    return json(200, { status: "connected" });
  } catch (error) {
    const code = safeCode(error);
    if (lifecycleAction === "health_check" && activeConnection) {
      await db.from("revo_inbox_provider_connections").update({ status: "expired", last_error_code: code }).eq("id", activeConnection.id);
      if (activeActorUserId) await recordEvent(db, activeConnection, activeActorUserId, "health_checked", { outcome: "failed", code });
    }
    return json(400, { error: code });
  }
});
