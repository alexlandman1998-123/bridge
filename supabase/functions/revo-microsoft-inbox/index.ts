import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

const REVO_ORGANISATION_ID = "322c3853-2d82-4413-97e6-b4cd8bc32a7c";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,x-client-info,apikey,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const text = (value: unknown) => String(value ?? "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const now = () => new Date().toISOString();

function serviceClient() {
  const url = text(Deno.env.get("SUPABASE_URL"));
  const key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function callbackUrl() { return `${text(Deno.env.get("SUPABASE_URL")).replace(/\/$/, "")}/functions/v1/revo-microsoft-inbox`; }
function providerConfig() {
  const clientId = text(Deno.env.get("REVO_MICROSOFT_CLIENT_ID"));
  const clientSecret = text(Deno.env.get("REVO_MICROSOFT_CLIENT_SECRET"));
  const tenant = text(Deno.env.get("REVO_MICROSOFT_TENANT_ID")) || "organizations";
  if (!clientId || !clientSecret) throw new Error("Microsoft 365 connection is not configured yet.");
  return { clientId, clientSecret, tenant };
}
function providerScopes(kind: string) {
  const mailboxScopes = kind === "delegated_shared_mailbox" ? ["Mail.ReadWrite.Shared", "Mail.Send.Shared"] : ["Mail.ReadWrite", "Mail.Send"];
  return ["openid", "profile", "offline_access", ...mailboxScopes].join(" ");
}
function isReturnUrlAllowed(value: string) {
  return /^https:\/\/app\.arch9\.co\.za\/revo\/inbox(?:\/settings)?(?:\?|$)/.test(value) || /^http:\/\/(localhost|127\.0\.0\.1):\d+\/revo\/inbox(?:\/settings)?(?:\?|$)/.test(value);
}
function randomUrlSafe(bytes = 32) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
async function sha256(value: string) { const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); return [...digest].map((item) => item.toString(16).padStart(2, "0")).join(""); }
async function pkceChallenge(verifier: string) { const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))); return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""); }

async function requireRevoAdmin(req: Request, db: any, organisationId: string) {
  if (organisationId !== REVO_ORGANISATION_ID) throw new Error("This provider connection is only available for Revo.");
  const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const user = (await db.auth.getUser(bearer)).data.user;
  if (!user) throw new Error("Sign in before connecting a mailbox.");
  const membership = await db.from("organisation_users").select("role,status").eq("organisation_id", organisationId).eq("user_id", user.id).maybeSingle();
  if (!membership.data || membership.data.status !== "active" || !["principal", "owner", "director", "admin", "super_admin", "agency_admin"].includes(text(membership.data.role).toLowerCase())) {
    throw new Error("Revo organisation administrator access is required.");
  }
  return user.id;
}

