// deno-lint-ignore no-import-prefix no-unversioned-import
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { sendViaResendApi } from "../send-email/services/resend.ts";
import { resolveAudienceEmailSender, resolveEmailBranding } from "../send-email/services/emailBranding.ts";
import { renderBridgeCta, renderBridgeEmailLayout, renderBridgeIntroParagraphs } from "../send-email/content/bridgeEmailLayout.ts";
import { buildSellerMandateDocumentMarkup } from "../../../the-it-guy/src/core/documents/sellerMandateDocumentMarkup.js";
import { buildSellerFicaDueDiligenceMarkup } from "../../../the-it-guy/src/core/documents/sellerFicaDueDiligenceMarkup.js";
import { buildPropertyDisclosureDocumentMarkup, normalizePropertyDisclosure, PROPERTY_DISCLOSURE_QUESTIONS } from "../../../the-it-guy/src/lib/propertyDisclosure.js";

type Row = Record<string, unknown>;
const createAdmin = (url: string, key: string) => createClient(url, key, { auth: { persistSession: false } });
type AdminClient = ReturnType<typeof createAdmin>;
const text = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (status: number, payload: Row) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const documentKeys = new Set(["signed_disclosure_form", "signed_fica_declaration", "signed_mandate"]);
const documentLabels: Record<string, string> = {
  signed_disclosure_form: "Mandatory Disclosure / Defects Form",
  signed_fica_declaration: "Seller FICA Declaration",
  signed_mandate: "Seller Mandate",
};
const approvalReference = "2026-09-27";
const enabled = () => Deno.env.get("SELLER_PORTAL_SIGNING_ENABLED") === "true";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value as Row).sort().reduce((result: Row, key) => {
      result[key] = canonical((value as Row)[key]);
      return result;
    }, {});
  }
  return value;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function escapeHtml(value: unknown) {
  return text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function signedHtml(reviewedHtml: string, evidence: Row[], versionDigest: string) {
  const blocks = evidence.map((row) => {
    const signature = text(row.signature_value);
    const drawn = text(row.signature_type) === "drawn" && /^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(signature);
    const signedAt = text(row.signed_date) || text(row.accepted_at);
    const signedPlace = text(row.signed_place);
    return `<div style="border-top:1px solid #152338;padding:12px 0;margin-top:18px"><strong>${escapeHtml(row.signed_name)}</strong><br>${drawn ? `<img alt="Signature" src="${signature}" style="max-height:90px;max-width:280px" />` : `<em>${escapeHtml(signature)}</em>`}<br>Signed ${signedPlace ? `at ${escapeHtml(signedPlace)} ` : ""}on ${escapeHtml(signedAt)} · Recorded ${escapeHtml(row.accepted_at)} · Evidence ${escapeHtml(row.evidence_digest)}</div>`;
  }).join("");
  const section = `<section style="max-width:820px;margin:28px auto;padding:24px;border:1px solid #dbe4df;page-break-before:always"><h2>Electronic signatures</h2><p>Reviewed document version: ${escapeHtml(versionDigest)}</p>${blocks}</section>`;
  return /<\/body>/i.test(reviewedHtml) ? reviewedHtml.replace(/<\/body>/i, `${section}</body>`) : `${reviewedHtml}${section}`;
}

async function staffContext(req: Request, admin: AdminClient, url: string, anonKey: string, organisationId: string) {
  const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user?.id) return null;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false },
  });
  const permission = await userClient.rpc("bridge_listing_seller_actor_permission", {
    p_organisation_id: organisationId,
    p_action: "manage_participants",
    p_sensitivity: "general",
  });
  return !permission.error && permission.data === true ? { userId: data.user.id } : null;
}

async function staffListing(req: Request, admin: AdminClient, url: string, anonKey: string, listingId: string) {
  if (!listingId) return null;
  const listing = await admin.from("private_listings").select("id, organisation_id").eq("id", listingId).maybeSingle();
  if (listing.error || !listing.data) return null;
  const staff = await staffContext(req, admin, url, anonKey, text(listing.data.organisation_id));
  return staff ? { listing: listing.data, staff } : null;
}

