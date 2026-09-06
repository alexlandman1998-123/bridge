import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  buildWebsiteLeadEmailPayload,
  shouldPrepareWebsiteLeadFallback,
  websiteLeadDeliveryStatus,
  websiteLeadErrorMessage,
  type WebsiteLeadNotificationEvent,
  websiteLeadProviderMessageId,
  websiteLeadReceiptId,
  websiteLeadRecord,
  websiteLeadText,
} from "../_shared/websiteLeadDispatch.ts";

type ServiceClient = ReturnType<typeof createClient<any, "public", any>>;
type DispatchResult = Record<string, unknown>;

function jsonResponse(status: number, body: DispatchResult) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function serviceRoleRequest(request: Request, serviceRoleKey: string) {
  const token = websiteLeadText(request.headers.get("authorization"), 4096)
    .replace(/^Bearer\s+/i, "");
  return Boolean(serviceRoleKey) && token === serviceRoleKey;
}

async function completeDelivery(
  client: ServiceClient,
  event: WebsiteLeadNotificationEvent,
  status: "sent" | "failed" | "skipped",
  providerMessageId?: string | null,
  errorMessage?: string | null,
) {
  const receiptId = websiteLeadReceiptId(event);
  const eventId = websiteLeadText(event.id, 64);
  if (!isUuid(receiptId) || !isUuid(eventId)) {
    throw new Error(
      "Website lead event is missing its durable receipt identity.",
    );
  }
  const result = await client.rpc("website_complete_lead_notification", {
    p_receipt_id: receiptId,
    p_notification_event_id: eventId,
    p_delivery_status: status,
    p_provider_message_id: providerMessageId || null,
    p_error_message: errorMessage || null,
  });
  if (result.error) throw result.error;
  return result.data;
}

async function sendEmail(
  event: WebsiteLeadNotificationEvent,
  supabaseUrl: string,
  serviceRoleKey: string,
  appUrl: string,
) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-email`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildWebsiteLeadEmailPayload(event, appUrl)),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      websiteLeadText(websiteLeadRecord(payload).error, 1000) ||
        `Notification service returned ${response.status}.`,
    );
  }
  return {
    status: websiteLeadDeliveryStatus(payload) as "sent" | "skipped",
    providerMessageId: websiteLeadProviderMessageId(payload),
  };
}

async function claimEvents(
  client: ServiceClient,
  limit: number,
  eventId: string | null,
) {
  const result = await client.rpc("website_claim_lead_notifications", {
    p_limit: limit,
    p_event_id: eventId,
  });
  if (result.error) throw result.error;
  return (result.data || []) as WebsiteLeadNotificationEvent[];
}

async function dispatchEvent(
  client: ServiceClient,
  event: WebsiteLeadNotificationEvent,
  configuration: {
    supabaseUrl: string;
    serviceRoleKey: string;
    appUrl: string;
  },
): Promise<DispatchResult> {
  const eventId = websiteLeadText(event.id, 64);
  try {
    const delivered = await sendEmail(
      event,
      configuration.supabaseUrl,
      configuration.serviceRoleKey,
      configuration.appUrl,
    );
    await completeDelivery(
      client,
      event,
      delivered.status,
      delivered.providerMessageId,
    );
    return { eventId, status: delivered.status };
  } catch (error) {
    const errorMessage = websiteLeadErrorMessage(error);
    let completion: unknown;
    try {
      completion = await completeDelivery(
        client,
        event,
        "failed",
        null,
        errorMessage,
      );
    } catch (completionError) {
      return {
        eventId,
        status: "claim_recovery_required",
        error: websiteLeadErrorMessage(completionError),
      };
    }

    const result: DispatchResult = {
      eventId,
      status: websiteLeadRecord(completion).retryScheduled === true
        ? "retry_scheduled"
        : "failed",
      error: errorMessage,
    };

    if (shouldPrepareWebsiteLeadFallback(event, completion)) {
      const fallback = await client.rpc(
        "website_prepare_lead_notification_fallback",
        {
          p_receipt_id: websiteLeadReceiptId(event),
          p_error_message: errorMessage,
        },
      );
      if (fallback.error) {
        result.fallback = {
          status: "prepare_failed",
          error: websiteLeadErrorMessage(fallback.error),
        };
      } else {
        const fallbackEventId = websiteLeadText(
          websiteLeadRecord(fallback.data).notificationEventId,
          64,
        );
        result.fallback = {
          status: websiteLeadRecord(fallback.data).available === true
            ? "queued"
            : "unavailable",
          eventId: fallbackEventId || undefined,
        };
        if (isUuid(fallbackEventId)) {
          const [claimedFallback] = await claimEvents(
            client,
            1,
            fallbackEventId,
          );
          if (claimedFallback) {
            result.fallback = await dispatchEvent(
              client,
              claimedFallback,
              configuration,
            );
          }
        }
      }
    }
    return result;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "POST is required." });
  }

  const supabaseUrl = websiteLeadText(Deno.env.get("SUPABASE_URL"), 2048);
  const serviceRoleKey = websiteLeadText(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    4096,
  );
  if (!serviceRoleRequest(request, serviceRoleKey)) {
    return jsonResponse(403, {
      error: "Service-role authorization is required.",
    });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Dispatcher configuration is missing." });
  }

  const body = websiteLeadRecord(await request.json().catch(() => ({})));
  const requestedEventId = websiteLeadText(body.eventId || body.event_id, 64);
  if (requestedEventId && !isUuid(requestedEventId)) {
    return jsonResponse(400, { error: "eventId must be a UUID." });
  }
  const limit = requestedEventId
    ? 1
    : Math.max(1, Math.min(Number(body.limit) || 25, 100));
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const reset = await client.rpc(
      "website_reset_stale_lead_notification_claims",
      {},
    );
    if (reset.error) throw reset.error;
    const events = await claimEvents(
      client,
      limit,
      requestedEventId || null,
    );
    const configuration = {
      supabaseUrl,
      serviceRoleKey,
      appUrl: websiteLeadText(Deno.env.get("ARCH9_APP_URL"), 2048) ||
        "https://app.arch9.co.za",
    };
    const results = [];
    for (const event of events) {
      results.push(await dispatchEvent(client, event, configuration));
    }
    return jsonResponse(200, {
      ok: true,
      staleClaimsReset: Number(reset.data || 0),
      claimed: events.length,
      results,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: websiteLeadErrorMessage(error),
    });
  }
});
