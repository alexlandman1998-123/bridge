import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function response(status: number, body: JsonRecord) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

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
    const [packetResult, versionResult, evidenceResult, signersResult, deliveriesResult] = await Promise.all([
      supabase.from("document_packets").select("id, organisation_id, packet_type, title, status, current_version_number").eq("id", packetId).maybeSingle(),
      supabase.from("document_packet_versions").select("id, packet_id, organisation_id, version_number, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, finalised_at").eq("id", packetVersionId).eq("packet_id", packetId).maybeSingle(),
      supabase.from("legal_final_artifact_evidence").select("organisation_id, packet_id, packet_version_id, bucket, path, file_name, sha256, byte_length, generated_at").eq("packet_version_id", packetVersionId).maybeSingle(),
      supabase.from("document_packet_signers").select("id, packet_id, packet_version_id, signer_role, signer_name, signer_email, status, signed_at").eq("packet_id", packetId).eq("packet_version_id", packetVersionId),
      supabase.from("legal_final_artifact_deliveries").select("signer_id, status, provider_message_id, attempted_at, attempt_number").eq("packet_version_id", packetVersionId).order("attempt_number", { ascending: false }),
    ]);
    for (const result of [packetResult, versionResult, evidenceResult, signersResult, deliveriesResult]) if (result.error) throw result.error;
    const packet = packetResult.data as JsonRecord | null;
    const version = versionResult.data as JsonRecord | null;
    const evidence = evidenceResult.data as JsonRecord | null;
    const signers = (signersResult.data || []) as JsonRecord[];
    const bindingValid = Boolean(packet && version && evidence) && text(packet?.status).toLowerCase() === "completed" && Number(packet?.current_version_number) === Number(version?.version_number) && text(packet?.organisation_id) === text(version?.organisation_id) && text(evidence?.packet_id) === packetId && text(evidence?.packet_version_id) === packetVersionId && text(evidence?.path) === text(version?.final_signed_file_path) && text(evidence?.bucket) === text(version?.final_signed_file_bucket);
    if (!bindingValid || !signers.length || signers.some((signer) => text(signer.status).toLowerCase() !== "signed")) return response(409, { success: false, error: "F2 final completion evidence is required before delivery.", errorCode: "FINAL_DELIVERY_F2_INVALID" });
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
    const signedUrl = await supabase.storage.from(text(evidence?.bucket)).createSignedUrl(text(evidence?.path), 60 * 60 * 24);
    if (signedUrl.error || !signedUrl.data?.signedUrl) return response(409, { success: false, error: "The final signed artifact is not readable for secure delivery.", errorCode: "FINAL_DELIVERY_ARTIFACT_UNREADABLE" });
    const portalSurface = text(packet?.packet_type).toLowerCase() === "mandate" ? "seller_portal" : "client_portal";
    const publication = await supabase.rpc("bridge_record_final_publication_f3", { p_packet_version_id: packetVersionId, p_portal_surface: portalSurface, p_verified_at: new Date().toISOString() });
    if (publication.error) throw publication.error;
    const latestBySigner = new Map<string, JsonRecord>();
    for (const row of (deliveriesResult.data || []) as JsonRecord[]) if (!latestBySigner.has(text(row.signer_id))) latestBySigner.set(text(row.signer_id), row);
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
        const emailResponse = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ type: "seller_mandate_signed", to: text(signer.signer_email).toLowerCase(), organisationId: text(packet?.organisation_id), packetId, packetType, documentLabel, idempotencyKey: `final-delivery:${packetVersionId}:${signerId}`, recipientName: text(signer.signer_name) || "there", sellerName, propertyTitle: text(packet?.title) || "your property", signedAt: text(version?.finalised_at), signedDocumentName: text(evidence?.file_name), downloadLink: signedUrl.data.signedUrl }),
        });
        const emailBody = await emailResponse.json().catch(() => ({}));
        providerMessageId = text(emailBody?.emailId);
        if (emailResponse.ok && providerMessageId) { status = "sent"; errorCode = ""; } else errorCode = text(emailBody?.errorCode || emailBody?.error) || `HTTP_${emailResponse.status}`;
      } catch (error) { errorCode = text((error as Error)?.message) || "FINAL_EMAIL_REQUEST_FAILED"; }
      const recorded = await supabase.rpc("bridge_record_final_delivery_f3", { p_packet_version_id: packetVersionId, p_signer_id: signerId, p_status: status, p_provider_message_id: providerMessageId || null, p_error_code: errorCode || null, p_attempted_at: new Date().toISOString() });
      if (recorded.error) throw recorded.error;
      outcomes.push({ signerId, status, providerMessageId: providerMessageId || null, reused: false });
    }
    const allDelivered = outcomes.length === signers.length && outcomes.every((outcome) => outcome.status === "sent");
    const eventType = allDelivered ? "final_signed_delivery_completed" : "final_signed_delivery_incomplete";
    const eventInsert = await supabase.from("document_packet_events").insert({ packet_id: packetId, organisation_id: text(packet?.organisation_id), version_id: packetVersionId, event_type: eventType, event_payload_json: { artifactSha256: text(evidence?.sha256), artifactPath: text(evidence?.path), transactionId: transactionPublication.data?.transactionId || null, transactionDocumentId: transactionPublication.data?.documentId || null, transactionPublicationId: transactionPublication.data?.publicationId || null, recipientCount: signers.length, sentCount: outcomes.filter((outcome) => outcome.status === "sent").length, portalSurface, recordedAt: new Date().toISOString() }, created_by: null, created_at: new Date().toISOString() });
    if (eventInsert.error) throw eventInsert.error;
    return response(200, { success: allDelivered, allDelivered, packetId, packetVersionId, portalSurface, transactionPublication: transactionPublication.data, surfaceCompletion: surfaceCompletion.data, recipientCount: signers.length, sentCount: outcomes.filter((outcome) => outcome.status === "sent").length, outcomes });
  } catch (error) {
    console.error("dispatch-final-signed-document failed", error);
    return response(500, { success: false, error: "Final signed document delivery failed.", errorCode: "FINAL_DELIVERY_FAILED" });
  }
});
