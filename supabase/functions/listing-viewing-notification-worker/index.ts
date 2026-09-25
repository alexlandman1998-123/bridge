import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.9";
import {
  buildListingViewingEmailPayload,
  listingViewingDeliveryDecision,
} from "../_shared/listingViewingNotification.ts";

type Row = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient<any, "public", any>>;

const text = (value: unknown) => String(value ?? "").trim();
const asRow = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value)
  ? value as Row
  : {};
const json = (status: number, body: Row) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

async function readOne(
  client: AdminClient,
  table: string,
  columns: string,
  filters: Array<[string, unknown]>,
) {
  let query = client.from(table).select(columns);
  for (const [column, value] of filters) query = query.eq(column, value as string);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data as Row | null;
}

async function complete(
  client: AdminClient,
  job: Row,
  status: "sent" | "failed" | "superseded",
  error = "",
  providerMessageId = "",
) {
  const result = await client.rpc("complete_listing_viewing_notification_job", {
    p_job_id: job.id,
    p_attempt_count: job.attempt_count,
    p_status: status,
    p_error: error || null,
    p_provider_message_id: providerMessageId || null,
  });
  if (result.error) throw result.error;
  return result.data === true;
}

async function dispatchJob(
  client: AdminClient,
  job: Row,
  configuration: { supabaseUrl: string; serviceRoleKey: string; appUrl: string },
) {
  try {
    const [appointment, round, participant] = await Promise.all([
      readOne(client, "appointments",
        "appointment_id, organisation_id, listing_viewing_round_number, status, appointment_date, start_time, end_time, timezone, title, location, notes, agent_id, created_by",
        [["appointment_id", job.appointment_id], ["organisation_id", job.organisation_id]]),
      readOne(client, "listing_viewing_rounds",
        "appointment_id, round_number, status, expires_at",
        [["appointment_id", job.appointment_id], ["round_number", job.round_number]]),
      readOne(client, "appointment_participants",
        "participant_id, appointment_id, name, email, participant_role, rsvp_status, rsvp_token, rsvp_revoked_at",
        [["participant_id", job.participant_id], ["appointment_id", job.appointment_id]]),
    ]);

    if (listingViewingDeliveryDecision(job, appointment, round, participant) !== "send") {
      await complete(client, job, "superseded");
      return { jobId: job.id, status: "superseded" };
    }

    const agentId = text(appointment?.agent_id || appointment?.created_by);
    const agent = agentId
      ? await readOne(client, "profiles", "id, full_name, email", [["id", agentId]]) || {}
      : {};
    const payload = buildListingViewingEmailPayload({
      job,
      appointment: appointment!,
      participant: participant!,
      agent,
      appUrl: configuration.appUrl,
    });
    const response = await fetch(
      `${configuration.supabaseUrl.replace(/\/$/, "")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${configuration.serviceRoleKey}`,
          apikey: configuration.serviceRoleKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const result = asRow(await response.json().catch(() => ({})));
    if (!response.ok || result.ok !== true) {
      throw new Error(text(result.error) || `Email service returned ${response.status}.`);
    }
    const recorded = await complete(client, job, "sent", "", text(result.emailId));
    if (recorded && ["request", "changed_time"].includes(text(job.event_kind))) {
      const sentAt = new Date().toISOString();
      const stamped = await client.from("appointment_participants")
        .update({ invitation_sent_at: sentAt, last_invitation_sent_at: sentAt, updated_at: sentAt })
        .eq("participant_id", job.participant_id as string)
        .eq("rsvp_token", text(participant?.rsvp_token));
      if (stamped.error) console.warn("[listing-viewing-email] invitation timestamp could not be saved", stamped.error);
    }
    return { jobId: job.id, status: recorded ? "sent" : "stale_receipt" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification delivery failed.";
    try {
      await complete(client, job, "failed", message);
    } catch (receiptError) {
      console.error("[listing-viewing-email] receipt failed", receiptError);
    }
    return { jobId: job.id, status: "failed", error: message };
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "POST is required." });
  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const suppliedKey = text(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (!serviceRoleKey || suppliedKey !== serviceRoleKey) {
    return json(403, { error: "Service-role authorization is required." });
  }
  if (!supabaseUrl) return json(500, { error: "SUPABASE_URL is missing." });
  const appUrl = text(Deno.env.get("ARCH9_APP_URL"));
  if (!/^https:\/\/[^/]+/i.test(appUrl)) {
    return json(500, { error: "ARCH9_APP_URL must be configured with the correct environment URL." });
  }

  const input = asRow(await request.json().catch(() => ({})));
  const limit = Math.max(1, Math.min(Number(input.limit) || 10, 25));
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const claimed = await client.rpc("claim_listing_viewing_notification_jobs", { p_limit: limit });
    if (claimed.error) throw claimed.error;
    const jobs = (Array.isArray(claimed.data) ? claimed.data : []) as Row[];
    const results = await Promise.all(jobs.map((job) => dispatchJob(client, job, {
      supabaseUrl,
      serviceRoleKey,
      appUrl,
    })));
    return json(200, { ok: true, claimed: jobs.length, results });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Worker failed." });
  }
});
