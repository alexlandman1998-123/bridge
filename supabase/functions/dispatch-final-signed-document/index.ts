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
import { handleSellerMandateSignedEmail } from "../send-email/handlers/sellerMandateSigned.ts";
import { assessControlledTestRecipient } from "../send-email/utils/controlledTestRecipient.ts";

type JsonRecord = Record<string, unknown>;
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function response(status: number, body: JsonRecord) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function resolveAppBaseUrl() {
  return text(
    Deno.env.get("PUBLIC_APP_URL") ||
      Deno.env.get("CLIENT_APP_URL") ||
      Deno.env.get("VITE_PUBLIC_APP_URL") ||
      "https://app.arch9.co.za",
  ).replace(/\/$/, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return response(405, { success: false, error: "Method not allowed." });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return response(500, { success: false, error: "Missing Supabase configuration." });
    if (text(req.headers.get("authorization")) !== `Bearer ${serviceKey}`) return response(403, { success: false, error: "Service-role delivery authority is required.", errorCode: "FINAL_DELIVERY_FORBIDDEN" });
    const payload = await req.json() as JsonRecord;
    const packetId = text(payload.packetId || payload.packet_id);
    const packetVersionId = text(payload.packetVersionId || payload.packet_version_id);
    if (!packetId || !packetVersionId) return response(400, { success: false, error: "packetId and packetVersionId are required.", errorCode: "FINAL_DELIVERY_TARGET_REQUIRED" });
    const supabase = createClient(url, serviceKey);
    const [packetResult, versionResult, evidenceResult, signersResult, deliveriesResult, transactionPublicationResult, completionReceiptResult, portalPublicationResult] = await Promise.all([
      supabase.from("document_packets").select("id, organisation_id, packet_type, title, status, current_version_number").eq("id", packetId).maybeSingle(),
      supabase.from("document_packet_versions").select("id, packet_id, organisation_id, version_number, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, finalised_at").eq("id", packetVersionId).eq("packet_id", packetId).maybeSingle(),
      supabase.from("legal_final_artifact_evidence").select("organisation_id, packet_id, packet_version_id, bucket, path, file_name, sha256, byte_length, generated_at").eq("packet_version_id", packetVersionId).maybeSingle(),
      supabase.from("document_packet_signers").select("id, packet_id, packet_version_id, signer_role, signer_name, signer_email, signing_token, status, signed_at").eq("packet_id", packetId).eq("packet_version_id", packetVersionId),
      supabase.from("legal_final_artifact_deliveries").select("signer_id, status, provider_message_id, attempted_at, attempt_number").eq("packet_version_id", packetVersionId).order("attempt_number", { ascending: false }),
      supabase.from("legal_final_transaction_publications").select("id, organisation_id, transaction_id, packet_id, packet_version_id, document_id, artifact_sha256, artifact_bucket, artifact_path, published_at").eq("packet_version_id", packetVersionId).maybeSingle(),
      supabase.from("legal_final_completion_receipts").select("id, organisation_id, transaction_id, packet_id, packet_version_id, document_id, publication_id, artifact_sha256, transaction_visible, client_visible, canonical_satisfied, completed_at").eq("packet_version_id", packetVersionId).maybeSingle(),
      supabase.from("legal_final_artifact_publications").select("id, organisation_id, packet_id, packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at").eq("packet_version_id", packetVersionId).maybeSingle(),
    ]);
    for (const result of [packetResult, versionResult, evidenceResult, signersResult, deliveriesResult, transactionPublicationResult, completionReceiptResult, portalPublicationResult]) if (result.error) throw result.error;
    const packet = packetResult.data as JsonRecord | null;
    const version = versionResult.data as JsonRecord | null;
    const evidence = evidenceResult.data as JsonRecord | null;
    const signers = (signersResult.data || []) as JsonRecord[];
    const bindingValid = Boolean(packet && version && evidence) && text(packet?.status).toLowerCase() === "completed" && Number(packet?.current_version_number) === Number(version?.version_number) && text(packet?.organisation_id) === text(version?.organisation_id) && text(evidence?.packet_id) === packetId && text(evidence?.packet_version_id) === packetVersionId && text(evidence?.path) === text(version?.final_signed_file_path) && text(evidence?.bucket) === text(version?.final_signed_file_bucket);
    if (!bindingValid || !signers.length || signers.some((signer) => text(signer.status).toLowerCase() !== "signed")) return response(409, { success: false, error: "F2 final completion evidence is required before delivery.", errorCode: "FINAL_DELIVERY_F2_INVALID" });
    const portalSurface = text(packet?.packet_type).toLowerCase() === "mandate" ? "seller_portal" : "client_portal";
    const latestBySigner = new Map<string, JsonRecord>();
    for (const row of (deliveriesResult.data || []) as JsonRecord[]) if (!latestBySigner.has(text(row.signer_id))) latestBySigner.set(text(row.signer_id), row);
    const hasNewCustomerDelivery = signers.some((signer) => {
      const existing = latestBySigner.get(text(signer.id));
      return !(text(existing?.status) === "sent" && text(existing?.provider_message_id));
    });

    // The dispatcher has one deliberately narrow historical exception. It
    // may return a read-only success for an artifact that was already F2/F3/F4
    // complete and delivered before a later pilot hold. It must not repair,
    // republish, trace, email, or otherwise mutate that historical record;
    // signed-PDF access itself remains owned by the signer-bound resolver.
    const historicalTransactionPublication = transactionPublicationResult.data as JsonRecord | null;
    const historicalCompletionReceipt = completionReceiptResult.data as JsonRecord | null;
    const historicalPortalPublication = portalPublicationResult.data as JsonRecord | null;
    const historicalCompletedArtifact = Boolean(
      !hasNewCustomerDelivery &&
      historicalTransactionPublication &&
      historicalCompletionReceipt &&
      historicalPortalPublication &&
      text(historicalTransactionPublication.packet_id) === packetId &&
      text(historicalTransactionPublication.packet_version_id) === packetVersionId &&
      text(historicalTransactionPublication.organisation_id) === text(packet?.organisation_id) &&
      text(historicalTransactionPublication.artifact_sha256).toLowerCase() === text(evidence?.sha256).toLowerCase() &&
      text(historicalTransactionPublication.artifact_bucket) === text(evidence?.bucket) &&
      text(historicalTransactionPublication.artifact_path) === text(evidence?.path) &&
      text(historicalCompletionReceipt.packet_id) === packetId &&
      text(historicalCompletionReceipt.packet_version_id) === packetVersionId &&
      text(historicalCompletionReceipt.organisation_id) === text(packet?.organisation_id) &&
      text(historicalCompletionReceipt.publication_id) === text(historicalTransactionPublication.id) &&
      text(historicalCompletionReceipt.document_id) === text(historicalTransactionPublication.document_id) &&
      text(historicalCompletionReceipt.artifact_sha256).toLowerCase() === text(evidence?.sha256).toLowerCase() &&
      historicalCompletionReceipt.transaction_visible === true &&
      historicalCompletionReceipt.client_visible === true &&
      historicalCompletionReceipt.canonical_satisfied === true &&
      text(historicalPortalPublication.packet_id) === packetId &&
      text(historicalPortalPublication.packet_version_id) === packetVersionId &&
      text(historicalPortalPublication.organisation_id) === text(packet?.organisation_id) &&
      text(historicalPortalPublication.artifact_sha256).toLowerCase() === text(evidence?.sha256).toLowerCase() &&
      text(historicalPortalPublication.artifact_path) === text(evidence?.path) &&
      text(historicalPortalPublication.portal_surface) === portalSurface,
    );
    if (historicalCompletedArtifact) {
      return response(200, {
        success: true,
        allDelivered: true,
        historicalCompletedArtifact: true,
        packetId,
        packetVersionId,
        portalSurface,
        transactionPublication: {
          publicationId: text(historicalTransactionPublication?.id) || null,
          transactionId: text(historicalTransactionPublication?.transaction_id) || null,
          documentId: text(historicalTransactionPublication?.document_id) || null,
          reused: true,
        },
        surfaceCompletion: {
          receiptId: text(historicalCompletionReceipt?.id) || null,
          completedAt: text(historicalCompletionReceipt?.completed_at) || null,
          reused: true,
        },
        recipientCount: signers.length,
        sentCount: signers.length,
        outcomes: signers.map((signer) => ({ signerId: text(signer.id), status: "sent", reused: true })),
      });
    }

    // Every non-historical F3/F4/publication/customer-delivery mutation is
    // release-bound before its first write. The lifecycle binding's plan
    // digest must match the active server release decision exactly.
    try {
      const activeRelease = assertLegalDocumentPilotRelease({
        organisationId: packet?.organisation_id,
        operation: "final_delivery",
      });
      await assertLegalDocumentPilotLifecycleBinding({
        supabase,
        packetId,
        packetVersionId,
        activeRelease,
      });
    } catch (error) {
      const typed = error as { code?: unknown; status?: unknown; message?: unknown };
      const status = Number(typed.status);
      return response(Number.isFinite(status) ? status : 403, {
        success: false,
        error: text(typed.message) || "Legal-document final delivery is not enabled for this packet organisation.",
        errorCode: text(typed.code) || "LEGAL_DOCUMENT_PILOT_RELEASE_BLOCKED",
        pilotReleaseContract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
      });
    }

    const transactionPublication = await supabase.rpc("bridge_publish_final_artifact_to_transaction_f3", { p_packet_version_id: packetVersionId });
    if (transactionPublication.error || !transactionPublication.data) {
      return response(409, {
        success: false,
        error: "The final signed document could not be attached to its transaction.",
        errorCode: "F3_TRANSACTION_PUBLICATION_FAILED",
      });
    }
    const surfaceCompletion = await supabase.rpc("bridge_complete_final_document_surfaces_f4", { p_packet_version_id: packetVersionId });
    if (surfaceCompletion.error || !surfaceCompletion.data) {
      return response(409, {
        success: false,
        error: "The signed document was saved, but its transaction and portal status could not be completed.",
        errorCode: "F4_SURFACE_COMPLETION_FAILED",
      });
    }
    const publication = await supabase.rpc("bridge_record_final_publication_f3", { p_packet_version_id: packetVersionId, p_portal_surface: portalSurface, p_verified_at: new Date().toISOString() });
    if (publication.error) throw publication.error;
    const outcomes: JsonRecord[] = [];
    const sellerName = text(signers.find((signer) => text(signer.signer_role).toLowerCase().includes("seller"))?.signer_name) || "Seller";
    const packetType = text(packet?.packet_type).toLowerCase() === "otp" ? "otp" : "mandate";
    const documentLabel = packetType === "otp" ? "Offer to Purchase" : "mandate";
    for (const signer of signers) {
      const signerId = text(signer.id);
      const existing = latestBySigner.get(signerId);
      if (text(existing?.status) === "sent" && text(existing?.provider_message_id)) { outcomes.push({ signerId, status: "sent", reused: true }); continue; }
      const claim = await supabase.rpc("bridge_claim_final_delivery_f3", { p_packet_version_id: packetVersionId, p_signer_id: signerId, p_claimed_at: new Date().toISOString() });
      if (claim.error) throw claim.error;
      if (claim.data !== true) { outcomes.push({ signerId, status: "in_progress", reused: true }); continue; }
      let status = "failed";
      let providerMessageId = "";
      let errorCode = "FINAL_EMAIL_FAILED";
      try {
        const recipientSafety = assessControlledTestRecipient({
          email: text(signer.signer_email).toLowerCase(),
          recipientName: text(signer.signer_name),
        });
        if (recipientSafety.suppressed) {
          errorCode = "FINAL_EMAIL_RECIPIENT_SUPPRESSED";
          console.log("[final-delivery] controlled test recipient suppressed", {
            packetId,
            packetVersionId,
            signerId,
            reason: recipientSafety.reason,
          });
        } else {
          const signerToken = text(signer.signing_token);
          if (!signerToken) {
            errorCode = "FINAL_EMAIL_SIGNER_ACCESS_TOKEN_MISSING";
            throw new Error("The signed document could not be sent because its signer-bound resolver access is unavailable.");
          }
          // This is the only final-document email path. The dispatcher owns
          // the packet/version binding, F2/F3/F4 checks, and a signer-bound
          // application route. The application must call the final-artifact
          // resolver at click time; raw storage URLs never leave this route.
          const emailResponse = await handleSellerMandateSignedEmail({
            type: "seller_mandate_signed",
            to: text(signer.signer_email).toLowerCase(),
            packetType,
            documentLabel,
            idempotencyKey: `final-delivery:${packetVersionId}:${signerId}`,
            recipientName: text(signer.signer_name) || "there",
            sellerName,
            propertyTitle: text(packet?.title) || "your property",
            signedAt: text(version?.finalised_at),
            signedDocumentName: text(evidence?.file_name),
            downloadLink: `${resolveAppBaseUrl()}/sign/${encodeURIComponent(signerToken)}`,
          });
          const emailBody = await emailResponse.json().catch(() => ({}));
          providerMessageId = text(emailBody?.emailId);
          if (emailResponse.ok && providerMessageId) { status = "sent"; errorCode = ""; } else errorCode = text(emailBody?.errorCode || emailBody?.error) || `HTTP_${emailResponse.status}`;
        }
      } catch (error) {
        // Preserve a deterministic non-provider failure code in the durable
        // F3 delivery row. The fallback message is useful for diagnostics,
        // but it is not a stable incident/reconciliation classification.
        if (errorCode !== "FINAL_EMAIL_SIGNER_ACCESS_TOKEN_MISSING") {
          errorCode = text((error as Error)?.message) || "FINAL_EMAIL_REQUEST_FAILED";
        }
      }
      const recorded = await supabase.rpc("bridge_record_final_delivery_f3", { p_packet_version_id: packetVersionId, p_signer_id: signerId, p_status: status, p_provider_message_id: providerMessageId || null, p_error_code: errorCode || null, p_attempted_at: new Date().toISOString() });
      if (recorded.error) throw recorded.error;
      outcomes.push({ signerId, status, providerMessageId: providerMessageId || null, reused: false });
    }
    const allDelivered = outcomes.length === signers.length && outcomes.every((outcome) => outcome.status === "sent");
    if (allDelivered) {
      try {
        await recordLegalDocumentPilotLifecycleTrace({
          supabase,
          packetId,
          packetVersionId,
          stage: "final_delivery_completed",
        });
      } catch (error) {
        if (hasNewCustomerDelivery) {
          const typed = error as { code?: unknown; message?: unknown };
          return response(409, {
            success: false,
            error: "The final email was provider-accepted, but its immutable release-bound lifecycle trace could not be recorded. Reconcile this packet before treating the delivery as complete.",
            errorCode: text(typed.code) || "PHASE5_RELEASE_TRACE_RECORD_REQUIRED",
            retryable: false,
          });
        }
        // Existing delivery remains an explicitly preserved Phase 0 path. A
        // missing release trace only excludes it from Phase 5 acceptance.
        console.warn("dispatch-final-signed-document existing delivery trace unavailable", error);
      }
    }
    const eventType = allDelivered ? "final_signed_delivery_completed" : "final_signed_delivery_incomplete";
    const eventInsert = await supabase.from("document_packet_events").insert({ packet_id: packetId, organisation_id: text(packet?.organisation_id), version_id: packetVersionId, event_type: eventType, event_payload_json: { artifactSha256: text(evidence?.sha256), artifactPath: text(evidence?.path), transactionId: transactionPublication.data?.transactionId || null, transactionDocumentId: transactionPublication.data?.documentId || null, transactionPublicationId: transactionPublication.data?.publicationId || null, recipientCount: signers.length, sentCount: outcomes.filter((outcome) => outcome.status === "sent").length, portalSurface, recordedAt: new Date().toISOString() }, created_by: null, created_at: new Date().toISOString() });
    if (eventInsert.error) throw eventInsert.error;
    return response(200, { success: allDelivered, allDelivered, packetId, packetVersionId, portalSurface, transactionPublication: transactionPublication.data, surfaceCompletion: surfaceCompletion.data, recipientCount: signers.length, sentCount: outcomes.filter((outcome) => outcome.status === "sent").length, outcomes });
  } catch (error) {
    console.error("dispatch-final-signed-document failed", error);
    return response(500, { success: false, error: "Final signed document delivery failed.", errorCode: "FINAL_DELIVERY_FAILED" });
  }
});