async function reviewedCopy(admin: AdminClient, listingId: string, documentKey: string) {
  const onboarding = await admin.from("private_listing_seller_onboarding")
    .select("status, form_data").eq("private_listing_id", listingId).maybeSingle();
  if (onboarding.error || !onboarding.data || text(onboarding.data.status) !== "completed") return null;
  const form = object(onboarding.data.form_data);
  const approval = object(form.sellerOnboardingFormalPackApproval || form.seller_onboarding_formal_pack_approval);
  const review = object(form.sellerOnboardingReview || form.seller_onboarding_review);
  if (text(approval.status) !== "approved" || text(review.status) !== "approved") return null;
  if (documentKey === "signed_disclosure_form") {
    const disclosure = object(form.propertyDisclosure || form.property_disclosure);
    const compliance = object(form.sellerComplianceSigning || form.seller_compliance_signing);
    if (text(disclosure.signature) && text(disclosure.signedAt || disclosure.signed_at) &&
        (compliance.complete === true || object(compliance.signingState).complete === true)) return null;
  }
  if (documentKey === "signed_mandate" && object(approval.commission).confirmed !== true) return null;
  const pack = object(form.sellerOnboardingManualSigningPack || form.seller_onboarding_manual_signing_pack);
  const index = object(form.sellerReviewedDocumentVersions || form.seller_reviewed_document_versions);
  const documents = Array.isArray(pack.documents) ? pack.documents.map(object) : [];
  const indexed = Array.isArray(index.documents) ? index.documents.map(object) : [];
  const matches = documents.filter((row) => text(row.key || row.requirementKey) === documentKey);
  const indexMatches = indexed.filter((row) => text(row.key) === documentKey);
  if (matches.length !== 1 || indexMatches.length !== 1) return null;
  const document = matches[0], indexRow = indexMatches[0];
  const html = String(document.generatedHtml || document.generated_html || "");
  const contentDigest = `sha256:${await sha256(html)}`;
  const signers = Array.isArray(document.requiredSigners) ? document.requiredSigners.map(object) : [];
  if (!text(html) || !text(document.versionId) || !signers.length || signers.some((signer) =>
    !text(signer.name) || !text(signer.role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(signer.email)))) return null;
  if (new Set(signers.map((signer) => text(signer.email).toLowerCase())).size !== signers.length) return null;
  const mandateTerms = documentKey === "signed_mandate" ? object(document.mandateTerms) : null;
  const versionDigest = `sha256:${await sha256(JSON.stringify(canonical({
    key: documentKey,
    contentDigest,
    sourceDraftFingerprint: text(document.sourceDraftFingerprint),
    signers,
    mandateTerms,
  })))}`;
  if (contentDigest !== text(document.contentDigest) || versionDigest !== text(document.versionDigest) ||
      versionDigest !== text(indexRow.versionDigest) || contentDigest !== text(indexRow.contentDigest) ||
      text(document.versionId) !== text(indexRow.versionId) ||
      JSON.stringify(canonical(signers)) !== JSON.stringify(canonical(indexRow.requiredSigners)) ||
      JSON.stringify(canonical(mandateTerms)) !== JSON.stringify(canonical(indexRow.mandateTerms))) return null;
  return { document, html, signers, contentDigest, versionDigest, form, approval, pack };
}

const correctionFields = {
  common: ["sellerName", "idNumber", "residentialAddress", "email", "phone", "propertyAddress"],
  fica: ["idType", "saResident", "incomeTaxNumber", "maritalStatus", "employer", "jobTitle", "occupation", "industryOfBusiness", "countriesOfTrade", "dualUseGoods", "armsWeapons", "actingOnBehalfOfAnother", "heirInEstate", "sourceOfWealth", "sourceOfIncome", "politicallyInfluentialPerson", "bankName", "accountName", "accountNumber", "accountType"],
  mandate: ["mandateType", "askingPrice", "startDate", "endDate", "protectionPeriod", "specialConditions", "commissionBasis", "commissionPercentage", "commissionAmount", "vatHandling"],
  disclosure: ["comments", "remoteControlsQuantity"],
} as const;

function editData(copy: NonNullable<Awaited<ReturnType<typeof reviewedCopy>>>, key: string, saved: Row = {}) {
  const pack = object(copy.pack.signingPackSnapshot);
  const seller = object(pack.seller), property = object(pack.property), mandate = object(pack.mandate);
  const form = copy.form, fica = object(form.fica || form.ficaDetails || form.fica_details);
  const disclosure = normalizePropertyDisclosure(object(form.propertyDisclosure || form.property_disclosure));
  const common = { sellerName: text(seller.name), idNumber: text(seller.idNumber), residentialAddress: text(seller.residentialAddress), email: text(seller.email), phone: text(seller.phone), propertyAddress: text(property.address) };
  const ficaValues: Row = {};
  const booleanFields = new Set(["saResident", "dualUseGoods", "armsWeapons", "actingOnBehalfOfAnother", "heirInEstate", "politicallyInfluentialPerson"]);
  for (const field of correctionFields.fica) {
    const value = text(fica[field] ?? form[field] ?? seller[field] ?? (field === "sourceOfIncome" ? seller.sourceOfFunds : ""));
    ficaValues[field] = booleanFields.has(field)
      ? (["true", "yes", "1"].includes(value.toLowerCase()) ? "yes" : ["false", "no", "0"].includes(value.toLowerCase()) ? "no" : value)
      : value;
  }
  const mandateValues: Row = {};
  const commission = object(copy.approval.commission);
  for (const field of correctionFields.mandate) mandateValues[field] = text(mandate[field] ?? ({ commissionBasis: commission.basis, commissionPercentage: commission.percentage, commissionAmount: commission.amount, vatHandling: commission.vatHandling } as Row)[field]);
  const disclosureValues = { comments: disclosure.comments, remoteControlsQuantity: disclosure.remoteControlsQuantity, responses: disclosure.responses };
  return {
    common: { ...common, ...object(saved.common) },
    ...(key === "signed_fica_declaration" ? { fica: { ...ficaValues, ...object(saved.fica) } } : {}),
    ...(key === "signed_mandate" ? { mandate: { ...mandateValues, ...object(saved.mandate) } } : {}),
    ...(key === "signed_disclosure_form" ? { disclosure: { ...disclosureValues, ...object(saved.disclosure) }, questions: PROPERTY_DISCLOSURE_QUESTIONS.map(({ key: questionKey, text: label, number }) => ({ key: questionKey, label, number })) } : {}),
  };
}

