import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

type HealthStatus = "healthy" | "not_configured" | "unreachable" | "auth_failed" | "unknown_error";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function buildConverterTarget() {
  const explicitConverterUrl = normalizeText(Deno.env.get("DOCX_PDF_CONVERTER_URL"));
  const gotenbergBaseUrl = normalizeText(Deno.env.get("GOTENBERG_URL"));

  if (explicitConverterUrl) {
    return {
      type: "custom" as const,
      url: explicitConverterUrl,
      configured: true,
    };
  }

  if (gotenbergBaseUrl) {
    const base = gotenbergBaseUrl.replace(/\/$/, "");
    return {
      type: "gotenberg" as const,
      url: `${base}/health`,
      configured: true,
    };
  }

  return {
    type: "none" as const,
    url: "",
    configured: false,
  };
}

async function checkConverterConnectivity() {
  const target = buildConverterTarget();
  const hasToken = Boolean(normalizeText(Deno.env.get("DOCX_PDF_CONVERTER_TOKEN")));

  if (!target.configured) {
    return {
      status: "not_configured" as HealthStatus,
      healthy: false,
      message: "DOCX conversion service is not configured.",
      details: {
        requires: ["DOCX_PDF_CONVERTER_URL or GOTENBERG_URL"],
        tokenConfigured: hasToken,
      },
    };
  }

  const headers: Record<string, string> = {};
  const token = normalizeText(Deno.env.get("DOCX_PDF_CONVERTER_TOKEN"));
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(target.url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      return {
        status: "auth_failed" as HealthStatus,
        healthy: false,
        message: "Converter endpoint rejected authentication.",
        details: {
          endpoint: target.url,
          converterType: target.type,
          statusCode: response.status,
        },
      };
    }

    if (response.ok) {
      return {
        status: "healthy" as HealthStatus,
        healthy: true,
        message: "Document conversion is available.",
        details: {
          endpoint: target.url,
          converterType: target.type,
          statusCode: response.status,
        },
      };
    }

    // For custom converter endpoints, 405 may still indicate reachable service.
    if (target.type === "custom" && response.status === 405) {
      return {
        status: "healthy" as HealthStatus,
        healthy: true,
        message: "Converter is reachable (method not allowed on health probe).",
        details: {
          endpoint: target.url,
          converterType: target.type,
          statusCode: response.status,
        },
      };
    }

    return {
      status: "unreachable" as HealthStatus,
      healthy: false,
      message: "Converter endpoint is reachable but unhealthy.",
      details: {
        endpoint: target.url,
        converterType: target.type,
        statusCode: response.status,
      },
    };
  } catch (error) {
    const raw = String(error || "");
    const isAbort = raw.toLowerCase().includes("abort");

    return {
      status: "unreachable" as HealthStatus,
      healthy: false,
      message: isAbort
        ? "Converter request timed out."
        : "Converter endpoint is unreachable.",
      details: {
        endpoint: target.url,
        converterType: target.type,
        error: raw,
      },
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed." });
  }

  try {
    const result = await checkConverterConnectivity();

    return jsonResponse(200, {
      success: true,
      status: result.status,
      healthy: result.healthy,
      message: result.message,
      details: result.details,
    });
  } catch (error) {
    return jsonResponse(200, {
      success: true,
      status: "unknown_error" as HealthStatus,
      healthy: false,
      message: "Unknown conversion health error.",
      details: {
        error: String(error),
      },
    });
  }
});
