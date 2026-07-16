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
    const [eventsResult, staleResult, completedResult] = await Promise.all([
      client.from("document_packet_events").select("id, event_type, packet_id, created_at").gte("created_at", since).in("event_type", ["generation_started", "version_generated", "generation_failed", "final_signed_otp_generated", "legal_template_approval_blocked"]),
      client.from("document_packets").select("id, packet_type, status, updated_at").in("packet_type", ["otp", "mandate"]).in("status", ["sent", "partially_signed"]).lt("updated_at", staleBefore),
      client.from("document_packets").select("id, packet_type, status, updated_at").in("packet_type", ["otp", "mandate"]).eq("status", "completed").gte("updated_at", since),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (staleResult.error) throw staleResult.error;
    if (completedResult.error) throw completedResult.error;
    const events = eventsResult.data || [];
    const completed = completedResult.data || [];
    const packetIds = completed.map((row: any) => row.id);
    const versionsResult = packetIds.length
      ? await client.from("document_packet_versions").select("packet_id, final_signed_file_path, finalised_at").in("packet_id", packetIds)
      : { data: [], error: null };
    if (versionsResult.error) throw versionsResult.error;
    const finalPacketIds = new Set((versionsResult.data || []).filter((row: any) => text(row.final_signed_file_path)).map((row: any) => row.packet_id));
    const count = (eventType: string) => events.filter((row: any) => row.event_type === eventType).length;
    const latestSuccessAt = events.filter((row: any) => row.event_type === "version_generated").map((row: any) => Date.parse(row.created_at)).filter(Number.isFinite).sort((a: number, b: number) => b - a)[0] || 0;
    const unresolvedFailures = events.filter((row: any) => row.event_type === "generation_failed" && Date.parse(row.created_at) > latestSuccessAt);
    const missingFinalPacketIds = completed.filter((row: any) => !finalPacketIds.has(row.id)).map((row: any) => row.id);
    const finalArtifactIntegrityPercent = completed.length ? Math.round((finalPacketIds.size / completed.length) * 10000) / 100 : null;
    const blockers = [] as Array<Record<string, unknown>>;
    if (unresolvedFailures.length) blockers.push({ code: "UNRESOLVED_GENERATION_FAILURES", count: unresolvedFailures.length });
    if (staleResult.data?.length) blockers.push({ code: "STALE_SIGNING_PACKETS", count: staleResult.data.length });
    if (missingFinalPacketIds.length) blockers.push({ code: "COMPLETED_PACKET_FINAL_ARTIFACT_MISSING", count: missingFinalPacketIds.length });
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
        finalArtifactIntegrityPercent,
      },
      blockers,
      stalePacketIds: (staleResult.data || []).map((row: any) => row.id),
      missingFinalPacketIds,
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
