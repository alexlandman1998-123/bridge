import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type RecordValue = Record<string, unknown>;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const escapeHtml = (value: unknown) => text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
const email = (value: unknown) => text(value).toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const documentKeys = new Set(["disclosure", "fica", "mandate"]);
const response = (status: number, body: RecordValue) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const token = () => crypto.getRandomValues(new Uint8Array(32)).reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "");
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function snapshot(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
async function authorizeListingRequest(req: Request, url: string, anonKey: string, listingId: string) {
  const authorization = req.headers.get("Authorization") || "";
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return { error: response(401, { success: false, error: "Sign in to manage seller document links." }) };
  const { data: listing, error: listingError } = await caller.from("private_listings").select("id, organisation_id").eq("id", listingId).maybeSingle();
  if (listingError || !listing) return { error: response(403, { success: false, error: "You do not have access to this listing." }) };
  return { caller, listing, user: userData.user };
}

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
    const listingId = text(body.listingId);
    const authorizationResult = await authorizeListingRequest(req, url, anonKey, listingId);
    if (authorizationResult.error) return authorizationResult.error;
    const { listing, user } = authorizationResult;
    const signerEmail = email(body.signerEmail);
    const signerName = text(body.signerName);
    if (!validEmail(signerEmail) || !signerName) return response(400, { success: false, error: "A seller name and valid email are required." });
    const selectedDocuments = Array.from(new Set((Array.isArray(body.selectedDocuments) ? body.selectedDocuments : []).map((item) => text(item).toLowerCase()).filter((item) => documentKeys.has(item))));
    if (!selectedDocuments.length) return response(400, { success: false, error: "Choose at least one seller document." });
    const rawToken = token();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("private_listing_mandate_signing_sessions").update({ status: "revoked", updated_at: now.toISOString() }).eq("private_listing_id", listing.id).eq("status", "active");
    const { data: session, error: sessionError } = await admin.from("private_listing_mandate_signing_sessions").insert({
      organisation_id: listing.organisation_id, private_listing_id: listing.id, signer_email: signerEmail, signer_name: signerName,
      token_hash: await hash(rawToken), expires_at: expiresAt, selected_documents: selectedDocuments, mandate_snapshot: snapshot(body.mandateSnapshot), created_by: user.id,
    }).select("id, expires_at").single();
    if (sessionError || !session) return response(500, { success: false, error: "Unable to create the signing link." });
    const appUrl = (Deno.env.get("APP_URL") || "https://app.arch9.co.za").replace(/\/$/, "");
    const signingLink = `${appUrl}/mandate-sign/${rawToken}`;
    const agentName = text(body.agentName) || "Your agent";
    const mail = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-email`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ type: "seller_mandate_sent", to: signerEmail, organisationId: listing.organisation_id, recipientRole: "seller", recipientName: signerName, sellerName: signerName, propertyTitle: text(snapshot(body.mandateSnapshot).propertyAddress) || "your property", mandateType: selectedDocuments.length > 1 ? "Seller documents" : selectedDocuments[0] === "fica" ? "FICA declaration" : selectedDocuments[0] === "disclosure" ? "Property disclosure" : "Exclusive mandate", askingPrice: text(snapshot(body.mandateSnapshot).askingPrice), portalLink: signingLink, agentName }),
    });
    const delivery = mail.ok ? "sent" : "failed";
    if (delivery === "sent" && selectedDocuments.includes("mandate")) await admin.from("private_listings").update({ mandate_status: "sent_to_seller", listing_status: "mandate_sent" }).eq("id", listing.id);
    return response(200, { success: true, delivery, signingLink, expiresAt: session.expires_at });
  }

  if (action === "status" || action === "revoke") {
    const listingId = text(body.listingId);
    const authorizationResult = await authorizeListingRequest(req, url, anonKey, listingId);
    if (authorizationResult.error) return authorizationResult.error;
    const { listing } = authorizationResult;
    if (action === "status") {
      const { data: sessions, error } = await admin.from("private_listing_mandate_signing_sessions")
        .select("id, status, signer_email, signer_name, selected_documents, document_progress, expires_at, viewed_at, signed_at, created_at")
        .eq("private_listing_id", listing.id).order("created_at", { ascending: false }).limit(10);
      if (error) return response(500, { success: false, error: "Unable to load seller document link status." });
      const now = Date.now();
      const normalizedSessions = (sessions || []).map((session: RecordValue) => ({
        ...session,
        status: text(session.status) === "active" && new Date(text(session.expires_at)).getTime() <= now ? "expired" : session.status,
      }));
      return response(200, { success: true, sessions: normalizedSessions });
    }
    const sessionId = text(body.sessionId);
    if (!sessionId) return response(400, { success: false, error: "Choose the document link to revoke." });
    const { data: session, error: sessionError } = await admin.from("private_listing_mandate_signing_sessions")
      .select("id, status").eq("id", sessionId).eq("private_listing_id", listing.id).maybeSingle();
    if (sessionError || !session) return response(404, { success: false, error: "That document link was not found." });
    if (session.status !== "active") return response(409, { success: false, error: "Only an active document link can be revoked." });
    const { error: revokeError } = await admin.from("private_listing_mandate_signing_sessions")
      .update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", session.id).eq("status", "active");
    if (revokeError) return response(500, { success: false, error: "Unable to revoke the document link." });
    return response(200, { success: true });
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
    return response(200, { success: true, session: { signerName: session.signer_name, expiresAt: session.expires_at, selectedDocuments: session.selected_documents, progress: session.document_progress || {}, mandate: session.mandate_snapshot } });
  }
  if (action !== "sign") return response(400, { success: false, error: "Unknown signing action." });
  const documentKey = text(body.documentKey).toLowerCase();
  const selectedDocuments = Array.isArray(session.selected_documents) ? session.selected_documents : ["mandate"];
  if (!documentKeys.has(documentKey) || !selectedDocuments.includes(documentKey)) return response(400, { success: false, error: "That document is not included in this link." });
  const signedName = text(body.signedName);
  const signature = text(body.signature);
  const accepted = body.accepted === true;
  if (!accepted || !signedName || !signature) return response(400, { success: false, error: "Accept the document and provide your signature before submitting." });
  const progress = snapshot(session.document_progress);
  if (progress[documentKey]) return response(409, { success: false, error: "This document has already been signed." });
  const mandate = snapshot(session.mandate_snapshot);
  const title = documentKey === "disclosure" ? "Property condition disclosure" : documentKey === "fica" ? "FICA declaration" : "Exclusive mandate";
  const commission = String(mandate.commissionBasis).toLowerCase() === "fixed"
    ? `R ${text(mandate.commissionAmount)}`
    : `${text(mandate.commissionPercentage)}%`;
  const signedHtml = `<article><h1>${escapeHtml(title)}</h1><p>Property: ${escapeHtml(mandate.propertyAddress)}</p><p>Seller: ${escapeHtml(session.signer_name)}</p>${documentKey === "mandate" ? `<p>Commission: ${escapeHtml(commission)} ${escapeHtml(mandate.vatHandling)}</p>` : ""}<p>Accepted and signed by ${escapeHtml(signedName)}.</p><p>Signature: ${escapeHtml(signature)}</p></article>`;
  const { data: completion, error: completionError } = await admin.rpc("complete_private_listing_seller_document_signing", {
    p_session_id: session.id, p_document_key: documentKey, p_signed_name: signedName, p_signature: signature,
    p_acceptance_ip: text(req.headers.get("x-forwarded-for")).split(",")[0] || "",
    p_acceptance_user_agent: text(req.headers.get("user-agent")), p_generated_html: signedHtml, p_generated_file_name: `signed-${documentKey}.html`,
  });
  if (completionError || !completion) return response(409, { success: false, error: completionError?.message || "This signing link has expired or has already been used." });
  return response(200, { success: true, signedAt: completion.signedAt, complete: completion.complete, progress: completion.progress });
});
