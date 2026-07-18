import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

const headers = { "Content-Type": "application/json" };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function authorizeServiceCredential(url: string, credential: string) {
  if (!credential) return false;
  const verifier: any = createClient(url, credential, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await verifier.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !result.error;
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const requestId = text(req.headers.get("x-request-id")) || crypto.randomUUID();
  try {
    if (req.method !== "POST") return response(405, { success: false, errorCode: "METHOD_NOT_ALLOWED" });
    const url = text(Deno.env.get("SUPABASE_URL"));
    const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    if (!url || !serviceKey) return response(500, { success: false, errorCode: "WATCHDOG_NOT_CONFIGURED" });
    if (!await authorizeServiceCredential(url, bearer)) return response(401, { success: false, errorCode: "WATCHDOG_AUTH_REQUIRED" });

    console.log(JSON.stringify({ level: "info", event: "legal_document_watchdog_started", requestId }));
    const client: any = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = Date.now();
    const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const staleBefore = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const retryStaleBefore = new Date(now - 10 * 60 * 1000).toISOString();
    const [eventsResult, staleResult, completedResult] = await Promise.all([
      client.from("document_packet_events").select("id, event_type, packet_id, created_at").gte("created_at", since).in("event_type", ["generation_started", "version_generated", "generation_failed", "final_signed_otp_generated", "legal_template_approval_blocked", "final_signed_transaction_published", "final_document_surfaces_completed"]),
      client.from("document_packets").select("id, packet_type, status, updated_at").in("packet_type", ["otp", "mandate"]).in("status", ["sent", "partially_signed"]).lt("updated_at", staleBefore),
      client.from("document_packets").select("id, packet_type, status, current_version_number, updated_at").in("packet_type", ["otp", "mandate"]).eq("status", "completed").gte("updated_at", since),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (staleResult.error) throw staleResult.error;
    if (completedResult.error) throw completedResult.error;
    const events = eventsResult.data || [];
    const completed = completedResult.data || [];
    const packetIds = completed.map((row: any) => row.id);
    const versionsResult = packetIds.length
      ? await client.from("document_packet_versions").select("id, packet_id, version_number, final_signed_file_path, finalised_at").in("packet_id", packetIds)
      : { data: [], error: null };
    if (versionsResult.error) throw versionsResult.error;
    const currentVersions = completed.map((packet: any) => (versionsResult.data || []).find((version: any) => version.packet_id === packet.id && Number(version.version_number) === Number(packet.current_version_number))).filter(Boolean);
    const versionIds = currentVersions.map((row: any) => row.id);
    const [evidenceResult, signersResult, deliveriesResult, publicationsResult, transactionPublicationsResult, completionReceiptsResult, completionRetriesResult] = versionIds.length
      ? await Promise.all([
        client.from("legal_final_artifact_evidence").select("packet_version_id, sha256, path").in("packet_version_id", versionIds),
        client.from("document_packet_signers").select("id, packet_version_id, status").in("packet_version_id", versionIds),
        client.from("legal_final_artifact_deliveries").select("packet_version_id, signer_id, status, artifact_sha256, artifact_path").in("packet_version_id", versionIds),
        client.from("legal_final_artifact_publications").select("packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at").in("packet_version_id", versionIds),
        client.from("legal_final_transaction_publications").select("packet_version_id, transaction_id, document_id, artifact_sha256, artifact_path").in("packet_version_id", versionIds),
        client.from("legal_final_completion_receipts").select("packet_version_id, transaction_id, document_id, artifact_sha256, transaction_visible, client_visible, canonical_satisfied").in("packet_version_id", versionIds),
        client.from("legal_final_completion_retry_attempts").select("packet_version_id, status, requested_at, completed_at").in("packet_version_id", versionIds),
      ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    for (const result of [evidenceResult, signersResult, deliveriesResult, publicationsResult, transactionPublicationsResult, completionReceiptsResult, completionRetriesResult]) if (result.error) throw result.error;
    const currentVersionByPacket = new Map(currentVersions.map((row: any) => [row.packet_id, row]));
    const evidenceByVersion = new Map((evidenceResult.data || []).map((row: any) => [row.packet_version_id, row]));
    const publicationByVersion = new Map((publicationsResult.data || []).map((row: any) => [row.packet_version_id, row]));
    const transactionPublicationByVersion = new Map((transactionPublicationsResult.data || []).map((row: any) => [row.packet_version_id, row]));
    const completionReceiptByVersion = new Map((completionReceiptsResult.data || []).map((row: any) => [row.packet_version_id, row]));
    const finalPacketIds = new Set(currentVersions.filter((row: any) => text(row.final_signed_file_path)).map((row: any) => row.packet_id));
    const count = (eventType: string) => events.filter((row: any) => row.event_type === eventType).length;
    const latestSuccessAt = events.filter((row: any) => row.event_type === "version_generated").map((row: any) => Date.parse(row.created_at)).filter(Number.isFinite).sort((a: number, b: number) => b - a)[0] || 0;
    const unresolvedFailures = events.filter((row: any) => row.event_type === "generation_failed" && Date.parse(row.created_at) > latestSuccessAt);
    const missingFinalPacketIds = completed.filter((row: any) => !finalPacketIds.has(row.id)).map((row: any) => row.id);
    const missingFinalEvidencePacketIds = completed.filter((packet: any) => {
      const version: any = currentVersionByPacket.get(packet.id);
      const evidence: any = evidenceByVersion.get(version?.id);
      return !version || !evidence || !text(evidence.sha256) || text(evidence.path) !== text(version.final_signed_file_path);
    }).map((row: any) => row.id);
    const missingPublicationPacketIds = completed.filter((packet: any) => {
      const version: any = currentVersionByPacket.get(packet.id);
      const evidence: any = evidenceByVersion.get(version?.id);
      const publication: any = publicationByVersion.get(version?.id);
      const expectedSurface = packet.packet_type === "mandate" ? "seller_portal" : "client_portal";
      return !publication || !evidence || text(publication.artifact_sha256) !== text(evidence.sha256) || text(publication.artifact_path) !== text(evidence.path) || text(publication.portal_surface) !== expectedSurface || !Number.isFinite(Date.parse(publication.verified_at));
    }).map((row: any) => row.id);
    const incompleteDeliveryPacketIds = completed.filter((packet: any) => {
      const version: any = currentVersionByPacket.get(packet.id);
      const evidence: any = evidenceByVersion.get(version?.id);
      const signers = (signersResult.data || []).filter((row: any) => row.packet_version_id === version?.id);
      return !signers.length || signers.some((signer: any) => !(deliveriesResult.data || []).some((delivery: any) => delivery.packet_version_id === version?.id && delivery.signer_id === signer.id && delivery.status === "sent" && text(delivery.artifact_sha256) === text(evidence?.sha256) && text(delivery.artifact_path) === text(evidence?.path)));
    }).map((row: any) => row.id);
    const missingTransactionPublicationPacketIds = completed.filter((packet: any) => {
      const version: any = currentVersionByPacket.get(packet.id);
      const evidence: any = evidenceByVersion.get(version?.id);
      const publication: any = transactionPublicationByVersion.get(version?.id);
      return !publication || !evidence || text(publication.transaction_id) !== text(packet.transaction_id)
        || !text(publication.document_id) || text(publication.artifact_sha256) !== text(evidence.sha256)
        || text(publication.artifact_path) !== text(evidence.path);
    }).map((row: any) => row.id);
    const missingCompletionReceiptPacketIds = completed.filter((packet: any) => {
      const version: any = currentVersionByPacket.get(packet.id);
      const publication: any = transactionPublicationByVersion.get(version?.id);
      const receipt: any = completionReceiptByVersion.get(version?.id);
      return !receipt || !publication || text(receipt.transaction_id) !== text(publication.transaction_id)
        || text(receipt.document_id) !== text(publication.document_id)
        || text(receipt.artifact_sha256) !== text(publication.artifact_sha256)
        || receipt.transaction_visible !== true || receipt.client_visible !== true || receipt.canonical_satisfied !== true;
    }).map((row: any) => row.id);
    const stuckCompletionRetryPacketIds = [...new Set((completionRetriesResult.data || [])
      .filter((row: any) => row.status === "processing" && !row.completed_at && text(row.requested_at) < retryStaleBefore)
      .map((row: any) => row.packet_version_id)
      .map((versionId: string) => currentVersions.find((version: any) => version.id === versionId)?.packet_id)
      .filter(Boolean))];
    const finalArtifactIntegrityPercent = completed.length ? Math.round((finalPacketIds.size / completed.length) * 10000) / 100 : null;
    const blockers = [] as Array<Record<string, unknown>>;
    if (unresolvedFailures.length) blockers.push({ code: "UNRESOLVED_GENERATION_FAILURES", count: unresolvedFailures.length });
    if (staleResult.data?.length) blockers.push({ code: "STALE_SIGNING_PACKETS", count: staleResult.data.length });
    if (missingFinalPacketIds.length) blockers.push({ code: "COMPLETED_PACKET_FINAL_ARTIFACT_MISSING", count: missingFinalPacketIds.length });
    if (missingFinalEvidencePacketIds.length) blockers.push({ code: "FINAL_ARTIFACT_EVIDENCE_MISSING", count: missingFinalEvidencePacketIds.length });
    if (incompleteDeliveryPacketIds.length) blockers.push({ code: "FINAL_DELIVERY_INCOMPLETE", count: incompleteDeliveryPacketIds.length });
    if (missingPublicationPacketIds.length) blockers.push({ code: "PORTAL_PUBLICATION_MISSING", count: missingPublicationPacketIds.length });
    if (missingTransactionPublicationPacketIds.length) blockers.push({ code: "FINAL_TRANSACTION_PUBLICATION_MISSING", count: missingTransactionPublicationPacketIds.length });
    if (missingCompletionReceiptPacketIds.length) blockers.push({ code: "FINAL_SURFACE_COMPLETION_MISSING", count: missingCompletionReceiptPacketIds.length });
    if (stuckCompletionRetryPacketIds.length) blockers.push({ code: "FINAL_COMPLETION_RETRY_STUCK", count: stuckCompletionRetryPacketIds.length });
    const status = blockers.length ? "critical" : completed.length ? "healthy" : "warning";
    const summary = {
      kind: "legal_document_watchdog_v1",
      windowHours: 24,
      metrics: {
        generationStarted: count("generation_started"),
        generationCompleted: count("version_generated"),
        generationFailed: count("generation_failed"),
        unresolvedGenerationFailures: unresolvedFailures.length,
        finalSignedGenerated: count("final_signed_otp_generated"),
        legalApprovalBlocked: count("legal_template_approval_blocked"),
        staleSigningPackets: staleResult.data?.length || 0,
        completedPackets: completed.length,
        missingFinalArtifacts: missingFinalPacketIds.length,
        missingFinalArtifactEvidence: missingFinalEvidencePacketIds.length,
        incompleteFinalDeliveries: incompleteDeliveryPacketIds.length,
        missingPortalPublications: missingPublicationPacketIds.length,
        missingTransactionPublications: missingTransactionPublicationPacketIds.length,
        missingCompletionReceipts: missingCompletionReceiptPacketIds.length,
        stuckCompletionRetries: stuckCompletionRetryPacketIds.length,
        finalArtifactIntegrityPercent,
      },
      blockers,
      stalePacketIds: (staleResult.data || []).map((row: any) => row.id),
      missingFinalPacketIds,
      missingFinalEvidencePacketIds,
      incompleteDeliveryPacketIds,
      missingPublicationPacketIds,
      missingTransactionPublicationPacketIds,
      missingCompletionReceiptPacketIds,
      stuckCompletionRetryPacketIds,
      checkedAt: new Date().toISOString(),
    };
    const snapshot = await client.from("system_health_snapshots").insert({ status, summary, created_by: null }).select("id, status, created_at").single();
    if (snapshot.error) throw snapshot.error;
    console.log(JSON.stringify({ level: status === "critical" ? "error" : "info", event: "legal_document_watchdog_completed", requestId, status, blockerCount: blockers.length, durationMs: Date.now() - startedAt }));
    return response(200, { success: true, snapshot: snapshot.data, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", event: "legal_document_watchdog_failed", requestId, error: message, durationMs: Date.now() - startedAt }));
    return response(500, { success: false, errorCode: "WATCHDOG_FAILED", error: message });
  }
});