function validatedCorrections(value: Row, key: string) {
  const result: Row = {};
  for (const section of ["common", key === "signed_fica_declaration" ? "fica" : key === "signed_mandate" ? "mandate" : "disclosure"] as const) {
    const input = object(value[section]);
    const clean: Row = {};
    for (const field of correctionFields[section]) {
      const entry = text(input[field]);
      if (entry.length > (field === "comments" || field === "specialConditions" ? 4000 : 500)) throw new Error("A corrected field is too long.");
      clean[field] = entry;
    }
    if (section === "disclosure") {
      const answers = object(input.responses), responses: Row = {};
      for (const question of PROPERTY_DISCLOSURE_QUESTIONS) {
        const response = object(answers[question.key]);
        const answer = text(response.answer).toLowerCase();
        const note = text(response.note);
        if (!["", "yes", "no", "unsure"].includes(answer) || note.length > 2000) throw new Error("A disclosure answer is invalid.");
        responses[question.key] = { answer, note };
      }
      clean.responses = responses;
    }
    if (section === "common" && (text(clean.sellerName).length < 2 || text(clean.propertyAddress).length < 5)) {
      throw new Error("Enter the seller name and property address before saving.");
    }
    if (section === "mandate") {
      if (!["sole", "exclusive", "sole_mandate", "open"].includes(text(clean.mandateType).toLowerCase()) ||
        !(Number(text(clean.askingPrice).replace(/[^\d.-]/g, "")) > 0) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(text(clean.startDate)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(text(clean.endDate)) ||
        text(clean.endDate) < text(clean.startDate)) throw new Error("Enter a valid mandate type, price, and dates.");
      if (!["percentage", "fixed"].includes(text(clean.commissionBasis)) ||
        !(Number(text(clean.commissionBasis) === "fixed" ? clean.commissionAmount : clean.commissionPercentage) > 0) ||
        !text(clean.vatHandling)) throw new Error("Enter valid commission and VAT terms.");
    }
    result[section] = clean;
  }
  return result;
}

function renderCorrectedHtml(copy: NonNullable<Awaited<ReturnType<typeof reviewedCopy>>>, key: string, corrections: Row, listingId: string) {
  const pack = structuredClone(object(copy.pack.signingPackSnapshot));
  const seller = object(pack.seller), property = object(pack.property), common = object(corrections.common);
  seller.name = text(common.sellerName); seller.idNumber = text(common.idNumber);
  seller.residentialAddress = text(common.residentialAddress); seller.email = text(common.email); seller.phone = text(common.phone);
  const parties = Array.isArray(seller.parties) ? seller.parties : [];
  if (parties.length) parties[0] = { ...object(parties[0]), name: seller.name, idNumber: seller.idNumber, residentialAddress: seller.residentialAddress, email: seller.email, phone: seller.phone };
  property.address = text(common.propertyAddress);
  pack.seller = seller; pack.property = property;
  const branding = object(pack.branding);
  if (key === "signed_mandate") {
    pack.mandate = { ...object(pack.mandate), ...object(corrections.mandate), propertyAddress: property.address };
    const terms = object(corrections.mandate);
    const approval = { ...copy.approval, commission: { ...object(copy.approval.commission), basis: terms.commissionBasis,
      percentage: terms.commissionPercentage, amount: terms.commissionAmount, vatHandling: terms.vatHandling } };
    return buildSellerMandateDocumentMarkup({ signingPack: pack, formalPackApproval: approval });
  }
  if (key === "signed_fica_declaration") {
    seller.incomeTaxNumber = text(object(corrections.fica).incomeTaxNumber);
    seller.maritalStatus = text(object(corrections.fica).maritalStatus);
    const drafts = object(copy.form.sellerPostOnboardingDrafts || copy.form.seller_post_onboarding_drafts);
    const ficaDraft = (Array.isArray(drafts.documents) ? drafts.documents : []).find((row: Row) => text(row.targetRequirementKey || row.requirementKey) === key);
    const ficaModel = object(object(ficaDraft?.metadata).ficaDeclarationModel);
    const formData = { ...copy.form, ...object(corrections.fica), fica: { ...object(copy.form.fica || copy.form.ficaDetails || copy.form.fica_details), ...object(corrections.fica) } };
    return buildSellerFicaDueDiligenceMarkup({ model: ficaModel as never, formData, signingPack: pack, branding, generatedAt: text(pack.frozenAt) });
  }
  const original = normalizePropertyDisclosure(object(copy.form.propertyDisclosure || copy.form.property_disclosure));
  const disclosure = { ...original, ...object(corrections.disclosure), signature: "", signedAt: "", signedPlace: "" };
  const responses = object(disclosure.responses);
  disclosure.decision = PROPERTY_DISCLOSURE_QUESTIONS.some((question) =>
    ["yes", "unsure"].includes(text(object(responses[question.key]).answer))) ? "disclose" : "none";
  return buildPropertyDisclosureDocumentMarkup(disclosure, { sellerName: seller.name, sellerIdNumber: seller.idNumber,
    propertyAddress: property.address, listingId, documentReference: pack.documentReference, branding });
}

async function expireStaleRequests(admin: AdminClient, listingId: string) {
  const pending = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id, status, created_at").eq("private_listing_id", listingId)
    .in("status", ["prepared", "sent", "partially_signed"]);
  if (pending.error) throw new Error("Unable to check signing link expiry.");
  for (const document of pending.data || []) {
    const abandoned = text(document.status) === "prepared" &&
      new Date(text(document.created_at)).getTime() < Date.now() - 15 * 60 * 1000;
    if (text(document.status) === "prepared" && !abandoned) continue;
    if (!abandoned) {
      const active = await admin.from("private_listing_seller_portal_signing_recipients")
        .select("id").eq("signing_document_id", document.id)
        .in("status", ["pending", "viewed"])
        .gt("expires_at", new Date().toISOString()).limit(1);
      if (active.error) throw new Error("Unable to check signing link expiry.");
      if (active.data?.length) continue;
    }
    const recipients = await admin.from("private_listing_seller_portal_signing_recipients")
      .update({ status: abandoned ? "revoked" : "expired" }).eq("signing_document_id", document.id).in("status", ["pending", "viewed"]);
    if (recipients.error) throw new Error("Unable to expire stale signer links.");
    const expired = await admin.from("private_listing_seller_portal_signing_documents")
      .update(abandoned
        ? { status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: "abandoned_preparation" }
        : { status: "expired" })
      .eq("id", document.id).in("status", ["prepared", "sent", "partially_signed"]);
    if (expired.error) throw new Error("Unable to expire stale signing links.");
  }
}

async function revokeSupersededRequests(admin: AdminClient, listingId: string, documentKey: string, versionId: string) {
  const old = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id").eq("private_listing_id", listingId).eq("document_key", documentKey)
    .neq("version_id", versionId).in("status", ["prepared", "sent", "partially_signed", "signed"]);
  if (old.error) throw new Error("Unable to check older signing requests.");
  for (const row of old.data || []) {
    const recipients = await admin.from("private_listing_seller_portal_signing_recipients")
      .update({ status: "revoked" }).eq("signing_document_id", row.id).in("status", ["pending", "viewed"]);
    if (recipients.error) throw new Error("Unable to revoke older signer links.");
    const revoked = await admin.from("private_listing_seller_portal_signing_documents")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: "superseded_version" })
      .eq("id", row.id).in("status", ["prepared", "sent", "partially_signed", "signed"]);
    if (revoked.error) throw new Error("Unable to revoke the older signing request.");
  }
}

