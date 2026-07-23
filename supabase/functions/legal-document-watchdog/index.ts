import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  isPhase3EvidenceExact,
  isPublishedFinalDocumentExact,
  type JsonRecord,
  normalizeFinalArtifactText,
} from "../_shared/finalSignedArtifactAccess.ts";
import {
  assessLegalDocumentPilotRelease,
  LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_ENV,
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
} from "../_shared/legalDocumentPilotRelease.ts";

const headers = { "Content-Type": "application/json" };
const WATCHDOG_CONTRACT = "phase5-f2-f3-f4-v2";
const CANONICAL_FINAL_EVENT = "final_signed_document_generated";
const FINAL_SIGNED_EVENT_TYPES = [
  CANONICAL_FINAL_EVENT,
  "final_signed_otp_generated",
];
const ORGANISATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PILOT_ENABLED_ENV = "LEGAL_DOCUMENT_PILOT_ENABLED";

const text = normalizeFinalArtifactText;
const lower = (value: unknown) => text(value).toLowerCase();
const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function configuredOrganisationIds(
  environmentName = "LEGAL_DOCUMENT_WATCHDOG_ORGANISATION_IDS",
) {
  const raw = text(Deno.env.get(environmentName));
  if (!raw) return [] as string[];
  const ids = [
    ...new Set(
      raw.split(",").map((value) => lower(value)).filter(Boolean),
    ),
  ];
  if (!ids.length || ids.some((id) => !ORGANISATION_ID_PATTERN.test(id))) {
    throw new Error(
      `${environmentName} must contain only UUIDs.`,
    );
  }
  return ids;
}

/**
 * The watchdog ordinarily supports an optional multi-organisation operational
 * scope.  Once the Phase 4 customer pilot is enabled, however, it is part of
 * the release evidence: it must observe precisely the same one organisation
 * and the same immutable activation-plan marker as the customer-facing
 * runtime guard.  Do not accept either from the watchdog request body.
 */
function readPhase4PilotRelease(watchdogOrganisationIds: string[]) {
  const active = lower(Deno.env.get(PILOT_ENABLED_ENV)) === "true";
  if (!active) {
    return {
      active: false,
      contract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
      planDigest: null as string | null,
      organisationId: null as string | null,
    };
  }

  if (watchdogOrganisationIds.length !== 1) {
    throw new Error(
      "The active Phase 4 legal-document pilot requires exactly one configured watchdog organisation.",
    );
  }
  const decision = assessLegalDocumentPilotRelease({
    organisationId: watchdogOrganisationIds[0],
    // This is a read-only contract assessment, not an attempt to generate a
    // document.  It deliberately reuses the production release guard so the
    // watcher cannot accept a malformed plan digest or broadened cohort.
    operation: "canonical_generation",
  });
  if (
    !decision.allowed ||
    decision.contract !== LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT ||
    !decision.planDigest ||
    decision.organisationId !== watchdogOrganisationIds[0]
  ) {
    throw new Error(
      `The active Phase 4 legal-document pilot release is invalid (${
        decision.code || "LEGAL_DOCUMENT_PILOT_RELEASE_INVALID"
      }); ${LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_ENV} and the configured organisation must satisfy ${LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT}.`,
    );
  }

  return {
    active: true,
    contract: decision.contract,
    planDigest: decision.planDigest,
    organisationId: decision.organisationId,
  };
}

function scopeByOrganisation(query: any, organisationIds: string[]) {
  return organisationIds.length
    ? query.in("organisation_id", organisationIds)
    : query;
}

