import { handleRecruitmentInvitationEmail } from '../send-email/handlers/recruitmentInvitation.ts';
import { sendViaResendApi } from '../send-email/services/resend.ts';
import { resolveAudienceEmailSender, resolveEmailBranding } from '../send-email/services/emailBranding.ts';

export async function dispatchRecruitmentApprovals(request: Request, { key, admin, deliver = handleRecruitmentInvitationEmail }: { key: string; admin: any; deliver?: typeof handleRecruitmentInvitationEmail }) {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return reply(405, { error: 'POST required' });
  // Scheduler identity is server-only. No user JWT or request-supplied actor is accepted.
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) return reply(401, { error: 'Server dispatch required' });
  if (!admin) return reply(503, { error: 'Dispatch unavailable' });
  const claimed = await admin.rpc('recruitment_claim_approval_emails', { p_limit: 3 });
  if (claimed.error || !Array.isArray(claimed.data)) return reply(503, { error: 'Dispatch unavailable' });
  let accepted = 0, pending = 0;
  for (const job of claimed.data) {
    try {
      const result = await deliver(request, { organisationId: job.organisation_id, leadId: job.lead_id, kind: 'approval', referenceId: job.lead_id, requestId: job.id }, {
        admin, user: null, automationActor: job.actor_id, send: sendViaResendApi, branding: resolveEmailBranding, sender: resolveAudienceEmailSender,
      });
      const outcome = await result.json();
      const confirmed = outcome.ok === true && outcome.status === 'provider_accepted';
      const saved = await admin.rpc('recruitment_complete_approval_email', { p_id: job.id, p_accepted: confirmed, p_error: confirmed ? null : outcome.suppressed ? 'controlled_test_recipient' : 'dispatch_unconfirmed' });
      if (confirmed && !saved.error && saved.data === true) accepted++; else pending++;
    } catch { pending++; /* The leased queue item is recovered after expiry. */ }
  }
  return reply(200, { accepted, pending });
}
