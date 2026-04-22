import { isMissingColumnError, isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

async function resolveOwnerNotificationTarget({
  supabase,
  transactionId,
}: {
  supabase: any;
  transactionId: string;
}) {
  let transactionQuery = await supabase
    .from("transactions")
    .select("id, owner_user_id, assigned_agent_email")
    .eq("id", transactionId)
    .maybeSingle();

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, "owner_user_id") ||
      isMissingColumnError(transactionQuery.error, "assigned_agent_email"))
  ) {
    transactionQuery = await supabase
      .from("transactions")
      .select("id, owner_user_id")
      .eq("id", transactionId)
      .maybeSingle();
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      return null;
    }
    console.error("Owner resolution transaction query failed", transactionQuery.error);
    return null;
  }

  const ownerUserId = normalizeText(transactionQuery.data?.owner_user_id);
  if (ownerUserId) {
    return { userId: ownerUserId, roleType: "developer" };
  }

  const assignedAgentEmail = normalizeText(transactionQuery.data?.assigned_agent_email).toLowerCase();
  if (assignedAgentEmail) {
    const profileQuery = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", assignedAgentEmail)
      .limit(1)
      .maybeSingle();
    if (!profileQuery.error && profileQuery.data?.id) {
      return { userId: normalizeText(profileQuery.data.id), roleType: "agent" };
    }
  }

  let participantsQuery = await supabase
    .from("transaction_participants")
    .select("user_id, role_type, status, removed_at")
    .eq("transaction_id", transactionId);

  if (participantsQuery.error) {
    if (isMissingTableError(participantsQuery.error, "transaction_participants")) {
      participantsQuery = { data: [], error: null };
    } else {
      console.error("Owner resolution participants query failed", participantsQuery.error);
      participantsQuery = { data: [], error: null };
    }
  }

  const activeParticipants = (participantsQuery.data || []).filter((row: any) =>
    row?.user_id &&
    !row?.removed_at &&
    normalizeText(row?.status || "active").toLowerCase() === "active"
  );
  const prioritizedParticipant =
    activeParticipants.find((row: any) => normalizeText(row?.role_type).toLowerCase() === "developer") ||
    activeParticipants.find((row: any) => normalizeText(row?.role_type).toLowerCase() === "agent") ||
    activeParticipants[0];

  if (prioritizedParticipant?.user_id) {
    return {
      userId: normalizeText(prioritizedParticipant.user_id),
      roleType: normalizeText(prioritizedParticipant.role_type).toLowerCase() || "developer",
    };
  }

  const eventsQuery = await supabase
    .from("transaction_events")
    .select("created_by, created_by_role, event_type, created_at")
    .eq("transaction_id", transactionId)
    .eq("event_type", "TransactionCreated")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (eventsQuery.error) {
    if (isMissingTableError(eventsQuery.error, "transaction_events")) {
      return null;
    }
    console.error("Owner resolution event query failed", eventsQuery.error);
    return null;
  }

  const createdByUserId = normalizeText(eventsQuery.data?.created_by);
  if (!createdByUserId) {
    return null;
  }

  return {
    userId: createdByUserId,
    roleType: normalizeText(eventsQuery.data?.created_by_role).toLowerCase() || "developer",
  };
}

