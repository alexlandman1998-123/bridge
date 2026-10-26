import { buildBuyerJourneyAlignmentModel, hasBuyerOnboardingSentEvidence, hasBuyerOnboardingSubmittedEvidence, hasBuyerSignedOtpEvidence, hasBuyerTransactionCreatedEvidence, summarizeBuyerJourneyDocuments, summarizeBuyerJourneyReadiness } from './buyerJourneyAlignmentService.js'
import { buildBuyerQualificationIntake, getBuyerQualificationReadiness } from './buyerIntakeModel.js'
import { resolveLeadLifecyclePresentation } from './leadLifecyclePresentationService.js'
import { buildDevelopmentBuyerJourneyModel } from './developmentBuyerJourneyService.js'
import { isDevelopmentBuyerLead } from '../core/leads/developmentBuyerLead.js'
import { isRentalCrmLead } from './rentals/rentalCrmLeadModel.js'
import { getBuyerSignedOtpDocuments } from '../pages/agency/buyerSignedOtpDocumentModel.js'

const text = value => String(value || '').trim()
const lower = value => text(value).toLowerCase()
function record(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {} } catch { return {} }
  }
  return value && typeof value === 'object' ? value : {}
}

// Match the desktop's contact evidence: automated acknowledgements do not count.
function contactActivity(activity = {}) {
  const type = lower(activity.activityType || activity.activity_type)
  const note = lower(activity.activityNote || activity.activity_note)
  return type !== 'lead created' && note !== 'lead_created' &&
    !type.includes('system') && !type.includes('automated') &&
    !note.startsWith('acknowledgement email ') && !note.includes('automatic acknowledgement') &&
    !lower(activity.outcome).startsWith('provider_message_id:') &&
    ['call', 'whatsapp', 'email', 'meeting', 'sms'].some(token => type.includes(token))
}

