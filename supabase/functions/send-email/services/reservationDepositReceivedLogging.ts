export async function logReservationDepositReceivedSideEffects({
  supabase,
  transactionId,
  recipientEmail,
  emailId,
  nowIso,
  source,
}: {
  supabase: any;
  transactionId: string;
  recipientEmail: string;
  emailId: string | null;
  nowIso: string;
  source: string;
}) {
  const eventsInsert = await supabase.from("transaction_events").insert({
    transaction_id: transactionId,
    event_type: "TransactionUpdated",
    created_by_role: "system",
    event_data: {
      type: "reservation_deposit_received_sent",
      action: "reservation_deposit_received_email_sent",
      message: `Reservation deposit received confirmation sent to ${recipientEmail}`,
      recipientEmail,
      emailId,
      sentAt: nowIso,
      source,
    },
  });

  if (eventsInsert.error) {
    console.error("Transaction events insert failed", eventsInsert.error);
  }
}
