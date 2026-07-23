import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  type JsonRecord,
  normalizeFinalArtifactText,
  resolvePublishedFinalSignedArtifact,
} from "../_shared/finalSignedArtifactAccess.ts";
import { recordLegalDocumentPilotLifecycleTrace } from "../_shared/legalDocumentPilotLifecycleTrace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeContext(value: unknown) {
  const context = normalizeFinalArtifactText(value).toLowerCase();
  return ["client_portal", "seller_portal", "workspace", "signer"].includes(
      context,
    )
    ? context
    : "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

async function authorizeClientPortal({ admin, portalToken, packet }: {
  admin: any;
  portalToken: string;
  packet: JsonRecord;
}) {
  if (!portalToken || !normalizeFinalArtifactText(packet.transaction_id)) {
    return false;
  }
  const linkResult = await admin
    .from("client_portal_links")
    .select("id, transaction_id, is_active")
    .eq("token", portalToken)
    .eq("is_active", true)
    .maybeSingle();
  return !linkResult.error && Boolean(linkResult.data) &&
    normalizeFinalArtifactText(linkResult.data?.transaction_id) ===
      normalizeFinalArtifactText(packet.transaction_id);
}

async function authorizeSellerPortal(
  { url, anonKey, portalToken, sellerAccessToken, packet }: {
    url: string;
    anonKey: string;
    portalToken: string;
    sellerAccessToken: string;
    packet: JsonRecord;
  },
) {
  if (
    !portalToken || !sellerAccessToken ||
    normalizeFinalArtifactText(packet.packet_type).toLowerCase() !== "mandate"
  ) {
    return false;
  }
  const portalClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const payloadResult = await portalClient.rpc(
    "bridge_private_listing_seller_portal_payload",
    {
      p_token: portalToken,
      p_access_token: sellerAccessToken,
      p_require_access: true,
    },
  );
  if (payloadResult.error) return false;
  const payload = asRecord(payloadResult.data);
  if (payload.authRequired === true || !asRecord(payload.listing).id) {
    return false;
  }
  const mandatePacket = asRecord(
    payload.mandatePacket || payload.mandate_packet,
  );
  const resolvedPacketId = normalizeFinalArtifactText(
    mandatePacket.id || asRecord(mandatePacket.packet).id,
  );
  return Boolean(resolvedPacketId) &&
    resolvedPacketId === normalizeFinalArtifactText(packet.id);
}

async function authorizeWorkspace({ url, anonKey, authorization, packetId }: {
  url: string;
  anonKey: string;
  authorization: string;
  packetId: string;
}) {
  const bearer = normalizeFinalArtifactText(authorization).replace(
    /^Bearer\s+/i,
    "",
  );
  if (!bearer || bearer === anonKey) return false;
  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const userResult = await userClient.auth.getUser();
  if (userResult.error || !userResult.data.user) return false;
  const packetAccess = await userClient
    .from("document_packets")
    .select("id")
    .eq("id", packetId)
    .maybeSingle();
  return !packetAccess.error && Boolean(packetAccess.data?.id);
}

/**
 * A completed signing link is a scoped bearer capability for its exact
 * packet-version. It may only resolve the final artifact after the normal
 * server-side publication fence succeeds; it never authorizes arbitrary
 * packet or Documents-row access.
 */
