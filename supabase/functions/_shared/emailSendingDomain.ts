// Always read the provider's current state. Webhook payloads may be duplicated
// or delivered out of order, and must never restore a stale verified status.
const text = (value: unknown) => String(value || "").trim();
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
    headers: { authorization: `Bearer ${resendKey}` },
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
  const status = details.status === "verified" ? "verified" : ["failed", "temporary_failure"].includes(details.status) ? "failed" : "pending";
  const { error } = await db.rpc("email_apply_domain_status", {
    p_domain_id: domain.id, p_status: status, p_records: sendingDomainRecords(details.records),
    p_error: status === "failed" ? "DNS verification failed. Check the records below, then retry verification." : null,
  });
  if (error) throw new Error("Unable to save domain verification. Please try again.");
  return status;
}
