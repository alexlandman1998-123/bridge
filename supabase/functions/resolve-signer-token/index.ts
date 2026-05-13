import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBucketCandidates(...values: (string | undefined)[]) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function collectSourceContextBucketHints(sourceContext: Record<string, unknown> = {}) {
  const generationPayload =
    sourceContext.generationPayload && typeof sourceContext.generationPayload === "object"
      ? sourceContext.generationPayload as Record<string, unknown>
      : {};
  const generationTemplate =
    generationPayload.template && typeof generationPayload.template === "object"
      ? generationPayload.template as Record<string, unknown>
      : {};

  return parseBucketCandidates(
    String(sourceContext.outputBucket || sourceContext.output_bucket || ""),
    String(sourceContext.template_output_bucket || sourceContext.templateOutputBucket || ""),
    String(generationPayload.outputBucket || generationPayload.output_bucket || ""),
    String(generationTemplate.outputBucket || generationTemplate.output_bucket || ""),
  );
}

async function resolveSignedPreviewUrl({
  supabase,
  filePath,
  bucketCandidates,
}: {
  supabase: ReturnType<typeof createClient>;
  filePath: string;
  bucketCandidates: string[];
}) {
  const path = normalizeText(filePath);
  if (!path) return null;

  for (const bucket of [...new Set(bucketCandidates.filter(Boolean))]) {
    const result = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (!result.error && result.data?.signedUrl) {
      return result.data.signedUrl;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed." });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        success: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    const payload = (await req.json()) as {
      action?: string;
      token?: string;
    };

    const action = normalizeText(payload?.action || "resolve").toLowerCase();
    if (action !== "resolve") {
      return jsonResponse(400, {
        success: false,
        error: "Unsupported action.",
        errorCode: "UNSUPPORTED_ACTION",
      });
    }

    const token = normalizeText(payload?.token);
    if (!token) {
      return jsonResponse(400, {
        success: false,
        error: "Signing token is required.",
        errorCode: "INVALID_SIGNING_TOKEN",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const signerQuery = await supabase
      .from("document_packet_signers")
      .select(
        "id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at",
      )
      .eq("signing_token", token)
      .maybeSingle();

    if (signerQuery.error) {
      throw signerQuery.error;
    }

    const signer = signerQuery.data as Record<string, unknown> | null;
    if (!signer) {
      return jsonResponse(404, {
        success: false,
        error: "This signing link is invalid.",
        errorCode: "INVALID_SIGNING_TOKEN",
      });
    }

    const nowIso = new Date().toISOString();
    const tokenExpiry = normalizeText(signer?.token_expires_at);
    if (tokenExpiry) {
      const expiryDate = new Date(tokenExpiry);
      if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
        if (normalizeText(signer?.status).toLowerCase() !== "expired") {
          await supabase.from("document_packet_signers").update({ status: "expired" }).eq("id", String(signer.id));
        }
        return jsonResponse(410, {
          success: false,
          error: "This signing link has expired.",
          errorCode: "SIGNING_TOKEN_EXPIRED",
        });
      }
    }

    const packetQuery = await supabase
      .from("document_packets")
      .select("id, organisation_id, packet_type, title, status, current_version_number, source_context_json, created_at, updated_at")
      .eq("id", String(signer.packet_id || ""))
      .maybeSingle();
    if (packetQuery.error) throw packetQuery.error;
    if (!packetQuery.data) {
      return jsonResponse(404, {
        success: false,
        error: "Packet not found for this signing link.",
        errorCode: "SIGNING_PACKET_NOT_FOUND",
      });
    }
    const packet = packetQuery.data as Record<string, unknown>;

    const versionQuery = await supabase
      .from("document_packet_versions")
      .select(
        "id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, validation_summary_json, created_at, updated_at",
      )
      .eq("id", String(signer.packet_version_id || ""))
      .eq("packet_id", String(packet.id || ""))
      .maybeSingle();
    if (versionQuery.error) throw versionQuery.error;
    if (!versionQuery.data) {
      return jsonResponse(404, {
        success: false,
        error: "Packet version not found for this signing link.",
        errorCode: "SIGNING_VERSION_NOT_FOUND",
      });
    }
    const version = versionQuery.data as Record<string, unknown>;

    const fieldsQuery = await supabase
      .from("document_signing_fields")
      .select(
        "id, packet_id, packet_version_id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, completed_at, completed_by_email",
      )
      .eq("packet_id", String(packet.id || ""))
      .eq("packet_version_id", String(version.id || ""))
      .eq("signer_role", normalizeText(signer.signer_role))
      .order("page_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (fieldsQuery.error) throw fieldsQuery.error;
    const allFields = (fieldsQuery.data || []) as Record<string, unknown>[];

    const signerEmail = normalizeText(signer.signer_email).toLowerCase();
    const fields = allFields.filter((field) => {
      const fieldEmail = normalizeText(field?.signer_email).toLowerCase();
      return !fieldEmail || fieldEmail === signerEmail;
    });

    const requiredInitials = fields.filter((field) => field.required && normalizeText(field.field_type) === "initial").length;
    const requiredSignatures = fields.filter((field) => field.required && normalizeText(field.field_type) === "signature").length;
    const requiredCount = fields.filter((field) => field.required).length;

    const sourceContext = packet.source_context_json && typeof packet.source_context_json === "object"
      ? packet.source_context_json as Record<string, unknown>
      : {};
    const validationSummary = version.validation_summary_json && typeof version.validation_summary_json === "object"
      ? version.validation_summary_json as Record<string, unknown>
      : {};
    const validationBucketHints = collectSourceContextBucketHints(validationSummary);
    const sourceContextBucketHints = collectSourceContextBucketHints(sourceContext);
    const packetType = normalizeText(packet.packet_type).toLowerCase();
    const packetTypeOutputBucket =
      packetType === "mandate"
        ? normalizeText(Deno.env.get("MANDATE_OUTPUT_BUCKET"))
        : packetType === "otp"
          ? normalizeText(Deno.env.get("OTP_OUTPUT_BUCKET"))
          : "";
    const bucketCandidates = parseBucketCandidates(
      packetTypeOutputBucket,
      Deno.env.get("MANDATE_OUTPUT_BUCKET"),
      Deno.env.get("OTP_OUTPUT_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
      Deno.env.get("DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_STORAGE_BUCKET"),
      Deno.env.get("SIGNED_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_SIGNED_DOCUMENTS_BUCKET"),
      ...sourceContextBucketHints,
      ...validationBucketHints,
      "documents",
    );
    const documentPreviewUrl =
      normalizeText(version.rendered_file_url) ||
      (await resolveSignedPreviewUrl({
        supabase,
        filePath: normalizeText(version.rendered_file_path),
        bucketCandidates,
      }));

    const nextStatus = ["pending", "ready_to_send", "sent"].includes(normalizeText(signer.status).toLowerCase())
      ? "viewed"
      : signer.status;
    const signerUpdatePayload: Record<string, unknown> = {
      status: nextStatus,
    };
    if (!normalizeText(signer.viewed_at)) signerUpdatePayload.viewed_at = nowIso;
    if (!normalizeText(signer.token_used_at)) signerUpdatePayload.token_used_at = nowIso;

    const updateResult = await supabase
      .from("document_packet_signers")
      .update(signerUpdatePayload)
      .eq("id", String(signer.id || ""))
      .select(
        "id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, token_expires_at, token_used_at, viewed_at, signed_at",
      )
      .single();
    if (updateResult.error) throw updateResult.error;
    const updatedSigner = updateResult.data as Record<string, unknown>;
    if (!normalizeText(signer.viewed_at)) {
      await supabase.from("document_packet_events").insert({
        packet_id: String(packet.id || ""),
        organisation_id: String(packet.organisation_id || ""),
        version_id: String(version.id || ""),
        event_type: "signer_link_viewed",
        event_payload_json: {
          activity_type: "signer_link_viewed",
          lead_id: sourceContext.leadId || sourceContext.lead_id || null,
          transaction_id: sourceContext.transactionId || sourceContext.transaction_id || null,
          private_listing_id: sourceContext.privateListingId || sourceContext.private_listing_id || null,
          document_packet_id: String(packet.id || ""),
          document_packet_version_id: String(version.id || ""),
          signer_id: updatedSigner.id,
          actor_name: updatedSigner.signer_name || "Seller",
          actor_role: "seller",
          message: updatedSigner.signer_name
            ? `${updatedSigner.signer_name} viewed the mandate.`
            : "Seller viewed the mandate.",
          visibility: "internal",
          created_at: nowIso,
          metadata: {},
          signerId: updatedSigner.id,
          signerRole: updatedSigner.signer_role,
          signerName: updatedSigner.signer_name,
          signerEmail: updatedSigner.signer_email,
          viewedAt: nowIso,
        },
        created_by: null,
        created_at: nowIso,
      });
    }

    await supabase
      .from("document_packets")
      .update({
        source_context_json: {
          ...sourceContext,
          signing_status: "viewed",
          signingStatus: "viewed",
          mandateStatus: "viewed",
          viewedAt: sourceContext.viewedAt || nowIso,
          lastViewedAt: nowIso,
        },
      })
      .eq("id", String(packet.id || ""));

    return jsonResponse(200, {
      success: true,
      session: {
        signer: updatedSigner,
        packet: {
          id: packet.id,
          packet_type: packet.packet_type,
          title: packet.title,
          status: packet.status,
          current_version_number: packet.current_version_number,
        },
        version: {
          id: version.id,
          version_number: version.version_number,
          render_status: version.render_status,
          rendered_file_name: version.rendered_file_name,
        },
        fields,
        fieldSummary: {
          requiredCount,
          requiredInitials,
          requiredSignatures,
        },
        documentPreviewUrl: documentPreviewUrl || null,
      },
    });
  } catch (error) {
    console.error("resolve-signer-token failed", error);
    return jsonResponse(500, {
      success: false,
      error: "The signing session could not be loaded. Please try again or request a new signing link.",
      errorCode: "SIGNER_SESSION_FAILED",
    });
  }
});
