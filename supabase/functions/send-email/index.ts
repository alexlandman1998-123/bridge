import { createClient } from "supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

type SendClientOnboardingPayload = {
  type: "client_onboarding";
  transactionId: string;
  resend?: boolean;
};

type SendLegacyTestPayload = {
  to: string;
  name?: string;
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

function resolveAppBaseUrl(req: Request) {
  const envCandidates = [
    Deno.env.get("CLIENT_APP_URL"),
    Deno.env.get("PUBLIC_APP_URL"),
    Deno.env.get("APP_BASE_URL"),
    Deno.env.get("SITE_URL"),
  ];

  for (const candidate of envCandidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized.replace(/\/+$/, "");
    }
  }

  const origin = normalizeText(req.headers.get("origin"));
  if (origin) {
    return origin.replace(/\/+$/, "");
  }

  const referer = normalizeText(req.headers.get("referer"));
  if (referer) {
    try {
      const parsed = new URL(referer);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Ignore malformed referer header.
    }
  }

  return "";
}

function buildOnboardingSubject(transactionReference: string) {
  return transactionReference
    ? `Complete your Bridge onboarding (${transactionReference})`
    : "Complete your Bridge onboarding";
}

function buildOnboardingEmailHtml({
  buyerName,
  developmentName,
  unitLabel,
  purchasePrice,
  onboardingUrl,
}: {
  buyerName: string;
  developmentName: string;
  unitLabel: string;
  purchasePrice: string;
  onboardingUrl: string;
}) {
  const subjectLine = [developmentName, unitLabel].filter(Boolean).join(" • ");

  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f8fafc; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe4ef; border-radius: 16px; overflow: hidden;">
        <div style="padding: 20px 24px; background: #0f2f4f; color: #ffffff;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">Bridge</p>
          <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">Client Onboarding</h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 14px; font-size: 15px;">Hi ${buyerName || "there"},</p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            Your transaction has been created. Please complete your onboarding information so the team can continue with your purchase process.
          </p>
          ${
            subjectLine || purchasePrice
              ? `<div style="margin: 16px 0; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
                   ${subjectLine ? `<p style="margin: 0 0 6px; font-size: 14px; color: #334155;"><strong>Property:</strong> ${subjectLine}</p>` : ""}
                   ${purchasePrice ? `<p style="margin: 0; font-size: 14px; color: #334155;"><strong>Purchase Price:</strong> ${purchasePrice}</p>` : ""}
                 </div>`
              : ""
          }
          <p style="margin: 0 0 18px; font-size: 15px;">Use the link below to begin:</p>
          <p style="margin: 0 0 22px;">
            <a href="${onboardingUrl}" style="display: inline-block; padding: 12px 18px; background: #0f4c81; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600;">
              Open Onboarding
            </a>
          </p>
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
            If the button does not work, copy and paste this URL into your browser:<br />
            <a href="${onboardingUrl}" style="color: #0f4c81;">${onboardingUrl}</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

function buildOnboardingEmailText({
  buyerName,
  onboardingUrl,
  developmentName,
  unitLabel,
}: {
  buyerName: string;
  onboardingUrl: string;
  developmentName: string;
  unitLabel: string;
}) {
  const propertyLine = [developmentName, unitLabel].filter(Boolean).join(" • ");

  return [
    `Hi ${buyerName || "there"},`,
    "",
    "Your transaction has been created on Bridge.",
    propertyLine ? `Property: ${propertyLine}` : null,
    "",
    "Please complete your onboarding information using this link:",
    onboardingUrl,
    "",
    "Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendViaResendApi({
  apiKey,
  from,
  to,
  subject,
  html,
  text,
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      ok: false as const,
      error: data,
    };
  }

  return {
    ok: true as const,
    data,
  };
}

async function handleLegacyTestEmail(payload: SendLegacyTestPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const name = normalizeText(payload.name) || "there";
  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject: "Bridge email test",
    html: `<p>Hi ${name}, your Bridge email system is working.</p>`,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send test email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "test",
    emailId: emailResult.data?.id || null,
  });
}

