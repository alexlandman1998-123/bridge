import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type Job = {
  id: string;
  listing_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
};

const MEDIA_VARIANTS = [
  { key: "thumbnail", width: 320, height: 240, quality: 70, resize: "cover" },
  { key: "card", width: 640, height: 480, quality: 75, resize: "cover" },
  { key: "detail", width: 1600, height: 1200, quality: 82, resize: "contain" },
] as const;

const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_BATCH = 10;

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function workerError(message: string, code: string, retryable: boolean) {
  return Object.assign(new Error(message), { code, retryable });
}

async function shortHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function imageExtension(contentType: string) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("avif")) return "avif";
  return "jpg";
}

async function reconcileMedia(client: ReturnType<typeof createClient>, job: Job) {
  const { data, error } = await client
    .from("listing_media")
    .select("id,storage_bucket,storage_path,processing_status")
    .eq("listing_id", job.listing_id);
  if (error) throw workerError(error.message, error.code || "MEDIA_QUERY_FAILED", true);

  const rows = data || [];
  const missingIdentity = rows.filter((row) => !row.storage_bucket || !row.storage_path);
  if (missingIdentity.length) {
    throw workerError(
      `${missingIdentity.length} media object(s) require storage identity repair.`,
      "MEDIA_IDENTITY_REPAIR_REQUIRED",
      false,
    );
  }
  return { mediaCount: rows.length, storageIdentityVerified: rows.length, reconciledAt: new Date().toISOString() };
}

async function refreshMediaVariants(client: ReturnType<typeof createClient>, job: Job) {
  const { data, error } = await client
    .from("listing_media")
    .select("id,listing_id,media_type,storage_bucket,storage_path,content_type,checksum,updated_at")
    .eq("listing_id", job.listing_id)
    .eq("media_type", "image");
  if (error) throw workerError(error.message, error.code || "VARIANT_MEDIA_QUERY_FAILED", true);

  const mediaRows = (data || []).filter((row) => row.storage_bucket && row.storage_path);
  let generated = 0;
  for (const media of mediaRows) {
    const revision = media.checksum || await shortHash(`${media.storage_bucket}:${media.storage_path}:${media.updated_at || "legacy"}`);
    for (const variant of MEDIA_VARIANTS) {
      const { data: blob, error: downloadError } = await client.storage.from(media.storage_bucket).download(
        media.storage_path,
        { transform: { width: variant.width, height: variant.height, quality: variant.quality, resize: variant.resize } },
      );
      if (downloadError || !blob) {
        throw workerError(downloadError?.message || "Variant transformation returned no image.", "VARIANT_TRANSFORM_FAILED", true);
      }

      const contentType = blob.type || media.content_type || "image/jpeg";
      const variantPath = `__variants/${job.listing_id}/${media.id}/${revision}/${variant.key}.${imageExtension(contentType)}`;
      const { data: existing } = await client
        .from("listing_media_variants")
        .select("storage_bucket,storage_path")
        .eq("listing_media_id", media.id)
        .eq("variant_key", variant.key)
        .maybeSingle();
      const { error: uploadError } = await client.storage.from(media.storage_bucket).upload(variantPath, blob, {
        contentType,
        cacheControl: "31536000",
        upsert: true,
      });
      if (uploadError) throw workerError(uploadError.message, "VARIANT_UPLOAD_FAILED", true);

      const { error: variantError } = await client.from("listing_media_variants").upsert({
        listing_media_id: media.id,
        listing_id: job.listing_id,
        variant_key: variant.key,
        source_revision: revision,
        storage_bucket: media.storage_bucket,
        storage_path: variantPath,
        content_type: contentType,
        byte_size: blob.size,
        width: variant.width,
        height: variant.height,
        status: "ready",
        error_code: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "listing_media_id,variant_key" });
      if (variantError) throw workerError(variantError.message, variantError.code || "VARIANT_METADATA_FAILED", true);

      if (existing?.storage_path && existing.storage_path !== variantPath) {
        await client.storage.from(existing.storage_bucket).remove([existing.storage_path]);
      }
      generated += 1;
    }
  }
  return { mediaCount: mediaRows.length, variantsGenerated: generated, sourceRevisionStrategy: "checksum_or_identity_hash" };
}