async function issue(req: Request, admin: AdminClient, url: string, anonKey: string, payload: Row) {
  if (!enabled()) return respond(503, { error: "Seller portal signing is not enabled." });
  const listingId = text(payload.listingId), documentKey = text(payload.documentKey);
  if (!documentKeys.has(documentKey)) return respond(400, { error: "Unsupported seller document." });
  const context = await staffListing(req, admin, url, anonKey, listingId);
  if (!context) return respond(403, { error: "Agent access to this listing is required." });
  const copy = await reviewedCopy(admin, listingId, documentKey);
  if (!copy) return respond(409, { error: "Approve and freeze this document and all signer details before sending it." });
  if (text(copy.document.signingRoute) !== "digital_pack") return respond(409, { error: "This document was approved for physical signing." });
  await expireStaleRequests(admin, listingId);
  await revokeSupersededRequests(admin, listingId, documentKey, text(copy.document.versionId));
  const existing = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id").eq("private_listing_id", listingId).eq("document_key", documentKey)
    .eq("version_id", text(copy.document.versionId)).in("status", ["prepared", "sent", "partially_signed", "signed", "reviewed"]).limit(1);
  if (existing.error) return respond(500, { error: "Unable to check existing signing requests." });
  if (existing.data?.length) return respond(409, { error: "This reviewed document version already has a signing request." });
  const created = await admin.from("private_listing_seller_portal_signing_documents").insert({
    organisation_id: context.listing.organisation_id,
    private_listing_id: listingId,
    document_key: documentKey,
    version_id: copy.document.versionId,
    version_digest: copy.versionDigest,
    content_digest: copy.contentDigest,
    source_version_digest: copy.versionDigest,
    source_content_digest: copy.contentDigest,
    reviewed_html: copy.html,
    required_signers: copy.signers,
    approval_reference: approvalReference,
    created_by: context.staff.userId,
  }).select("id").single();
  if (created.error || !created.data) return respond(500, { error: "Unable to prepare this signing request." });
  const signingDocumentId = text(created.data.id);
  const recipients = await Promise.all(copy.signers.map(async (signer) => {
    const token = newToken();
    return { token, signer, row: {
      signing_document_id: signingDocumentId,
      signer_name: text(signer.name), signer_role: text(signer.role),
      signer_email: text(signer.email).toLowerCase(), token_hash: await sha256(token),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    } };
  }));
  const inserted = await admin.from("private_listing_seller_portal_signing_recipients")
    .insert(recipients.map((recipient) => recipient.row)).select("id, signer_email");
  if (inserted.error || inserted.data?.length !== recipients.length) {
    await admin.from("private_listing_seller_portal_signing_documents").update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: "recipient_setup_failed" }).eq("id", signingDocumentId);
    return respond(500, { error: "Unable to prepare all signer links. No link was sent." });
  }
  const apiKey = text(Deno.env.get("RESEND_API_KEY"));
  const platformSender = text(Deno.env.get("RESEND_FROM_EMAIL"));
  if (!apiKey || !platformSender) {
    await admin.from("private_listing_seller_portal_signing_documents").update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: "email_not_configured" }).eq("id", signingDocumentId);
    return respond(503, { error: "Signature email delivery is not configured. No link was sent." });
  }
  const branding = await resolveEmailBranding({ supabase: admin, organisationId: text(context.listing.organisation_id) });
  const from = await resolveAudienceEmailSender({ audience: "client", branding, platformSender, supabase: admin });
  const baseUrl = text(Deno.env.get("PUBLIC_APP_URL") || "https://app.arch9.co.za").replace(/\/$/, "");
  let deliveryFailed = false;
  for (const recipient of recipients) {
    const link = `${baseUrl}/seller/sign/${encodeURIComponent(recipient.token)}`;
    const label = documentLabels[documentKey];
    const html = renderBridgeEmailLayout({
      preheader: `Review and sign your ${label} for ${branding.organisationName}.`,
      title: `Review and sign your ${label}`,
      greeting: `Hello ${text(recipient.signer.name)},`,
      contentHtml: renderBridgeIntroParagraphs([
        `${branding.organisationName} has prepared your ${label} for review and signature. Open your private link to read the details and sign on your phone or computer.`,
        "You can correct the details before signing. This link expires in seven days.",
      ]) + renderBridgeCta(`Review and sign ${label}`, link, { primaryColor: "#171717" }),
      branding: { ...branding, primaryColor: "#171717", secondaryColor: "#777777" },
    });
    const result = await sendViaResendApi({
      apiKey, from, to: text(recipient.signer.email),
      replyTo: text(branding.replyTo || branding.supportEmail) || undefined,
      subject: `Please review and sign your ${label}`,
      html,
      text: `Hello ${text(recipient.signer.name)},\n\n${branding.organisationName} has prepared your ${label}. Review, correct details if needed, and sign it: ${link}\n\nThis link expires in seven days.`,
      idempotencyKey: `seller-portal-signature:${signingDocumentId}:${text(recipient.row.signer_email)}`,
    });
    if (!result.ok) { deliveryFailed = true; break; }
    const recipientId = text(inserted.data.find((row: Row) =>
      text(row.signer_email).toLowerCase() === text(recipient.row.signer_email))?.id);
    if (!recipientId) { deliveryFailed = true; break; }
    const recorded = await admin.from("private_listing_seller_portal_signing_recipients")
      .update({ delivered_at: new Date().toISOString(), provider_message_id: text(object(result.data).id) || null })
      .eq("id", recipientId);
    if (recorded.error) { deliveryFailed = true; break; }
  }
  if (deliveryFailed) {
    await admin.from("private_listing_seller_portal_signing_recipients").update({ status: "revoked" }).eq("signing_document_id", signingDocumentId);
    await admin.from("private_listing_seller_portal_signing_documents").update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: "delivery_failed" }).eq("id", signingDocumentId);
    return respond(502, { error: "A signature email could not be delivered. This request was revoked; prepare a new one." });
  }
  const sent = await admin.from("private_listing_seller_portal_signing_documents")
    .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", signingDocumentId);
  if (sent.error) {
    await admin.from("private_listing_seller_portal_signing_documents")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: "activation_failed" })
      .eq("id", signingDocumentId);
    return respond(502, { error: "The signature request could not be activated. Ask your agent to prepare a new request." });
  }
  return respond(200, { success: true, signingDocumentId, sentCount: recipients.length, versionId: copy.document.versionId });
}

