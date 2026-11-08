// Always read the provider's current state. Webhook payloads may be duplicated
// or delivered out of order, and must never restore a stale verified status.
const text = (value: unknown) => String(value || "").trim();
export function sendingDomainState(details: any) {
  const disabled = details?.capabilities && Object.hasOwn(details.capabilities, "sending") && details.capabilities.sending !== "enabled";
  const status = disabled ? "failed" : details?.status === "verified" ? "verified" : ["failed", "temporary_failure"].includes(details?.status) ? "failed" : "pending";
  return { status, error: disabled
    ? "Sending is disabled for this domain at the email provider. Ask your domain administrator to enable sending, then recheck verification."
    : status === "failed" ? "DNS verification failed. Check the records below, then retry verification." : null };
}
export function sendingDomainRecords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((r) => ({ record: text(r.record), name: text(r.name), type: text(r.type), value: text(r.value),
    ttl: text(r.ttl), status: text(r.status), priority: r.priority != null && Number.isFinite(Number(r.priority)) ? Number(r.priority) : null,
  })).filter((r) => r.name && r.type && r.value);
}
export async function refreshSendingDomain({ db, domain, resendKey, fetcher = fetch }: {
  db: any; domain: any; resendKey: string; fetcher?: typeof fetch;
}) {
  if (domain.verification_status === "disabled") return "disabled";
  if (!domain.provider_domain_id) throw new Error("Domain setup is incomplete. Add the domain again to retry.");
  const response = await fetcher(`https://api.resend.com/domains/${encodeURIComponent(domain.provider_domain_id)}`, {
    headers: { authorization: `Bearer ${resendKey}` }, signal: AbortSignal.timeout(15000),
  });
  const details = await response.json().catch(() => ({}));
  if (response.status === 404) {
    const missing = await db.rpc("email_apply_domain_status", { p_domain_id: domain.id, p_status: "failed", p_records: null,
      p_error: "Domain removed from the email provider. Add the same domain again to reconnect." });
    if (missing.error) throw new Error("Unable to save domain verification. Please try again.");
    return "failed";
  }
  if (!response.ok) throw new Error("The email provider is unavailable. Please try verification again shortly.");
  if (text(details.name).toLowerCase() !== domain.domain_name || text(details.id) !== domain.provider_domain_id) {
    throw new Error("The provider domain does not match this agency's domain.");
  }
  const { status, error: providerError } = sendingDomainState(details);
  const { error } = await db.rpc("email_apply_domain_status", {
    p_domain_id: domain.id, p_status: status, p_records: sendingDomainRecords(details.records),
    p_error: providerError,
  });
  if (error) throw new Error("Unable to save domain verification. Please try again.");
  await recordSendingDomainTracking(db, domain.id, domain.provider_domain_id, details);
  return status;
}

// Recover a provider domain created before a lost response/database save. Domain
// creation does not support the email API's idempotency-key contract.
export async function findSendingDomain({ name, resendKey, fetcher = fetch }: { name: string; resendKey: string; fetcher?: typeof fetch }) {
  let after = "";
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ limit: "100", ...(after ? { after } : {}) });
    const response = await fetcher(`https://api.resend.com/domains?${query}`, { headers: { authorization: `Bearer ${resendKey}` }, signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.data)) throw new Error("The email provider's domain list could not be checked. Try again shortly.");
    const found = body.data.find((row: any) => text(row.name).toLowerCase() === name.toLowerCase());
    if (found) return found;
    if (!body.has_more) return null;
    const cursor = text(body.data.at(-1)?.id);
    if (!cursor || cursor === after) throw new Error("The email provider returned an incomplete domain list.");
    after = cursor;
  }
  throw new Error("The email provider's domain list is too large to safely check.");
}

// Sending DNS and engagement tracking are separate provider capabilities.
export function sendingDomainTracking(details: any) {
  const openEnabled = typeof details?.open_tracking === 'boolean' ? details.open_tracking : null;
  const clickEnabled = typeof details?.click_tracking === 'boolean' ? details.click_tracking : null;
  const subdomain = typeof details?.tracking_subdomain === 'string' ? details.tracking_subdomain.slice(0, 253) : null;
  const records = Array.isArray(details?.records) ? details.records.filter((row: any) => String(row.record || '').toLowerCase() === 'tracking') : [];
  const domainReady = subdomain && records.length ? records.every((row: any) => row.status === 'verified') : null;
  const status = (enabled: boolean | null) => enabled === null ? 'unknown' : !enabled ? 'disabled' : domainReady === true ? 'ready' : domainReady === false ? 'pending' : 'unknown';
  return { openEnabled, clickEnabled, subdomain, domainReady: domainReady === null ? null : Boolean(domainReady), openStatus: status(openEnabled), clickStatus: status(clickEnabled) };
}
export async function recordSendingDomainTracking(db: any, domainId: string | null, providerId: string, details: any) {
  const snapshot = sendingDomainTracking(details);
  const result = await db.rpc('email_record_tracking_status', { p_domain_id: domainId, p_provider_domain_id: providerId, p_snapshot: snapshot });
  if (result.error) throw new Error('Engagement tracking settings could not be saved. Recheck the domain shortly.');
  return snapshot;
}
