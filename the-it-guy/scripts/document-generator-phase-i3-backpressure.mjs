import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { assessDocumentGeneratorBackpressureBoundary } from "../src/core/documents/documentGeneratorBackpressureBoundary.js";

const STAGING_PROJECT_REF = "isdowlnollckzvltkasn";
const concurrencyPerPacket = Math.max(
  4,
  Math.min(16, Number(process.env.I3_CONCURRENCY_PER_PACKET || 8)),
);
const holdMs = Math.max(
  250,
  Math.min(2000, Number(process.env.I3_HOLD_MS || 1000)),
);
const latencyLimitMs = Math.max(
  2000,
  Number(process.env.I3_P95_LIMIT_MS || 5000),
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

const i2Run = runJson(
  "scripts/document-generator-phase-i2-renderer-capacity.mjs",
);
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
if (!i2Run.report)
  blockers.push({
    code: "I3_I2_CHECK_UNAVAILABLE",
    detail: i2Run.error,
    solution: "Restore document-generator I2 verification before running I3.",
  });
if (!g1Run.report)
  blockers.push({
    code: "I3_CONTROLLED_PAIR_UNAVAILABLE",
    detail: g1Run.error,
    solution: "Restore the controlled mandate and OTP launch-chain verifier.",
  });
if (projectRef !== STAGING_PROJECT_REF)
  blockers.push({
    code: "I3_STAGING_BOUNDARY_INVALID",
    detail: projectRef || "missing project ref",
    solution: `Run I3 only against staging project ${STAGING_PROJECT_REF}.`,
  });
if (!url || !anon || !serviceKey)
  blockers.push({
    code: "I3_SUPABASE_CONFIGURATION_MISSING",
    solution:
      "Configure the staging URL, anonymous key and service-role diagnostics credential.",
  });

const waves = [],
  beforeSnapshots = [],
  afterSnapshots = [],
  latencies = [];
let unauthorizedRejected = false;
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
      "bridge_probe_document_generator_backpressure_i3",
      { p_packet_id: target.packetId, p_hold_ms: holdMs },
    );
    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    latencies.push(durationMs);
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
      "bridge_probe_document_generator_backpressure_i3",
      { p_packet_id: targets[0].packetId, p_hold_ms: 50 },
    );
    unauthorizedRejected = Boolean(unauthorized.error);
    for (let waveNumber = 1; waveNumber <= 2; waveNumber += 1) {
      const calls = targets.flatMap((target) =>
        Array.from({ length: concurrencyPerPacket }, () => probe(target)),
      );
      waves.push({ waveNumber, probes: await Promise.all(calls) });
    }
    afterSnapshots.push(...(await Promise.all(targets.map(snapshot))));
  } catch (error) {
    blockers.push({
      code: "I3_BACKPRESSURE_PROBE_FAILED",
      detail: error?.message || String(error),
      solution:
        "Deploy migration 202607180032 and restore its service-role diagnostic RPC.",
    });
  }
}

const sortedLatencies = latencies.filter(Number.isFinite).sort((a, b) => a - b);
const latencyP95Ms = sortedLatencies.length
  ? sortedLatencies[Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1)]
  : null;
const assessment = assessDocumentGeneratorBackpressureBoundary({
  i2: i2Run.report || {},
  targets,
  concurrencyPerPacket,
  waves,
  unauthorizedRejected,
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
      phase: "I3",
      status: unique.length ? "NO_GO" : "READY_FOR_I4",
      ready: unique.length === 0,
      blockerCount: unique.length,
      blockers: unique,
      evidence: {
        i2Status: i2Run.report?.status || "UNAVAILABLE",
        targetCount: targets.length,
        concurrencyPerPacket,
        holdMs,
        unauthorizedRejected,
        beforeSnapshots,
        afterSnapshots,
        latencyP95Ms,
        latencyLimitMs,
        waves: waves.map((wave) => ({
          waveNumber: wave.waveNumber,
          packetResults: targets.map((target) => {
            const rows = wave.probes.filter(
              (row) => row.packetId === target.packetId,
            );
            return {
              packetType: target.packetType,
              claimedCount: rows.filter((row) => row.claimed === true).length,
              rejectedCount: rows.filter(
                (row) => row.claimed === false && !row.error,
              ).length,
            };
          }),
          probes: wave.probes.map(
            ({
              packetType,
              contract,
              claimed,
              activeLeaseCount,
              primaryKeyPresent,
              completionTriggerPresent,
              expiryIndexPresent,
              durationMs,
              error,
            }) => ({
              packetType,
              contract,
              claimed,
              activeLeaseCount,
              primaryKeyPresent,
              completionTriggerPresent,
              expiryIndexPresent,
              durationMs,
              error,
            }),
          ),
        })),
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
