import { createAgencyCrmLeadActivity, updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import { assertRentalLeadFicaCompletion, createRentalLeadFicaChecklist, getRentalLeadFicaReadiness, RENTAL_LEAD_FICA_VERSION } from './rentalLeadFicaModel'
import { advanceRentalLead } from './rentalLeadService'

const text = (value) => String(value ?? '').trim()

export function getRentalLeadFicaChecklist(lead = {}) {
  const metadata = getRentalLeadMetadata(lead.raw || lead)
  return createRentalLeadFicaChecklist(metadata.compliance?.fica?.checklist)
}

export async function saveRentalLeadFicaChecklist(lead = {}, checklist = {}, context = {}) {
  if (lead.role !== 'tenant' || !['screening_pending', 'fica_pending'].includes(lead.stage)) throw new Error('FICA readiness is available only for tenant leads in screening or FICA stages.')
  const current = getRentalLeadMetadata(lead.raw)
  const normalizedChecklist = createRentalLeadFicaChecklist(checklist)
  const metadata = patchRentalCrmLeadMetadata(lead.raw, { compliance: { ...(current.compliance || {}), fica: { version: RENTAL_LEAD_FICA_VERSION, checklist: normalizedChecklist, updatedAt: new Date().toISOString() } } })
  const updated = await updateAgencyCrmLeadRecord(context.organisationId, lead.id, { rawEnquiryPayload: metadata })
  const readiness = getRentalLeadFicaReadiness(normalizedChecklist)
  void createAgencyCrmLeadActivity(context.organisationId, lead.id, { agent: context.actor || {}, activityType: 'Rental FICA Checklist Updated', activityNote: `${readiness.verified.length}/${readiness.checklist ? Object.keys(readiness.checklist).length : 0} FICA items verified.`, outcome: readiness.complete ? 'Ready for evidence' : 'Incomplete' }, { actor: context.actor || {} }).catch(() => null)
  return { updated, checklist: normalizedChecklist, readiness }
}

export async function completeRentalLeadFica(lead = {}, checklist = {}, evidenceReference = '', context = {}) {
  if (lead.stage !== 'fica_pending') throw new Error('Move the tenant lead to FICA pending before marking FICA complete.')
  assertRentalLeadFicaCompletion(checklist, evidenceReference)
  await saveRentalLeadFicaChecklist(lead, checklist, context)
  return advanceRentalLead(lead, { organisationId: context.organisationId, actor: context.actor || {}, toStage: 'fica_complete', evidence: { ficaReference: text(evidenceReference) } })
}
