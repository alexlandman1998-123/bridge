import { createClient } from "supabase";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { assessControlledTestRecipient } from "../utils/controlledTestRecipient.ts";
import { jsonResponse } from "../utils/http.ts";
import {
  applicantEmailKinds,
  buildHomeSeekersRecruitmentApprovalEmail,
  buildRecruitmentApplicantEmail,
} from "../content/recruitmentApplicantEmails.ts";
import {
  HOME_SEEKERS_RECRUITMENT_ACCENT,
  HOME_SEEKERS_RECRUITMENT_ORGANISATION_ID,
  homeSeekersRecruitmentBranding,
  HomeSeekersRecruitmentSenderUnavailable,
  resolveHomeSeekersRecruitmentSender,
  HOME_SEEKERS_RECRUITMENT_REPLY_TO,
} from "../services/homeSeekersRecruitmentBranding.ts";

const uuid = (value: unknown) =>
  typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
    ? value
    : "";
const record = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
// Dependency injection permits full dispatch/recovery verification without real emails.
export async function handleRecruitmentInvitationEmail(
  req: Request,
  payload: Record<string, unknown>,
  dependencies?: {
    admin: any;
    user: any;
    send: typeof sendViaResendApi;
    branding: typeof resolveEmailBranding;
    sender: typeof resolveAudienceEmailSender;
    automationActor?: string;
    submissionAutomation?: boolean;
  },
) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const baseUrl = Deno.env.get("CLIENT_APP_URL") ||
    Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("APP_BASE_URL") ||
    Deno.env.get("SITE_URL") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse(401, {
      error: "Sign in before sending an invitation.",
    });
  }
  if (!dependencies && (!url || !serviceKey || !anonKey)) {
    return jsonResponse(503, {
      error: "Invitation email service is unavailable.",
    });
  }
  if (!apiKey || !/^https:\/\//.test(baseUrl)) {
    return jsonResponse(503, {
      error:
        "Invitation email sending and the secure application address must be configured.",
    });
  }
  const org = uuid(payload.organisationId),
    leadId = uuid(payload.leadId),
    reference = uuid(payload.referenceId),
    requestId = uuid(payload.requestId);
  const kind = payload.kind;
  if (
    dependencies?.submissionAutomation &&
    !applicantEmailKinds.includes(String(kind))
  ) return jsonResponse(400, { error: "Invalid submission email." });
  if (
    !org || !leadId || !reference || !requestId ||
    !(dependencies?.submissionAutomation
      ? applicantEmailKinds
      : ["application", "workspace", "documents_reminder", "approval"])
      .includes(String(kind))
  ) {
    return jsonResponse(400, {
      error: "Choose a saved application or workspace invitation.",
    });
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = dependencies?.admin || createClient(url, serviceKey, options);
  const user = dependencies?.automationActor ? null : dependencies?.user ||
    createClient(url, anonKey, {
      ...options,
      global: { headers: { Authorization: authorization } },
    });
  const identity = dependencies?.automationActor
    ? { data: { user: { id: dependencies.automationActor } }, error: null }
    : await user.auth.getUser(authorization.slice(7));
  const actor = uuid(identity.data?.user?.id);
  if (identity.error || !actor) {
    return jsonResponse(401, {
      error: "Sign in before sending an invitation.",
    });
  }
  const access = dependencies?.automationActor
    ? { error: null }
    : await user.rpc("recruitment_assert_joining_manager", {
      p_organisation_id: org,
    });
  if (access.error) {
    return jsonResponse(403, {
      error: "Only organisation managers can send recruitment invitations.",
    });
  }
  const result = await admin.from("recruitment_leads").select(
    "id,name,email,status,activation_json,approved_at,approval_snapshot,documents_json,document_waivers_json",
  ).eq("id", leadId).eq("organisation_id", org).maybeSingle();
  if (result.error || !result.data) {
    return jsonResponse(404, { error: "Recruitment record unavailable." });
  }
  const lead = result.data;
  const to = String(lead.email || "").trim().toLowerCase();
  if (
    assessControlledTestRecipient({ email: to, recipientName: lead.name })
      .suppressed
  ) {
    return jsonResponse(200, {
      ok: false,
      suppressed: true,
      error: "Controlled test recipient: no email was sent.",
    });
  }
  if (
    applicantEmailKinds.includes(String(kind)) &&
    org !== "2958d402-368e-43c9-b728-0098e10505f1"
  ) {
    return jsonResponse(409, {
      error: "The restricted applicant emails are configured for Home Seekers.",
    });
  }
  let token = "", tokenHash: string | null = null;
  if (kind === "application") {
    // The raw application token is supplied transiently; the database stores its hash.
    try {
      const supplied = new URL(String(payload.applicationLink || ""));
      if (
        !/^\/join-us\/[a-f0-9]{64}$/.test(supplied.pathname) ||
        supplied.search || supplied.hash
      ) throw new Error();
      token = supplied.pathname.split("/").at(-1)!;
    } catch {
      return jsonResponse(400, {
        error:
          "Paste the complete private application link, or prepare a new one.",
      });
    }
    tokenHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  } else if (kind === "workspace") {
    const invite = await admin.from("invites").select("token").eq(
      "id",
      reference,
    ).eq("target_workspace_id", org).maybeSingle();
    token = invite.data?.token || "";
    if (invite.error || !token) {
      return jsonResponse(409, {
        error:
          "Workspace invitation link is unavailable. Review access preparation.",
      });
    }
  }
  let attempt: Record<string, any> | null = null;
  try {
    const isHomeSeekers = org === HOME_SEEKERS_RECRUITMENT_ORGANISATION_ID;
    const resolvedBranding =
      await (dependencies?.branding || resolveEmailBranding)({
        supabase: isHomeSeekers ? admin : undefined,
        payload: {},
        organisationId: org,
        defaults: {
          organisationName: isHomeSeekers ? "Home Seekers" : "Arch9 agency",
        },
      });
    const branding = isHomeSeekers
      ? homeSeekersRecruitmentBranding(resolvedBranding)
      : resolvedBranding;
    const from = isHomeSeekers
      ? await resolveHomeSeekersRecruitmentSender({
        branding,
        supabase: admin,
        sender: dependencies?.sender,
      })
      : await (dependencies?.sender || resolveAudienceEmailSender)({
        audience: "internal",
        branding,
        platformSender: Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
          Deno.env.get("RESEND_FROM_EMAIL") || "Arch9 <onboarding@resend.dev>",
      });
    // Never trust the caller's host, recipient, role, branding or email contents.
    const link = kind === "documents_reminder"
      ? new URL("/applicant/my-profile", baseUrl).href
      : new URL(
        `${kind === "application" ? "/join-us/" : "/invite/"}${
          encodeURIComponent(token)
        }`,
        baseUrl,
      ).href;
    const role = String(record(lead.activation_json).role || "agent")
      .replaceAll("_", " ");
    const title = kind === "application"
      ? "Complete your joining application"
      : kind === "documents_reminder"
      ? "Application received — upload your documents"
      : kind === "approval"
      ? "Your application has been approved"
      : "Accept your agency workspace access";
    const explanation = kind === "application"
      ? "Complete your application so the agency can review your joining. Submitting an application does not grant staff access."
      : kind === "documents_reminder"
      ? "Thank you for applying to Home Seekers. Your application is awaiting review. Log in with your application email address and the password you set when applying, then open My Profile and upload your supporting FICA documents and FFC certificate so our team can review and approve your application. If you already have an account, use your existing password. You can also choose ‘Use an email code instead’ if you need help signing in."
      : kind === "approval"
      ? "Your application has been approved. We will send you the contract shortly."
      : `Your joining setup is ready. Accept the invitation using the account for ${to} to access your agency workspace as ${role}.`;
    const subject = `${branding.organisationName}: ${title}`;
    const message = {
      from,
      to,
      ...(isHomeSeekers ? { replyTo: HOME_SEEKERS_RECRUITMENT_REPLY_TO } : {}),
      subject,
      html: renderBridgeEmailLayout({
        title,
        greeting: `Hi ${lead.name},`,
        organisationName: branding.organisationName,
        branding,
        ...(isHomeSeekers
          ? {
            securityBody:
              "Your information and documents are handled securely. Only you and the authorised recruitment team can access your application documents.",
            helpBody:
              "Need help? Contact the Home Seekers recruitment team at admin@homeseekers.co.za.",
            footerText: "Home Seekers · Recruitment",
          }
          : {}),
        contentHtml: renderBridgeIntroParagraphs([explanation]) +
          renderBridgeSummaryCard([{
            label: "Invitation",
            value: kind === "application"
              ? "Application only"
              : kind === "documents_reminder"
              ? "Application documents"
              : kind === "approval"
              ? "Application approved"
              : "Workspace access",
          }], isHomeSeekers ? "Application status" : undefined) +
          (kind === "approval" ? "" : renderBridgeCta(
            kind === "application"
              ? "Complete application"
              : kind === "documents_reminder"
              ? "Log in and upload documents"
              : "Accept workspace access",
            link,
            isHomeSeekers
              ? { primaryColor: HOME_SEEKERS_RECRUITMENT_ACCENT }
              : {},
          )),
      }),
      text: `${title}\n${explanation}${kind === "approval" ? "" : `\n${link}`}`,
      ...(applicantEmailKinds.includes(String(kind))
        ? buildRecruitmentApplicantEmail(String(kind), lead, baseUrl, branding)
        : {}),
      ...(isHomeSeekers && kind === "approval"
        ? buildHomeSeekersRecruitmentApprovalEmail(
          lead as { name: string },
          branding,
        )
        : {}),
    };
    const claim = await admin.rpc(
      dependencies?.submissionAutomation
        ? "recruitment_begin_submission_email"
        : "recruitment_begin_invitation_email",
      {
        p_actor: actor,
        p_organisation_id: org,
        p_lead_id: leadId,
        p_kind: kind,
        p_reference_id: reference,
        p_request_id: requestId,
        p_token_hash: tokenHash,
        p_message: message,
        p_allow_duplicate: payload.allowDuplicate === true,
      },
    );
    if (claim.error) {
      return jsonResponse(409, {
        error: claim.error.code === "PGRST202"
          ? "Invitation delivery setup is pending. Apply the recruitment delivery migration."
          : claim.error.message || "Invitation sending could not be prepared.",
      });
    }
    if (!claim.data?.send) {
      return jsonResponse(200, {
        ok: !claim.data?.busy,
        busy: Boolean(claim.data?.busy),
        status: claim.data?.attempt?.status,
        requestId: claim.data?.attempt?.id,
      });
    }
    attempt = claim.data.attempt;
    const delivery = await (dependencies?.send || sendViaResendApi)({
      ...attempt!.message_json,
      apiKey,
      idempotencyKey: `recruitment-invitation/${attempt!.id}`,
      timeoutMs: 20000,
    });
    // A timeout/5xx/concurrent request has an uncertain outcome. A retry uses the same snapshot and provider key.
    const state = delivery.ok && delivery.data?.id
      ? "provider_accepted"
      : !delivery.ok && delivery.status && delivery.status < 500 &&
          delivery.status !== 409
      ? "failed"
      : "unknown";
    const completed = await admin.rpc("recruitment_finish_invitation_email", {
      p_request_id: attempt!.id,
      p_lease_id: attempt!.lease_id,
      p_status: state,
      p_provider_id: delivery.ok ? delivery.data?.id || null : null,
      p_error_code: state === "failed"
        ? "provider_rejected"
        : state === "unknown"
        ? "provider_result_uncertain"
        : null,
    });
    if (completed.error || !completed.data) {
      return jsonResponse(200, {
        ok: false,
        status: "unknown",
        requestId: attempt!.id,
        error:
          "The email result could not be recorded. Refresh its status before retrying.",
      });
    }
    return jsonResponse(200, {
      ok: state === "provider_accepted",
      status: state,
      requestId: attempt!.id,
      error: state === "provider_accepted"
        ? null
        : state === "failed"
        ? "The email provider rejected this send. Retry after checking email configuration."
        : "The sending result is uncertain. Refresh or retry this same request.",
    });
  } catch (error) {
    if (!attempt && error instanceof HomeSeekersRecruitmentSenderUnavailable) {
      return jsonResponse(503, { error: error.message });
    }
    // Leave an acquired attempt visible as uncertain after its lease expires; never invent a failure after possible delivery.
    return jsonResponse(500, {
      error: attempt
        ? "The sending result is uncertain. Refresh its status before retrying."
        : "Invitation email could not be prepared. Please retry.",
    });
  }
}