export async function notifyOwnerOnOnboardingSubmitted({
  supabase,
  transactionId,
  buyerName,
  developmentName,
  unitLabel,
  transactionReference,
}: {
  supabase: any;
  transactionId: string;
  buyerName: string;
  developmentName: string;
  unitLabel: string;
  transactionReference: string;
}) {
  const target = await resolveOwnerNotificationTarget({ supabase, transactionId });
  if (!target?.userId) {
    return;
  }

  const dedupeKey = `onboarding-completed:${transactionId}:${target.userId}`;

  const existingQuery = await supabase
    .from("transaction_notifications")
    .select("id")
    .eq("user_id", target.userId)
    .eq("dedupe_key", dedupeKey)
    .eq("is_read", false)
    .limit(1)
    .maybeSingle();

  if (existingQuery.error) {
    const missingSupport =
      isMissingSchemaError(existingQuery.error) ||
      isMissingTableError(existingQuery.error, "transaction_notifications") ||
      isMissingColumnError(existingQuery.error, "dedupe_key");
    if (missingSupport) {
      return;
    }
    console.error("Owner notification dedupe lookup failed", existingQuery.error);
    return;
  }

  if (existingQuery.data?.id) {
    return;
  }

  const cleanBuyerName = normalizeText(buyerName) || "Client";
  const propertyLine = [normalizeText(developmentName), normalizeText(unitLabel)]
    .filter(Boolean)
    .join(" ");
  const message = propertyLine
    ? `Client ${cleanBuyerName} buying ${propertyLine} has completed the onboarding. Prepare their OTP and upload it to the transaction.`
    : `Client ${cleanBuyerName} has completed the onboarding. Prepare their OTP and upload it to the transaction.`;

  const insertResult = await supabase.from("transaction_notifications").insert({
    transaction_id: transactionId,
    user_id: target.userId,
    role_type: target.roleType || "developer",
    notification_type: "readiness_updated",
    title: "Onboarding Completed",
    message,
    event_type: "TransactionUpdated",
    event_data: {
      trigger: "client_onboarding_submitted",
      actionRequired: "prepare_otp_and_upload",
      buyerName: cleanBuyerName,
      developmentName: normalizeText(developmentName) || null,
      unitLabel: normalizeText(unitLabel) || null,
      transactionReference: normalizeText(transactionReference) || null,
    },
    dedupe_key: dedupeKey,
  });

  if (insertResult.error) {
    const duplicateInsert = String(insertResult.error.code || "") === "23505";
    const missingSupport =
      isMissingSchemaError(insertResult.error) ||
      isMissingTableError(insertResult.error, "transaction_notifications") ||
      isMissingColumnError(insertResult.error);
    if (!duplicateInsert && !missingSupport) {
      console.error("Owner onboarding notification insert failed", insertResult.error);
    }
  }
}

export async function logOnboardingSubmittedEmailSideEffects({
  supabase,
  transactionId,
  buyerEmail,
  buyerName,
  developmentName,
  unitLabel,
  transactionReference,
  clientPortalLink,
  emailId,
  nowIso,
  authProfileExists,
  authModel,
  portalBuyerAligned,
}: {
  supabase: any;
  transactionId: string;
  buyerEmail: string;
  buyerName: string;
  developmentName: string;
  unitLabel: string;
  transactionReference: string;
  clientPortalLink: string;
  emailId: string | null;
  nowIso: string;
  authProfileExists: boolean;
  authModel: string;
  portalBuyerAligned: boolean;
}) {
  const activityMessage = `Onboarding submission confirmation sent to ${buyerEmail}`;

  const eventsInsert = await supabase.from("transaction_events").insert({
    transaction_id: transactionId,
    event_type: "TransactionUpdated",
    created_by_role: "system",
    event_data: {
      type: "onboarding_submitted_sent",
      action: "onboarding_submitted_email_sent",
      message: activityMessage,
      recipientEmail: buyerEmail,
      clientPortalLink,
      emailId,
      sentAt: nowIso,
      source: "send-email",
      authValidation: {
        model: authModel,
        authProfileExists,
        portalBuyerAligned,
      },
    },
  });

  if (eventsInsert.error) {
    console.error("Transaction events insert failed", eventsInsert.error);
  }

  const commentsInsert = await supabase.from("transaction_comments").insert({
    transaction_id: transactionId,
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
    .eq("id", transactionId);

  if (transactionUpdate.error) {
    console.error("Transaction update failed", transactionUpdate.error);
  }

  await notifyOwnerOnOnboardingSubmitted({
    supabase,
    transactionId,
    buyerName,
    developmentName,
    unitLabel,
    transactionReference,
  });
}