async function recordEvent(db: any, connection: Record<string, unknown>, actorUserId: string | null, eventType: string, metadata: Record<string, unknown> = {}) {
  await db.from("revo_inbox_connection_events").insert({ organisation_id: connection.organisation_id, connection_id: connection.id, actor_user_id: actorUserId, event_type: eventType, metadata_json: metadata });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = serviceClient();
  if (!db) return json(500, { error: "Server configuration is unavailable." });
  const url = new URL(req.url);
  const code = text(url.searchParams.get("code"));
  const state = text(url.searchParams.get("state"));

  if (req.method === "GET" && state) {
    const stateHash = await sha256(state);
    const stateResult = await db.from("revo_inbox_oauth_states").select("*").eq("state_hash", stateHash).eq("provider_key", "microsoft_365").is("consumed_at", null).gt("expires_at", now()).maybeSingle();
    const stateRow = stateResult.data;
    if (!stateRow) return json(400, { error: "Microsoft connection state is invalid or expired." });
    const claimed = await db.from("revo_inbox_oauth_states").update({ consumed_at: now() }).eq("state_hash", stateHash).eq("provider_key", "microsoft_365").is("consumed_at", null).select("state_hash").maybeSingle();
    if (!claimed.data) return json(400, { error: "Microsoft connection has already been completed or expired." });
    const connectionResult = await db.from("revo_inbox_provider_connections").select("*").eq("id", stateRow.connection_id).eq("organisation_id", REVO_ORGANISATION_ID).maybeSingle();
    const connection = connectionResult.data;
    if (!connection) return json(404, { error: "Mailbox connection was not found." });
    const providerError = text(url.searchParams.get("error"));
    if (providerError || !code) {
      await db.from("revo_inbox_provider_connections").update({ status: "error", last_error_code: providerError || "authorization_cancelled" }).eq("id", connection.id);
      await recordEvent(db, connection, stateRow.requested_by, "authorization_failed", { code: providerError || "authorization_cancelled" });
      return Response.redirect(`${stateRow.return_url}${stateRow.return_url.includes("?") ? "&" : "?"}microsoft_connection=failed`, 302);
    }
    try {
      const config = providerConfig();
      const tokenRequest = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", code, redirect_uri: callbackUrl(), code_verifier: stateRow.code_verifier, scope: providerScopes(connection.connection_kind) });
      const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenRequest });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || !text(token.access_token) || !text(token.refresh_token)) throw new Error("token_exchange_failed");
      const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", { headers: { authorization: `Bearer ${token.access_token}` } });
      const graphAccount = await graphResponse.json();
      if (!graphResponse.ok || !text(graphAccount.id)) throw new Error("graph_account_verification_failed");
      if (connection.connection_kind === "delegated_shared_mailbox") {
        const sharedResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(connection.mailbox_address)}/mailFolders/inbox?$select=id`, { headers: { authorization: `Bearer ${token.access_token}` } });
        if (!sharedResponse.ok) throw new Error("shared_mailbox_verification_failed");
      }
      const vaultResult = await db.rpc("revo_store_inbox_connection_credential", { p_connection_id: connection.id, p_secret: { provider: "microsoft_365", access_token: token.access_token, refresh_token: token.refresh_token, expires_in: Number(token.expires_in || 0), token_type: text(token.token_type), scope: text(token.scope) } });
      if (vaultResult.error) throw new Error("credential_storage_failed");
      const update = await db.from("revo_inbox_provider_connections").update({ status: "connected", provider_account_id: text(graphAccount.id), granted_scopes: text(token.scope).split(/\s+/).filter(Boolean), connected_by: stateRow.requested_by, connected_at: now(), last_verified_at: now(), last_error_code: null, disconnected_at: null, disconnected_by: null }).eq("id", connection.id);
      if (update.error) throw new Error("connection_update_failed");
      await recordEvent(db, connection, stateRow.requested_by, "authorization_completed", { providerAccountId: text(graphAccount.id), connectionKind: connection.connection_kind });
      return Response.redirect(`${stateRow.return_url}${stateRow.return_url.includes("?") ? "&" : "?"}microsoft_connection=connected`, 302);
    } catch (error) {
      const code = error instanceof Error ? error.message.replace(/[^a-z0-9_]/gi, "_").slice(0, 120) : "authorization_failed";
      await db.from("revo_inbox_provider_connections").update({ status: "error", last_error_code: code }).eq("id", connection.id);
      await recordEvent(db, connection, stateRow.requested_by, "authorization_failed", { code });
      return Response.redirect(`${stateRow.return_url}${stateRow.return_url.includes("?") ? "&" : "?"}microsoft_connection=failed`, 302);
    }
  }

  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const body = await req.json();
    if (text(body.action) !== "start_authorization") return json(400, { error: "Unsupported action." });
    const organisationId = text(body.organisationId);
    const actorUserId = await requireRevoAdmin(req, db, organisationId);
    const channelId = text(body.channelId);
    const mailboxAddress = text(body.mailboxAddress).toLowerCase();
    const connectionKind = text(body.connectionKind);
    const returnUrl = text(body.returnUrl);
    if (!channelId || !mailboxAddress || !["individual_mailbox", "delegated_shared_mailbox"].includes(connectionKind) || !isReturnUrlAllowed(returnUrl)) return json(400, { error: "The Microsoft connection request is incomplete." });
    const config = providerConfig();
    const channel = await db.from("revo_inbox_channels").select("id,organisation_id,provider_key,address").eq("id", channelId).eq("organisation_id", organisationId).eq("provider_key", "microsoft_365").maybeSingle();
    if (!channel.data) return json(404, { error: "Choose a Revo Microsoft 365 channel before connecting it." });
    const existing = await db.from("revo_inbox_provider_connections").select("*").eq("channel_id", channelId).maybeSingle();
    if (existing.data?.status === "connected") return json(409, { error: "This mailbox is already connected. Disconnect it before reconnecting." });
    const connectionPayload = { organisation_id: organisationId, channel_id: channelId, provider_key: "microsoft_365", connection_kind: connectionKind, mailbox_address: mailboxAddress, status: "authorizing", granted_scopes: [], connected_by: null, connected_at: null, last_error_code: null, disconnected_at: null, disconnected_by: null };
    const connectionResult = existing.data ? await db.from("revo_inbox_provider_connections").update(connectionPayload).eq("id", existing.data.id).select("*").single() : await db.from("revo_inbox_provider_connections").insert(connectionPayload).select("*").single();
    if (connectionResult.error || !connectionResult.data) throw new Error("Unable to prepare the Microsoft mailbox connection.");
    const rawState = randomUrlSafe(48), verifier = randomUrlSafe(64), challenge = await pkceChallenge(verifier);
    await db.from("revo_inbox_oauth_states").insert({ state_hash: await sha256(rawState), organisation_id: organisationId, connection_id: connectionResult.data.id, requested_by: actorUserId, provider_key: "microsoft_365", return_url: returnUrl, code_verifier: verifier, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    await recordEvent(db, connectionResult.data, actorUserId, "authorization_started", { connectionKind });
    const authorization = new URLSearchParams({ client_id: config.clientId, response_type: "code", redirect_uri: callbackUrl(), response_mode: "query", scope: providerScopes(connectionKind), state: rawState, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
    return json(200, { authorizationUrl: `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize?${authorization}` });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Unable to begin the Microsoft mailbox connection." });
  }
});
