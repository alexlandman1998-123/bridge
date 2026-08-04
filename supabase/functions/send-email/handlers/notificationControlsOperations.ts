import {
  applyNotificationQueueControls,
  getNotificationObservabilitySnapshot,
} from "../services/notificationControls.ts";
import type { SendNotificationControlsPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

async function serviceClient() {
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const key = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !key) return null;
  const { createClient } = await import("supabase");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jwtRole(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1] || "";
  if (!payload) return "";
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return normalizeText(JSON.parse(atob(padded))?.role).toLowerCase();
  } catch {
    return "";
  }
}

function isServiceRequest(req: Request) {
  const authorization = normalizeText(req.headers.get("authorization"));
  const serviceKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return Boolean(
    (serviceKey && authorization === `Bearer ${serviceKey}`) ||
      jwtRole(authorization) === "service_role",
  );
}

export async function handleNotificationControlsOperation(
  req: Request,
  payload: SendNotificationControlsPayload,
) {
  if (!isServiceRequest(req)) {
    return jsonResponse(403, {
      error:
        "Service role authorization is required for notification controls.",
    });
  }

  const supabase = await serviceClient();
  if (!supabase) {
    return jsonResponse(500, {
      error: "Notification controls are not configured.",
    });
  }

  const type = normalizeText(payload.type).toLowerCase();
  if (
    [
      "notification_controls_apply_queue",
      "notification_preferences_apply_queue",
      "notification_queue_controls",
    ].includes(type)
  ) {
    const result = await applyNotificationQueueControls(supabase, {
      limit: Math.max(1, Math.min(Number(payload.limit) || 500, 5000)),
      dryRun: Boolean(payload.dryRun ?? payload.dry_run),
      now: normalizeText(payload.now),
      eventId: normalizeText(payload.eventId ?? payload.event_id),
    });
    return jsonResponse(200, {
      ok: true,
      operation: "apply_queue_controls",
      result,
    });
  }

  if (
    [
      "notification_observability_snapshot",
      "notification_controls_snapshot",
      "notification_health_snapshot",
    ].includes(type)
  ) {
    const result = await getNotificationObservabilitySnapshot(supabase, {
      organisationId: normalizeText(
        payload.organisationId ?? payload.organisation_id,
      ),
      since: normalizeText(payload.since),
    });
    return jsonResponse(200, {
      ok: true,
      operation: "observability_snapshot",
      result,
    });
  }

  return jsonResponse(400, {
    error: "Unknown notification controls operation.",
    receivedType: type,
  });
}