async function signerDocument(admin: AdminClient, token: string) {
  if (!token || token.length < 32) return null;
  const tokenHash = await sha256(token);
  const recipient = await admin.from("private_listing_seller_portal_signing_recipients")
    .select("id, signing_document_id, signer_name, signer_role, signer_email, status, expires_at, viewed_at")
    .eq("token_hash", tokenHash).maybeSingle();
  if (recipient.error || !recipient.data) return null;
  const document = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id, private_listing_id, document_key, version_id, version_digest, content_digest, source_version_digest, source_content_digest, reviewed_html, seller_corrections, required_signers, status")
    .eq("id", recipient.data.signing_document_id).maybeSingle();
  if (document.error || !document.data) return null;
  const current = await reviewedCopy(admin, text(document.data.private_listing_id), text(document.data.document_key));
  if (!["sent", "partially_signed"].includes(text(document.data.status)) ||
      !["pending", "viewed"].includes(text(recipient.data.status)) ||
      new Date(text(recipient.data.expires_at)).getTime() <= Date.now() ||
      !current || text(current.document.versionId) !== text(document.data.version_id) ||
      current.versionDigest !== text(document.data.source_version_digest) ||
      current.contentDigest !== text(document.data.source_content_digest) ||
      `sha256:${await sha256(String(document.data.reviewed_html || ""))}` !== text(document.data.content_digest)) return null;
  return { recipient: recipient.data, document: document.data, tokenHash };
}

