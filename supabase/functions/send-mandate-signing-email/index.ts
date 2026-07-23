import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  assertLegalDocumentPilotRelease,
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
} from "../_shared/legalDocumentPilotRelease.ts";
import {
  assertLegalDocumentPilotLifecycleBinding,
  recordLegalDocumentPilotLifecycleTrace,
} from "../_shared/legalDocumentPilotLifecycleTrace.ts";
import { handleSellerMandateSentEmail } from "../send-email/handlers/sellerMandateSent.ts";
import { corsHeaders, jsonResponse } from "../send-email/utils/http.ts";

type JsonRecord = Record<string, unknown>;

const PRIVILEGED_PACKET_ROLES = new Set([
  "principal",
  "owner",
  "admin",
  "super_admin",
  "branch_manager",
  "manager",
  "agency_admin",
  "agent_admin",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function booleanFlag(value: unknown) {
  return value === true || normalizeText(value).toLowerCase() === "true";
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function bearerToken(req: Request) {
  return normalizeText(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
}

function extractSigningToken(portalLink: unknown) {
  const raw = normalizeText(portalLink);
  if (!raw) return "";

  try {
    const parsed = new URL(raw, "https://invalid.local");
    const segments = parsed.pathname.split("/").filter(Boolean);
    const signIndex = segments.findIndex((segment) => segment.toLowerCase() === "sign");
    const token = signIndex >= 0 ? decodeURIComponent(segments[signIndex + 1] || "") : "";
    return /^[A-Za-z0-9._~-]{16,512}$/.test(token) ? token : "";
  } catch {
    return "";
  }
}

function resolveAppBaseUrl() {
  return normalizeText(
    Deno.env.get("PUBLIC_APP_URL") ||
      Deno.env.get("CLIENT_APP_URL") ||
      Deno.env.get("VITE_PUBLIC_APP_URL") ||
      "https://app.arch9.co.za",
  ).replace(/\/$/, "");
}

function membershipIsActive(membership: JsonRecord | null) {
  const status = normalizeText(membership?.membership_status || membership?.status).toLowerCase();
  return status === "active" || status === "accepted";
}

function membershipIsPrivileged(membership: JsonRecord | null) {
  return [
    membership?.role,
    membership?.workspace_role,
    membership?.organisation_role,
    membership?.app_role,
  ].some((role) => PRIVILEGED_PACKET_ROLES.has(normalizeText(role).toLowerCase()));
}

async function resolveInvocationAuthority({
  req,
  serviceClient,
  serviceKey,
}: {
  req: Request;
  serviceClient: any;
  serviceKey: string;
}) {
  const token = bearerToken(req);
  if (!token) return { kind: "none" as const, userId: "" };
  if (token === serviceKey) return { kind: "service" as const, userId: "" };

  const userResult = await serviceClient.auth.getUser(token);
  const userId = normalizeText(userResult.data?.user?.id);
  if (userResult.error || !userId) return { kind: "none" as const, userId: "" };
  return { kind: "user" as const, userId };
}

function canManagePacket({
  authority,
  membership,
  packet,
}: {
  authority: { kind: "none" | "service" | "user"; userId: string };
  membership: JsonRecord | null;
  packet: JsonRecord;
}) {
  if (authority.kind === "service") return true;
  if (authority.kind !== "user" || !membershipIsActive(membership)) return false;
  if (membershipIsPrivileged(membership)) return true;
  return authority.userId === normalizeText(packet.assigned_agent_id) ||
    authority.userId === normalizeText(packet.created_by);
}

function versionHasCertifiedPdf(version: JsonRecord | null) {
  const path = normalizeText(version?.rendered_file_path);
  const sha256 = normalizeText(version?.rendered_sha256).toLowerCase();
  const byteLength = Number(version?.rendered_byte_length);
  return Boolean(
    version &&
      normalizeText(version.rendered_document_id) &&
      normalizeText(version.rendered_file_bucket) &&
      path &&
      path.toLowerCase().endsWith(".pdf") &&
      booleanFlag(version.render_input_verified) &&
      booleanFlag(version.transaction_pdf_persisted) &&
      booleanFlag(version.native_pdf_verified) &&
      normalizeText(version.rendered_media_type).toLowerCase() === "application/pdf" &&
      /^sha256:[0-9a-f]{64}$/.test(sha256) &&
      Number.isFinite(byteLength) &&
      byteLength > 0,
  );
}

function documentMatchesCertifiedVersion({
  document,
  packet,
  version,
}: {
  document: JsonRecord | null;
  packet: JsonRecord;
  version: JsonRecord;
}) {
  return Boolean(
    document &&
      normalizeText(document.legal_packet_id) === normalizeText(packet.id) &&
      normalizeText(document.legal_packet_version_id) === normalizeText(version.id) &&
      normalizeText(document.generated_artifact_bucket) === normalizeText(version.rendered_file_bucket) &&
      normalizeText(document.file_path) === normalizeText(version.rendered_file_path) &&
      normalizeText(document.generated_artifact_sha256).toLowerCase() === normalizeText(version.rendered_sha256).toLowerCase(),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed.", errorCode: "METHOD_NOT_ALLOWED" });
  }

  try {
    const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
    const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, {
        success: false,
        error: "Mandate email delivery is not configured.",
        errorCode: "MANDATE_EMAIL_CONFIGURATION_MISSING",
      });
    }

    const payload = asRecord(await req.json().catch(() => ({})));
    const type = normalizeText(payload.type).toLowerCase().replaceAll("-", "_");
    if (!["seller_mandate_sent", "seller_mandate", "otp_signing"].includes(type)) {
      return jsonResponse(400, {
        success: false,
        error: "Unsupported packet signing email type.",
        errorCode: "MANDATE_EMAIL_TYPE_UNSUPPORTED",
      });
    }

    const isOtpSigning = type === "otp_signing";
    const packetId = normalizeText(payload.packetId || payload.packet_id || payload.mandateId || payload.mandate_id);
    const requestedPacketVersionId = normalizeText(payload.packetVersionId || payload.packet_version_id);
    const signingToken = extractSigningToken(payload.portalLink || payload.portal_link);
    const dispatchId = normalizeText(payload.dispatchId || payload.dispatch_id);
    const isResend = booleanFlag(payload.resend) || booleanFlag(payload.reminder);
    if (!packetId || !signingToken) {
      return jsonResponse(400, {
        success: false,
        error: "A packet-bound signing link is required before a mandate email can be sent.",
        errorCode: "MANDATE_EMAIL_PACKET_BINDING_REQUIRED",
      });
    }
    if (dispatchId && !UUID_PATTERN.test(dispatchId)) {
      return jsonResponse(400, {
        success: false,
        error: "The signing delivery dispatch identifier is invalid.",
        errorCode: "MANDATE_EMAIL_DISPATCH_ID_INVALID",
      });
    }
    if (isOtpSigning && (!requestedPacketVersionId || !dispatchId)) {
      return jsonResponse(400, {
        success: false,
        error: "OTP delivery requires the exact certified packet version and a targeted signing dispatch.",
        errorCode: "OTP_EMAIL_DISPATCH_BINDING_REQUIRED",
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authority = await resolveInvocationAuthority({ req, serviceClient: supabase, serviceKey: serviceRoleKey });
    if (authority.kind === "none") {
      return jsonResponse(401, {
        success: false,
        error: "Authenticated internal delivery authority is required.",
        errorCode: "MANDATE_EMAIL_AUTH_REQUIRED",
      });
    }

    const [packetResult, versionResult] = await Promise.all([
      supabase
        .from("document_packets")
        .select("id, organisation_id, packet_type, transaction_id, title, status, current_version_number, assigned_agent_id, created_by")
        .eq("id", packetId)
        .maybeSingle(),
      supabase
        .from("document_packet_versions")
        .select("id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_bucket, rendered_file_path, rendered_media_type, rendered_byte_length, rendered_sha256, render_input_verified, transaction_pdf_persisted, native_pdf_verified")
        .eq("packet_id", packetId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (packetResult.error) throw packetResult.error;
    if (versionResult.error) throw versionResult.error;

    const packet = packetResult.data as JsonRecord | null;
    const version = versionResult.data as JsonRecord | null;
    if (!packet || !version) {
      return jsonResponse(404, {
        success: false,
        error: "The signing packet is unavailable.",
        errorCode: "MANDATE_EMAIL_PACKET_UNAVAILABLE",
      });
    }

    const requestedOrganisationId = normalizeText(payload.organisationId || payload.organisation_id);
    const packetType = normalizeText(packet.packet_type).toLowerCase();
    const packetStatus = normalizeText(packet.status).toLowerCase();
    const versionIsCurrent =
      normalizeText(version.organisation_id) === normalizeText(packet.organisation_id) &&
      Number(version.version_number) === Number(packet.current_version_number) &&
      normalizeText(version.render_status).toLowerCase() === "generated";
    const expectedPacketType = isOtpSigning ? "otp" : "mandate";
    if (
      (requestedOrganisationId && requestedOrganisationId !== normalizeText(packet.organisation_id)) ||
      packetType !== expectedPacketType ||
      (isOtpSigning && (!normalizeText(packet.transaction_id) || requestedPacketVersionId !== normalizeText(version.id))) ||
      // Dispatch intentionally happens while a canonical packet is prepared,
      // before the caller commits its public "sent" lifecycle transition.
      !["signing_prep", "signing_prepared", "ready_to_send", "sent", "partially_signed"].includes(packetStatus) ||
      !versionIsCurrent ||
      !versionHasCertifiedPdf(version)
    ) {
      return jsonResponse(409, {
        success: false,
        error: "The signing packet is not a current, certified PDF that may be delivered for signature.",
        errorCode: isOtpSigning ? "OTP_EMAIL_PACKET_NOT_DELIVERABLE" : "MANDATE_EMAIL_PACKET_NOT_DELIVERABLE",
      });
    }

    let membership: JsonRecord | null = null;
    if (authority.kind === "user") {
      const membershipResult = await supabase
        .from("organisation_users")
        .select("role, workspace_role, organisation_role, app_role, status, membership_status")
        .eq("organisation_id", normalizeText(packet.organisation_id))
        .eq("user_id", authority.userId)
        .limit(1)
        .maybeSingle();
      if (membershipResult.error) throw membershipResult.error;
      membership = membershipResult.data as JsonRecord | null;
    }
    if (!canManagePacket({ authority, membership, packet })) {
      return jsonResponse(403, {
        success: false,
        error: "You are not allowed to deliver this packet for signature.",
        errorCode: "MANDATE_EMAIL_PACKET_FORBIDDEN",
      });
    }

    const sourceDocumentResult = await supabase
      .from("documents")
      .select("id, legal_packet_id, legal_packet_version_id, generated_artifact_bucket, generated_artifact_sha256, file_path")
      .eq("id", normalizeText(version.rendered_document_id))
      .maybeSingle();
    if (sourceDocumentResult.error) throw sourceDocumentResult.error;
    const sourceDocument = sourceDocumentResult.data as JsonRecord | null;
    if (!documentMatchesCertifiedVersion({ document: sourceDocument, packet, version })) {
      return jsonResponse(409, {
        success: false,
        error: "The packet's certified source PDF link is unavailable for signing delivery.",
        errorCode: "MANDATE_EMAIL_CERTIFIED_PDF_LINK_INVALID",
      });
    }

    const signerResult = await supabase
      .from("document_packet_signers")
      .select("id, organisation_id, packet_id, packet_version_id, signer_role, signer_name, signer_email, signing_token, token_expires_at, status")
      .eq("packet_id", packetId)
      .eq("packet_version_id", normalizeText(version.id))
      .eq("signing_token", signingToken)
      .maybeSingle();
    if (signerResult.error) throw signerResult.error;
    const signer = signerResult.data as JsonRecord | null;
    const signerEmail = normalizeEmail(signer?.signer_email);
    const requestedRecipient = normalizeEmail(payload.to);
    const tokenExpiry = Date.parse(normalizeText(signer?.token_expires_at));
    const signerStatus = normalizeText(signer?.status).toLowerCase();
    const signerMayBeRecordedByDispatch = Boolean(dispatchId) && ["sent", "viewed"].includes(signerStatus);
    const signerCanReceiveDelivery = isResend
      ? ["sent", "viewed"].includes(signerStatus)
      : signerStatus === "ready_to_send" || signerMayBeRecordedByDispatch;
    if (
      !signer ||
      normalizeText(signer.organisation_id) !== normalizeText(packet.organisation_id) ||
      !signerEmail ||
      (requestedRecipient && requestedRecipient !== signerEmail) ||
      !signerCanReceiveDelivery ||
      !Number.isFinite(tokenExpiry) ||
      tokenExpiry <= Date.now()
    ) {
      return jsonResponse(409, {
        success: false,
        error: "The recipient does not have an active, packet-bound signing invitation.",
        errorCode: "MANDATE_EMAIL_SIGNER_BINDING_INVALID",
      });
    }

    const certifiedSourceDownload = await supabase.storage
      .from(normalizeText(version.rendered_file_bucket))
      .download(normalizeText(version.rendered_file_path));
    if (certifiedSourceDownload.error || !certifiedSourceDownload.data) {
      return jsonResponse(409, {
        success: false,
        error: "The packet's certified source PDF cannot be read from controlled storage.",
        errorCode: "MANDATE_EMAIL_CERTIFIED_PDF_UNREADABLE",
      });
    }
    const certifiedSourceBytes = new Uint8Array(await certifiedSourceDownload.data.arrayBuffer());
    const certifiedSourceSha256 = normalizeText(version.rendered_sha256).toLowerCase();
    if (
      new TextDecoder().decode(certifiedSourceBytes.subarray(0, 4)) !== "%PDF" ||
      certifiedSourceBytes.length !== Number(version.rendered_byte_length) ||
      `sha256:${await sha256Hex(certifiedSourceBytes)}` !== certifiedSourceSha256
    ) {
      return jsonResponse(409, {
        success: false,
        error: "The packet's source PDF bytes no longer match its certified record.",
        errorCode: "MANDATE_EMAIL_CERTIFIED_PDF_INTEGRITY_MISMATCH",
      });
    }

    const signerRole = normalizeText(signer.signer_role).toLowerCase();
    const signerName = normalizeText(signer.signer_name) || "Signer";
    if (dispatchId) {
      const dispatchResult = await supabase
        .from("document_signing_dispatches")
        .select("id, packet_id, packet_version_id, target_signer_role, status, delivery_evidence_json, completed_at")
        .eq("id", dispatchId)
        .maybeSingle();
      if (dispatchResult.error) throw dispatchResult.error;
      const dispatch = dispatchResult.data as JsonRecord | null;
      if (
        !dispatch ||
        normalizeText(dispatch.packet_id) !== packetId ||
        normalizeText(dispatch.packet_version_id) !== normalizeText(version.id) ||
        (isOtpSigning && normalizeText(dispatch.target_signer_role).toLowerCase() !== signerRole) ||
        (normalizeText(dispatch.target_signer_role) && normalizeText(dispatch.target_signer_role).toLowerCase() !== signerRole)
      ) {
        return jsonResponse(409, {
          success: false,
          error: "The signing delivery dispatch is not bound to this signer.",
          errorCode: "MANDATE_EMAIL_DISPATCH_BINDING_INVALID",
        });
      }
      if (normalizeText(dispatch.status).toLowerCase() === "delivered") {
        if (!["sent", "viewed"].includes(signerStatus)) {
          return jsonResponse(409, {
            success: false,
            error: "The delivered dispatch does not have an active signer state.",
            errorCode: "MANDATE_EMAIL_DISPATCH_SIGNER_STATE_INVALID",
          });
        }
        const evidence = asRecord(dispatch.delivery_evidence_json);
        try {
          await recordLegalDocumentPilotLifecycleTrace({
            supabase,
            packetId,
            packetVersionId: normalizeText(version.id),
            stage: "signing_invite_delivered",
          });
        } catch (error) {
          // This branch does not send a new email. Keep the existing packet's
          // idempotent completion path usable during a later pilot hold; the
          // missing trace simply means it cannot count toward Phase 5 proof.
          console.warn("send-mandate-signing-email existing delivery trace unavailable", error);
        }
        return jsonResponse(200, {
          success: true,
          ok: true,
          type,
          emailConfirmed: true,
          emailId: normalizeText(evidence.providerMessageId) || null,
          recipientEmail: signerEmail,
          recipientRole: signerRole,
          packetId,
          packetVersionId: normalizeText(version.id),
          delivery: {
            contract: isOtpSigning ? "phase2-otp-signing-delivery-v1" : "phase0-mandate-signing-delivery-v1",
            recorded: true,
            idempotent: true,
            dispatchId,
            packetId,
            packetVersionId: normalizeText(version.id),
            deliveryEvidence: evidence,
          },
        });
      }
    }

    // A previously recorded dispatch is deliberately returned above without
    // consulting the current pilot state. This fence applies only before a
    // new customer-facing signing email can leave the system.
    try {
      const activeRelease = assertLegalDocumentPilotRelease({
        organisationId: packet.organisation_id,
        operation: "signing_invite",
      });
      await assertLegalDocumentPilotLifecycleBinding({
        supabase,
        packetId,
        packetVersionId: normalizeText(version.id),
        activeRelease,
      });
    } catch (error) {
      const typed = error as { code?: unknown; status?: unknown; message?: unknown };
      const status = Number(typed.status);
      return jsonResponse(Number.isFinite(status) ? status : 403, {
        success: false,
        error: normalizeText(typed.message) || "Legal-document signing delivery is not enabled for this packet organisation.",
        errorCode: normalizeText(typed.code) || "LEGAL_DOCUMENT_PILOT_RELEASE_BLOCKED",
        pilotReleaseContract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
      });
    }

    const deliveryPrefix = isOtpSigning ? "otp-signing" : "mandate-signing";
    const providerIdempotencyKey = dispatchId
      ? `${deliveryPrefix}:${packetId}:${normalizeText(version.id)}:${normalizeText(signer.id)}:${dispatchId}`
      : isResend
        ? `${deliveryPrefix}:${packetId}:${normalizeText(version.id)}:${normalizeText(signer.id)}:resend:${crypto.randomUUID()}`
        : `${deliveryPrefix}:${packetId}:${normalizeText(version.id)}:${normalizeText(signer.id)}:initial`;
    const providerResponse = await handleSellerMandateSentEmail({
      ...payload,
      type: "seller_mandate_sent",
      to: signerEmail,
      organisationId: normalizeText(packet.organisation_id),
      packetId: normalizeText(packet.id),
      mandateId: normalizeText(packet.id),
      recipientRole: signerRole,
      recipientName: signerName,
      sellerName: normalizeText(payload.sellerName) || signerName,
      propertyTitle: normalizeText(packet.title) || "your property",
      mandateType: packetType === "otp" ? "Offer to Purchase" : "Mandate",
      portalLink: `${resolveAppBaseUrl()}/sign/${signingToken}`,
      idempotencyKey: providerIdempotencyKey,
    } as never);
    const providerBody = asRecord(await providerResponse.json().catch(() => ({})));
    const providerMessageId = normalizeText(providerBody.emailId);
    if (!providerResponse.ok || !providerMessageId) {
      return jsonResponse(502, {
        success: false,
        error: normalizeText(providerBody.error) || "The email provider did not confirm mandate signing delivery.",
        errorCode: normalizeText(providerBody.errorCode) || "MANDATE_EMAIL_PROVIDER_UNCONFIRMED",
        retryable: true,
      });
    }

    const deliveryEvidence = {
      provider: "resend",
      providerMessageId,
      providerStatus: providerBody.providerStatus || null,
      recipientEmail: signerEmail,
      recipientRole: signerRole || null,
      emailConfirmed: true,
      idempotencyKey: providerIdempotencyKey,
    };
    const deliveryRpc = isOtpSigning
      ? "bridge_record_otp_signing_delivery_phase2"
      : "bridge_record_mandate_signing_delivery_phase0";
    const recordedDelivery = await supabase.rpc(deliveryRpc, {
      p_packet_id: packetId,
      p_version_id: normalizeText(version.id),
      p_signer_id: normalizeText(signer.id),
      p_signing_token: signingToken,
      p_provider_message_id: providerMessageId,
      p_delivery_evidence: deliveryEvidence,
      p_dispatch_id: dispatchId || null,
      p_is_resend: isResend,
    });
    if (recordedDelivery.error || !recordedDelivery.data) {
      console.error("send-mandate-signing-email delivery evidence record failed", {
        packetId,
        packetVersionId: normalizeText(version.id),
        signerId: normalizeText(signer.id),
        providerMessageId,
        error: recordedDelivery.error,
      });
      return jsonResponse(502, {
        success: false,
        error: "The provider accepted the email, but the controlled delivery record could not be written. No sent status was recorded.",
        errorCode: isOtpSigning ? "OTP_EMAIL_DELIVERY_RECORD_FAILED" : "MANDATE_EMAIL_DELIVERY_RECORD_FAILED",
        retryable: true,
      });
    }
    try {
      await recordLegalDocumentPilotLifecycleTrace({
        supabase,
        packetId,
        packetVersionId: normalizeText(version.id),
        stage: "signing_invite_delivered",
      });
    } catch (error) {
      const typed = error as { code?: unknown; message?: unknown };
      return jsonResponse(409, {
        success: false,
        error: "The provider accepted the email, but its release-bound lifecycle trace could not be recorded. Retry only after this packet is reconciled.",
        errorCode: normalizeText(typed.code) || "PHASE5_RELEASE_TRACE_RECORD_REQUIRED",
        retryable: false,
      });
    }

    return jsonResponse(200, {
      success: true,
      ok: true,
      type,
      emailConfirmed: true,
      emailId: providerMessageId,
      providerStatus: providerBody.providerStatus || null,
      recipientEmail: signerEmail,
      recipientRole: signerRole,
      packetId,
      packetVersionId: normalizeText(version.id),
      delivery: recordedDelivery.data,
    });
  } catch (error) {
    console.error("send-mandate-signing-email failed", error);
    return jsonResponse(500, {
      success: false,
      error: "The mandate signing email could not be sent.",
      errorCode: "MANDATE_EMAIL_DELIVERY_FAILED",
    });
  }
});
