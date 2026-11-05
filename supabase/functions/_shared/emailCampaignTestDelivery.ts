import { acquireCampaignSendSlot, recordCampaignBackoff } from "./emailCampaignSendGate.ts";

export async function deliverCampaignTest({ db, organisationId, actorId, identityId, requestKey, payload, recipientEmail, resendKey, fetcher, sleep }: {
  db: any; organisationId: string; actorId: string; identityId: string; requestKey: string;
  payload: Record<string, unknown>; recipientEmail: string; resendKey: string; fetcher: typeof fetch; sleep: (ms: number) => Promise<void>;
}) {
  const response = (status: number, body: Record<string, unknown>) => ({ status, body });
  const uncertain = () => response(502, { error: "Test acceptance could not be confirmed. Check your inbox before starting another test.", deliveryUncertain: true });
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  let claim;
  try {
    claim = await db.rpc("email_campaign_test_claim", { p_organisation_id: organisationId, p_actor_id: actorId, p_identity_id: identityId, p_key: requestKey, p_hash: hash });
  } catch { return response(503, { error: "Duplicate protection is unavailable. No test was sent.", deliveryUncertain: true }); }
  if (claim.error || !claim.data?.action || (claim.data.action === "send" && (typeof claim.data.id !== "string" || !claim.data.id))) return response(503, { error: "Duplicate protection is unavailable. No test was sent.", deliveryUncertain: true });
  const receipt = claim.data;
  if (receipt.action === "accepted" && receipt.providerMessageId) return response(200, { deliveredTo: recipientEmail, providerMessageId: receipt.providerMessageId, replayed: true });
  if (receipt.action === "conflict") return response(409, { error: "This test request already belongs to different content. Review the email and start a new test.", deliveryUncertain: true });
  if (receipt.action !== "send") return response(409, { error: receipt.action === "rejected" ? "This test request was already stopped. Resolve the sending issue and start a new test." : "This test is already processing or its acceptance is uncertain. Check the recipient inbox before starting a new test.", deliveryUncertain: true });
  const complete = async (status: string, providerId: string | null = null) => {
    const result = await db.rpc("email_campaign_test_complete", { p_organisation_id: organisationId, p_actor_id: actorId, p_id: receipt.id, p_status: status, p_provider_message_id: providerId });
    return !result.error && result.data === true;
  };
  const reservationKey = `test:${receipt.id}`;
  try {
    const reservation = await db.rpc("email_reserve_send", { p_organisation_id: organisationId, p_identity_id: identityId, p_key: reservationKey, p_actor_id: actorId, p_test: true });
    if (reservation.error || !reservation.data || await acquireCampaignSendSlot(db, { p_organisation_id: organisationId, p_identity_id: identityId, p_key: reservationKey, p_email: recipientEmail, p_actor_id: actorId }, sleep) !== "send") {
      await complete("rejected");
      return response(429, { error: "Test sending is paused or a sending limit was reached. Resolve the issue before starting a new test." });
    }
  } catch {
    await complete("rejected").catch(() => false);
    return response(503, { error: "Sending controls are unavailable. No provider request was made.", deliveryUncertain: true });
  }
  let result: Response;
  try {
    result = await fetcher("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json", "Idempotency-Key": reservationKey }, body: JSON.stringify(payload) });
  } catch {
    await complete("uncertain").catch(() => false);
    return uncertain();
  }
  const data = await result.json().catch(() => ({}));
  // Preserve acceptance before best-effort rate telemetry, so a telemetry error
  // can never turn a confirmed send into a second provider submission.
  if (result.ok && typeof data.id === "string" && data.id.trim()) {
    if (!await complete("accepted", data.id).catch(() => false)) return uncertain();
    return response(200, { deliveredTo: recipientEmail, providerMessageId: data.id });
  }
  await complete("uncertain").catch(() => false);
  await recordCampaignBackoff(db, result).catch(() => {});
  return uncertain();
}
