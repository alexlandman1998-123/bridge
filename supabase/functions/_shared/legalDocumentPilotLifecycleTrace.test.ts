import {
  assertLegalDocumentPilotLifecycleBinding,
  LEGAL_DOCUMENT_PILOT_LIFECYCLE_TRACE_CONTRACT,
} from "./legalDocumentPilotLifecycleTrace.ts";
import {
  assessLegalDocumentPilotRelease,
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
} from "./legalDocumentPilotRelease.ts";

const organisationId = "11111111-1111-4111-8111-111111111111";
const packetId = "22222222-2222-4222-8222-222222222222";
const packetVersionId = "33333333-3333-4333-8333-333333333333";
const activeDigest = `sha256:${"a".repeat(64)}`;
const staleDigest = `sha256:${"b".repeat(64)}`;

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function activeRelease() {
  const decision = assessLegalDocumentPilotRelease({
    organisationId,
    operation: "final_delivery",
    environment: (name) => ({
      LEGAL_DOCUMENT_PILOT_ENABLED: "true",
      LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: organisationId,
      LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: activeDigest,
    })[name],
  });
  expect(decision.allowed, "The fixture must create an active release decision.");
  expect(decision.contract === LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT, "The fixture must use the production release contract.");
  return decision;
}

function bindingResult(activationPlanDigest = activeDigest) {
  return {
    data: {
      contract: LEGAL_DOCUMENT_PILOT_LIFECYCLE_TRACE_CONTRACT,
      bindingId: "44444444-4444-4444-8444-444444444444",
      packetId,
      packetVersionId,
      packetType: "mandate",
      activationPlanDigest,
    },
    error: null,
  };
}

Deno.test("lifecycle binding accepts only the exact active release-plan digest", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const result = await assertLegalDocumentPilotLifecycleBinding({
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return bindingResult();
      },
    },
    packetId,
    packetVersionId,
    activeRelease: activeRelease(),
  });

  expect(result.activationPlanDigest === activeDigest, "The matching immutable binding should be returned.");
  expect(calls.length === 1, "The assertion must use exactly one service-only binding RPC.");
  expect(calls[0]?.name === "bridge_assert_legal_document_pilot_release_binding_phase5", "The assertion must use the immutable Phase 5 binding RPC.");
  expect(calls[0]?.args.p_packet_id === packetId && calls[0]?.args.p_packet_version_id === packetVersionId, "The assertion must bind the exact packet version.");
});

Deno.test("lifecycle binding fails closed when an earlier plan digest differs from the active release", async () => {
  let failure: { code?: string; status?: number } | null = null;
  try {
    await assertLegalDocumentPilotLifecycleBinding({
      supabase: { rpc: async () => bindingResult(staleDigest) },
      packetId,
      packetVersionId,
      activeRelease: activeRelease(),
    });
  } catch (error) {
    failure = error as { code?: string; status?: number };
  }
  expect(failure?.code === "PHASE5_RELEASE_TRACE_ACTIVE_RELEASE_MISMATCH", "A stale immutable binding must not authorize current customer-facing work.");
  expect(failure?.status === 409, "A plan identity mismatch must be a deterministic conflict.");
});

Deno.test("lifecycle binding fails closed when the RPC response names a different packet version", async () => {
  let failure: { code?: string } | null = null;
  try {
    await assertLegalDocumentPilotLifecycleBinding({
      supabase: {
        rpc: async () => ({
          ...bindingResult(),
          data: { ...bindingResult().data, packetVersionId: "55555555-5555-4555-8555-555555555555" },
        }),
      },
      packetId,
      packetVersionId,
      activeRelease: activeRelease(),
    });
  } catch (error) {
    failure = error as { code?: string };
  }
  expect(failure?.code === "PHASE5_RELEASE_TRACE_ACTIVE_RELEASE_MISMATCH", "A response for another exact version must never be accepted.");
});
