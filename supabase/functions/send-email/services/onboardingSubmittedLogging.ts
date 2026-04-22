export async function logOnboardingSubmittedEmailSideEffects({
  supabase,
  transactionId,
  buyerEmail,
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
}
