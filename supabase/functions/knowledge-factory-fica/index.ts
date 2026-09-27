import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { mayAccessFicaHandoff } from "./policy.ts";

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
  const { data: auth, error: authError } = await db.auth.getUser(bearer);
  if (authError || !auth.user) return response(401, { status: "integration_unavailable", error: "unauthenticated" });

  const { data: ficaCase, error } = await db
    .from("knowledge_factory_fica_cases")
    .select("id, organisation_id, created_by, party_role, entity_type, transaction_id, declaration_document_id, document_readiness")
    .eq("id", caseId)
    .maybeSingle();
  if (error || !ficaCase) return response(404, { status: "integration_unavailable", error: "fica_case_not_found" });

  const [membership, access, permission] = await Promise.all([
    db.from("organisation_users")
      .select("organisation_id, user_id, status, membership_status, role, workspace_role, organization_role, organisation_role")
      .eq("organisation_id", ficaCase.organisation_id).eq("user_id", auth.user.id).maybeSingle(),
    db.from("knowledge_factory_organisation_access")
      .select("enabled, allowed_operations, suspended_at")
      .eq("organisation_id", ficaCase.organisation_id).maybeSingle(),
    db.from("knowledge_factory_user_permissions")
      .select("allowed_operations, revoked_at")
      .eq("organisation_id", ficaCase.organisation_id).eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (membership.error || access.error || permission.error) {
    return response(503, { status: "integration_unavailable", error: "fica_access_check_unavailable" });
  }
  if (!mayAccessFicaHandoff({
    userId: auth.user.id,
    ficaCase,
    membership: membership.data,
    organisationAccess: access.data,
    userPermission: permission.data,
  })) return response(403, { status: "integration_unavailable", error: "fica_access_denied" });

  const readiness = ficaCase.document_readiness && typeof ficaCase.document_readiness === "object" ? ficaCase.document_readiness as Json : {};
  const packReady = Boolean(ficaCase.party_role && ficaCase.entity_type && (ficaCase.transaction_id || ficaCase.declaration_document_id) && readiness.declarationReady === true && readiness.supportingDocumentsReady === true);
  if (!packReady) return response(422, { status: "integration_unavailable", error: "fica_pack_not_ready" });

  // No provider protocol has been authorised. A readiness check must not
  // alter the case or imply that a supplier request was sent.
  return response(503, { status: "not_configured", error: "knowledge_factory_fica_adapter_not_configured" });
});
