import { createAgencyCrmLeadRecord, updateAgencyCrmLeadRecord, updateAgencyCrmContactRecord, createAgencyCrmLeadActivity } from '../lib/agencyCrmRepository'
import { createPrivateListing, persistSellerProfileOnboardingFormData, updateSellerOnboardingProgress } from './privateListingService'
import { generateSellerOnboardingToken } from '../lib/agentListingStorage'
import { addLeadCollaborator } from './leadCollaboratorService'

const text = value => String(value ?? '').trim()

// A resumable receipt is held by the dialog, not another database record. The
// same IDs survive failed requests, so retrying never creates another journey.
export function createSellerLeadCaptureReceipt() {
  return { leadId: crypto.randomUUID(), contactId: crypto.randomUUID(), token: generateSellerOnboardingToken(), lead: null, listing: null, collaboratorAgentIds: [] }
}

export async function persistSellerLeadCapture({ organisationId, actor, assignedAgent, additionalAgents = [], source, priority, candidate, receipt }, dependencies = {}) {
  const api = { createAgencyCrmLeadRecord, updateAgencyCrmLeadRecord, updateAgencyCrmContactRecord, createPrivateListing, persistSellerProfileOnboardingFormData, updateSellerOnboardingProgress, addLeadCollaborator, ...dependencies }
  const formData = candidate.sellerOnboarding.formData
  if (!receipt.lead) {
    receipt.lead = await api.createAgencyCrmLeadRecord(organisationId, {
      leadId: receipt.leadId,
      contact: { contactId: receipt.contactId, firstName: text(formData.sellerFirstName), lastName: text(formData.sellerSurname), email: text(formData.email), phone: text(formData.phone), contactType: 'seller' },
      assignedAgent, assignedUserId: assignedAgent?.userId || assignedAgent?.id,
      branchId: assignedAgent?.branchId, createdBy: actor?.id,
      leadCategory: 'seller', leadSource: source, priority, stage: 'New Lead',
      sellerPropertyAddress: text(formData.propertyAddress),
    }, { actor, notifyAgent: false })
    receipt.contact = { firstName: text(formData.sellerFirstName), lastName: text(formData.sellerSurname), email: text(formData.email), phone: text(formData.phone) }
  }
  if (!receipt.listing) {
    const result = await api.createPrivateListing({
      organisationId, assignedAgentId: assignedAgent?.id,
      originatingCrmLeadId: receipt.leadId, sellerLeadId: receipt.leadId,
      listingStatus: 'seller_lead', listingVisibility: 'internal', listingSource: 'seller_lead_intake',
      listingCategory: 'private_sale', sellerOnboardingStatus: 'not_started', mandateStatus: 'not_started',
      title: text(formData.propertyAddress), addressLine1: text(formData.propertyAddressLine1),
      formattedAddress: text(formData.propertyAddress), suburb: text(formData.suburb),
      city: text(formData.city), province: text(formData.province), postalCode: text(formData.postalCode),
      propertyCategory: text(formData.propertyCategory), propertyType: text(formData.propertyType),
      propertyStructureType: text(formData.propertyStructureType), askingPrice: formData.askingPrice,
    }, { includeRequirementsAndDocuments: false, syncRequirements: false })
    receipt.listing = result.listing
    receipt.newOnboarding = !result.existing && !result.listing?.sellerOnboarding?.id
  }
  if (!receipt.listing?.id) throw new Error('The seller record could not be prepared. Your answers are still in this form.')

  let saved
  if (receipt.listing.sellerOnboarding?.token) {
    // Use the revision originally displayed, never a fresh read to hide a conflict.
    const result = await api.updateSellerOnboardingProgress(receipt.listing.sellerOnboarding.token, {
      listingSnapshot: candidate.id ? candidate : receipt.listing,
      formData, currentStep: formData.currentStep, status: 'in_progress',
    })
    saved = result.listing
  } else {
    const onboarding = await api.persistSellerProfileOnboardingFormData({
      listingId: receipt.listing.id, listingSnapshot: receipt.listing,
      token: receipt.token, formData, status: 'in_progress',
      allowProtectedSectionOverride: true,
      newOnboarding: receipt.newOnboarding,
    })
    saved = { ...receipt.listing, updatedAt: onboarding.listing_updated_at || receipt.listing.updatedAt,
      sellerOnboarding: { ...onboarding, formData: onboarding.form_data || onboarding.formData } }
  }
  if (!saved?.sellerOnboarding?.token) throw new Error('The seller save was not confirmed. Keep this form open and try again.')
  receipt.listing = saved
  receipt.token = saved.sellerOnboarding.token
  const confirmed = saved.sellerOnboarding.formData || saved.sellerOnboarding.form_data
  const contact = { firstName: text(confirmed.sellerFirstName), lastName: text(confirmed.sellerSurname), email: text(confirmed.email), phone: text(confirmed.phone) }
  const patch = { listingId: saved.id, sellerOnboardingToken: receipt.token, sellerOnboardingStatus: 'in_progress',
    sellerPropertyAddress: text(confirmed.propertyAddress), formattedAddress: text(confirmed.propertyAddress),
    suburb: text(confirmed.suburb), city: text(confirmed.city), province: text(confirmed.province), postalCode: text(confirmed.postalCode),
  }
  // All these writes depend on the confirmed profile, but not on each other.
  // Keep every success in the receipt so retrying only completes missing work.
  const writes = []
  if (JSON.stringify(contact) !== JSON.stringify(receipt.contact)) {
    writes.push({ kind: 'contact', run: () => api.updateAgencyCrmContactRecord(organisationId, receipt.contactId, contact) })
  }
  if (JSON.stringify(patch) !== JSON.stringify(receipt.leadPatch)) {
    writes.push({ kind: 'lead', run: () => api.updateAgencyCrmLeadRecord(organisationId, receipt.leadId, patch) })
  }
  const collaboratorIds = [...new Set(additionalAgents.map(agent => text(agent?.userId || agent?.id)).filter(id => id && id !== text(assignedAgent?.userId || assignedAgent?.id)))]
  receipt.collaboratorAgentIds ||= []
  for (const userId of collaboratorIds) {
    if (!receipt.collaboratorAgentIds.includes(userId)) {
      writes.push({ kind: 'agent', userId, run: () => api.addLeadCollaborator({ organisationId, leadId: receipt.leadId, userId }) })
    }
  }
  const results = await Promise.allSettled(writes.map(write => Promise.resolve().then(write.run)))
  let projectionFailure
  let teamFailure
  results.forEach((result, index) => {
    const write = writes[index]
    if (result.status === 'rejected') {
      if (write.kind === 'agent') teamFailure ||= result.reason
      else projectionFailure ||= result.reason
    } else if (write.kind === 'contact') receipt.contact = contact
    else if (write.kind === 'lead') receipt.leadPatch = patch
    else receipt.collaboratorAgentIds.push(write.userId)
  })
  if (projectionFailure) {
    throw Object.assign(new Error('Your seller details are saved, but the lead summary could not be updated. Try saving again to finish linking the lead.'), {
      code: 'SELLER_CAPTURE_PROJECTION_FAILED', committed: true, listing: saved, cause: projectionFailure,
    })
  }
  if (teamFailure) {
    throw Object.assign(new Error('Your seller details are saved, but an additional agent could not be assigned. Try saving again to finish the lead team.'), {
      code: 'SELLER_CAPTURE_TEAM_FAILED', committed: true, listing: saved, cause: teamFailure,
    })
  }
  receipt.lead = { ...receipt.lead, ...patch, sellerOnboarding: saved.sellerOnboarding, collaboratorAgentIds: [...receipt.collaboratorAgentIds] }
  return saved
}

export const SELLER_CAPTURE_PROGRESS = Object.freeze([
  'I’m not sure yet',
  'We have just started speaking',
  'We are arranging a valuation',
  'We are discussing selling',
  'We are collecting details and documents',
  'We already have a signed mandate',
])

export async function recordSellerCaptureProgress({ organisationId, receipt, progress, actor }, createActivity = createAgencyCrmLeadActivity) {
  if (!SELLER_CAPTURE_PROGRESS.includes(progress)) return
  // Reported progress is activity evidence, never a verified lifecycle stage.
  await createActivity(organisationId, receipt.leadId, {
    agent: actor, activityType: 'Seller Progress Reported', outcome: progress,
    activityNote: `${progress}. This is the agent’s report; document review and existing workflow checks still apply.`,
  }, { actor })
}
