import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type RecordValue = Record<string, unknown>;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const escapeHtml = (value: unknown) => text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
const email = (value: unknown) => text(value).toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const documentKeys = new Set(["disclosure", "fica", "mandate"]);
// Keep the recipient journey and the frozen server-side pack in the same order.
// FICA establishes the seller/entity details that the later documents rely on.
const documentOrder = ["fica", "disclosure", "mandate"];
const orderDocuments = (value: unknown) => documentOrder.filter((key) => Array.isArray(value) && value.some((item) => text(item).toLowerCase() === key));
const disclosureQuestionKeys = ["electrical_faults", "illegal_electrical_extensions", "water_heater", "drainage_system", "leaking_taps_pipes", "keys_to_all_doors", "remote_controls", "security_systems", "pool_equipment", "pool_repairs_six_months", "rising_damp", "roof_leaks", "sanitary_fittings", "tiles_floors", "structural_defects", "carpet_damage", "cupboards", "door_window_locks", "improvements_on_plans", "approved_plans_possession"];
const signingPackVersion = "seller_signing_pack_v1";
const response = (status: number, body: RecordValue) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const token = () => crypto.getRandomValues(new Uint8Array(32)).reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "");
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function snapshot(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
async function syncSigningSellerDetails(admin: any, session: RecordValue, fica: RecordValue) {
  const { data, error } = await admin.rpc("bridge_update_listing_signing_seller_details", {
    p_session_id: session.id,
    p_seller: {
      idNumber: text(fica.idNumber), residentialAddress: text(fica.residentialAddress), incomeTaxNumber: text(fica.incomeTaxNumber),
      email: email(fica.email), phone: text(fica.phone),
    },
  });
  const result = snapshot(data);
  const nextPack = snapshot(result.signingPack);
  if (error || !Object.keys(nextPack).length) throw new Error(error?.message || "Seller details could not be saved. Please try again.");
  const digest = await hash(JSON.stringify(nextPack));
  let sessionUpdate = admin.from("private_listing_mandate_signing_sessions")
    .update({ signing_pack_snapshot: nextPack, signing_pack_digest: digest, updated_at: new Date().toISOString() })
    .eq("status", "active");
  sessionUpdate = text(session.signing_group_id)
    ? sessionUpdate.eq("signing_group_id", session.signing_group_id)
    : sessionUpdate.eq("id", session.id);
  const { error: sessionError } = await sessionUpdate;
  if (sessionError) throw new Error("Seller details could not be saved. Please try again.");
  return { signingPack: nextPack, signingPackDigest: digest, changedFields: Array.isArray(result.changedFields) ? result.changedFields : [] };
}
function signingPack(value: unknown, selectedDocuments: string[], mandate: RecordValue, frozenAt: string) {
  const provided = snapshot(value);
  const providedMandate = snapshot(provided.mandate);
  const selected = selectedDocuments.slice();
  return {
    ...provided,
    version: signingPackVersion,
    frozenAt,
    selectedDocuments: selected,
    mandate: Object.keys(providedMandate).length
      ? providedMandate
      : mandate,
    seller: snapshot(provided.seller),
    property: snapshot(provided.property),
    disclosure: snapshot(provided.disclosure),
    signers: Array.isArray(provided.signers) ? provided.signers : [],
    templateVersions: snapshot(provided.templateVersions),
  };
}
function mandateLabel(value: unknown) {
  const mandateType = text(value).toLowerCase();
  return mandateType === "dual" ? "Dual mandate" : mandateType === "tri" ? "Tri mandate" : mandateType === "open" ? "Open mandate" : "Sole mandate";
}
function signedPackDocumentHtml(documentKey: string, session: RecordValue, signedName: string, signature: string) {
  const pack = snapshot(session.signing_pack_snapshot);
  const mandate = snapshot(pack.mandate);
  const seller = snapshot(pack.seller);
  const disclosureResponses = snapshot(snapshot(pack.disclosure).responses);
  const mandateType = text(mandate.mandateType).toLowerCase() || "sole";
  const mandateTitle = mandateLabel(mandateType);
  const title = documentKey === "disclosure" ? "Property condition disclosure" : documentKey === "fica" ? "Seller FICA declaration" : mandateTitle;
  const property = text(mandate.propertyAddress) || text(snapshot(pack.property).address);
  const detail = documentKey === "mandate"
    ? `Asking price: ${escapeHtml(mandate.askingPrice)}<br>Commission: ${escapeHtml(mandate.commissionBasis === "fixed" ? mandate.commissionAmount : `${text(mandate.commissionPercentage)}%`)} ${escapeHtml(mandate.vatHandling)}`
    : documentKey === "fica"
      ? `Seller/entity: ${escapeHtml(seller.name)}<br>Legal type: ${escapeHtml(seller.legalType)}<br>ID / passport: ${escapeHtml(seller.idNumber)}`
      : Object.entries(disclosureResponses).map(([key, value]) => `${escapeHtml(key.replaceAll("_", " "))}: ${escapeHtml(snapshot(value).answer)}`).join("<br>") || "The seller reviewed the property-condition disclosure included in this signing pack.";
  const signatureMarkup = /^data:image\/(png|jpeg);base64,/i.test(signature)
    ? `<img src="${escapeHtml(signature)}" alt="Signature of ${escapeHtml(signedName)}" style="display:block;max-width:280px;max-height:120px;border-bottom:1px solid #172334">`
    : escapeHtml(signature);
  return `<article><h1>${escapeHtml(title)}</h1><p>Property: ${escapeHtml(property)}</p><p>${detail}</p><p>Frozen signing pack: ${escapeHtml(session.signing_pack_digest)}</p><p>Accepted and signed by ${escapeHtml(signedName)}.</p><p>Signature:</p>${signatureMarkup}</article>`;
}
async function issueSellerPortalRecipientInvites(admin: any, url: string, serviceKey: string, sessionId: string, organisationId: string, propertyTitle: string, agentName: string) {
  const { data: recipientRows, error } = await admin.rpc("bridge_list_completed_listing_seller_portal_recipients", { p_signing_session_id: sessionId });
  const recipients = Array.isArray(recipientRows) ? recipientRows as RecordValue[] : [];
  if (error || !recipients.length) return { attempted: false, deliveries: [], error: error?.message || "Seller portal recipients could not be prepared." };
  const appUrl = (Deno.env.get("APP_URL") || "https://app.arch9.co.za").replace(/\/$/, "");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const deliveries = [] as Array<RecordValue>;
  for (const recipient of recipients) {
    const rawToken = `seller-recipient-${token()}`;
    const { data: inviteData, error: inviteError } = await admin.rpc("bridge_prepare_listing_seller_portal_recipient_invite", {
      p_signing_session_id: recipient.signing_session_id, p_invite_token_hash: await hash(rawToken), p_expires_at: expiresAt,
    });
    const invite = snapshot(inviteData);
    if (inviteError || !invite?.inviteId || invite?.alreadyPrepared) {
      deliveries.push({ recipientEmail: recipient.signer_email, delivery: invite?.alreadyPrepared ? "already_sent" : "failed" });
      continue;
    }
    const mail = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-email`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ type: "seller_portal_link", to: recipient.signer_email, organisationId, recipientRole: "seller", recipientName: recipient.signer_name, sellerName: recipient.signer_name, propertyTitle, portalLink: `${appUrl}/client/${rawToken}/selling`, onboardingLink: `${appUrl}/client/${rawToken}/selling`, agentName }),
    });
    await admin.rpc("bridge_record_listing_seller_portal_recipient_invite_delivery", { p_invite_id: invite.inviteId, p_sent: mail.ok, p_error: mail.ok ? null : "Seller portal email delivery failed." });
    deliveries.push({ recipientEmail: recipient.signer_email, delivery: mail.ok ? "sent" : "failed", expiresAt });
  }
  return { attempted: true, deliveries };
}
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
    const requestedSigners = Array.isArray(body.signers) && body.signers.length
      ? body.signers.map((item) => snapshot(item))
      : [{ name: body.signerName, email: body.signerEmail, role: "Seller" }];
    const signers = requestedSigners.map((signer) => ({ name: text(signer.name), email: email(signer.email), role: text(signer.role) || "Seller" }));
    if (!signers.length || signers.some((signer) => !signer.name || !validEmail(signer.email))) return response(400, { success: false, error: "Every required signer needs a name and valid email." });
    if (new Set(signers.map((signer) => signer.email)).size !== signers.length) return response(400, { success: false, error: "Each required signer must have a different email address." });
    const primaryDocumentContactEmail = email(body.primaryDocumentContactEmail) || signers[0]?.email;
    if (!signers.some((signer) => signer.email === primaryDocumentContactEmail)) return response(400, { success: false, error: "Choose one of the required signers as the primary document contact." });
    const selectedDocuments = orderDocuments(body.selectedDocuments);
    if (!selectedDocuments.length) return response(400, { success: false, error: "Choose at least one seller document." });
    const supersededSigningGroupId = text(body.supersededSigningGroupId);
    const replacementReason = text(body.replacementReason);
    if (supersededSigningGroupId && replacementReason.length < 5) return response(400, { success: false, error: "Provide a short reason for replacing this seller signing pack." });
    const now = new Date();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const mandateSnapshot = snapshot(body.mandateSnapshot);
    const packSnapshot = {
      ...signingPack(body.signingPack, selectedDocuments, mandateSnapshot, issuedAt),
      primaryDocumentContact: {
        email: primaryDocumentContactEmail,
        name: signers.find((signer) => signer.email === primaryDocumentContactEmail)?.name || "",
      },
    };
    const packDigest = await hash(JSON.stringify(packSnapshot));
    const signingGroupId = crypto.randomUUID();
    if (supersededSigningGroupId) {
      const { data: replacement, error: replacementError } = await admin.rpc("bridge_replace_listing_seller_signing_pack", {
        p_listing_id: listing.id,
        p_superseded_signing_group_id: supersededSigningGroupId,
        p_replacement_signing_group_id: signingGroupId,
        p_reason: replacementReason,
        p_initiated_by: user.id,
      });
      if (replacementError || !replacement) return response(409, { success: false, error: replacementError?.message || "This seller signing pack cannot be replaced." });
    }
    // A replacement link should supersede an active link for the same signer
    // only when it covers at least one of the same documents. This keeps a
    // deliberately separate FICA or disclosure pack usable alongside a
    // mandate-only pack.
    const { data: activeSessions, error: activeSessionsError } = await admin.from("private_listing_mandate_signing_sessions")
      .select("id, signer_email, selected_documents")
      .eq("private_listing_id", listing.id)
      .eq("status", "active")
      .in("signer_email", signers.map((signer) => signer.email));
    if (activeSessionsError) return response(500, { success: false, error: "Unable to prepare the replacement signing link." });
    const replacementSessionIds = (activeSessions || [])
      .filter((existing: RecordValue) => Array.isArray(existing.selected_documents) && existing.selected_documents.some((documentKey) => selectedDocuments.includes(text(documentKey))))
      .map((existing: RecordValue) => text(existing.id))
      .filter(Boolean);
    if (replacementSessionIds.length) {
      const { error: revokeError } = await admin.from("private_listing_mandate_signing_sessions")
        .update({ status: "revoked", updated_at: now.toISOString() })
        .in("id", replacementSessionIds)
        .eq("status", "active");
      if (revokeError) return response(500, { success: false, error: "Unable to replace the existing signing link." });
    }
    const appUrl = (Deno.env.get("APP_URL") || "https://app.arch9.co.za").replace(/\/$/, "");
    const agentName = text(body.agentName) || "Your agent";
    const issued = [] as Array<{ signerName: string; signerEmail: string; signingLink: string; expiresAt: string; delivery: string }>;
    for (const signer of signers) {
      const rawToken = token();
      const { data: session, error: sessionError } = await admin.from("private_listing_mandate_signing_sessions").insert({
        organisation_id: listing.organisation_id, private_listing_id: listing.id, signer_email: signer.email, signer_name: signer.name,
        token_hash: await hash(rawToken), expires_at: expiresAt, selected_documents: selectedDocuments, mandate_snapshot: mandateSnapshot,
        signing_pack_snapshot: packSnapshot, signing_pack_version: text(packSnapshot.version) || signingPackVersion,
        signing_pack_digest: packDigest, signing_pack_frozen_at: issuedAt, signing_group_id: signingGroupId,
        is_primary_document_contact: signer.email === primaryDocumentContactEmail, primary_document_contact_email: primaryDocumentContactEmail, created_by: user.id,
      }).select("id, expires_at").single();
      if (sessionError || !session) return response(500, { success: false, error: "Unable to create every required signing link." });
      const signingLink = `${appUrl}/mandate-sign/${rawToken}`;
      const mail = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-email`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ type: "seller_mandate_sent", to: signer.email, organisationId: listing.organisation_id, recipientRole: "seller", recipientName: signer.name, sellerName: signer.name, propertyTitle: text(snapshot(body.mandateSnapshot).propertyAddress) || "your property", mandateType: selectedDocuments.length > 1 ? "Seller documents" : selectedDocuments[0] === "fica" ? "FICA declaration" : selectedDocuments[0] === "disclosure" ? "Property disclosure" : mandateLabel(mandateSnapshot.mandateType), askingPrice: text(snapshot(body.mandateSnapshot).askingPrice), portalLink: signingLink, agentName }),
      });
      issued.push({ signerName: signer.name, signerEmail: signer.email, signingLink, expiresAt: session.expires_at, delivery: mail.ok ? "sent" : "failed" });
    }
    const delivery = issued.every((item) => item.delivery === "sent") ? "sent" : issued.some((item) => item.delivery === "sent") ? "partial" : "failed";
    if (delivery !== "failed" && selectedDocuments.includes("mandate")) await admin.from("private_listings").update({ mandate_status: "sent_to_seller", listing_status: "mandate_sent" }).eq("id", listing.id);
    return response(200, { success: true, delivery, signingLink: issued[0]?.signingLink || "", signingLinks: issued, expiresAt });
  }

  if (action === "status" || action === "revoke") {
    const listingId = text(body.listingId);
    const authorizationResult = await authorizeListingRequest(req, url, anonKey, listingId);
    if (authorizationResult.error) return authorizationResult.error;
    const { listing } = authorizationResult;
    if (action === "status") {
      const { data: sessions, error } = await admin.from("private_listing_mandate_signing_sessions")
      .select("id, status, signer_email, signer_name, selected_documents, document_progress, signing_group_id, is_primary_document_contact, primary_document_contact_email, signing_pack_version, signing_pack_digest, signing_pack_frozen_at, expires_at, viewed_at, signed_at, created_at")
        .eq("private_listing_id", listing.id).order("created_at", { ascending: false }).limit(10);
      if (error) return response(500, { success: false, error: "Unable to load seller document link status." });
      const now = Date.now();
      const normalizedSessions = (sessions || []).map((session: RecordValue) => ({
        ...session,
        status: text(session.status) === "active" && new Date(text(session.expires_at)).getTime() <= now ? "expired" : session.status,
      }));
      const sessionIds = normalizedSessions.map((session: RecordValue) => text(session.id)).filter(Boolean);
      const [{ data: invitations }, { data: taskPlan }] = await Promise.all([
        sessionIds.length ? admin.from("private_listing_seller_portal_recipient_invites").select("signing_session_id, recipient_name, recipient_email, status, sent_at, expires_at, opened_at, consumed_at").in("signing_session_id", sessionIds) : Promise.resolve({ data: [] }),
        admin.from("private_listing_seller_portal_task_plans").select("task_plan, updated_at").eq("private_listing_id", listing.id).maybeSingle(),
      ]);
      return response(200, { success: true, sessions: normalizedSessions, portalInvitations: invitations || [], portalTaskPlan: snapshot(taskPlan) });
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
    let primaryDocumentContactSigned = session.is_primary_document_contact !== false;
    if (text(session.signing_group_id) && session.is_primary_document_contact === false) {
      const { data: primarySession } = await admin.from("private_listing_mandate_signing_sessions")
        .select("status").eq("signing_group_id", session.signing_group_id).eq("is_primary_document_contact", true).maybeSingle();
      primaryDocumentContactSigned = primarySession?.status === "signed";
    }
    const frozenPack = snapshot(session.signing_pack_snapshot);
    return response(200, { success: true, session: {
      signerName: session.signer_name,
      expiresAt: session.expires_at,
      selectedDocuments: session.selected_documents,
      progress: session.document_progress || {},
      mandate: session.mandate_snapshot,
      signingPack: frozenPack,
      signingPackVersion: text(session.signing_pack_version) || signingPackVersion,
      signingPackDigest: text(session.signing_pack_digest),
      signingPackFrozenAt: session.signing_pack_frozen_at || null,
      isPrimaryDocumentContact: session.is_primary_document_contact !== false,
      primaryDocumentContactEmail: text(session.primary_document_contact_email) || text(snapshot(frozenPack.primaryDocumentContact).email),
      primaryDocumentContactSigned,
    } });
  }
  if (action === "save-fica-details") {
    if (session.is_primary_document_contact === false) return response(403, { success: false, error: "Only the primary document contact can change shared seller details. You can review the frozen pack and sign it, or ask the agent to prepare a replacement." });
    const fica = snapshot(snapshot(body.sellerResponses).fica);
    if (!text(fica.idNumber) || !text(fica.residentialAddress)) return response(400, { success: false, error: "Add your ID or passport number and residential or registered address before continuing." });
    try {
      const saved = await syncSigningSellerDetails(admin, session, fica);
      return response(200, { success: true, signingPack: saved.signingPack, signingPackDigest: saved.signingPackDigest, changedFields: saved.changedFields });
    } catch (saveError) {
      return response(500, { success: false, error: saveError instanceof Error ? saveError.message : "Seller details could not be saved. Please try again." });
    }
  }
  if (action === "flag-issue") {
    const issue = text(body.issue);
    if (issue.length < 5) return response(400, { success: false, error: "Describe the issue so the agent can prepare a corrected pack." });
    const groupQuery = admin.from("private_listing_mandate_signing_sessions")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("status", "active");
    const { error: revokeError } = text(session.signing_group_id)
      ? await groupQuery.eq("signing_group_id", session.signing_group_id)
      : await groupQuery.eq("id", session.id);
    if (revokeError) return response(500, { success: false, error: "The signing pack could not be paused for correction." });
    await admin.from("private_listing_activity").insert({
      private_listing_id: session.private_listing_id,
      activity_type: "seller_signing_pack_issue_flagged",
      activity_title: "Seller signing pack needs correction",
      activity_description: `${text(session.signer_name) || "A signer"} flagged an issue: ${issue}`,
      visibility: "internal",
      metadata: { signingSessionId: session.id, signingGroupId: session.signing_group_id || null, signerEmail: email(session.signer_email), issue },
    });
    return response(200, { success: true, message: "The pack has been paused. Your agent will prepare a corrected replacement." });
  }
  if (action === "sign-pack") {
    const signedName = text(body.signedName);
    const signature = text(body.signature);
    const selectedDocuments = Array.isArray(session.selected_documents) ? session.selected_documents : ["mandate"];
    const isPrimaryDocumentContact = session.is_primary_document_contact !== false;
    if (!isPrimaryDocumentContact && text(session.signing_group_id)) {
      const { data: primarySession } = await admin.from("private_listing_mandate_signing_sessions")
        .select("status").eq("signing_group_id", session.signing_group_id).eq("is_primary_document_contact", true).maybeSingle();
      if (primarySession?.status !== "signed") return response(409, { success: false, error: "The primary document contact must complete the shared details and sign first." });
    }
    const acceptedDocuments = snapshot(body.acceptedDocuments);
    const missingAcceptance = selectedDocuments.find((documentKey: string) => acceptedDocuments[documentKey] !== true);
    if (missingAcceptance || !signedName || !signature) return response(400, { success: false, error: missingAcceptance ? `Review and accept the ${missingAcceptance} document before submitting.` : "Provide your full name and signature before submitting." });
    const frozenPack = snapshot(session.signing_pack_snapshot);
    const sellerResponses = isPrimaryDocumentContact ? snapshot(body.sellerResponses) : {};
    const disclosure = isPrimaryDocumentContact ? snapshot(sellerResponses.disclosure) : snapshot(frozenPack.disclosure);
    const disclosureResponses = snapshot(disclosure.responses);
    const fica = isPrimaryDocumentContact ? snapshot(sellerResponses.fica) : snapshot(frozenPack.seller);
    if (isPrimaryDocumentContact && selectedDocuments.includes("disclosure")) {
      const answers = disclosureQuestionKeys.map((key) => text(snapshot(disclosureResponses[key]).answer));
      if (answers.some((answer) => !["yes", "no", "unsure"].includes(answer))) return response(400, { success: false, error: "Answer every property disclosure question before signing." });
    }
    if (isPrimaryDocumentContact && selectedDocuments.includes("fica") && (!text(fica.idNumber) || !text(fica.residentialAddress))) return response(400, { success: false, error: "Add your ID or passport number and residential or registered address before signing the FICA declaration." });

    let syncedPack = frozenPack;
    if (isPrimaryDocumentContact && selectedDocuments.includes("fica")) {
      try {
        syncedPack = (await syncSigningSellerDetails(admin, session, fica)).signingPack;
      } catch (saveError) {
        return response(500, { success: false, error: saveError instanceof Error ? saveError.message : "Seller details could not be saved. Please try again." });
      }
    }
    const existingPack = syncedPack;
    const completedPack = isPrimaryDocumentContact ? {
      ...existingPack,
      disclosure: selectedDocuments.includes("disclosure") ? disclosure : snapshot(existingPack.disclosure),
      seller: {
        ...snapshot(existingPack.seller),
        ...(selectedDocuments.includes("fica") ? {
          idNumber: text(fica.idNumber), residentialAddress: text(fica.residentialAddress), incomeTaxNumber: text(fica.incomeTaxNumber), email: email(fica.email), phone: text(fica.phone),
        } : {}),
      },
    } : frozenPack;
    if (isPrimaryDocumentContact && text(session.signing_group_id)) {
      const completedPackDigest = await hash(JSON.stringify(completedPack));
      const { error: fanoutError } = await admin.from("private_listing_mandate_signing_sessions")
        .update({ signing_pack_snapshot: completedPack, signing_pack_digest: completedPackDigest, updated_at: new Date().toISOString() })
        .eq("signing_group_id", session.signing_group_id).eq("status", "active");
      if (fanoutError) return response(500, { success: false, error: "The completed shared details could not be prepared for every signer." });
    }
    if (isPrimaryDocumentContact) {
      const { data: onboarding } = await admin.from("private_listing_seller_onboarding").select("form_data").eq("private_listing_id", session.private_listing_id).maybeSingle();
      const formData = { ...snapshot(onboarding?.form_data) };
      const responseRecordedAt = new Date().toISOString();
      if (selectedDocuments.includes("disclosure")) {
      formData.propertyDisclosure = disclosure;
      formData.property_disclosure = disclosure;
      const declarations = snapshot(formData.propertyDisclosureDeclarations);
      const declaration = { signerName: text(session.signer_name), signerEmail: email(session.signer_email), responses: disclosureResponses, completedAt: responseRecordedAt };
      formData.propertyDisclosureDeclarations = { ...declarations, [text(session.id)]: declaration };
      formData.property_disclosure_declarations = formData.propertyDisclosureDeclarations;
      }
      if (selectedDocuments.includes("fica")) {
      const declarations = snapshot(formData.ficaDeclarations);
      const declaration = { signerName: text(session.signer_name), signerEmail: email(session.signer_email), idNumber: text(fica.idNumber), residentialAddress: text(fica.residentialAddress), incomeTaxNumber: text(fica.incomeTaxNumber), email: email(fica.email), phone: text(fica.phone), completedAt: responseRecordedAt };
      formData.ficaDeclarations = { ...declarations, [text(session.id)]: declaration };
      formData.fica_declarations = formData.ficaDeclarations;
      // Preserve the existing single-seller aliases for all downstream users,
      // but do not let a later co-owner overwrite the other owner's details.
      const signingPackSigners = Array.isArray(existingPack.signers) ? existingPack.signers : [];
      if (signingPackSigners.length <= 1) {
        formData.idNumber = declaration.idNumber;
        formData.sellerIdNumber = declaration.idNumber;
        formData.residentialAddress = declaration.residentialAddress;
        formData.residential_address = declaration.residentialAddress;
        formData.incomeTaxNumber = declaration.incomeTaxNumber;
        formData.email = declaration.email;
        formData.phone = declaration.phone;
      }
      }
      const { data: savedOnboarding, error: onboardingError } = await admin.from("private_listing_seller_onboarding")
      .update({ form_data: formData, updated_at: new Date().toISOString() })
      .eq("private_listing_id", session.private_listing_id)
      .select("id")
      .maybeSingle();
      if (onboardingError || !savedOnboarding) return response(500, { success: false, error: onboardingError?.message || "Seller details could not be saved. Please try again." });
    }
    const completedSession = { ...session, signing_pack_snapshot: completedPack };
    const generatedDocuments = Object.fromEntries(selectedDocuments.map((documentKey: string) => [documentKey, signedPackDocumentHtml(documentKey, completedSession, signedName, signature)]));
    const { data: completion, error: completionError } = await admin.rpc("complete_private_listing_seller_signing_pack", {
      p_session_id: session.id, p_signed_name: signedName, p_signature: signature,
      p_acceptance_ip: text(req.headers.get("x-forwarded-for")).split(",")[0] || "",
      p_acceptance_user_agent: text(req.headers.get("user-agent")), p_generated_documents: generatedDocuments,
    });
    if (completionError || !completion) return response(409, { success: false, error: completionError?.message || "This signing link has expired or has already been used." });
    const portalInvitations = completion.groupComplete === true
      ? await issueSellerPortalRecipientInvites(admin, url, serviceKey, session.id, text(session.organisation_id), text(snapshot(session.mandate_snapshot).propertyAddress) || "your property", "Your agent")
      : { attempted: false, deliveries: [] };
    return response(200, {
      success: true,
      signedAt: completion.signedAt,
      complete: true,
      groupComplete: completion.groupComplete === true,
      sellerPortalWorkspace: snapshot(completion.sellerPortalWorkspace),
      sellerPortalInvitations: portalInvitations,
      progress: completion.progress,
    });
  }
  if (action !== "sign") return response(400, { success: false, error: "Unknown signing action." });
  if (session.signing_group_id) {
    return response(409, {
      success: false,
      error: "This signing pack must be completed together. Use the secure signing-pack form.",
    });
  }
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
