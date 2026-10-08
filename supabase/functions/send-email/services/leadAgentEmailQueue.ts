import { createClient } from "supabase";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

// Existing callers become status checks. The database insert already queued the
// alert in the same transaction as the lead; caller-supplied recipients are ignored.
export async function leadAgentEmailQueueResponse(
  request: Request,
  payload: Record<string, unknown>,
  makeClient = createClient,
) {
  const event = normalizeText(
    payload.eventKind || payload.event_kind || payload.type,
  );
  const clientIntro = [
    "lead_acknowledgement",
    "lead_acknowledgement_email",
    "property_enquiry_acknowledgement",
  ].includes(event);
  // Event confirmations use this renderer without a lead. Preserve that route.
  if (clientIntro && !normalizeText(payload.leadId || payload.lead_id)) {
    return null;
  }
  if (
    !clientIntro &&
    !["new_enquiry_assigned_agent", "new_enquiry_unassigned_manager"].includes(
      event,
    )
  ) return null;
  const organisationId = normalizeText(
    payload.organisationId || payload.organisation_id,
  );
  const leadId = normalizeText(payload.leadId || payload.lead_id);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(organisationId) || !uuid.test(leadId)) {
    return jsonResponse(400, {
      error: "A saved lead and organisation are required.",
    });
  }
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const key = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const token = normalizeText(request.headers.get("authorization")).replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return jsonResponse(401, { error: "Authorization is required." });
  if (!url || !key) {
    return jsonResponse(503, {
      error: "Lead email queue configuration is missing.",
    });
  }
  const caller = makeClient(
    url,
    normalizeText(Deno.env.get("SUPABASE_ANON_KEY")) || key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const accessible = await caller.from("leads").select("lead_id")
    .eq("organisation_id", organisationId).eq("lead_id", leadId).maybeSingle();
  if (accessible.error || !accessible.data) {
    return jsonResponse(403, { error: "Lead access is required." });
  }
  const service = makeClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Preserve the website's receipt, retries and principal notifications. Only
  // its service-authenticated dispatcher may use the existing direct renderer.
  if (
    !clientIntro && token === key &&
    (payload.metadata as Record<string, unknown>)?.dispatchContract ===
      "website-lead-dispatch-v1"
  ) {
    const receipt = await service.from("website_lead_submissions").select("id")
      .eq("organisation_id", organisationId).eq("lead_id", leadId).limit(1)
      .maybeSingle();
    if (receipt.error) {
      return jsonResponse(503, { error: "Website receipt lookup failed." });
    }
    if (receipt.data) {
      if (event === "new_enquiry_assigned_agent") {
        const eligible = await service.rpc(
          "lead_agent_email_website_agent_eligible",
          {
            p_organisation_id: organisationId,
            p_lead_id: leadId,
            p_email: normalizeText(payload.to),
          },
        );
        if (eligible.error) {
          return jsonResponse(503, {
            error: "Website agent validation failed.",
          });
        }
        if (eligible.data !== true) {
          return jsonResponse(409, {
            error:
              "The website notification recipient is no longer the active lead owner.",
          });
        }
      }
      return null;
    }
  }
  const state = await service.rpc(
    clientIntro ? "lead_client_intro_status" : "lead_agent_email_status",
    {
      p_organisation_id: organisationId,
      p_lead_id: leadId,
    },
  );
  if (state.error || !state.data) {
    return jsonResponse(503, {
      error:
        "The durable lead email record is unavailable. Check the release configuration.",
    });
  }
  const status = state.data.status;
  return jsonResponse(200, {
    ok: true,
    sent: status === "sent",
    queued: ["pending", "processing", "waiting_recipient", "delegated"]
      .includes(status),
    suppressed: status === "skipped",
    needsAttention: status === "needs_attention",
    deliveryStatus: status,
    providerMessageId: state.data.providerMessageId || null,
    reason: state.data.reason || undefined,
  });
}
