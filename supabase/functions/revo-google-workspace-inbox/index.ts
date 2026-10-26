import { requireInboxMailbox, requireInboxMailboxUser, isInboxReturnUrlAllowed } from "../_shared/sharedInboxAccess.ts";
import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

const PROVIDER_KEY = "google_workspace";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,x-client-info,apikey,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const text = (value: unknown) => String(value ?? "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const now = () => new Date().toISOString();

function serviceClient() {
  const url = text(Deno.env.get("SUPABASE_URL"));
  const key = text(supabaseServiceKey());
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
function callbackUrl() { return `${text(Deno.env.get("SUPABASE_URL")).replace(/\/$/, "")}/functions/v1/revo-google-workspace-inbox`; }
function providerConfig() {
  const clientId = text(Deno.env.get("REVO_GOOGLE_CLIENT_ID"));
  const clientSecret = text(Deno.env.get("REVO_GOOGLE_CLIENT_SECRET"));
  if (!clientId || !clientSecret) throw new Error("Google Workspace connection is not configured yet.");
  return { clientId, clientSecret };
}
function providerScopes() { return ["openid", "email", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"].join(" "); }
function randomUrlSafe(bytes = 32) { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""); }
async function sha256(value: string) { const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); return [...digest].map((item) => item.toString(16).padStart(2, "0")).join(""); }
async function pkceChallenge(verifier: string) { const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))); return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""); }

async function recordEvent(db: any, connection: Record<string, unknown>, actorUserId: string | null, eventType: string, metadata: Record<string, unknown> = {}) {
  await db.from("revo_inbox_connection_events").insert({ organisation_id: connection.organisation_id, connection_id: connection.id, actor_user_id: actorUserId, event_type: eventType, metadata_json: metadata });
}
async function markFailed(db: any, connection: Record<string, unknown>, actorUserId: string | null, code: string) {
  await db.from("revo_inbox_provider_connections").update({ status: "error", last_error_code: code }).eq("id", connection.id).eq("status", "authorizing").eq("updated_at", connection.updated_at);
  await recordEvent(db, connection, actorUserId, "authorization_failed", { code });
}

