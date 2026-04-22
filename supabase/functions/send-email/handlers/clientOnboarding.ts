import { createClient } from "supabase";
import {
  buildOnboardingEmailHtml,
  buildOnboardingEmailText,
  buildOnboardingSubject,
} from "../content/onboarding.ts";
import { logOnboardingEmailSideEffects } from "../services/onboardingLogging.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type {
  SendClientOnboardingPayload,
  TransactionOnboardingRow,
} from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText, pickMostRecentOnboardingRow } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

export async function handleClientOnboardingEmail(
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
    .eq("is_active", true);

  if (onboardingQuery.error) {
    console.error("Onboarding query failed", onboardingQuery.error);
    return jsonResponse(500, {
      error: onboardingQuery.error.message || "Failed to load onboarding record.",
      code: onboardingQuery.error.code || null,
    });
  }

  const onboardingRows = Array.isArray(onboardingQuery.data)
    ? (onboardingQuery.data as TransactionOnboardingRow[])
    : [];
  let onboarding = pickMostRecentOnboardingRow(onboardingRows);

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
  const resolvedOnboarding = onboarding as TransactionOnboardingRow;

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

  const onboardingUrl = `${appBaseUrl}/client/onboarding/${resolvedOnboarding.token}`;
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
    resolvedOnboarding.status === "Not Started" ? "In Progress" : resolvedOnboarding.status;

  const onboardingUpdate = await supabase
    .from("transaction_onboarding")
    .update({
      status: nextOnboardingStatus,
      updated_at: nowIso,
    })
    .eq("id", resolvedOnboarding.id);

  if (onboardingUpdate.error) {
    console.error("Onboarding update failed", onboardingUpdate.error);
    return jsonResponse(500, {
      error: onboardingUpdate.error.message || "Failed to update onboarding status after send.",
      code: onboardingUpdate.error.code || null,
    });
  }

  await logOnboardingEmailSideEffects({
    supabase,
    transactionId: transaction.id,
    buyerEmail,
    onboardingToken: resolvedOnboarding.token,
    emailId: emailResult.data?.id || null,
    resend: Boolean(payload.resend),
    nowIso,
  });

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
