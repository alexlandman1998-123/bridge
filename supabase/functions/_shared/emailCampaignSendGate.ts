// Campaign and test traffic share a server-owned rate slot. A long wait yields
// campaign work back to the queue; a short wait avoids wasting a cron interval.
export async function acquireCampaignSendSlot(db: any, parameters: Record<string, unknown>, sleep: (ms: number) => Promise<void>) {
  for (let tries = 0; tries < 3; tries += 1) {
    const { data, error } = await db.rpc("email_campaign_acquire_send_slot", parameters);
    if (error) throw error;
    if (data?.action !== "wait") return data?.action || "paused";
    const delay = Number(data.retry_after_ms);
    if (!Number.isFinite(delay) || delay > 1500 || delay < 0 || tries === 2) return "wait";
    await sleep(Math.max(1, delay));
  }
  return "wait";
}
export async function recordCampaignBackoff(db: any, response: Response) {
  if (response.status !== 429) return;
  const value = response.headers.get("retry-after");
  const seconds = value && Number.isFinite(Number(value)) ? Number(value) : value ? (Date.parse(value) - Date.now()) / 1000 : 60;
  const { error } = await db.rpc("email_campaign_provider_backoff", { p_seconds: Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 60 });
  if (error) throw error;
}