Deno.serve(withApiCredentials(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = serviceClient();
  if (!db) return json(500, { error: "Server configuration is unavailable." });
  const url = new URL(req.url);
  const code = text(url.searchParams.get("code"));
  const state = text(url.searchParams.get("state"));

  if (req.method === "GET" && state) {
    const stateHash = await sha256(state);
    const stateResult = await db.from("revo_inbox_oauth_states").select("*").eq("state_hash", stateHash).eq("provider_key", PROVIDER_KEY).is("consumed_at", null).gt("expires_at", now()).maybeSingle();
    const stateRow = stateResult.data;
    if (!stateRow) return json(400, { error: "Google connection state is invalid or expired." });
    const claimed = await db.from("revo_inbox_oauth_states").update({ consumed_at: now() }).eq("state_hash", stateHash).eq("provider_key", PROVIDER_KEY).is("consumed_at", null).select("state_hash").maybeSingle();
    if (!claimed.data) return json(400, { error: "Google connection has already been completed or expired." });
    const connectionResult = await db.from("revo_inbox_provider_connections").select("*").eq("id", stateRow.connection_id).eq("organisation_id", stateRow.organisation_id).eq("provider_key", PROVIDER_KEY).maybeSingle();
    const connection = connectionResult.data;
    if (!connection || connection.status !== "authorizing") return json(404, { error: "Mailbox connection was not found." });
    try { await requireInboxMailboxUser(db, stateRow.organisation_id, stateRow.requested_by, connection.channel_id); } catch { return json(403, { error: "Mailbox access is required." }); }
    const providerError = text(url.searchParams.get("error"));
    if (providerError || !code) {
      await markFailed(db, connection, stateRow.requested_by, providerError || "authorization_cancelled");
      return Response.redirect(`${stateRow.return_url}${stateRow.return_url.includes("?") ? "&" : "?"}google_connection=failed`, 302);
    }
    try {
      const config = providerConfig();
      const tokenRequest = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", code, redirect_uri: callbackUrl(), code_verifier: stateRow.code_verifier });
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenRequest });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || !text(token.access_token) || !text(token.refresh_token)) throw new Error("refresh_token_missing");
      const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json();
      if (!profileResponse.ok || !text(profile.emailAddress)) throw new Error("gmail_account_verification_failed");
      if (connection.connection_kind !== "individual_mailbox") throw new Error("google_delegation_unsupported");
      if (text(profile.emailAddress).toLowerCase() !== text(connection.mailbox_address).toLowerCase()) throw new Error("mailbox_identity_mismatch");
      const completed = await db.rpc("shared_inbox_complete_oauth", { p_state_hash: stateHash, p_account: text(profile.emailAddress).toLowerCase(), p_secret: { provider: PROVIDER_KEY, access_token: token.access_token, refresh_token: text(token.refresh_token), expires_at: Date.now() + Number(token.expires_in || 3600) * 1000, expires_in: Number(token.expires_in || 0), token_type: text(token.token_type), scope: text(token.scope) } });
      if (completed.error) throw new Error("authorization_cancelled");
      await recordEvent(db, connection, stateRow.requested_by, "authorization_completed", { providerAccountId: text(profile.emailAddress).toLowerCase(), connectionKind: connection.connection_kind });
      return Response.redirect(`${stateRow.return_url}${stateRow.return_url.includes("?") ? "&" : "?"}google_connection=connected`, 302);
    } catch (error) {
      const failureCode = error instanceof Error ? error.message.replace(/[^a-z0-9_]/gi, "_").slice(0, 120) : "authorization_failed";
      if (failureCode !== "authorization_cancelled") await markFailed(db, connection, stateRow.requested_by, failureCode);
      return Response.redirect(`${stateRow.return_url}${stateRow.return_url.includes("?") ? "&" : "?"}google_connection=failed`, 302);
    }
  }

  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const body = await req.json();
    if (text(body.action) !== "start_authorization") return json(400, { error: "Unsupported action." });
    const organisationId = text(body.organisationId);
    const channelId = text(body.channelId);
    const actorUserId = await requireInboxMailbox(req, db, organisationId, channelId);
    const mailboxAddress = text(body.mailboxAddress).toLowerCase();
    const connectionKind = text(body.connectionKind);
    const returnUrl = text(body.returnUrl);
    if (!channelId || !mailboxAddress || !["individual_mailbox", "delegated_shared_mailbox"].includes(connectionKind) || !isInboxReturnUrlAllowed(returnUrl)) return json(400, { error: "The Google connection request is incomplete." });
    const config = providerConfig();
    const channel = await db.from("revo_inbox_channels").select("id,address").eq("id", channelId).eq("organisation_id", organisationId).eq("provider_key", PROVIDER_KEY).maybeSingle();
    if (!channel.data) return json(404, { error: "Choose a Revo Google Workspace channel before connecting it." });
    if (text(channel.data.address).toLowerCase() !== mailboxAddress) return json(400, { error: "The connection address must match the mailbox address." });
    const existing = await db.from("revo_inbox_provider_connections").select("*").eq("channel_id", channelId).maybeSingle();
    if (existing.data?.status === "connected") return json(409, { error: "This mailbox is already connected. Disconnect it before reconnecting." });
    if (connectionKind !== "individual_mailbox") return json(400, { error: "Connect each Google mailbox with its own account, then share access in Inbox settings." });
    const connectionPayload = { organisation_id: organisationId, channel_id: channelId, provider_key: PROVIDER_KEY, connection_kind: connectionKind, mailbox_address: mailboxAddress, status: "authorizing", granted_scopes: [], connected_by: null, connected_at: null, last_error_code: null, disconnected_at: null, disconnected_by: null };
    const connectionResult = existing.data ? await db.from("revo_inbox_provider_connections").update(connectionPayload).eq("id", existing.data.id).select("*").single() : await db.from("revo_inbox_provider_connections").insert(connectionPayload).select("*").single();
    if (connectionResult.error || !connectionResult.data) throw new Error("Unable to prepare the Google mailbox connection.");
    const rawState = randomUrlSafe(48), verifier = randomUrlSafe(64), challenge = await pkceChallenge(verifier);
    const stateResult = await db.from("revo_inbox_oauth_states").insert({ state_hash: await sha256(rawState), organisation_id: organisationId, connection_id: connectionResult.data.id, requested_by: actorUserId, provider_key: PROVIDER_KEY, return_url: returnUrl, code_verifier: verifier, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    if (stateResult.error) throw new Error("Unable to secure the Google connection request.");
    await recordEvent(db, connectionResult.data, actorUserId, "authorization_started", { connectionKind });
    const authorization = new URLSearchParams({ client_id: config.clientId, response_type: "code", redirect_uri: callbackUrl(), scope: providerScopes(), state: rawState, code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent", include_granted_scopes: "true", login_hint: mailboxAddress });
    return json(200, { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${authorization}` });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Unable to begin the Google mailbox connection." });
  }
}));
