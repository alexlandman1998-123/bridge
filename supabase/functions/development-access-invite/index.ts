import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;
type SupabaseServiceClient = ReturnType<typeof createClient<any, "public", any>>;

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

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeNullable(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function isSchemaError(error: unknown) {
  const message = normalizeLower((error as { message?: string })?.message);
  const code = normalizeText((error as { code?: string })?.code);
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function getBearerToken(req: Request) {
  const header = normalizeText(req.headers.get("authorization"));
  const match = header.match(/^Bearer\s+(.+)$/i);
  return normalizeText(match?.[1] || header);
}

async function getUserForRequest(supabase: SupabaseServiceClient, req: Request) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return { user: null, error: "missing_session" };
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user?.id) {
    return { user: null, error: "invalid_session" };
  }

  return { user: data.user, error: "" };
}

function getDeveloperTeamMembers(stakeholderTeams: unknown) {
  if (!stakeholderTeams || typeof stakeholderTeams !== "object") return [];
  const teams = stakeholderTeams as JsonRecord;
  return Array.isArray(teams.developers) ? teams.developers as JsonRecord[] : [];
}

function getMemberInviteToken(member: JsonRecord) {
  return normalizeText(member.inviteToken || member.invite_token || member.token);
}

function getMemberEmail(member: JsonRecord) {
  return normalizeLower(member.email || member.contactEmail || member.contact_email);
}

function buildInvitePreview({
  development,
  member,
  status,
}: {
  development: JsonRecord | null;
  member: JsonRecord;
  status: string;
}) {
  const developmentName = normalizeText(development?.name) || "this development";
  return {
    developmentId: normalizeText(development?.id),
    developmentName,
    developmentStatus: normalizeText(development?.status),
    location: normalizeText(development?.location),
    organisationId: normalizeText(development?.organisation_id),
    contactName: normalizeText(member.contactName || member.contact_name || member.name),
    companyName: normalizeText(member.company || member.organisation || member.organisationName || member.organisation_name),
    email: getMemberEmail(member),
    status,
  };
}

async function fetchDevelopment(supabase: SupabaseServiceClient, developmentId: string) {
  if (!developmentId) return null;

  const result = await supabase
    .from("developments")
    .select("id, name, status, location, organisation_id")
    .eq("id", developmentId)
    .maybeSingle();

  if (!result.error) return result.data as JsonRecord | null;
  if (!isSchemaError(result.error)) throw result.error;

  const fallback = await supabase
    .from("developments")
    .select("id, name")
    .eq("id", developmentId)
    .maybeSingle();

  if (fallback.error) throw fallback.error;
  return fallback.data as JsonRecord | null;
}

async function findInviteByToken(supabase: SupabaseServiceClient, token: string) {
  const safeToken = normalizeText(token);
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const result = await supabase
      .from("development_settings")
      .select("development_id, stakeholder_teams")
      .range(offset, offset + pageSize - 1);

    if (result.error) throw result.error;

    const rows = (result.data || []) as JsonRecord[];
    for (const row of rows) {
      const members = getDeveloperTeamMembers(row.stakeholder_teams);
      const memberIndex = members.findIndex((member) => getMemberInviteToken(member) === safeToken);
      if (memberIndex < 0) continue;

      const developmentId = normalizeText(row.development_id);
      const development = await fetchDevelopment(supabase, developmentId);
      return {
        row,
        member: members[memberIndex],
        memberIndex,
        members,
        development,
      };
    }

    if (rows.length < pageSize) return null;
    offset += pageSize;
  }
}

