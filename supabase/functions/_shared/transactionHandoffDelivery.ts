import { assessControlledTestRecipient } from '../send-email/utils/controlledTestRecipient.ts';
import { sendViaResendApi } from '../send-email/services/resend.ts';

type Job = { id: string; channel: string; recipient_key: string; attempt_count: number; lease_token: string; context: Record<string, unknown> };
type Configuration = { appUrl: string; sender: string; apiKey: string };
const text = (value: unknown) => String(value ?? '').trim();
const escape = (value: unknown) => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const roles: Record<string,string> = { transfer_attorney:'Transfer attorney', bond_originator:'Bond originator', bond_attorney:'Bond attorney', cancellation_attorney:'Cancellation attorney' };

export function buildTransactionHandoffEmail(job: Job, config: Configuration) {
  const role = roles[text(job.context.roleType)] || 'Partner';
  const reference = text(job.context.transactionReference);
  // A normal authenticated workspace URL; never a bearer invitation link.
  const url = config.appUrl.replace(/\/$/,'');
  const message = `A new ${role.toLowerCase()} instruction is ready for ${text(job.context.organisationName) || 'your organisation'}. Open Arch9 to review the matter and accept the instruction. Delivery of this email does not record organisation acceptance.`;
  const subject = `${role} instruction ready: ${reference}`;
  return {
    from: config.sender, to: job.recipient_key, subject,
    html: `<h1>${escape(subject)}</h1><p>${escape(message)}</p><p>Matter reference: ${escape(reference)}</p><p><a href="${escape(url)}">Open Arch9</a></p>`,
    text: `${subject}\n\n${message}\n\nMatter reference: ${reference}\nOpen Arch9: ${url}`,
    idempotencyKey: `transaction-handoff:${job.id}`,
  };
}

export async function dispatchTransactionHandoffJob(client: any, job: Job, config: Configuration, sender = sendViaResendApi) {
  const fence = { p_id:job.id, p_attempt:job.attempt_count, p_lease:job.lease_token };
  const finish = async (status: string, providerId: string | null = null, reason: string | null = null) => {
    const result = await client.rpc('complete_transaction_handoff_dispatch',{...fence,p_status:status,p_provider_id:providerId,p_reason:reason});
    if (result.error) throw result.error;
    return result.data === true;
  };
  try {
    if (job.channel === 'workspace') {
      const result = await client.rpc('prepare_transaction_handoff_workspace',fence);
      if (result.error) throw result.error;
      return {jobId:job.id,status:result.data?.reason === 'stale_job' ? 'stale_job' : result.data?.reason ? 'retry' : result.data?.prepared ? 'prepared' : 'failed'};
    }
    if (job.channel !== 'email') throw new Error('Unsupported dispatch channel');
    if (assessControlledTestRecipient({email:job.recipient_key,metadata:job.context}).suppressed) {
      await finish('failed',null,'controlled_test_recipient');
      return {jobId:job.id,status:'suppressed'};
    }
    const frozen = await client.rpc('freeze_transaction_handoff_email',{...fence,p_payload:buildTransactionHandoffEmail(job,config)});
    if (frozen.error) throw frozen.error;
    if (!frozen.data) return {jobId:job.id,status:'stale_job'};
    const result = await sender({...frozen.data,apiKey:config.apiKey,timeoutMs:12000});
    if (!result.ok || !text(result.ok ? result.data?.id : null)) throw new Error('Provider delivery was not confirmed');
    const recorded = await finish('sent',text(result.ok ? result.data?.id : null));
    return {jobId:job.id,status:recorded ? 'sent' : 'stale_receipt'};
  } catch {
    // Do not copy provider responses (which can contain addresses/secrets) into logs.
    try { await finish('failed',null,'delivery_failed'); } catch { /* lease expiry recovers interrupted work */ }
    return {jobId:job.id,status:'failed'};
  }
}
