export async function logOnboardingEmailSideEffects({
  supabase,
  transactionId,
  buyerEmail,
  onboardingToken,
  emailId,
  resend,
  nowIso,
}: {
  supabase: any;
  transactionId: string;
  buyerEmail: string;
  onboardingToken: string;
  emailId: string | null;
  resend: boolean;
  nowIso: string;
}) {
  const activityMessage = `Client onboarding link sent to ${buyerEmail}`;

  const eventsInsert = await supabase.from("transaction_events").insert({
    transaction_id: transactionId,
    event_type: "TransactionUpdated",
    created_by_role: "system",
    event_data: {
      type: "onboarding_sent",
      action: "onboarding_email_sent",
      message: activityMessage,
      recipientEmail: buyerEmail,
      onboardingToken,
      emailId,
      resend,
      sentAt: nowIso,
      source: "send-email",
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
}