async function syncDevelopmentParticipant({
  supabase,
  developmentId,
  member,
  userId,
  userEmail,
}: {
  supabase: SupabaseServiceClient;
  developmentId: string;
  member: JsonRecord;
  userId: string;
  userEmail: string;
}) {
  const participantEmail = getMemberEmail(member) || userEmail;
  const participantName = normalizeText(member.contactName || member.contact_name || member.name) || userEmail;
  const organisationName = normalizeText(member.company || member.organisation || member.organisationName || member.organisation_name);

  const existing = await supabase
    .from("development_participants")
    .select("id")
    .eq("development_id", developmentId)
    .eq("role_type", "developer")
    .eq("participant_email", participantEmail)
    .maybeSingle();

  if (existing.error && !isSchemaError(existing.error)) throw existing.error;

  if (existing.data?.id) {
    const updateResult = await supabase
      .from("development_participants")
      .update({
        user_id: userId,
        participant_name: participantName,
        organisation_name: normalizeNullable(organisationName),
        is_active: true,
      })
      .eq("id", existing.data.id);

    if (!updateResult.error) return;
    if (!isSchemaError(updateResult.error)) throw updateResult.error;

    const fallbackUpdate = await supabase
      .from("development_participants")
      .update({ user_id: userId, participant_name: participantName })
      .eq("id", existing.data.id);

    if (fallbackUpdate.error) throw fallbackUpdate.error;
    return;
  }

  const insertResult = await supabase.from("development_participants").insert({
    development_id: developmentId,
    user_id: userId,
    role_type: "developer",
    participant_name: participantName,
    participant_email: participantEmail,
    organisation_name: normalizeNullable(organisationName),
    is_primary: false,
    can_view: true,
    can_create_transactions: false,
    assignment_source: "development_default",
    is_active: true,
  });

  if (!insertResult.error) return;
  if (!isSchemaError(insertResult.error)) throw insertResult.error;

  const fallbackInsert = await supabase.from("development_participants").insert({
    development_id: developmentId,
    user_id: userId,
    role_type: "developer",
    participant_name: participantName,
    participant_email: participantEmail,
  });

  if (fallbackInsert.error) throw fallbackInsert.error;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
    const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret." });
    }

    const body = await req.json().catch(() => ({})) as JsonRecord;
    const action = normalizeLower(body.action) || "preview";
    const token = normalizeText(body.token || body.inviteToken || body.invite_token);
    if (!token) {
      return jsonResponse(400, { code: "missing_token", error: "Developer access invite token is required." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const invite = await findInviteByToken(supabase, token);
    if (!invite) {
      return jsonResponse(404, { code: "not_found", error: "This developer access invite could not be found." });
    }

    const status = normalizeLower(invite.member.status) || "invited";
    if (["revoked", "expired", "removed"].includes(status)) {
      return jsonResponse(410, { code: status, error: "This developer access invite is no longer active." });
    }

    const preview = buildInvitePreview({
      development: invite.development,
      member: invite.member,
      status,
    });

    if (action === "preview") {
      return jsonResponse(200, {
        ok: true,
        invite: preview,
        alreadyAccepted: status === "active" || status === "accepted",
      });
    }

    const authResult = await getUserForRequest(supabase, req);
    if (!authResult.user) {
      return jsonResponse(401, { code: authResult.error, error: "Sign in before accepting this developer access invite." });
    }

    const userId = normalizeText(authResult.user.id);
    const userEmail = normalizeLower(authResult.user.email);
    const invitedEmail = getMemberEmail(invite.member);
    if (!userEmail) {
      return jsonResponse(403, { code: "missing_user_email", error: "Your signed-in account does not have an email address." });
    }
    if (invitedEmail && invitedEmail !== userEmail) {
      return jsonResponse(403, {
        code: "email_mismatch",
        error: `This invite was sent to ${invitedEmail}. Sign in with that email, or ask the sender to resend it.`,
      });
    }

    const now = new Date().toISOString();
    const nextMembers = invite.members.map((member, index) =>
      index === invite.memberIndex
        ? {
          ...member,
          email: getMemberEmail(member) || userEmail,
          status: "active",
          acceptedAt: now,
          accepted_at: now,
          acceptedBy: userId,
          accepted_by: userId,
        }
        : member
    );
    const existingTeams = invite.row.stakeholder_teams && typeof invite.row.stakeholder_teams === "object"
      ? invite.row.stakeholder_teams as JsonRecord
      : {};
    const stakeholderTeams = {
      ...existingTeams,
      developers: nextMembers,
    };

    const developmentId = normalizeText(invite.row.development_id);
    const updateResult = await supabase
      .from("development_settings")
      .update({ stakeholder_teams: stakeholderTeams })
      .eq("development_id", developmentId);
    if (updateResult.error) throw updateResult.error;

    await syncDevelopmentParticipant({
      supabase,
      developmentId,
      member: invite.member,
      userId,
      userEmail,
    });

    return jsonResponse(200, {
      ok: true,
      accepted: true,
      invite: {
        ...preview,
        email: userEmail,
        status: "active",
      },
      redirectTo: `/developments/${encodeURIComponent(developmentId)}`,
    });
  } catch (error) {
    console.error("[development-access-invite] failed", error);
    return jsonResponse(500, {
      code: "server_error",
      error: (error as Error)?.message || "Unable to process this developer access invite.",
    });
  }
});