async function dispatchSyndication(job: Job) {
  const adapterUrl = Deno.env.get("LISTING_SYNDICATION_ADAPTER_URL") || "";
  const adapterSecret = Deno.env.get("LISTING_SYNDICATION_WORKER_SECRET") || "";
  if (!adapterUrl || !adapterSecret) {
    throw workerError("Listing syndication adapter is not configured.", "SYNDICATION_ADAPTER_NOT_CONFIGURED", false);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const result = await fetch(adapterUrl, {
      method: "POST",
      headers: { ...JSON_HEADERS, "x-listing-syndication-worker-secret": adapterSecret },
      body: JSON.stringify({
        jobId: job.id,
        listingId: job.listing_id,
        jobType: job.job_type,
        payload: job.payload,
      }),
      signal: controller.signal,
    });
    const body = await result.json().catch(() => ({})) as Record<string, unknown>;
    if (!result.ok) {
      throw workerError(
        String(body.error || `Syndication adapter returned HTTP ${result.status}.`),
        String(body.code || "SYNDICATION_ADAPTER_FAILED"),
        result.status === 408 || result.status === 429 || result.status >= 500,
      );
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeJob(client: ReturnType<typeof createClient>, job: Job) {
  if (job.job_type === "media_reconcile") return await reconcileMedia(client, job);
  if (job.job_type === "media_variant_refresh") return await refreshMediaVariants(client, job);
  if (job.job_type === "property24_publish" || job.job_type === "private_property_publish") {
    return await dispatchSyndication(job);
  }

  // Publication/document/webhook jobs are intentionally gated until a dedicated
  // adapter and production activation decision are configured.
  throw workerError(
    `No activated worker adapter exists for ${job.job_type}.`,
    "HANDLER_NOT_ACTIVATED",
    false,
  );
}

Deno.serve(async (req) => {
  const startedAt = performance.now();
  if (req.method !== "POST") return response(405, { error: "Method not allowed." });
  const expectedSecret = Deno.env.get("LISTING_JOB_RUNNER_SECRET") || "";
  if (!expectedSecret || req.headers.get("x-listing-job-runner-secret") !== expectedSecret) {
    return response(401, { error: "Unauthorized." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return response(503, { error: "Worker environment is incomplete." });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(body?.limit) || 5));
  const workerId = `listing-edge:${crypto.randomUUID()}`;
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const runId = crypto.randomUUID();
  const { error: runInsertError } = await client.from("listing_job_worker_runs").insert({
    id: runId,
    worker_id: workerId,
    requested_limit: limit,
  });
  if (runInsertError) return response(500, { error: "Worker run evidence could not be created." });
  const { data: claimed, error: claimError } = await client.rpc("bridge_claim_listing_jobs_v1", {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 180,
  });
  if (claimError) {
    await client.from("listing_job_worker_runs").update({
      status: "failed",
      error_code: claimError.code || "CLAIM_FAILED",
      error_message: claimError.message,
      duration_ms: Math.round(performance.now() - startedAt),
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return response(500, { error: claimError.message });
  }

  const outcomes: Record<string, unknown>[] = [];
  for (const job of (claimed || []) as Job[]) {
    try {
      const result = await executeJob(client, job);
      const { error } = await client.rpc("bridge_complete_listing_job_v1", {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_result: result,
      });
      if (error) throw error;
      outcomes.push({ id: job.id, status: "completed" });
    } catch (cause) {
      const error = cause as Error & { code?: string; retryable?: boolean };
      const { data: failed, error: failError } = await client.rpc("bridge_fail_listing_job_v1", {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error: error.message || "Unknown worker failure.",
        p_error_code: error.code || "WORKER_FAILURE",
        p_retryable: error.retryable !== false,
      });
      outcomes.push({
        id: job.id,
        status: failError ? "lease_update_failed" : failed?.status,
        errorCode: error.code || "WORKER_FAILURE",
      });
    }
  }

  const completed = outcomes.filter((item) => item.status === "completed").length;
  const manualReview = outcomes.filter((item) => item.status === "manual_review").length;
  const retryScheduled = outcomes.filter((item) => item.status === "retry_scheduled").length;
  const durationMs = Math.round(performance.now() - startedAt);
  await client.from("listing_job_worker_runs").update({
    status: "completed",
    claimed_count: outcomes.length,
    completed_count: completed,
    retry_scheduled_count: retryScheduled,
    manual_review_count: manualReview,
    duration_ms: durationMs,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);
  return response(200, {
    workerId,
    claimed: outcomes.length,
    completed,
    retryScheduled,
    manualReview,
    durationMs,
    outcomes,
  });
});