function dateValue(value: unknown) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sha256Hex(bytes: Uint8Array) {
  return crypto.subtle.digest("SHA-256", bytes).then((hash) =>
    [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  );
}

function sha256Text(value: string) {
  return sha256Hex(new TextEncoder().encode(value));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const output: R[] = [];
  let next = 0;
  const workers = Array.from({
    length: Math.min(Math.max(concurrency, 1), values.length),
  }, async () => {
    while (next < values.length) {
      const index = next++;
      output[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

async function authorizeServiceCredential(url: string, credential: string) {
  if (!credential) return false;
  const verifier: any = createClient(url, credential, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await verifier.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !result.error;
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const requestId = text(req.headers.get("x-request-id")) ||
    crypto.randomUUID();
  try {
    if (req.method !== "POST") {
      return response(405, { success: false, errorCode: "METHOD_NOT_ALLOWED" });
    }
    const url = text(Deno.env.get("SUPABASE_URL"));
    const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const bearer = text(req.headers.get("authorization")).replace(
      /^Bearer\s+/i,
      "",
    );
    if (!url || !serviceKey) {
      return response(500, {
        success: false,
        errorCode: "WATCHDOG_NOT_CONFIGURED",
      });
    }
    if (!await authorizeServiceCredential(url, bearer)) {
      return response(401, {
        success: false,
        errorCode: "WATCHDOG_AUTH_REQUIRED",
      });
    }

    const organisationIds = configuredOrganisationIds();
    const pilotRelease = readPhase4PilotRelease(organisationIds);
    const scope = organisationIds.length
      ? "configured_organisations"
      : "all_legal_documents";
    const organisationDigest = organisationIds.length
      ? await sha256Text([...organisationIds].sort().join(","))
      : null;
    console.log(
      JSON.stringify({
        level: "info",
        event: "legal_document_watchdog_started",
        requestId,
        scope,
        organisationCount: organisationIds.length,
        pilotReleaseActive: pilotRelease.active,
      }),
    );

    const client: any = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = Date.now();
    const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const staleBefore = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const retryStaleBefore = new Date(now - 10 * 60 * 1000).toISOString();
    const pendingDocumentBefore = new Date(now - 10 * 60 * 1000).toISOString();
    const eventsQuery = scopeByOrganisation(
      client.from("document_packet_events")
        .select(
          "id, event_type, packet_id, version_id, organisation_id, created_at",
        )
        .gte("created_at", since)
        .in("event_type", [
          "generation_started",
          "version_generated",
          "generation_failed",
          ...FINAL_SIGNED_EVENT_TYPES,
          "legal_template_approval_blocked",
          "final_signed_transaction_published",
          "final_document_surfaces_completed",
        ]),
      organisationIds,
    );
    const staleQuery = scopeByOrganisation(
      client.from("document_packets")
        .select(
          "id, organisation_id, transaction_id, packet_type, status, updated_at",
        )
        .in("packet_type", ["otp", "mandate"])
        .in("status", ["sent", "partially_signed"])
        .lt("updated_at", staleBefore),
      organisationIds,
    );
    const completedQuery = scopeByOrganisation(
      client.from("document_packets")
        .select(
          "id, organisation_id, transaction_id, packet_type, status, current_version_number, completed_at",
        )
        .in("packet_type", ["otp", "mandate"])
        .eq("status", "completed")
        .gte("completed_at", since),
      organisationIds,
    );
    // A pending Documents row has no organisation_id.  Under an organisation
    // scope, resolve it only through a version already constrained by the
    // server-owned organisation_id; a global pending-documents scan would let
    // another organisation's stuck artifact poison this pilot's evidence.
    const pendingDocumentVersionsQuery = organisationIds.length
      ? scopeByOrganisation(
        client.from("document_packet_versions")
          .select("final_signed_document_id")
          .not("final_signed_document_id", "is", null),
        organisationIds,
      )
      : Promise.resolve({ data: [], error: null });
    const [
      eventsResult,
      staleResult,
      completedResult,
      pendingDocumentVersionsResult,
    ] = await Promise.all([
      eventsQuery,
      staleQuery,
      completedQuery,
      pendingDocumentVersionsQuery,
    ]);
    for (
      const result of [
        eventsResult,
        staleResult,
        completedResult,
        pendingDocumentVersionsResult,
      ]
    ) if (result.error) throw result.error;

    const pendingDocumentIds = [
      ...new Set(
        (pendingDocumentVersionsResult.data || []).map((row: any) =>
          text(row.final_signed_document_id)
        ).filter(Boolean),
      ),
    ];
    const pendingDocumentsResult = organisationIds.length
      ? pendingDocumentIds.length
        ? await client.from("documents")
          .select("id, updated_at")
          .in("id", pendingDocumentIds)
          .eq("document_type", "final_signed_packet")
          .eq("stage_key", "final_signed_pending")
          .eq("is_client_visible", false)
          .lt("updated_at", pendingDocumentBefore)
        : { data: [], error: null }
      : await client.from("documents")
        .select("id, updated_at")
        .eq("document_type", "final_signed_packet")
        .eq("stage_key", "final_signed_pending")
        .eq("is_client_visible", false)
        .lt("updated_at", pendingDocumentBefore);
    if (pendingDocumentsResult.error) throw pendingDocumentsResult.error;

    const events = eventsResult.data || [];
    const completed = completedResult.data || [];
    const packetIds = completed.map((row: any) => text(row.id)).filter(Boolean);
    const versionsResult = packetIds.length
      ? await scopeByOrganisation(
        client.from("document_packet_versions")
          .select(
            "id, packet_id, organisation_id, version_number, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, final_signed_document_id, finalised_at",
          )
          .in("packet_id", packetIds),
        organisationIds,
      )
      : { data: [], error: null };
    if (versionsResult.error) throw versionsResult.error;

    const currentVersions = completed.map((packet: any) =>
      (versionsResult.data || []).find((version: any) =>
        text(version.packet_id) === text(packet.id) &&
        Number(version.version_number) === Number(packet.current_version_number)
      )
    ).filter(Boolean);
    const versionIds = currentVersions.map((row: any) => text(row.id)).filter(
      Boolean,
    );
    const documentIds = currentVersions.map((row: any) =>
      text(row.final_signed_document_id)
    ).filter(Boolean);
    const [
      evidenceResult,
      finalEventsResult,
      documentsResult,
      signersResult,
      deliveriesResult,
      publicationsResult,
      transactionPublicationsResult,
      completionReceiptsResult,
      completionRetriesResult,
    ] = versionIds.length
      ? await Promise.all([
        scopeByOrganisation(
          client.from("legal_final_artifact_evidence").select(
            "organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type, sha256, byte_length, generated_at, signature_evidence_contract, signature_evidence_mode, embedded_signature_count, signature_asset_evidence_sha256, signature_asset_fingerprints_json",
          ).in("packet_version_id", versionIds),
          organisationIds,
        ),
        scopeByOrganisation(
          client.from("document_packet_events").select(
            "id, packet_id, version_id, organisation_id, event_type, event_payload_json, created_at",
          ).in("version_id", versionIds).eq(
            "event_type",
            CANONICAL_FINAL_EVENT,
          ),
          organisationIds,
        ),
        documentIds.length
          ? client.from("documents").select(
            "id, transaction_id, file_path, file_bucket, name, status, visibility_scope, is_client_visible, stage_key, final_legal_packet_id, final_legal_packet_version_id, final_artifact_bucket, final_artifact_media_type, final_artifact_byte_length, final_artifact_sha256",
          ).in("id", documentIds).in(
            "final_legal_packet_version_id",
            versionIds,
          )
          : Promise.resolve({ data: [], error: null }),
        scopeByOrganisation(
          client.from("document_packet_signers").select(
            "id, organisation_id, packet_version_id, status",
          ).in("packet_version_id", versionIds),
          organisationIds,
        ),
        scopeByOrganisation(
          client.from("legal_final_artifact_deliveries").select(
            "organisation_id, packet_version_id, signer_id, status, artifact_sha256, artifact_path",
          ).in("packet_version_id", versionIds),
          organisationIds,
        ),
        scopeByOrganisation(
          client.from("legal_final_artifact_publications").select(
            "organisation_id, packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at",
          ).in("packet_version_id", versionIds),
          organisationIds,
        ),
        scopeByOrganisation(
          client.from("legal_final_transaction_publications").select(
            "organisation_id, packet_id, packet_version_id, transaction_id, document_id, artifact_sha256, artifact_bucket, artifact_path",
          ).in("packet_version_id", versionIds),
          organisationIds,
        ),
        scopeByOrganisation(
          client.from("legal_final_completion_receipts").select(
            "organisation_id, packet_id, packet_version_id, transaction_id, document_id, artifact_sha256, transaction_visible, client_visible, canonical_satisfied",
          ).in("packet_version_id", versionIds),
          organisationIds,
        ),
        scopeByOrganisation(
          client.from("legal_final_completion_retry_attempts").select(
            "organisation_id, packet_version_id, status, requested_at, completed_at",
          ).in("packet_version_id", versionIds),
          organisationIds,
        ),
      ])
      : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
    for (
      const result of [
        evidenceResult,
        finalEventsResult,
        documentsResult,
        signersResult,
        deliveriesResult,
        publicationsResult,
        transactionPublicationsResult,
        completionReceiptsResult,
        completionRetriesResult,
      ]
    ) if (result.error) throw result.error;

    const currentVersionByPacket = new Map(
      currentVersions.map((row: any) => [text(row.packet_id), asRecord(row)]),
    );
    const evidenceByVersion = new Map<string, JsonRecord[]>();
    for (const row of evidenceResult.data || []) {
      const versionId = text(row.packet_version_id);
      evidenceByVersion.set(versionId, [
        ...(evidenceByVersion.get(versionId) || []),
        asRecord(row),
      ]);
    }
    const finalEventsByVersion = new Map<string, JsonRecord[]>();
    for (const row of finalEventsResult.data || []) {
      const versionId = text(row.version_id);
      finalEventsByVersion.set(versionId, [
        ...(finalEventsByVersion.get(versionId) || []),
        asRecord(row),
      ]);
    }
    const documentById = new Map(
      (documentsResult.data || []).map((
        row: any,
      ) => [text(row.id), asRecord(row)]),
    );
    const publicationByVersion = new Map(
      (publicationsResult.data || []).map((
        row: any,
      ) => [text(row.packet_version_id), asRecord(row)]),
    );
    const transactionPublicationByVersion = new Map(
      (transactionPublicationsResult.data || []).map((
        row: any,
      ) => [text(row.packet_version_id), asRecord(row)]),
    );
    const completionReceiptByVersion = new Map(
      (completionReceiptsResult.data || []).map((
        row: any,
      ) => [text(row.packet_version_id), asRecord(row)]),
    );

    const artifactStates = completed.map((packetRow: any) => {
      const packet = asRecord(packetRow);
      const version = currentVersionByPacket.get(text(packet.id));
      const evidenceCandidates = version
        ? evidenceByVersion.get(text(version.id)) || []
        : [];
      const evidence = evidenceCandidates.length === 1
        ? evidenceCandidates[0]
        : {};
      const event =
        (version ? finalEventsByVersion.get(text(version.id)) || [] : []).find((
          candidate,
        ) =>
          isPhase3EvidenceExact({
            packet,
            version: version || {},
            evidence,
            event: candidate,
          })
        ) || {};
      const f2Exact = Boolean(
        version && evidenceCandidates.length === 1 && text(event.id),
      );
      const document = version
        ? documentById.get(text(version.final_signed_document_id)) || {}
        : {};
      const documentExact = f2Exact &&
        isPublishedFinalDocumentExact({
          packet,
          version: version || {},
          evidence,
          document,
        });
      return {
        packet,
        version: version || {},
        evidence,
        f2Exact,
        documentExact,
      };
    });

    const storageVerification = await mapWithConcurrency(
      artifactStates.filter((state) => state.f2Exact),
      4,
      async (state) => {
        try {
          const download = await client.storage.from(
            text(state.evidence.bucket),
          ).download(text(state.evidence.path));
          if (download.error || !download.data) {
            return { packetId: text(state.packet.id), verified: false };
          }
          const bytes = new Uint8Array(await download.data.arrayBuffer());
          const sha256 = await sha256Hex(bytes);
          return {
            packetId: text(state.packet.id),
            verified: bytes.length === Number(state.evidence.byte_length) &&
              lower(sha256) === lower(state.evidence.sha256),
          };
        } catch {
          return { packetId: text(state.packet.id), verified: false };
        }
      },
    );
    const storageVerifiedPacketIds = new Set(
      storageVerification.filter((row) => row.verified).map((row) =>
        row.packetId
      ),
    );
    const count = (eventType: string) =>
      events.filter((row: any) => row.event_type === eventType).length;
    const countAny = (eventTypes: string[]) =>
      events.filter((row: any) => eventTypes.includes(row.event_type)).length;
    const latestSuccessByPacket = new Map<string, number>();
    for (
      const event of events.filter((row: any) =>
        row.event_type === "version_generated"
      )
    ) {
      const packetId = text(event.packet_id);
      const occurredAt = dateValue(event.created_at);
      if (packetId && occurredAt > (latestSuccessByPacket.get(packetId) || 0)) {
        latestSuccessByPacket.set(packetId, occurredAt);
      }
    }
    const unresolvedFailures = events.filter((event: any) =>
      event.event_type === "generation_failed" && (
        !text(event.packet_id) ||
        dateValue(event.created_at) >
          (latestSuccessByPacket.get(text(event.packet_id)) || 0)
      )
    );
    const missingFinalPacketIds = artifactStates.filter((state) =>
      !text(state.version.id) || !text(state.version.final_signed_file_path) ||
      !text(state.version.final_signed_file_bucket) ||
      !text(state.version.final_signed_document_id)
    ).map((state) => text(state.packet.id));
    const missingFinalEvidencePacketIds = artifactStates.filter((state) =>
      !state.f2Exact
    ).map((state) => text(state.packet.id));
    const invalidFinalDocumentPacketIds = artifactStates.filter((state) =>
      !state.documentExact
    ).map((state) => text(state.packet.id));
    const storageIntegrityFailurePacketIds = artifactStates.filter((state) =>
      state.f2Exact && !storageVerifiedPacketIds.has(text(state.packet.id))
    ).map((state) => text(state.packet.id));
    const incompleteDeliveryPacketIds = artifactStates.filter((state) => {
      const versionId = text(state.version.id);
      const signers = (signersResult.data || []).filter((row: any) =>
        text(row.packet_version_id) === versionId
      );
      return !state.f2Exact || !signers.length ||
        signers.some((signer: any) =>
          lower(signer.status) !== "signed" ||
          !(deliveriesResult.data || []).some((delivery: any) =>
            text(delivery.packet_version_id) === versionId &&
            text(delivery.signer_id) === text(signer.id) &&
            lower(delivery.status) === "sent" &&
            lower(delivery.artifact_sha256) === lower(state.evidence.sha256) &&
            text(delivery.artifact_path) === text(state.evidence.path)
          )
        );
    }).map((state) => text(state.packet.id));
    const missingPublicationPacketIds = artifactStates.filter((state) => {
      const publication = publicationByVersion.get(text(state.version.id));
      const expectedSurface = lower(state.packet.packet_type) === "mandate"
        ? "seller_portal"
        : "client_portal";
      return !state.f2Exact || !publication ||
        lower(publication.artifact_sha256) !== lower(state.evidence.sha256) ||
        text(publication.artifact_path) !== text(state.evidence.path) ||
        lower(publication.portal_surface) !== expectedSurface ||
        !dateValue(publication.verified_at);
    }).map((state) => text(state.packet.id));
    const missingTransactionPublicationPacketIds = artifactStates.filter(
      (state) => {
        const publication = transactionPublicationByVersion.get(
          text(state.version.id),
        );
        return !state.f2Exact || !state.documentExact || !publication ||
          text(publication.organisation_id) !==
            text(state.packet.organisation_id) ||
          text(publication.packet_id) !== text(state.packet.id) ||
          text(publication.transaction_id) !==
            text(state.packet.transaction_id) ||
          text(publication.document_id) !==
            text(state.version.final_signed_document_id) ||
          lower(publication.artifact_sha256) !== lower(state.evidence.sha256) ||
          text(publication.artifact_bucket) !== text(state.evidence.bucket) ||
          text(publication.artifact_path) !== text(state.evidence.path);
      },
    ).map((state) => text(state.packet.id));
    const missingCompletionReceiptPacketIds = artifactStates.filter((state) => {
      const publication = transactionPublicationByVersion.get(
        text(state.version.id),
      );
      const receipt = completionReceiptByVersion.get(text(state.version.id));
      return !receipt || !publication ||
        text(receipt.packet_id) !== text(state.packet.id) ||
        text(receipt.transaction_id) !== text(publication.transaction_id) ||
        text(receipt.document_id) !== text(publication.document_id) ||
        lower(receipt.artifact_sha256) !== lower(publication.artifact_sha256) ||
        receipt.transaction_visible !== true ||
        receipt.client_visible !== true || receipt.canonical_satisfied !== true;
    }).map((state) => text(state.packet.id));
    const stuckCompletionRetryPacketIds = [
      ...new Set(
        (completionRetriesResult.data || [])
          .filter((row: any) =>
            lower(row.status) === "processing" && !row.completed_at &&
            dateValue(row.requested_at) < dateValue(retryStaleBefore)
          )
          .map((row: any) =>
            currentVersions.find((version: any) =>
              text(version.id) === text(row.packet_version_id)
            )?.packet_id
          )
          .map(text)
          .filter(Boolean),
      ),
    ];
    const fullyVerifiedPacketIds = new Set(
      artifactStates.filter((state) =>
        state.f2Exact && state.documentExact &&
        storageVerifiedPacketIds.has(text(state.packet.id))
      ).map((state) => text(state.packet.id)),
    );
    const finalArtifactIntegrityPercent = completed.length
      ? Math.round((fullyVerifiedPacketIds.size / completed.length) * 10000) /
        100
      : null;
    const blockers = [] as Array<Record<string, unknown>>;
    if (unresolvedFailures.length) {
      blockers.push({
        code: "UNRESOLVED_GENERATION_FAILURES",
        count: unresolvedFailures.length,
      });
    }
    if (staleResult.data?.length) {
      blockers.push({
        code: "STALE_SIGNING_PACKETS",
        count: staleResult.data.length,
      });
    }
    if (missingFinalPacketIds.length) {
      blockers.push({
        code: "COMPLETED_PACKET_FINAL_ARTIFACT_MISSING",
        count: missingFinalPacketIds.length,
      });
    }
    if (missingFinalEvidencePacketIds.length) {
      blockers.push({
        code: "FINAL_ARTIFACT_EVIDENCE_MISSING",
        count: missingFinalEvidencePacketIds.length,
      });
    }
    if (invalidFinalDocumentPacketIds.length) {
      blockers.push({
        code: "FINAL_DOCUMENT_PUBLICATION_INVALID",
        count: invalidFinalDocumentPacketIds.length,
      });
    }
    if (storageIntegrityFailurePacketIds.length) {
      blockers.push({
        code: "FINAL_ARTIFACT_STORAGE_MISMATCH",
        count: storageIntegrityFailurePacketIds.length,
      });
    }
    if (incompleteDeliveryPacketIds.length) {
      blockers.push({
        code: "FINAL_DELIVERY_INCOMPLETE",
        count: incompleteDeliveryPacketIds.length,
      });
    }
    if (missingPublicationPacketIds.length) {
      blockers.push({
        code: "PORTAL_PUBLICATION_MISSING",
        count: missingPublicationPacketIds.length,
      });
    }
    if (missingTransactionPublicationPacketIds.length) {
      blockers.push({
        code: "FINAL_TRANSACTION_PUBLICATION_MISSING",
        count: missingTransactionPublicationPacketIds.length,
      });
    }
    if (missingCompletionReceiptPacketIds.length) {
      blockers.push({
        code: "FINAL_SURFACE_COMPLETION_MISSING",
        count: missingCompletionReceiptPacketIds.length,
      });
    }
    if (stuckCompletionRetryPacketIds.length) {
      blockers.push({
        code: "FINAL_COMPLETION_RETRY_STUCK",
        count: stuckCompletionRetryPacketIds.length,
      });
    }
    if (pendingDocumentsResult.data?.length) {
      blockers.push({
        code: "FINAL_DOCUMENT_PUBLICATION_PENDING",
        count: pendingDocumentsResult.data.length,
      });
    }
    const status = blockers.length
      ? "critical"
      : completed.length
      ? "healthy"
      : "warning";
    const summary = {
      kind: "legal_document_watchdog_v1",
      contract: WATCHDOG_CONTRACT,
      // Persist the same immutable release marker that authorizes Phase 4
      // customer delivery.  This makes an otherwise healthy snapshot
      // unusable as pilot evidence if it was collected under another plan.
      pilotRelease: {
        active: pilotRelease.active,
        contract: pilotRelease.contract,
        activationPlanDigest: pilotRelease.planDigest,
        organisationId: pilotRelease.organisationId,
      },
      windowHours: 24,
      scope: {
        mode: scope,
        organisationCount: organisationIds.length,
        organisationDigest,
        storageReadback: "all_current_completed_final_artifacts",
      },
      metrics: {
        generationStarted: count("generation_started"),
        generationCompleted: count("version_generated"),
        generationFailed: count("generation_failed"),
        unresolvedGenerationFailures: unresolvedFailures.length,
        finalSignedGenerated: countAny(FINAL_SIGNED_EVENT_TYPES),
        canonicalFinalSignedGenerated: count(CANONICAL_FINAL_EVENT),
        legalApprovalBlocked: count("legal_template_approval_blocked"),
        staleSigningPackets: staleResult.data?.length || 0,
        completedPackets: completed.length,
        missingFinalArtifacts: missingFinalPacketIds.length,
        missingFinalArtifactEvidence: missingFinalEvidencePacketIds.length,
        invalidFinalDocuments: invalidFinalDocumentPacketIds.length,
        finalArtifactStorageMismatches: storageIntegrityFailurePacketIds.length,
        incompleteFinalDeliveries: incompleteDeliveryPacketIds.length,
        missingPortalPublications: missingPublicationPacketIds.length,
        missingTransactionPublications:
          missingTransactionPublicationPacketIds.length,
        missingCompletionReceipts: missingCompletionReceiptPacketIds.length,
        stuckCompletionRetries: stuckCompletionRetryPacketIds.length,
        pendingFinalDocumentPublications: pendingDocumentsResult.data?.length ||
          0,
        finalArtifactIntegrityPercent,
      },
      blockers,
      stalePacketIds: (staleResult.data || []).map((row: any) => row.id),
      missingFinalPacketIds,
      missingFinalEvidencePacketIds,
      invalidFinalDocumentPacketIds,
      storageIntegrityFailurePacketIds,
      incompleteDeliveryPacketIds,
      missingPublicationPacketIds,
      missingTransactionPublicationPacketIds,
      missingCompletionReceiptPacketIds,
      stuckCompletionRetryPacketIds,
      pendingFinalDocumentIds: (pendingDocumentsResult.data || []).map((
        row: any,
      ) => row.id),
      checkedAt: new Date().toISOString(),
    };
    const snapshot = await client.from("system_health_snapshots").insert({
      status,
      summary,
      created_by: null,
    }).select("id, status, created_at").single();
    if (snapshot.error) throw snapshot.error;
    console.log(JSON.stringify({
      level: status === "critical" ? "error" : "info",
      event: "legal_document_watchdog_completed",
      requestId,
      status,
      blockerCount: blockers.length,
      durationMs: Date.now() - startedAt,
    }));
    return response(200, { success: true, snapshot: snapshot.data, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "legal_document_watchdog_failed",
        requestId,
        error: message,
        durationMs: Date.now() - startedAt,
      }),
    );
    return response(500, {
      success: false,
      errorCode: "WATCHDOG_FAILED",
      requestId,
    });
  }
});
