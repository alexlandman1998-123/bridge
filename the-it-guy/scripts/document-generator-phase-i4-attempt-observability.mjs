import { createHash } from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { assessDocumentGeneratorAttemptObservabilityBoundary } from "../src/core/documents/documentGeneratorAttemptObservabilityBoundary.js";

const STAGING_PROJECT_REF = "isdowlnollckzvltkasn";
const probesPerPacket = Math.max(
  2,
  Math.min(10, Number(process.env.I4_PROBES_PER_PACKET || 4)),
);
const latencyLimitMs = Math.max(
  500,
  Number(process.env.I4_P95_LIMIT_MS || 2000),
);
function runJson(script, timeout = 900_000) {
  const run = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout,
    maxBuffer: 60 * 1024 * 1024,
  });
  try {
    return { report: JSON.parse(String(run.stdout || "").trim()), error: null };
  } catch {
    return {
      report: null,
      error: String(
        run.stderr || run.stdout || `${script} returned no report.`,
      ).trim(),
    };
  }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const digest = (value) =>
  `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;

const i3Run = runJson("scripts/document-generator-phase-i3-backpressure.mjs");
const g1Run = runJson("scripts/document-generator-phase-g1-verify.mjs");
const targets = g1Run.report?.evidence || [];
const url = String(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
)
  .trim()
  .replace(/\/+$/, "");
const anon = String(
  process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || "",
).trim();
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || "";
const blockers = [];
if (!i3Run.report)
  blockers.push({
    code: "I4_I3_CHECK_UNAVAILABLE",
    detail: i3Run.error,
    solution: "Restore document-generator I3 verification before running I4.",
  });
if (!g1Run.report)
  blockers.push({
    code: "I4_CONTROLLED_PAIR_UNAVAILABLE",
    detail: g1Run.error,
    solution: "Restore the controlled mandate and OTP launch-chain verifier.",
  });
if (projectRef !== STAGING_PROJECT_REF)
  blockers.push({
    code: "I4_STAGING_BOUNDARY_INVALID",
    detail: projectRef || "missing project ref",
    solution: `Run I4 only against staging project ${STAGING_PROJECT_REF}.`,
  });
if (!url || !anon || !serviceKey)
  blockers.push({
    code: "I4_SUPABASE_CONFIGURATION_MISSING",
    solution:
      "Configure the staging URL, anonymous key and service-role diagnostics credential.",
  });

const packetServiceSource = fs.readFileSync(
  "src/core/documents/packetService.js",
  "utf8",
);
const retryGuidanceCovered =
  /getDocumentPacketGenerationLeaseStatus/.test(packetServiceSource) &&
  /retryAfterSeconds/.test(packetServiceSource) &&
  /retryAt/.test(packetServiceSource) &&
  /safeToRetry/.test(packetServiceSource);
const probes = [],
  beforeSnapshots = [],
  afterSnapshots = [],
  latencies = [];
let unauthorizedRejected = false,
  internalIdentifierExposed = false;
if (!blockers.length && targets.length) {
  const require = createRequire(path.resolve("package.json"));
  const { createClient } = require("@supabase/supabase-js");
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function snapshot(target) {
    const [packet, versions, events, documents, leases] = await Promise.all([
      service
        .from("document_packets")
        .select("*")
        .eq("id", target.packetId)
        .maybeSingle(),
      service
        .from("document_packet_versions")
        .select("*")
        .eq("packet_id", target.packetId)
        .order("version_number", { ascending: true }),
      service
        .from("document_packet_events")
        .select("*")
        .eq("packet_id", target.packetId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      service
        .from("documents")
        .select("*")
        .or(
          `legal_packet_id.eq.${target.packetId},final_legal_packet_id.eq.${target.packetId}`,
        )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      service
        .from("legal_document_generation_leases")
        .select("*")
        .eq("packet_id", target.packetId)
        .order("claimed_at", { ascending: true }),
    ]);
    const failed = [packet, versions, events, documents, leases].find(
      (result) => result.error,
    );
    if (failed?.error) throw failed.error;
    return {
      packetId: target.packetId,
      packetType: target.packetType,
      stateDigest: digest({
        packet: packet.data,
        versions: versions.data || [],
        events: events.data || [],
        documents: documents.data || [],
        leases: leases.data || [],
      }),
    };
  }
  async function probe(target) {
    const started = performance.now();
    const result = await service.rpc(
      "bridge_get_generation_attempt_status_i4",
      { p_packet_id: target.packetId },
    );
    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    latencies.push(durationMs);
    if (
      result.data &&
      /"(?:generationAttemptId|generation_attempt_id|claimedBy|claimed_by)"\s*:/.test(
        JSON.stringify(result.data),
      )
    )
      internalIdentifierExposed = true;
    return {
      packetId: target.packetId,
      packetType: target.packetType,
      ...(result.data || {}),
      durationMs,
      error: result.error?.message || null,
    };
  }
  try {
    beforeSnapshots.push(...(await Promise.all(targets.map(snapshot))));
    const unauthorized = await publicClient.rpc(
      "bridge_get_generation_attempt_status_i4",
      { p_packet_id: targets[0].packetId },
    );
    unauthorizedRejected = Boolean(unauthorized.error);
    const calls = targets.flatMap((target) =>
      Array.from({ length: probesPerPacket }, () => probe(target)),
    );
    probes.push(...(await Promise.all(calls)));
    afterSnapshots.push(...(await Promise.all(targets.map(snapshot))));
  } catch (error) {
    blockers.push({
      code: "I4_STATUS_PROBE_FAILED",
      detail: error?.message || String(error),
      solution:
        "Deploy migration 202607180033 and restore its authorised status RPC.",
    });
  }
}

const sortedLatencies = latencies.filter(Number.isFinite).sort((a, b) => a - b);
const latencyP95Ms = sortedLatencies.length
  ? sortedLatencies[Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1)]
  : null;
const assessment = assessDocumentGeneratorAttemptObservabilityBoundary({
  i3: i3Run.report || {},
  targets,
  probes,
  probesPerPacket,
  unauthorizedRejected,
  retryGuidanceCovered,
  internalIdentifierExposed,
  beforeSnapshots,
  afterSnapshots,
  latencyP95Ms,
  latencyLimitMs,
});
blockers.push(...assessment.blockers);
const unique = [
  ...new Map(
    blockers.map((item) => [`${item.code}:${item.detail || ""}`, item]),
  ).values(),
];
console.log(
  JSON.stringify(
    {
      phase: "I4",
      status: unique.length ? "NO_GO" : "READY_FOR_I5",
      ready: unique.length === 0,
      blockerCount: unique.length,
      blockers: unique,
      evidence: {
        i3Status: i3Run.report?.status || "UNAVAILABLE",
        targetCount: targets.length,
        probesPerPacket,
        unauthorizedRejected,
        retryGuidanceCovered,
        internalIdentifierExposed,
        beforeSnapshots,
        afterSnapshots,
        latencyP95Ms,
        latencyLimitMs,
        probes: probes.map(
          ({
            packetType,
            contract,
            generationStatus,
            active,
            safeToRetry,
            retryAfterSeconds,
            completionTriggerPresent,
            internalIdentifiersExcluded,
            durationMs,
            error,
          }) => ({
            packetType,
            contract,
            generationStatus,
            active,
            safeToRetry,
            retryAfterSeconds,
            completionTriggerPresent,
            internalIdentifiersExcluded,
            durationMs,
            error,
          }),
        ),
      },
      projectRef,
      checkedAt: new Date().toISOString(),
      mutatedData: false,
    },
    null,
    2,
  ),
);
if (unique.length) process.exitCode = 1;
