import { isMissingColumnError, isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

async function notifyRolesForTransaction({
  supabase,
  transactionId,
  source,
  reservationStatus,
  reservationAmount,
  recipient,
  forceResend,
  buyerName,
  actorUserId,
  today,
}: {
  supabase: any;
  transactionId: string;
  source: string;
  reservationStatus: string;
  reservationAmount: number;
  recipient: string;
  forceResend: boolean;
  buyerName: string;
  actorUserId: string | null;
  today: string;
}) {
  const participantsQuery = await supabase
    .from("transaction_participants")
    .select("transaction_id, user_id, role_type, status, removed_at")
    .eq("transaction_id", transactionId);

  if (participantsQuery.error) {
    if (isMissingTableError(participantsQuery.error, "transaction_participants")) {
      return;
    }
    console.error("Reservation notification participant query failed", participantsQuery.error);
    return;
  }

  const targetRoleSet = new Set(["developer", "agent", "attorney"]);
  const targets = (participantsQuery.data || [])
    .filter((row: any) =>
      row?.user_id &&
      !row?.removed_at &&
      normalizeText(row?.status).toLowerCase() === "active" &&
      targetRoleSet.has(normalizeText(row?.role_type).toLowerCase())
    )
    .map((row: any) => ({
      userId: row.user_id as string,
      roleType: normalizeText(row.role_type).toLowerCase(),
    }))
    .filter((row: { userId: string; roleType: string }) => !actorUserId || row.userId !== actorUserId);

  const seen = new Set<string>();
  for (const target of targets) {
    const dedupeKey = `${source}:${forceResend ? "resend" : "send"}:${today}:${transactionId}:${target.roleType}:${target.userId}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const insertResult = await supabase.from("transaction_notifications").insert({
      transaction_id: transactionId,
      user_id: target.userId,
      role_type: target.roleType,
      notification_type: "document_uploaded",
      title: forceResend
        ? "Reservation deposit email resent"
        : "Reservation deposit requested",
      message: `${buyerName || "Client"} was sent reservation deposit payment instructions.`,
      event_type: "TransactionUpdated",
      event_data: {
        source,
        reservationStatus,
        reservationAmount,
        recipient,
        recipientRole: target.roleType,
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
        console.error("Reservation notification insert failed", insertResult.error);
      }
    }
  }
}

export async function logReservationDepositSideEffects({
  supabase,
  transactionId,
  source,
  forceResend,
  requestedAt,
  nowIso,
  reservationAmount,
  paymentReference,
  recipientEmail,
  buyerName,
  actorRole,
  actorUserId,
  emailId,
  reservationStatus,
}: {
  supabase: any;
  transactionId: string;
  source: string;
  forceResend: boolean;
  requestedAt: string;
  nowIso: string;
  reservationAmount: number;
  paymentReference: string;
  recipientEmail: string;
  buyerName: string;
  actorRole: string;
  actorUserId: string | null;
  emailId: string | null;
  reservationStatus: string;
}) {
  const today = nowIso.slice(0, 10);

  const eventsInsert = await supabase.from("transaction_events").insert({
    transaction_id: transactionId,
    event_type: "TransactionUpdated",
    created_by: actorUserId,
    created_by_role: actorRole,
    event_data: {
      type: "reservation_deposit_sent",
      action: "reservation_deposit_email_sent",
      source,
      reservationDeposit: {
        action: forceResend ? "resent" : "requested",
        requestedAt,
        emailSentAt: nowIso,
        amount: reservationAmount,
        paymentReference,
        recipient: recipientEmail,
        emailId,
        status: reservationStatus,
      },
    },
  });

  if (eventsInsert.error) {
    console.error("Transaction events insert failed", eventsInsert.error);
  }

  await notifyRolesForTransaction({
    supabase,
    transactionId,
    source,
    reservationStatus,
    reservationAmount,
    recipient: recipientEmail,
    forceResend,
    buyerName,
    actorUserId,
    today,
  });
}
