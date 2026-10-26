import { afterEach, expect, it, vi } from 'vitest'
import { buildMobileBuyerJourney, loadMobileBuyerJourney } from '../mobileBuyerJourneyService.js'
import { buildBuyerIntakeNotes } from '../buyerIntakeModel.js'
import { buildBuyerJourneyAlignmentModel } from '../buyerJourneyAlignmentService.js'
import { listAppointmentsAsync } from '../../lib/agencyPipelineService.js'
import { listCanonicalOffersForLead, getBuyerLeadLifecycleDiagnostic } from '../../lib/buyerLifecycleService.js'
import { fetchJourneyStageOverrides } from '../journeyStageOverrideService.js'
import { readDocumentRequirementContext } from '../documents/documentRequirementReadService.js'
import { fetchAgencyCrmLeadWorkspace } from '../../lib/agencyCrmRepository.js'
vi.mock('../../lib/agencyPipelineService.js', () => ({ listAppointmentsAsync: vi.fn() }))
vi.mock('../../lib/buyerLifecycleService.js', () => ({ listCanonicalOffersForLead: vi.fn(), getBuyerLeadLifecycleDiagnostic: vi.fn() }))
vi.mock('../journeyStageOverrideService.js', () => ({ fetchJourneyStageOverrides: vi.fn() }))
vi.mock('../../lib/agencyCrmRepository.js', () => ({ fetchAgencyCrmLeadWorkspace: vi.fn() }))
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: {} }))
vi.mock('../documents/documentRequirementReadService.js', () => ({ readDocumentRequirementContext: vi.fn(), mergeDocumentRequirementRows: vi.fn(() => []) }))
vi.mock('../rentals/rentalLeadService.js', () => ({ buildRentalLeadView: vi.fn(lead => ({ id: lead.leadId, stage: 'new', role: 'tenant' })) }))
vi.mock('../rentals/rentalApplicationRepository.js', () => ({ listPersistedRentalApplicationsForLead: vi.fn().mockResolvedValue([]), getRentalApplicationTenancyConversion: vi.fn() }))
vi.mock('../developmentBuyerLeadService.js', () => ({ enrichDevelopmentBuyerLeads: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const lead = { leadId: 'one', leadCategory: 'buyer', stage: 'New Lead', contactId: 'contact' }
const notes = buildBuyerIntakeNotes({ qualification: { answers: { budget: 'R 2m', areaInterest: 'Waverley' } } })
const row = (model, key) => model.stages.find(stage => stage.key === key)

it('matches the desktop stage order and counts only actual completed milestones', () => {
  const model = buildMobileBuyerJourney({ lead })
  expect(model.stageOrder).toEqual(buildBuyerJourneyAlignmentModel().stageOrder)
  expect(model.readiness).toEqual({ completed: 1, total: 9, percent: 11 })
  expect(model.currentStageKey).toBe('contacted')
  expect(row(model, 'contacted').done).toBe(false)
})

it('excludes automated acknowledgement emails and counts recorded human contact', () => {
  const automated = { activityType: 'Email', activityNote: 'Acknowledgement email delivered', outcome: 'Sent' }
  expect(row(buildMobileBuyerJourney({ lead, activities: [automated] }), 'contacted').done).toBe(false)
  expect(row(buildMobileBuyerJourney({ lead, activities: [{ activityType: 'Call', outcome: 'Interested' }] }), 'contacted').done).toBe(true)
})

it('uses saved qualification answers and distinguishes a booked viewing from a completed one', () => {
  const input = { lead: { ...lead, firstContactedAt: '2026-10-20', notes }, appointments: [{ appointmentType: 'Viewing', status: 'confirmed' }] }
  const booked = buildMobileBuyerJourney(input)
  expect(row(booked, 'qualified').done).toBe(true)
  expect(row(booked, 'viewing').done).toBe(false)
  expect(booked.currentStageKey).toBe('viewing')
  const completed = buildMobileBuyerJourney({ ...input, appointments: [{ appointmentType: 'Viewing', status: 'completed' }] })
  expect(row(completed, 'viewing').done).toBe(true)
})

it('requires actual delivery, submission and signed OTP evidence beyond a dragged CRM stage', () => {
  const model = buildMobileBuyerJourney({ lead: { ...lead, stage: 'Transaction', convertedTransactionId: 'tx' }, offers: [{ status: 'accepted' }], transactionId: 'tx', diagnostic: { transaction: { stage: 'Buyer Onboarding Pending' } } })
  for (const key of ['buyer_onboarding_sent', 'buyer_onboarding_submitted', 'offer', 'buyer_documents_uploaded']) expect(row(model, key).done).toBe(false)
  expect(row(model, 'transaction').done).toBe(true) // Desktop accepts a saved Transaction stage with a linked transaction.
  expect(model.currentStageKey).toBe('buyer_onboarding_sent')
})

it('reaches 100% using the same completed evidence and document rules as desktop', () => {
  const model = buildMobileBuyerJourney({ lead: { ...lead, notes, rawEnquiryPayload: { buyerOnboarding: { status: 'submitted' }, buyerOtpDocument: { storagePath: 'otp.pdf', metadata: { signedByAllPartiesConfirmed: true } } } },
    diagnostic: { transaction: { id: 'tx', stage: 'Finance' } }, transactionId: 'tx',
    documentRows: [{ key: 'buyer_id', required: true, status: 'uploaded', storagePath: 'id.pdf' }], documentsReady: true,
  })
  expect(model.readiness).toEqual({ completed: 9, total: 9, percent: 100 })
  const rejected = buildMobileBuyerJourney({ lead, documentRows: [{ key: 'id', required: true, status: 'rejected', storagePath: 'id.pdf' }], documentsReady: true })
  expect(row(rejected, 'buyer_documents_uploaded').done).toBe(false)
})

it('uses saved manual overrides and development reservation stages', () => {
  const model = buildMobileBuyerJourney({ lead, overrides: [{ id: 'override', entityType: 'buyer_lead', entityId: 'one', stageKey: 'contacted', actionType: 'mark_complete', reason: 'Contact recorded', effectiveAt: '2026-10-20T10:00:00Z' }] })
  expect(row(model, 'contacted').done).toBe(true)
  expect(row(model, 'contacted').overridden).toBe(true)
  expect(buildMobileBuyerJourney({ lead: { ...lead, developmentId: 'development' } }).stages.some(stage => stage.key === 'development_selection')).toBe(true)
})

function mockReads() {
  listAppointmentsAsync.mockResolvedValue([])
  listCanonicalOffersForLead.mockResolvedValue([])
  fetchJourneyStageOverrides.mockResolvedValue([])
  readDocumentRequirementContext.mockResolvedValue({ requirements: [], documents: [] })
}
it('loads only this organisation and lead, including the canonical document context', async () => {
  mockReads()
  const model = await loadMobileBuyerJourney({ organisationId: 'agency', lead, actor: { id: 'agent', email: 'agent@example.com' } })
  expect(listAppointmentsAsync).toHaveBeenCalledWith('agency', expect.objectContaining({ leadId: 'one', agentId: 'agent', includeAll: false }))
  expect(fetchJourneyStageOverrides).toHaveBeenCalledWith({ organisationId: 'agency', entityType: 'buyer_lead', entityId: 'one' })
  expect(readDocumentRequirementContext).toHaveBeenCalledWith({}, { contextType: 'buyer_lead', contextId: 'one' })
  expect(getBuyerLeadLifecycleDiagnostic).not.toHaveBeenCalled()
  expect(model.readiness.percent).toBe(11)
})

it('reloads the lead on refresh and does not replace failed evidence reads with mock progress', async () => {
  mockReads()
  fetchAgencyCrmLeadWorkspace.mockResolvedValue({ leads: [{ ...lead, firstContactedAt: '2026-10-20' }], contacts: [], leadActivities: [] })
  const model = await loadMobileBuyerJourney({ organisationId: 'agency', lead, refreshLead: true })
  expect(row(model, 'contacted').done).toBe(true)
  readDocumentRequirementContext.mockRejectedValueOnce(new Error('Not available'))
  await expect(loadMobileBuyerJourney({ organisationId: 'agency', lead })).rejects.toThrow('Not available')
})

it('uses the tenant journey and rental action for a classified rental, without loading buyer evidence', async () => {
  const { listPersistedRentalApplicationsForLead } = await import('../rentals/rentalApplicationRepository.js')
  listPersistedRentalApplicationsForLead.mockResolvedValue([])
  const model = await loadMobileBuyerJourney({ organisationId: 'agency', lead: { ...lead, rawEnquiryPayload: { arch9RentalLead: true, classification: 'rental', role: 'tenant', stage: 'new' } } })
  expect(model.kind).toBe('tenant')
  expect(model.nextAction.title).toBe('Contact tenant')
  expect(model.stages.map(stage => stage.label)).toContain('Application pending')
  expect(model.stages.map(stage => stage.label)).not.toContain('Offer to purchase signed')
  expect(listAppointmentsAsync).not.toHaveBeenCalled()
  expect(listCanonicalOffersForLead).not.toHaveBeenCalled()
})
