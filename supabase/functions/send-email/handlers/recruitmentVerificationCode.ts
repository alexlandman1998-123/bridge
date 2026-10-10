import { createClient } from "supabase";
import { buildHomeSeekersRecruitmentCodeEmail } from "../content/recruitmentVerificationCode.ts";
import {
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { assessControlledTestRecipient } from "../utils/controlledTestRecipient.ts";
import { jsonResponse } from "../utils/http.ts";
import { HOME_SEEKERS_ORGANISATION_ID } from "./homeSeekersSellerEnquiry.ts";
import {
  HOME_SEEKERS_RECRUITMENT_REPLY_TO,
  homeSeekersRecruitmentBranding,
  resolveHomeSeekersRecruitmentSender,
} from "../services/homeSeekersRecruitmentBranding.ts";

export async function authorizeRecruitmentCodeSender(
  request: Request,
  fetchAdmin: typeof fetch = fetch,
) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = request.headers.get("authorization") || "";
  if (!serviceKey || !authorization.startsWith("Bearer ")) return false;
  if (authorization === `Bearer ${serviceKey}`) return true;

  // A rotated server credential can remain valid without matching the key
  // injected into this function. Auth must independently verify its admin
  // permission for this project; decoded JWT claims never grant access.
  const url = Deno.env.get("SUPABASE_URL") || "";
  const credential = authorization.slice("Bearer ".length);
  if (!url || !credential) return false;
  try {
    const response = await fetchAdmin(
      `${url.replace(/\/$/, "")}/auth/v1/admin/users?page=1&per_page=1`,
      {
        headers: { authorization, apikey: credential },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      },
    );
    // Only the permission result is needed. Do not read user records.
    await response.body?.cancel();
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function handleHomeSeekersRecruitmentCodeEmail(
  request: Request,
  payload: Record<string, unknown>,
  dependencies?: {
    admin: any;
    send: typeof sendViaResendApi;
    branding: typeof resolveEmailBranding;
    sender: typeof resolveAudienceEmailSender;
    fetchAdmin?: typeof fetch;
  },
) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (
    !(await authorizeRecruitmentCodeSender(request, dependencies?.fetchAdmin))
  ) {
    return jsonResponse(403, { error: "Server authorization required." });
  }
  const leadId = String(payload.leadId || "");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      leadId,
    )
  ) {
    return jsonResponse(400, {
      error: "A saved recruitment enquiry is required.",
    });
  }
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!apiKey || (!dependencies && !url)) {
    return jsonResponse(503, { error: "Verification email is unavailable." });
  }
  try {
    const admin = dependencies?.admin || createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await admin.from("recruitment_leads")
      .select("id,status,contact_capture_json")
      .eq("organisation_id", HOME_SEEKERS_ORGANISATION_ID)
      .eq("id", leadId).maybeSingle();
    const contact = result.data?.contact_capture_json;
    if (
      result.error || !contact ||
      contact.version !== "recruitment-contact-v1" ||
      contact.privacyAccepted !== true ||
      ["closed_lost", "legacy_joined", "agent_activated"].includes(
        result.data.status,
      )
    ) {
      return jsonResponse(409, { error: "Recruitment enquiry unavailable." });
    }
    // Recipient and name come only from the immutable contact capture.
    const to = String(contact.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return jsonResponse(409, { error: "Recruitment enquiry unavailable." });
    }
    if (assessControlledTestRecipient({ email: to }).suppressed) {
      return jsonResponse(200, {
        suppressed: true,
        verificationRequested: false,
      });
    }
    const branding = homeSeekersRecruitmentBranding(
      await (dependencies?.branding || resolveEmailBranding)({
        supabase: admin,
        payload: {},
        organisationId: HOME_SEEKERS_ORGANISATION_ID,
        defaults: {
          organisationId: HOME_SEEKERS_ORGANISATION_ID,
          organisationName: "Home Seekers",
          primaryColor: "#f25c1f",
          secondaryColor: "#171717",
        },
      }),
    );
    const from = await resolveHomeSeekersRecruitmentSender({
      branding,
      supabase: admin,
      sender: dependencies?.sender,
    });
    // generateLink generates the provider OTP without sending the shared Auth
    // email. Only the numeric code is used; no activation URL leaves the server.
    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: to,
    });
    const code = generated.data?.properties?.email_otp;
    const tokenHash = generated.data?.properties?.hashed_token;
    if (
      generated.error || generated.data?.user?.email?.toLowerCase() !== to ||
      typeof code !== "string" || !/^(?:\d{6}|\d{8})$/.test(code) ||
      typeof tokenHash !== "string" || !tokenHash
    ) {
      throw new Error("Verification code unavailable");
    }
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(tokenHash),
        ),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const email = buildHomeSeekersRecruitmentCodeEmail(
      code,
      String(contact.firstName || ""),
      branding,
    );
    const sent = await (dependencies?.send || sendViaResendApi)({
      apiKey,
      from,
      to,
      replyTo: HOME_SEEKERS_RECRUITMENT_REPLY_TO,
      ...email,
      idempotencyKey: `home-seekers-recruitment-code:${digest}`,
      timeoutMs: 10_000,
    });
    if (!sent.ok) throw new Error("Verification email unavailable");
    // Codes, tokens, provider responses and account identifiers stay private.
    return jsonResponse(200, {
      verificationRequested: true,
      codeLength: code.length,
    });
  } catch {
    return jsonResponse(503, {
      error:
        "Verification email could not be sent. Your saved enquiry is safe.",
    });
  }
}