export function buildMobileBuyerJourney({ lead, activities = [], appointments = [], offers = [], diagnostic = {}, documentRows = [], documentUploads = [], documentsReady = false, overrides = [], transactionId = '' }) {
  const rawPayload = record(lead.rawEnquiryPayload || lead.raw_enquiry_payload)
  const stage = lower(resolveLeadLifecyclePresentation(lead).label || lead.stage)
  const qualification = getBuyerQualificationReadiness(buildBuyerQualificationIntake({}, { notes: lead.notes || '' }).qualification?.answers || {})
  const contacted = Boolean(lead.firstContactedAt || lead.first_contacted_at || activities.some(contactActivity) ||
    lower(lead.ownershipStatus || lead.ownership_status) === 'contacted' || stage.includes('contacted') ||
    ['qualified', 'viewing', 'offer', 'otp', 'transaction', 'converted'].some(token => stage.includes(token)))
  const viewings = appointments.filter(row => lower(row.appointmentType || row.title).includes('viewing'))
  const viewingScheduled = viewings.some(row => ['accepted', 'confirmed', 'scheduled', 'booked'].includes(lower(row.status)))
  const viewingCompleted = viewings.some(row => lower(row.status) === 'completed') || stage.includes('viewing completed')
  const onboarding = { ...record(rawPayload.buyerOnboarding), ...record(diagnostic.onboarding) }
  const onboardingSubmitted = hasBuyerOnboardingSubmittedEvidence({
    status: diagnostic.onboarding?.status || diagnostic.transaction?.onboarding_status || lead.buyerOnboardingStatus || lead.clientOnboardingStatus || onboarding.status,
    onboarding, transaction: diagnostic.transaction || {},
  })
  const onboardingSent = hasBuyerOnboardingSentEvidence({ onboarding, activities, submitted: onboardingSubmitted })
  const acceptedOffer = offers.find(row => lower(row.status) === 'converted_to_transaction') || offers.find(row => lower(row.status) === 'accepted') || null
  const uploadedOtp = getBuyerSignedOtpDocuments({ lead, uploads: documentUploads, requirements: documentRows }).length > 0 ||
    Boolean(lead.otpDocumentUploadedAt || lead.otp_document_uploaded_at || rawPayload.otpDocumentUploadedAt || lead.offerDocumentUploadedAt || lead.offer_document_uploaded_at || rawPayload.offerDocumentUploadedAt) ||
    offers.some(row => ['submitted', 'accepted'].includes(lower(row.status)))
  const offerComplete = hasBuyerSignedOtpEvidence({ lead, rawPayload, acceptedOffer, documentUploaded: uploadedOtp })
  const transactionDone = hasBuyerTransactionCreatedEvidence({ transactionId, transaction: diagnostic.transaction || {}, lead, rawPayload })
  const documents = summarizeBuyerJourneyDocuments(documentRows.filter(row => !['uploaded_otp', 'buyer_otp', 'signed_otp'].includes(lower(row.key))), { ready: documentsReady })
  const modelBuilder = isDevelopmentBuyerLead(lead) ? buildDevelopmentBuyerJourneyModel : buildBuyerJourneyAlignmentModel
  const model = modelBuilder({
    lead, persistedStage: stage, overrides,
    evidence: {
      leadCaptured: true, contacted, qualified: qualification.complete, qualificationStarted: qualification.answeredCount > 0,
      viewingStarted: viewings.length > 0 || stage.includes('viewing'), viewingScheduled, viewingCompleted,
      buyerOnboardingSent: onboardingSent, buyerOnboardingSubmitted: onboardingSubmitted,
      offerStarted: uploadedOtp || offers.length > 0 || stage.includes('offer') || stage.includes('otp'),
      offerComplete, transactionCreated: transactionDone, buyerDocumentsUploaded: documents.complete,
    },
    details: {
      qualified: qualification.complete ? `${qualification.answeredCount} captured` : qualification.answeredCount ? `${qualification.answeredCount}/${qualification.minimumCount} captured` : 'Pending',
      viewing: viewingCompleted ? 'Completed' : viewingScheduled ? 'Upcoming' : 'Not booked',
      buyer_onboarding_sent: onboardingSent ? 'Sent' : 'Not sent',
      buyer_onboarding_submitted: onboardingSubmitted ? 'Submitted' : 'Awaiting submission',
      offer: offerComplete ? 'Signed OTP recorded' : uploadedOtp || offers.length ? 'In progress' : 'Not uploaded',
      transaction: transactionDone ? 'Created' : 'Not started',
      buyer_documents_uploaded: documents.total ? `${documents.uploaded}/${documents.total} uploaded` : 'No requirements verified',
    },
  })
  return { ...model, readiness: summarizeBuyerJourneyReadiness(model.stages) }
}