async function view(admin: AdminClient, payload: Row) {
  if (!enabled()) return respond(503, { error: "Seller portal signing is not enabled." });
  const signing = await signerDocument(admin, text(payload.token));
  if (!signing) return respond(404, { error: "This signing link is unavailable or has expired." });
  if (text(signing.recipient.status) === "pending") await admin.from("private_listing_seller_portal_signing_recipients")
    .update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", signing.recipient.id).eq("status", "pending");
  const current = await reviewedCopy(admin, text(signing.document.private_listing_id), text(signing.document.document_key));
  if (!current) return respond(409, { error: "The approved document has changed. Ask your agent for a new link." });
  const listingDocuments = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id").eq("private_listing_id", signing.document.private_listing_id);
  if (listingDocuments.error) return respond(500, { error: "Unable to check document signatures." });
  const signed = await admin.from("private_listing_seller_portal_signature_evidence")
    .select("id").in("signing_document_id", (listingDocuments.data || []).map((row: Row) => row.id)).limit(1);
  if (signed.error) return respond(500, { error: "Unable to check document signatures." });
  const firstSigner = object(Array.isArray(signing.document.required_signers) ? signing.document.required_signers[0] : {});
  const correctedName = text(object(object(signing.document.seller_corrections).common).sellerName);
  const signerName = text(firstSigner.email).toLowerCase() === text(signing.recipient.signer_email).toLowerCase() && correctedName
    ? correctedName : signing.recipient.signer_name;
  return respond(200, {
    documentKey: signing.document.document_key,
    versionId: signing.document.version_id,
    versionDigest: signing.document.version_digest,
    reviewedHtml: signing.document.reviewed_html,
    signerName,
    signerRole: signing.recipient.signer_role,
    editData: editData(current, text(signing.document.document_key), object(signing.document.seller_corrections)),
    canEdit: !signed.data?.length && text(signing.document.status) === "sent",
  });
}

