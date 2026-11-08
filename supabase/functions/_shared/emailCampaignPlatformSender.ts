import { ARCH9_CAMPAIGN_DOMAIN, ARCH9_CAMPAIGN_EMAIL } from './emailCampaignSender.js';
import { sendingDomainState, recordSendingDomainTracking } from './emailSendingDomain.ts';

// Dedicated campaign configuration. Never fall back to transactional sender
// variables or a domain/address supplied by the browser.
export async function refreshPlatformCampaignSender({ db, env, resendKey, fetcher = fetch }: {
  db: any; env: (key: string) => string | undefined; resendKey: string; fetcher?: typeof fetch;
}) {
  const providerId = String(env('ARCH9_CAMPAIGN_RESEND_DOMAIN_ID') || '').trim();
  const enabled = env('ARCH9_CAMPAIGN_SENDING_ENABLED') === 'true' && Boolean(providerId);
  const save = async (status: string) => {
    const result = await db.rpc('email_campaign_apply_platform_status', {
      p_provider_domain_id: providerId || null, p_status: status, p_enabled: enabled,
    });
    if (result.error) throw new Error('Arch9 campaign sender status could not be saved.');
    return { email: ARCH9_CAMPAIGN_EMAIL, enabled, status, ready: enabled && status === 'verified' };
  };
  if (!enabled) return save('pending');
  const response = await fetcher(`https://api.resend.com/domains/${encodeURIComponent(providerId)}`, {
    headers: { authorization: `Bearer ${resendKey}` }, signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return save('failed');
  if (!response.ok) throw new Error('The Arch9 campaign sender could not be verified. Try again shortly.');
  const domain = await response.json();
  if (domain.id !== providerId || String(domain.name || '').toLowerCase() !== ARCH9_CAMPAIGN_DOMAIN) return save('failed');
  const state = await save(sendingDomainState(domain).status);
  const tracking = await recordSendingDomainTracking(db, null, providerId, domain);
  return { ...state, tracking };
}