export async function loadMobileBuyerJourney({ organisationId, lead, contact = {}, activities = [], actor = {}, includeAll = false, refreshLead = false }) {
  const leadId = text(lead.leadId || lead.lead_id)
  if (!organisationId || !leadId) throw new Error('A saved buyer lead and organisation are required.')
  if (refreshLead) {
    const { fetchAgencyCrmLeadWorkspace } = await import('../lib/agencyCrmRepository.js')
    const snapshot = await fetchAgencyCrmLeadWorkspace(organisationId, leadId)
    const fresh = snapshot.leads?.find(row => (row.leadId || row.lead_id) === (snapshot.resolvedLeadId || leadId))
    if (!fresh) throw new Error('Buyer lead unavailable.')
    lead = fresh
    contact = snapshot.contacts?.find(row => row.contactId === lead.contactId) || {}
    activities = snapshot.leadActivities || []
  }
  if (isRentalCrmLead(lead)) {
    const [{ buildRentalLeadView }, { listPersistedRentalApplicationsForLead, getRentalApplicationTenancyConversion }, { TENANT_JOURNEY, tenantJourneyStage }, { getRentalLeadNextAction }] = await Promise.all([
      import('./rentals/rentalLeadService.js'), import('./rentals/rentalApplicationRepository.js'), import('./rentals/rentalTenantWorkspaceModel.js'), import('./rentals/rentalLeadPipelineModel.js'),
    ])
    const tenant = buildRentalLeadView(lead, contact)
    const applications = await listPersistedRentalApplicationsForLead(organisationId, leadId)
    const conversions = (await Promise.all(applications.map(application => getRentalApplicationTenancyConversion(application.id)))).filter(Boolean)
    const currentIndex = tenantJourneyStage(tenant, conversions, applications)
    const keys = ['captured', 'contacted', 'qualified', 'viewing', 'application_pending', 'application_submitted', 'lease', 'tenancy']
    const stages = TENANT_JOURNEY.map((label, index) => ({ key: keys[index], label, done: index < currentIndex, state: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming' }))
    return { kind: 'tenant', stages, currentStage: stages[currentIndex], currentStageKey: keys[currentIndex], nextAction: { title: getRentalLeadNextAction(tenant.stage, 'tenant') || 'Open tenant actions' }, readiness: summarizeBuyerJourneyReadiness(stages) }
  }
  const [{ listAppointmentsAsync }, { listCanonicalOffersForLead, getBuyerLeadLifecycleDiagnostic }, { fetchJourneyStageOverrides }, { readDocumentRequirementContext, mergeDocumentRequirementRows }, { buyerLeadDocumentContext }, { supabase }, { enrichDevelopmentBuyerLeads }] = await Promise.all([
    import('../lib/agencyPipelineService.js'), import('../lib/buyerLifecycleService.js'), import('./journeyStageOverrideService.js'),
    import('./documents/documentRequirementReadService.js'), import('./documents/buyerLeadDocumentReadService.js'), import('../lib/supabaseClient.js'), import('./developmentBuyerLeadService.js'),
  ])
  const [appointments, overrides, enriched] = await Promise.all([
    listAppointmentsAsync(organisationId, { leadId, includeAll, agentId: includeAll ? '' : actor.id || actor.userId || '', agentEmail: includeAll ? '' : actor.email || '' }),
    fetchJourneyStageOverrides({ organisationId, entityType: 'buyer_lead', entityId: leadId }),
    isDevelopmentBuyerLead(lead) ? enrichDevelopmentBuyerLeads(organisationId, [lead]) : Promise.resolve([lead]),
  ])
  const offers = await listCanonicalOffersForLead({
    organisationId, leadId, contactId: lead.contactId || contact.contactId || '',
    appointmentIds: appointments.map(row => row.appointmentId || row.id).filter(Boolean),
    listingIds: [lead.enquiredListingId, lead.listingId, ...appointments.map(row => row.listingId)].filter(Boolean),
    buyerEmail: contact.email || '', buyerPhone: contact.phone || '', buyerName: contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' '),
  })
  let transactionId = text(lead.convertedTransactionId || lead.convertedDealId || offers.find(row => row.transactionId)?.transactionId)
  const diagnostic = transactionId || offers.length ? await getBuyerLeadLifecycleDiagnostic({ organisationId, leadId, transactionId, offerId: offers.find(row => row.transactionId)?.id || offers.find(row => lower(row.status) === 'accepted')?.id || offers[0]?.id || '' }) : {}
  transactionId = text(diagnostic.transaction?.id || transactionId)
  const documentSnapshot = await readDocumentRequirementContext(supabase, buyerLeadDocumentContext({ leadId, transactionId }))
  return buildMobileBuyerJourney({ lead: enriched[0] || lead, activities, appointments, offers, diagnostic, transactionId, overrides,
    documentRows: mergeDocumentRequirementRows([], documentSnapshot, { party: 'buyer' }), documentUploads: documentSnapshot.documents, documentsReady: true })
}