async function authorizeSigner(
  { admin, signingToken, packetId, packetVersionId }: {
    admin: any;
    signingToken: string;
    packetId: string;
    packetVersionId: string;
  },
) {
  if (!signingToken || !packetId || !packetVersionId) return false;
  const signerResult = await admin
    .from("document_packet_signers")
    .select("id, status, packet_id, packet_version_id")
    .eq("signing_token", signingToken)
    .eq("packet_id", packetId)
    .eq("packet_version_id", packetVersionId)
    .maybeSingle();
  return !signerResult.error && Boolean(signerResult.data?.id) &&
    normalizeFinalArtifactText(signerResult.data?.status).toLowerCase() ===
      "signed";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, {
      success: false,
      error: "Method not allowed.",
      errorCode: "FINAL_ACCESS_METHOD_NOT_ALLOWED",
    });
  }

  try {
    const url = normalizeFinalArtifactText(Deno.env.get("SUPABASE_URL"));
    const anonKey = normalizeFinalArtifactText(
      Deno.env.get("SUPABASE_ANON_KEY"),
    );
    const serviceKey = normalizeFinalArtifactText(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    if (!url || !anonKey || !serviceKey) {
      return jsonResponse(500, {
        success: false,
        error: "Final document access is not configured.",
        errorCode: "FINAL_ACCESS_CONFIGURATION_MISSING",
      });
    }

    const payload = asRecord(await req.json());
    const context = normalizeContext(payload.context);
    const requestedPacketId = normalizeFinalArtifactText(
      payload.packetId || payload.packet_id,
    );
    const requestedPacketVersionId = normalizeFinalArtifactText(
      payload.packetVersionId || payload.packet_version_id,
    );
    const documentId = normalizeFinalArtifactText(
      payload.documentId || payload.document_id,
    );
    const portalToken = normalizeFinalArtifactText(
      payload.portalToken || payload.portal_token,
    );
    const sellerAccessToken = normalizeFinalArtifactText(
      payload.sellerAccessToken || payload.seller_access_token,
    );
    const signingToken = normalizeFinalArtifactText(
      payload.signingToken || payload.signing_token,
    );
    const action =
      normalizeFinalArtifactText(payload.action).toLowerCase() === "download"
        ? "download"
        : "status";
    if (
      !context ||
      ((!requestedPacketId || !requestedPacketVersionId) && !documentId)
    ) {
      return jsonResponse(400, {
        success: false,
        error: "A final document reference and access context are required.",
        errorCode: "FINAL_ACCESS_TARGET_REQUIRED",
      });
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let packetId = requestedPacketId;
    let packetVersionId = requestedPacketVersionId;
    if (documentId) {
      const versionByDocumentResult = await admin
        .from("document_packet_versions")
        .select("id, packet_id")
        .eq("final_signed_document_id", documentId)
        .maybeSingle();
      if (
        versionByDocumentResult.error || !versionByDocumentResult.data?.id ||
        !versionByDocumentResult.data?.packet_id
      ) {
        return jsonResponse(403, {
          success: false,
          error: "This final document is not available in this workspace.",
          errorCode: "FINAL_ACCESS_DENIED",
        });
      }
      const versionPacketId = normalizeFinalArtifactText(
        versionByDocumentResult.data.packet_id,
      );
      const versionId = normalizeFinalArtifactText(
        versionByDocumentResult.data.id,
      );
      if (
        (packetId && packetId !== versionPacketId) ||
        (packetVersionId && packetVersionId !== versionId)
      ) {
        return jsonResponse(403, {
          success: false,
          error: "This final document is not available in this workspace.",
          errorCode: "FINAL_ACCESS_DENIED",
        });
      }
      packetId = versionPacketId;
      packetVersionId = versionId;
    }
    const packetResult = await admin
      .from("document_packets")
      .select("id, organisation_id, packet_type, transaction_id")
      .eq("id", packetId)
      .maybeSingle();
    if (packetResult.error || !packetResult.data) {
      return jsonResponse(403, {
        success: false,
        error: "This final document is not available in this workspace.",
        errorCode: "FINAL_ACCESS_DENIED",
      });
    }
    const packet = asRecord(packetResult.data);
    const authorized = context === "client_portal"
      ? await authorizeClientPortal({ admin, portalToken, packet })
      : context === "seller_portal"
      ? await authorizeSellerPortal({
        url,
        anonKey,
        portalToken,
        sellerAccessToken,
        packet,
      })
      : context === "signer"
      ? await authorizeSigner({
        admin,
        signingToken,
        packetId,
        packetVersionId,
      })
      : await authorizeWorkspace({
        url,
        anonKey,
        authorization: req.headers.get("authorization") || "",
        packetId,
      });
    if (!authorized) {
      return jsonResponse(403, {
        success: false,
        error: "This final document is not available in this workspace.",
        errorCode: "FINAL_ACCESS_DENIED",
      });
    }

    const resolved = await resolvePublishedFinalSignedArtifact({
      supabase: admin,
      packetId,
      packetVersionId,
      documentId,
      issueDownloadUrl: action === "download",
      expiresInSeconds: 60,
    });
    if (action === "download") {
      try {
        // Final access remains a Phase 0 exception: a missing/old release
        // trace must never take an already-completed PDF away from an
        // authorised client, seller, workspace user, or signer. The trace is
        // evidence for Phase 5 acceptance only, and a failed write therefore
        // leaves the resolver response intact while preventing a false pass.
        await recordLegalDocumentPilotLifecycleTrace({
          supabase: admin,
          packetId,
          packetVersionId,
          stage: "final_access_authorized",
          accessContext: context as "client_portal" | "seller_portal" | "workspace" | "signer",
        });
      } catch (traceError) {
        console.warn("resolve-final-signed-document-access lifecycle trace unavailable", traceError);
      }
    }
    return jsonResponse(200, { success: true, ...resolved });
  } catch (error) {
    console.error("resolve-final-signed-document-access failed", error);
    return jsonResponse(500, {
      success: false,
      error: "The final signed document could not be verified right now.",
      errorCode: "FINAL_ACCESS_UNAVAILABLE",
    });
  }
});
