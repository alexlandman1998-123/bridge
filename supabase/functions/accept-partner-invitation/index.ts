import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;
type SupabaseServiceClient = ReturnType<typeof createClient<any, "public", any>>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_ROLES = new Set([
  "super_admin",
  "owner",
  "principal",
  "director",
  "partner",
  "admin",
  "branch_manager",
  "manager",
  "sales_manager",
  "development_manager",
  "developer",
  "firm_admin",
]);

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

function normalizeRelationshipType(value: unknown) {
  const normalized = normalizeLower(value);
  if (normalized === "preferred" || normalized === "internal") return normalized;
  return "approved";
}

function normalizeScopeType(value: unknown) {
  const normalized = normalizeLower(value);
  return normalized || "organisation";
}

function normalizeNullable(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function isActiveMembership(row: JsonRecord) {
  const status = normalizeLower(row.status);
  const membershipStatus = normalizeLower(row.membership_status);
  return status === "active" || membershipStatus === "active";
}

function getMembershipRole(row: JsonRecord) {
  return normalizeLower(
    row.organization_role ||
      row.organisation_role ||
      row.workspace_role ||
      row.role,
  );
}

function getBearerToken(req: Request) {
  const header = normalizeText(req.headers.get("authorization"));
  const match = header.match(/^Bearer\s+(.+)$/i);
  return normalizeText(match?.[1] || header);
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

function normalisePartnerType(invitation: JsonRecord) {
  return normalizeText(invitation.partner_type || invitation.to_workspace_type);
}

function getInvitationEmail(invitation: JsonRecord) {
  return normalizeLower(invitation.recipient_email || invitation.invited_email);
}

function isInvitationAccepted(invitation: JsonRecord) {
  return normalizeLower(invitation.status) === "accepted" || Boolean(invitation.accepted_at);
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

async function fetchActiveMembership({
  supabase,
  organisationId,
  userId,
  email,
}: {
  supabase: SupabaseServiceClient;
  organisationId: string;
  userId: string;
  email: string;
}) {
  const membershipQuery = await supabase
    .from("organisation_users")
    .select("id, organisation_id, user_id, email, role, organisation_role, organization_role, workspace_role, status, membership_status")
    .eq("organisation_id", organisationId)
    .or(`user_id.eq.${userId},email.eq.${email}`);

  if (membershipQuery.error) throw membershipQuery.error;

  return (membershipQuery.data || [])
    .filter((row: JsonRecord) => isActiveMembership(row))
    .find((row: JsonRecord) =>
      normalizeText(row.user_id) === userId ||
      normalizeLower(row.email) === email
    ) || null;
}

function assertInvitationVisibleToUser({
  invitation,
  membership,
  userEmail,
}: {
  invitation: JsonRecord;
  membership: JsonRecord;
  userEmail: string;
}) {
  const invitedEmail = getInvitationEmail(invitation);
  const role = getMembershipRole(membership);
  const isAdmin = ADMIN_ROLES.has(role);

  if (invitedEmail && invitedEmail !== userEmail && !invitedEmail.endsWith("@bridge.internal") && !isAdmin) {
    return {
      ok: false,
      status: 403,
      code: "email_mismatch",
      error: `This invitation was sent to ${invitedEmail}. Sign in with that email, or ask an organisation admin to accept it.`,
    };
  }

  return { ok: true };
}

function buildPreview(invitation: JsonRecord, organisation: JsonRecord | null) {
  return {
    id: normalizeText(invitation.id),
    status: normalizeLower(invitation.status) || "pending",
    fromOrganisationName: normalizeText(invitation.from_organisation_name || organisation?.name || organisation?.display_name),
    toOrganisationName: normalizeText(invitation.to_organisation_name),
    partnerType: normalisePartnerType(invitation),
    relationshipType: normalizeRelationshipType(invitation.relationship_type),
    scopeType: normalizeScopeType(invitation.scope_type),
    scopeName: normalizeText(invitation.scope_name),
    preferred: invitation.preferred === true,
    expiresAt: normalizeText(invitation.expires_at),
  };
}

async function fetchInvitation(supabase: SupabaseServiceClient, invitationId: string) {
  const invitationQuery = await supabase
    .from("partner_invitations")
    .select("id, sender_organisation_id, recipient_email, recipient_organisation_id, invited_email, from_organisation_name, to_organisation_name, to_workspace_type, partner_type, relationship_type, scope_type, scope_id, scope_name, preferred, status, expires_at, accepted_at")
    .eq("id", invitationId)
    .single();

  if (!invitationQuery.error) return invitationQuery;
  if (!isSchemaError(invitationQuery.error)) return invitationQuery;

  return supabase
    .from("partner_invitations")
    .select("id, sender_organisation_id, recipient_email, recipient_organisation_id, relationship_type, status, expires_at, accepted_at")
    .eq("id", invitationId)
    .single();
}

async function fetchOrganisationName(supabase: SupabaseServiceClient, organisationId: string) {
  if (!organisationId) return null;
  const { data } = await supabase
    .from("organisations")
    .select("id, name, display_name")
    .eq("id", organisationId)
    .maybeSingle();
  return data || null;
}

async function updateInvitationAccepted({
  supabase,
  invitationId,
  recipientOrganisationId,
  userId,
}: {
  supabase: SupabaseServiceClient;
  invitationId: string;
  recipientOrganisationId: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const updatePayload = {
    recipient_organisation_id: recipientOrganisationId,
    status: "accepted",
    accepted_at: now,
    responded_at: now,
    responded_by_user_id: userId,
  };

  const result = await supabase
    .from("partner_invitations")
    .update(updatePayload)
    .eq("id", invitationId)
    .select("id")
    .single();

  if (!result.error) return;
  if (!isSchemaError(result.error)) throw result.error;

  const legacyResult = await supabase
    .from("partner_invitations")
    .update({
      recipient_organisation_id: recipientOrganisationId,
      status: "accepted",
      accepted_at: now,
    })
    .eq("id", invitationId);

  if (legacyResult.error) throw legacyResult.error;
}

async function ensureOrganisationRelationship({
  supabase,
  invitation,
  recipientOrganisationId,
  userId,
}: {
  supabase: SupabaseServiceClient;
  invitation: JsonRecord;
  recipientOrganisationId: string;
  userId: string;
}) {
  const senderOrganisationId = normalizeText(invitation.sender_organisation_id);
  if (!senderOrganisationId || !recipientOrganisationId || senderOrganisationId === recipientOrganisationId) return null;

  const now = new Date().toISOString();
  const relationshipType = normalizeRelationshipType(invitation.relationship_type);
  const preferred = invitation.preferred === true || relationshipType === "preferred";
  const scopeType = normalizeScopeType(invitation.scope_type);
  const scopeId = normalizeText(invitation.scope_id) || (scopeType === "organisation" ? senderOrganisationId : "");
  const pairFilter =
    `and(organisation_id.eq.${senderOrganisationId},partner_organisation_id.eq.${recipientOrganisationId}),` +
    `and(organisation_id.eq.${recipientOrganisationId},partner_organisation_id.eq.${senderOrganisationId})`;

  const found = await supabase
    .from("organisation_partners")
    .select("id")
    .or(pairFilter);

  if (found.error) throw found.error;

  const existingIds = (found.data || []).map((row: JsonRecord) => normalizeText(row.id)).filter(Boolean);
  const fullPayload = {
    partner_type: normalisePartnerType(invitation) || null,
    relationship_status: "accepted",
    status: "accepted",
    relationship_type: relationshipType,
    preferred,
    scope_type: scopeType,
    scope_id: normalizeNullable(scopeId),
    scope_name: normalizeNullable(invitation.scope_name),
    visibility_level: preferred ? "preferred_partners" : "connected_partners",
    accepted_at: now,
    updated_at: now,
  };

  if (existingIds.length) {
    const updateResult = await supabase
      .from("organisation_partners")
      .update(fullPayload)
      .in("id", existingIds)
      .select("id")
      .limit(1);

    if (!updateResult.error) return normalizeText(updateResult.data?.[0]?.id);
    if (!isSchemaError(updateResult.error)) throw updateResult.error;

    const legacyUpdate = await supabase
      .from("organisation_partners")
      .update({
        relationship_status: "accepted",
        relationship_type: relationshipType,
        accepted_at: now,
      })
      .in("id", existingIds)
      .select("id")
      .limit(1);
    if (legacyUpdate.error) throw legacyUpdate.error;
    return normalizeText(legacyUpdate.data?.[0]?.id);
  }

  const insertPayload = {
    organisation_id: senderOrganisationId,
    partner_organisation_id: recipientOrganisationId,
    ...fullPayload,
    created_by: userId,
  };

  const insertResult = await supabase
    .from("organisation_partners")
    .insert(insertPayload)
    .select("id")
    .single();

  if (!insertResult.error) return normalizeText(insertResult.data?.id);
  if (!isSchemaError(insertResult.error)) throw insertResult.error;

  const fallbackInsert = await supabase
    .from("organisation_partners")
    .insert({
      organisation_id: senderOrganisationId,
      partner_organisation_id: recipientOrganisationId,
      relationship_status: "accepted",
      relationship_type: relationshipType,
      visibility_level: preferred ? "preferred_partners" : "connected_partners",
      accepted_at: now,
      created_by: userId,
    })
    .select("id")
    .single();

  if (fallbackInsert.error) throw fallbackInsert.error;
  return normalizeText(fallbackInsert.data?.id);
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
    const action = normalizeLower(body.action) || "accept";
    const invitationId = normalizeText(body.invitationId || body.invitation_id);
    const organisationId = normalizeText(body.organisationId || body.organisation_id);

    if (!invitationId) {
      return jsonResponse(400, { code: "missing_invitation", error: "Partner invitation id is required." });
    }
    if (!organisationId) {
      return jsonResponse(400, { code: "missing_organisation", error: "Choose an active workspace before accepting this invitation." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authResult = await getUserForRequest(supabase, req);
    if (!authResult.user) {
      return jsonResponse(401, { code: authResult.error, error: "Sign in before opening this partner invitation." });
    }

    const userId = normalizeText(authResult.user.id);
    const userEmail = normalizeLower(authResult.user.email);
    if (!userEmail) {
      return jsonResponse(403, { code: "missing_user_email", error: "Your signed-in account does not have an email address." });
    }

    const invitationQuery = await fetchInvitation(supabase, invitationId);
    if (invitationQuery.error || !invitationQuery.data) {
      return jsonResponse(404, { code: "not_found", error: "This partner invitation is not available." });
    }

    const invitation = invitationQuery.data as JsonRecord;
    const status = normalizeLower(invitation.status) || "pending";
    const expiresAt = normalizeText(invitation.expires_at);
    if (expiresAt && new Date(expiresAt).getTime() < Date.now() && status === "pending") {
      return jsonResponse(410, { code: "expired", error: "This partner invitation has expired." });
    }
    if (["revoked", "declined", "expired"].includes(status)) {
      return jsonResponse(410, { code: status, error: "This partner invitation is no longer active." });
    }

    const existingRecipientOrganisationId = normalizeText(invitation.recipient_organisation_id);
    if (existingRecipientOrganisationId && existingRecipientOrganisationId !== organisationId) {
      return jsonResponse(403, { code: "wrong_workspace", error: "This invitation belongs to another workspace." });
    }

    const membership = await fetchActiveMembership({
      supabase,
      organisationId,
      userId,
      email: userEmail,
    });
    if (!membership) {
      return jsonResponse(403, {
        code: "not_active_member",
        error: "You must be an active member of the invited workspace before accepting this partner invitation.",
      });
    }

    const visibility = assertInvitationVisibleToUser({
      invitation,
      membership,
      userEmail,
    });
    if (!visibility.ok) {
      return jsonResponse(visibility.status as number, {
        code: visibility.code,
        error: visibility.error,
      });
    }

    const senderOrganisation = await fetchOrganisationName(supabase, normalizeText(invitation.sender_organisation_id));
    const preview = buildPreview(invitation, senderOrganisation);

    if (action === "preview") {
      return jsonResponse(200, {
        ok: true,
        invitation: preview,
        alreadyAccepted: status === "accepted",
      });
    }

    if (isInvitationAccepted(invitation)) {
      const relationshipId = await ensureOrganisationRelationship({
        supabase,
        invitation,
        recipientOrganisationId: organisationId,
        userId,
      });
      if (!existingRecipientOrganisationId) {
        await updateInvitationAccepted({
          supabase,
          invitationId,
          recipientOrganisationId: organisationId,
          userId,
        });
      }
      return jsonResponse(200, {
        ok: true,
        alreadyAccepted: true,
        repaired: Boolean(relationshipId),
        relationshipId,
        invitation: preview,
        redirectTo: "/partners?tab=invitations",
      });
    }

    const relationshipId = await ensureOrganisationRelationship({
      supabase,
      invitation,
      recipientOrganisationId: organisationId,
      userId,
    });
    await updateInvitationAccepted({
      supabase,
      invitationId,
      recipientOrganisationId: organisationId,
      userId,
    });

    return jsonResponse(200, {
      ok: true,
      accepted: true,
      relationshipId,
      invitation: {
        ...preview,
        status: "accepted",
      },
      redirectTo: "/partners?tab=invitations",
    });
  } catch (error) {
    console.error("[accept-partner-invitation] failed", error);
    return jsonResponse(500, {
      code: "server_error",
      error: (error as Error)?.message || "Unable to accept this partner invitation.",
    });
  }
});
