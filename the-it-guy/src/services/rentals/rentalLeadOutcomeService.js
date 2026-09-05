import { createAgencyCrmLeadActivity, updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import { buildRentalLeadOutcome } from './rentalLeadOutcomeModel'

export async function recordRentalLeadOutcome(lead = {}, values = {}, context = {}) {
  if (!lead?.id) throw new Error('A rental lead is required.')
  const outcome = buildRentalLeadOutcome(values, { recordedBy: context.actor?.id || context.actor?.userId, nowIso: context.nowIso })
  const metadata = patchRentalCrmLeadMetadata(lead.raw, { outcome })
  const updated = await updateAgencyCrmLeadRecord(context.organisationId, lead.id, { rawEnquiryPayload: metadata })
  void createAgencyCrmLeadActivity(context.organisationId, lead.id, {
    agent: context.actor || {}, activityType: 'Rental Lead Outcome Recorded',
    activityNote: [`Outcome: ${outcome.status}.`, outcome.reason && `Reason: ${outcome.reason}.`, outcome.note].filter(Boolean).join(' '), outcome: outcome.status,
  }, { actor: context.actor || {} }).catch(() => null)
  return { updated, outcome }
}