async function correct(admin: AdminClient, payload: Row) {
  if (!enabled()) return respond(503, { error: "Seller portal signing is not enabled." });
  const signing = await signerDocument(admin, text(payload.token));
  if (!signing) return respond(404, { error: "This signing link is unavailable or has expired." });
  if (text(signing.document.status) !== "sent") return respond(409, { error: "Details are locked after the first signature." });
  const current = await reviewedCopy(admin, text(signing.document.private_listing_id), text(signing.document.document_key));
  if (!current) return respond(409, { error: "The approved document has changed. Ask your agent for a new link." });
  let corrections: Row;
  try { corrections = validatedCorrections(object(payload.corrections), text(signing.document.document_key)); }
  catch (error) { return respond(400, { error: error instanceof Error ? error.message : "Invalid corrected details." }); }
  const active = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id, document_key, version_digest, source_version_digest, seller_corrections")
    .eq("private_listing_id", signing.document.private_listing_id).eq("status", "sent");
  if (active.error || !active.data?.length) return respond(409, { error: "Reload the signing pack before changing it." });
  const updates = [];
  for (const row of active.data) {
    const key = text(row.document_key);
    const source = key === text(signing.document.document_key) ? current
      : await reviewedCopy(admin, text(signing.document.private_listing_id), key);
    if (!source || source.versionDigest !== text(row.source_version_digest)) {
      return respond(409, { error: "An approved document changed. Ask your agent for a new link." });
    }
    const values = key === text(signing.document.document_key) ? corrections
      : validatedCorrections({ ...editData(source, key, object(row.seller_corrections)), common: corrections.common }, key);
    const reviewedHtml = renderCorrectedHtml(source, key, values, text(signing.document.private_listing_id));
    const contentDigest = `sha256:${await sha256(reviewedHtml)}`;
    updates.push({ documentId: row.id, expectedVersionDigest: row.version_digest, corrections: values, reviewedHtml,
      contentDigest, versionDigest: `sha256:${await sha256(`${source.versionDigest}:${contentDigest}`)}` });
  }
  const saved = await admin.rpc("bridge_update_seller_portal_document_corrections", {
    p_token_hash: signing.tokenHash,
    p_expected_version_digest: text(payload.versionDigest),
    p_updates: updates,
  });
  if (saved.error) return respond(409, { error: "Details changed or became locked. Reload the link before signing." });
  const selected = updates.find((row) => text(row.documentId) === text(signing.document.id));
  if (!selected) return respond(500, { error: "Corrected document was not returned." });
  const firstSigner = object(Array.isArray(signing.document.required_signers) ? signing.document.required_signers[0] : {});
  const signerName = text(firstSigner.email).toLowerCase() === text(signing.recipient.signer_email).toLowerCase()
    ? text(object(corrections.common).sellerName) : signing.recipient.signer_name;
  return respond(200, { success: true, reviewedHtml: selected.reviewedHtml, versionDigest: selected.versionDigest,
    editData: editData(current, text(signing.document.document_key), corrections), signerName });
}

