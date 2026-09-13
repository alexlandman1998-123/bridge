import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function response(status: number, body: Json) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });

  // This boundary deliberately has no supplier call until the supported FICA
  // operation, authentication method and result contract are approved.
  // Credentials are never accepted from the browser.
  const url = text(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !serviceRoleKey) return response(503, { status: "integration_unavailable", error: "server_configuration_unavailable" });

  const body = await request.json().catch(() => ({})) as Json;
  const caseId = text(body.caseId);
  if (!caseId) return response(400, { status: "integration_unavailable", error: "fica_case_required" });

  const bearer = text(request.headers.get("authorization"), 12_000).replace(/^Bearer\s+/i, "");
  if (!bearer) return response(401, { status: "integration_unavailable", error: "unauthenticated" });
  const db = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth } = await db.auth.getUser(bearer);
  if (!auth.user) return response(401, { status: "integration_unavailable", error: "unauthenticated" });

  const { data: ficaCase, error } = await db
    .from("knowledge_factory_fica_cases")
    .select("id, organisation_id, party_role, entity_type, transaction_id, declaration_document_id, document_readiness")
    .eq("id", caseId)
    .maybeSingle();
  if (error || !ficaCase) return response(404, { status: "integration_unavailable", error: "fica_case_not_found" });

  const readiness = ficaCase.document_readiness && typeof ficaCase.document_readiness === "object" ? ficaCase.document_readiness as Json : {};
  const packReady = Boolean(ficaCase.party_role && ficaCase.entity_type && (ficaCase.transaction_id || ficaCase.declaration_document_id) && readiness.declarationReady === true && readiness.supportingDocumentsReady === true);
  if (!packReady) return response(422, { status: "integration_unavailable", error: "fica_pack_not_ready" });

  // Phase 4 safety posture: no provider protocol has been authorised. Keep a
  // visible normalized state without pretending that a supplier check occurred.
  await db.from("knowledge_factory_fica_cases").update({
    verification_provider_status: "not_configured",
    provider_name: "knowledge_factory",
    updated_at: new Date().toISOString(),
  }).eq("id", caseId);
  return response(503, { status: "not_configured", error: "knowledge_factory_fica_adapter_not_configured" });
});
