import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type RecordValue = Record<string, unknown>;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const email = (value: unknown) => text(value).toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const response = (status: number, body: RecordValue) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const token = () => crypto.getRandomValues(new Uint8Array(32)).reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "");
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function snapshot(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return response(405, { success: false, error: "Method not allowed." });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !serviceKey || !anonKey) return response(500, { success: false, error: "Signing service is not configured." });
  const body = await req.json().catch(() => ({})) as RecordValue;
  const action = text(body.action).toLowerCase();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (action === "issue") {
    const authorization = req.headers.get("Authorization") || "";
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return response(401, { success: false, error: "Sign in to send a mandate signing link." });
    const listingId = text(body.listingId);
    const { data: listing, error: listingError } = await caller.from("private_listings").select("id, organisation_id").eq("id", listingId).maybeSingle();
    if (listingError || !listing) return response(403, { success: false, error: "You do not have access to this listing." });
    const signerEmail = email(body.signerEmail);
    const signerName = text(body.signerName);
    if (!validEmail(signerEmail) || !signerName) return response(400, { success: false, error: "A seller name and valid email are required." });
    const rawToken = token();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("private_listing_mandate_signing_sessions").update({ status: "revoked", updated_at: now.toISOString() }).eq("private_listing_id", listing.id).eq("status", "active");
    const { data: session, error: sessionError } = await admin.from("private_listing_mandate_signing_sessions").insert({
      organisation_id: listing.organisation_id, private_listing_id: listing.id, signer_email: signerEmail, signer_name: signerName,
      token_hash: await hash(rawToken), expires_at: expiresAt, mandate_snapshot: snapshot(body.mandateSnapshot), created_by: userData.user.id,
    }).select("id, expires_at").single();
    if (sessionError || !session) return response(500, { success: false, error: "Unable to create the signing link." });
    const appUrl = (Deno.env.get("APP_URL") || "https://app.arch9.co.za").replace(/\/$/, "");
    const signingLink = `${appUrl}/mandate-sign/${rawToken}`;
    const agentName = text(body.agentName) || "Your agent";
    const mail = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-email`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ type: "seller_mandate_sent", to: signerEmail, organisationId: listing.organisation_id, recipientRole: "seller", recipientName: signerName, sellerName: signerName, propertyTitle: text(snapshot(body.mandateSnapshot).propertyAddress) || "your property", mandateType: "Exclusive mandate", askingPrice: text(snapshot(body.mandateSnapshot).askingPrice), portalLink: signingLink, agentName }),
    });
    if (!mail.ok) return response(502, { success: false, error: "The signing link was created but the email could not be sent. Please try again." });
    await admin.from("private_listings").update({ mandate_status: "sent_to_seller", listing_status: "mandate_sent" }).eq("id", listing.id);
    return response(200, { success: true, signingLink, expiresAt: session.expires_at });
  }

  const rawToken = text(body.token);
  if (!rawToken) return response(400, { success: false, error: "Signing link is missing." });
  const { data: session, error: sessionError } = await admin.from("private_listing_mandate_signing_sessions").select("*").eq("token_hash", await hash(rawToken)).maybeSingle();
  if (sessionError || !session) return response(404, { success: false, error: "This signing link is invalid." });
  if (session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session.status === "active") await admin.from("private_listing_mandate_signing_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
    return response(410, { success: false, error: "This signing link has expired or has already been used." });
  }
  if (action === "resolve") {
    await admin.from("private_listing_mandate_signing_sessions").update({ viewed_at: session.viewed_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
    return response(200, { success: true, session: { signerName: session.signer_name, expiresAt: session.expires_at, mandate: session.mandate_snapshot } });
  }
  if (action !== "sign") return response(400, { success: false, error: "Unknown signing action." });
  const signedName = text(body.signedName);
  const signature = text(body.signature);
  const accepted = body.accepted === true;
  if (!accepted || !signedName || !signature) return response(400, { success: false, error: "Accept the mandate and provide your signature before submitting." });
  const signedAt = new Date().toISOString();
  const { data: completed, error: completeError } = await admin.from("private_listing_mandate_signing_sessions").update({ status: "signed", signed_at: signedAt, used_at: signedAt, signed_name: signedName, signature, acceptance_ip: text(req.headers.get("x-forwarded-for")).split(",")[0] || null, acceptance_user_agent: text(req.headers.get("user-agent")) || null, updated_at: signedAt }).eq("id", session.id).eq("status", "active").select().maybeSingle();
  if (completeError || !completed) return response(409, { success: false, error: "This signing link has already been used." });
  const mandate = snapshot(session.mandate_snapshot);
  const signedHtml = `<article><h1>Exclusive mandate</h1><p>Property: ${text(mandate.propertyAddress)}</p><p>Seller: ${text(session.signer_name)}</p><p>Commission: ${text(mandate.commissionPercentage)}% ${text(mandate.vatHandling)}</p><p>Accepted and signed by ${signedName} on ${signedAt}.</p><p>Signature: ${signature}</p></article>`;
  const requirements = await admin.from("private_listing_document_requirements").select("id, requirement_key").eq("private_listing_id", session.private_listing_id);
  const requirement = (requirements.data || []).find((row: RecordValue) => text(row.requirement_key).toLowerCase().includes("mandate"));
  await admin.from("private_listing_documents").insert({ private_listing_id: session.private_listing_id, requirement_id: requirement?.id || null, document_type: "signed_mandate", category: "Mandate", document_name: "Signed exclusive mandate.html", generated_html: signedHtml, generated_file_name: "signed-exclusive-mandate.html", signing_session_id: session.id, status: "completed", visibility: "internal", uploaded_at: signedAt });
  if (requirement?.id) await admin.from("private_listing_document_requirements").update({ status: "completed", updated_at: signedAt }).eq("id", requirement.id);
  await admin.from("private_listings").update({ mandate_status: "signed", listing_status: "mandate_signed" }).eq("id", session.private_listing_id);
  return response(200, { success: true, signedAt });
});