async function sign(req: Request, admin: AdminClient, payload: Row) {
  if (!enabled()) return respond(503, { error: "Seller portal signing is not enabled." });
  const signing = await signerDocument(admin, text(payload.token));
  if (!signing) return respond(404, { error: "This signing link is unavailable or has expired." });
  const signedName = text(payload.signedName), signatureType = text(payload.signatureType);
  const signatureValue = text(payload.signatureValue);
  const signedDate = text(payload.signedDate), signedPlace = text(payload.signedPlace);
  const firstSigner = object(Array.isArray(signing.document.required_signers) ? signing.document.required_signers[0] : {});
  const correctedName = text(object(object(signing.document.seller_corrections).common).sellerName);
  const expectedName = text(firstSigner.email).toLowerCase() === text(signing.recipient.signer_email).toLowerCase() && correctedName
    ? correctedName : text(signing.recipient.signer_name);
  const validSignedDate = /^\d{4}-\d{2}-\d{2}$/.test(signedDate) &&
    !Number.isNaN(Date.parse(`${signedDate}T00:00:00Z`)) &&
    new Date(`${signedDate}T00:00:00Z`).toISOString().slice(0, 10) === signedDate;
  if (signedName.toLowerCase() !== expectedName.toLowerCase() ||
      signatureType !== "drawn" || signatureValue.length < 100 || signatureValue.length > 1_500_000 ||
      !/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(signatureValue) ||
      !validSignedDate || signedPlace.length < 2 || signedPlace.length > 160) {
    return respond(400, { error: "Confirm the named signer, draw a signature, and enter its date and place." });
  }
  if (payload.accepted !== true || text(payload.versionDigest) !== text(signing.document.version_digest)) {
    return respond(409, { error: "Review and accept the exact document version before signing." });
  }
  const ip = text(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")).slice(0, 200);
  const agent = text(req.headers.get("user-agent")).slice(0, 500);
  const saved = await admin.rpc("bridge_submit_seller_portal_document_signature", {
    p_token_hash: signing.tokenHash,
    p_signed_name: signedName,
    p_signature_type: signatureType,
    p_signature_value: signatureValue,
    p_signed_date: signedDate,
    p_signed_place: signedPlace,
    p_acceptance_ip: ip || null,
    p_acceptance_user_agent: agent || null,
    p_expected_version_digest: text(payload.versionDigest),
  });
  if (saved.error) return respond(409, { error: "This document could not be signed. Ask your agent for a new link." });
  return respond(200, { success: true, allRequiredSignersComplete: saved.data?.allRequiredSignersComplete === true });
}

async function list(req: Request, admin: AdminClient, url: string, anonKey: string, payload: Row) {
  const context = await staffListing(req, admin, url, anonKey, text(payload.listingId));
  if (!context) return respond(403, { error: "Agent access to this listing is required." });
  await expireStaleRequests(admin, text(context.listing.id));
  const documents = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id, document_key, version_id, status, created_at, sent_at, signed_at, reviewed_at, signed_document_id")
    .eq("private_listing_id", context.listing.id).order("created_at", { ascending: false });
  if (documents.error) return respond(500, { error: "Unable to load signing requests." });
  return respond(200, { documents: documents.data || [] });
}

async function preview(req: Request, admin: AdminClient, url: string, anonKey: string, payload: Row) {
  const id = text(payload.signingDocumentId);
  const document = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id, private_listing_id, document_key, version_id, version_digest, source_version_digest, reviewed_html, required_signers, status")
    .eq("id", id).maybeSingle();
  if (document.error || !document.data) return respond(404, { error: "Signing document not found." });
  const context = await staffListing(req, admin, url, anonKey, text(document.data.private_listing_id));
  if (!context) return respond(403, { error: "Agent access to this listing is required." });
  if (text(document.data.status) !== "signed") return respond(409, { error: "All signatures must be complete before review." });
  const current = await reviewedCopy(admin, text(document.data.private_listing_id), text(document.data.document_key));
  if (!current || text(current.document.versionId) !== text(document.data.version_id) ||
      current.versionDigest !== text(document.data.source_version_digest)) {
    return respond(409, { error: "A newer reviewed document replaced this signing request." });
  }
  const evidence = await admin.from("private_listing_seller_portal_signature_evidence")
    .select("signed_name, signature_type, signature_value, signed_date, signed_place, accepted_at, evidence_digest")
    .eq("signing_document_id", id).order("accepted_at", { ascending: true });
  if (evidence.error || evidence.data?.length !== (Array.isArray(document.data.required_signers) ? document.data.required_signers.length : 0)) {
    return respond(409, { error: "Signature evidence is incomplete." });
  }
  return respond(200, {
    documentKey: document.data.document_key,
    versionDigest: document.data.version_digest,
    signedHtml: signedHtml(String(document.data.reviewed_html || ""), evidence.data, text(document.data.version_digest)),
  });
}

async function review(req: Request, admin: AdminClient, url: string, anonKey: string, payload: Row) {
  const id = text(payload.signingDocumentId);
  const document = await admin.from("private_listing_seller_portal_signing_documents")
    .select("id, private_listing_id, document_key, version_id, version_digest, source_version_digest, reviewed_html, status")
    .eq("id", id).maybeSingle();
  if (document.error || !document.data) return respond(404, { error: "Signing document not found." });
  const context = await staffListing(req, admin, url, anonKey, text(document.data.private_listing_id));
  if (!context) return respond(403, { error: "Agent access to this listing is required." });
  if (text(document.data.status) !== "signed") return respond(409, { error: "All signatures must be complete before review." });
  const current = await reviewedCopy(admin, text(document.data.private_listing_id), text(document.data.document_key));
  if (!current || text(current.document.versionId) !== text(document.data.version_id) ||
      current.versionDigest !== text(document.data.source_version_digest)) {
    return respond(409, { error: "A newer reviewed document replaced this signing request." });
  }
  const evidence = await admin.from("private_listing_seller_portal_signature_evidence")
    .select("signed_name, signature_type, signature_value, signed_date, signed_place, accepted_at, evidence_digest")
    .eq("signing_document_id", id).order("accepted_at", { ascending: true });
  if (evidence.error || !evidence.data?.length) return respond(409, { error: "Signature evidence is unavailable." });
  const html = signedHtml(String(document.data.reviewed_html || ""), evidence.data, text(document.data.version_digest));
  const digest = `sha256:${await sha256(html)}`;
  const saved = await admin.rpc("bridge_review_seller_portal_signed_document", {
    p_signing_document_id: id,
    p_signed_html: html,
    p_signed_html_digest: digest,
    p_reviewer_id: context.staff.userId,
  });
  if (saved.error) return respond(409, { error: "Review failed. Confirm every signer completed the current version." });
  return respond(200, { success: true, documentId: saved.data?.documentId, versionId: saved.data?.documentVersionId });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed." });
  const url = text(Deno.env.get("SUPABASE_URL"));
  const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY"));
  if (!url || !serviceKey || !anonKey) return respond(500, { error: "Signing service is unavailable." });
  const admin = createAdmin(url, serviceKey);
  try {
    const payload = object(await req.json());
    switch (text(payload.action)) {
      case "issue": return await issue(req, admin, url, anonKey, payload);
      case "view": return await view(admin, payload);
      case "correct": return await correct(admin, payload);
      case "sign": return await sign(req, admin, payload);
      case "list": return await list(req, admin, url, anonKey, payload);
      case "preview": return await preview(req, admin, url, anonKey, payload);
      case "review": return await review(req, admin, url, anonKey, payload);
      default: return respond(400, { error: "Unknown signing action." });
    }
  } catch {
    return respond(500, { error: "Unable to process this signing request." });
  }
});