async function handleClientOnboardingEmail(
  req: Request,
  payload: SendClientOnboardingPayload,
) {
  const transactionId = normalizeText(payload.transactionId);
  if (!transactionId) {
    return jsonResponse(400, { error: "Missing required field: transactionId" });
  }

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.",
    });
  }

  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const appBaseUrl = resolveAppBaseUrl(req);
  if (!appBaseUrl) {
    return jsonResponse(500, {
      error: "Unable to resolve app URL. Set CLIENT_APP_URL (or PUBLIC_APP_URL) in function secrets.",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();

  console.log("Loading transaction", transactionId);

  const transactionQuery = await supabase
    .from("transactions")
    .select("id, buyer_id, development_id, unit_id, transaction_reference, purchase_price, sales_price, purchaser_type")
    .eq("id", transactionId)
    .maybeSingle();

  if (transactionQuery.error) {
    console.error("Transaction query failed", transactionQuery.error);
    return jsonResponse(500, {
      error: transactionQuery.error.message || "Failed to load transaction.",
      code: transactionQuery.error.code || null,
    });
  }

  const transaction = transactionQuery.data;
  if (!transaction) {
    return jsonResponse(404, { error: "Transaction not found." });
  }

  console.log("Loading onboarding row");

  const onboardingQuery = await supabase
    .from("transaction_onboarding")
    .select("id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at")
    .eq("transaction_id", transaction.id)
    .eq("is_active", true)
    .maybeSingle();

  if (onboardingQuery.error) {
    console.error("Onboarding query failed", onboardingQuery.error);
    return jsonResponse(500, {
      error: onboardingQuery.error.message || "Failed to load onboarding record.",
      code: onboardingQuery.error.code || null,
    });
  }

  let onboarding = onboardingQuery.data;

  if (!onboarding) {
    console.log("No onboarding row found, creating one");

    const insertResult = await supabase
      .from("transaction_onboarding")
      .insert({
        transaction_id: transaction.id,
        token: `onb_${crypto.randomUUID().replaceAll("-", "")}`,
        status: "Not Started",
        purchaser_type: transaction.purchaser_type || "individual",
        is_active: true,
      })
      .select("id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at")
      .single();

    if (insertResult.error) {
      console.error("Onboarding insert failed", insertResult.error);
      return jsonResponse(500, {
        error: insertResult.error.message || "Failed to create onboarding record.",
        code: insertResult.error.code || null,
      });
    }

    onboarding = insertResult.data;
  }

  let buyerName = "Client";
  let buyerEmail = "";

  if (transaction.buyer_id) {
    console.log("Loading buyer", transaction.buyer_id);

    const buyerQuery = await supabase
      .from("buyers")
      .select("id, name, email")
      .eq("id", transaction.buyer_id)
      .maybeSingle();

    if (buyerQuery.error) {
      console.error("Buyer query failed", buyerQuery.error);
      return jsonResponse(500, {
        error: buyerQuery.error.message || "Failed to load buyer record.",
        code: buyerQuery.error.code || null,
      });
    }

    buyerName = normalizeText(buyerQuery.data?.name) || buyerName;
    buyerEmail = normalizeText(buyerQuery.data?.email).toLowerCase();
  }

  if (!buyerEmail) {
    return jsonResponse(400, {
      error: "Buyer email is missing. Capture buyer email before sending onboarding.",
    });
  }

  let developmentName = "";
  if (transaction.development_id) {
    const developmentQuery = await supabase
      .from("developments")
      .select("id, name")
      .eq("id", transaction.development_id)
      .maybeSingle();

    if (!developmentQuery.error) {
      developmentName = normalizeText(developmentQuery.data?.name);
    }
  }

  let unitLabel = "";
  if (transaction.unit_id) {
    const unitQuery = await supabase
      .from("units")
      .select("id, unit_number")
      .eq("id", transaction.unit_id)
      .maybeSingle();

    if (!unitQuery.error && unitQuery.data?.unit_number) {
      unitLabel = `Unit ${unitQuery.data.unit_number}`;
    }
  }

  const onboardingUrl = `${appBaseUrl}/client/onboarding/${onboarding.token}`;
  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const transactionReference = normalizeText(transaction.transaction_reference);
  const purchasePriceRaw = Number(transaction.purchase_price ?? transaction.sales_price ?? 0);
  const purchasePrice =
    Number.isFinite(purchasePriceRaw) && purchasePriceRaw > 0
      ? new Intl.NumberFormat("en-ZA", {
          style: "currency",
          currency: "ZAR",
          maximumFractionDigits: 0,
        }).format(purchasePriceRaw)
      : "";

  console.log("Sending onboarding email", buyerEmail);

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to: buyerEmail,
    subject: buildOnboardingSubject(transactionReference),
    html: buildOnboardingEmailHtml({
      buyerName,
      developmentName,
      unitLabel,
      purchasePrice,
      onboardingUrl,
    }),
    text: buildOnboardingEmailText({
      buyerName,
      onboardingUrl,
      developmentName,
      unitLabel,
    }),
  });

  if (!emailResult.ok) {
    console.error("Resend failed", emailResult.error);
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send onboarding email.",
      details: emailResult.error,
    });
  }

  const nextOnboardingStatus =
    onboarding.status === "Not Started" ? "In Progress" : onboarding.status;

  const onboardingUpdate = await supabase
    .from("transaction_onboarding")
    .update({
      status: nextOnboardingStatus,
      updated_at: nowIso,
    })
    .eq("id", onboarding.id);

  if (onboardingUpdate.error) {
    console.error("Onboarding update failed", onboardingUpdate.error);
    return jsonResponse(500, {
      error: onboardingUpdate.error.message || "Failed to update onboarding status after send.",
      code: onboardingUpdate.error.code || null,
    });
  }

  const activityMessage = `Client onboarding link sent to ${buyerEmail}`;

  const eventsInsert = await supabase.from("transaction_events").insert({
    transaction_id: transaction.id,
    event_type: "TransactionUpdated",
    created_by_role: "system",
    event_data: {
      type: "onboarding_sent",
      action: "onboarding_email_sent",
      message: activityMessage,
      recipientEmail: buyerEmail,
      onboardingToken: onboarding.token,
      emailId: emailResult.data?.id || null,
      resend: Boolean(payload.resend),
      sentAt: nowIso,
      source: "send-email",
    },
  });

  if (eventsInsert.error) {
    console.error("Transaction events insert failed", eventsInsert.error);
  }

  const commentsInsert = await supabase.from("transaction_comments").insert({
    transaction_id: transaction.id,
    author_name: "Bridge System",
    author_role: "system",
    comment_text: `[system] ${activityMessage}`,
  });

  if (commentsInsert.error) {
    console.error("Transaction comments insert failed", commentsInsert.error);
  }

  const transactionUpdate = await supabase
    .from("transactions")
    .update({
      last_meaningful_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", transaction.id);

  if (transactionUpdate.error) {
    console.error("Transaction update failed", transactionUpdate.error);
  }

  return jsonResponse(200, {
    ok: true,
    type: "client_onboarding",
    transactionId: transaction.id,
    recipientEmail: buyerEmail,
    onboardingUrl,
    onboardingStatus: nextOnboardingStatus,
    emailId: emailResult.data?.id || null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return jsonResponse(400, { error: "Invalid request body." });
    }

    const type = normalizeText((body as { type?: string }).type).toLowerCase();

    if (type === "client_onboarding") {
      return await handleClientOnboardingEmail(
        req,
        body as SendClientOnboardingPayload,
      );
    }

    if ((body as SendLegacyTestPayload).to) {
      return await handleLegacyTestEmail(body as SendLegacyTestPayload);
    }

    return jsonResponse(400, {
      error: "Unknown email request type. Provide { type: 'client_onboarding', transactionId }.",
    });
  } catch (err) {
    console.error("Unhandled function error", err);
    return jsonResponse(500, { error: String(err) });
  }
});