import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { buildDevelopmentBuyerJourneyModel as journey } from '../developmentBuyerJourneyService.js'
import { buildBuyerJourneyAlignmentModel as normalJourney } from '../buyerJourneyAlignmentService.js'
import { buildBuyerNextBestActionButtons, checkBuyerNextActionEvidence as check, getBuyerNextActionCompletion } from '../buyerNextActionCompletionService.js'
const lead = { leadCategory: 'buyer', developmentId: 'dev', developmentLeadContext: { preferredUnitId: 'unit', reservationState: 'reserved' }, buyerOtpSignedByAllPartiesConfirmed: true }
const ready = { contacted: true, qualified: true, viewingCompleted: true }
const cases = [
  [{}, {}, 'contacted', 'mark_contacted', 'logContact'],
  [{ contacted: true }, {}, 'qualified', 'qualify', 'openQualification'],
  [{ contacted: true, qualified: true }, {}, 'viewing', 'schedule_viewing', 'scheduleViewing'],
  [{ contacted: true, qualified: true, viewingScheduled: true }, {}, 'viewing', 'progress_from_viewing', 'recordViewingOutcome'],
  [ready, { developmentLeadContext: {} }, 'development_selection', 'open_development', 'openDevelopment'],
  [ready, {}, 'buyer_onboarding_sent', 'send_buyer_onboarding', 'sendOnboarding'],
  [{ ...ready, buyerOnboardingSent: true }, {}, 'buyer_onboarding_submitted', 'complete_buyer_onboarding', 'captureOnboarding'],
  [{ ...ready, buyerOnboardingSubmitted: true }, {}, 'offer', 'upload_signed_otp', 'uploadSignedOtp'],
  [{ ...ready, buyerOnboardingSubmitted: true, offerComplete: true }, {}, 'transaction', 'create_transaction', 'createTransaction'],
  [{ ...ready, buyerOnboardingSubmitted: true, offerComplete: true, transactionCreated: true }, {}, 'buyer_documents_uploaded', 'upload_buyer_documents', 'openDocuments'],
  [{ ...ready, buyerOnboardingSubmitted: true, offerComplete: true, transactionCreated: true, buyerDocumentsUploaded: true }, {}, 'buyer_documents_uploaded', 'open_transaction', 'openTransaction'],
]
it.each(cases)('aligns stage and button for evidence %j', (evidence, patch, stage, action, command) => {
  const model = journey({ lead: { ...lead, ...patch }, evidence })
  expect(model.currentStageKey).toBe(stage)
  expect(model.nextAction.key).toBe(action)
  expect(model.nextAction.tip).toBeTruthy()
  const called = []
  const handlers = Object.fromEntries([...cases.map(row => row[4]), 'scheduleAnotherViewing'].map(key => [key, () => called.push(key)]))
  const buttons = buildBuyerNextBestActionButtons(action, handlers, { journeyType: 'development' })
  buttons[0].onClick()
  expect(called).toEqual([command])
  expect(getBuyerNextActionCompletion(action, { journeyType: 'development' }).mode).not.toBe('unavailable')
})
it('removes development qualification copy while retaining validation mode and normal buyer guidance', () => {
  expect(journey({ lead, evidence: { contacted: true } }).nextAction.description).toBe('')
  expect(getBuyerNextActionCompletion('qualify', { journeyType: 'development' })).toEqual({ mode: 'qualification', requirement: '' })
  expect(getBuyerNextActionCompletion('qualify').requirement).toContain('minimum qualification')
  expect(normalJourney({ evidence: { contacted: true } }).nextAction.description).toContain('budget')
  const viewing = journey({ lead, evidence: { contacted: true, qualified: true, viewingScheduled: true } })
  expect(viewing.nextAction.tip).toContain('select a unit and confirm its reservation')
})
it.each(['expired', 'provisional', 'none'])('blocks onboarding and transaction progress for a %s reservation', state => {
  const input = { ...lead, developmentLeadContext: { preferredUnitId: 'unit', reservationState: state } }
  const model = journey({ lead: input, evidence: { ...ready, buyerOnboardingSubmitted: true, offerComplete: true, transactionCreated: true } })
  expect(model.currentStageKey).toBe('development_selection')
  expect(model.stages.find(stage => stage.key === 'transaction').done).toBe(false)
  expect(check({ actionKey: 'send_buyer_onboarding', lead: input, diagnostic: { onboarding: { status: 'sent' } } })).toBe(false)
})
it('treats a passed expiry date as expired, including during manual completion', () => {
  const input = { ...lead, developmentLeadContext: { preferredUnitId: 'unit', reservationState: 'reserved', reservationExpiresAt: '2000-01-01T00:00:00Z' } }
  const model = journey({ lead: input, evidence: ready })
  expect(model.currentStageKey).toBe('development_selection')
  expect(model.currentStage.detail).toBe('Reservation expired')
  expect(check({ actionKey: 'open_development', lead: input })).toBe(false)
})
it('checks the same ordered milestones for manual completion as the rail', () => {
  const complete = { lead, signedOtpUploaded: true, transactionId: 'tx', diagnostic: { onboarding: { status: 'Submitted' }, transaction: { stage: 'Finance' } }, documentRows: [{ required: true, storagePath: 'buyer/id.pdf' }], documentsReady: true }
  for (const actionKey of ['open_development', 'send_buyer_onboarding', 'complete_buyer_onboarding', 'upload_signed_otp', 'create_transaction', 'upload_buyer_documents']) expect(check({ ...complete, actionKey })).toBe(true)
  expect(check({ ...complete, actionKey: 'create_transaction', diagnostic: { onboarding: { status: 'In Progress' }, transaction: { stage: 'Finance' } } })).toBe(false)
  expect(check({ ...complete, actionKey: 'create_transaction', signedOtpUploaded: false })).toBe(false)
  expect(check({ ...complete, actionKey: 'create_transaction', diagnostic: { onboarding: { status: 'Submitted' }, transaction: { stage: 'Buyer Onboarding Pending' } } })).toBe(false)
  expect(check({ ...complete, actionKey: 'upload_signed_otp', lead: { ...lead, buyerOtpSignedByAllPartiesConfirmed: false } })).toBe(false)
  expect(check({ ...complete, actionKey: 'upload_buyer_documents', transactionId: '' })).toBe(false)
  expect(check({ ...complete, actionKey: 'upload_buyer_documents', documentsReady: false })).toBe(false)
})

it('opens the real appointment editor for a development presentation outcome', () => {
  const source = readFileSync(new URL('../../pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('  function handleOpenBuyerViewingDoneAction()')
  const end = source.indexOf('  function handleOpenViewingCompletedFeedbackOverride()', start)
  const appointment = { appointmentId: 'viewing-1', status: 'scheduled' }
  const editor = vi.fn(), legacy = vi.fn()
  const context = { selectedLeadIsDevelopment: true, selectedLeadViewingAppointments: [appointment], selectedLeadActiveViewing: null, normalizeText: value => String(value || ''), setBuyerJourneyActionStage: vi.fn(), handleLeadWorkspaceTabSelection: vi.fn(), handleOpenAppointmentModal: editor, handleOpenLeadCompletionPanel: legacy, setMessage: vi.fn() }
  const open = new Function('context', `with (context) { ${source.slice(start, end)}; return handleOpenBuyerViewingDoneAction; }`)(context)
  open()
  expect(editor).toHaveBeenCalledWith(appointment)
  expect(legacy).not.toHaveBeenCalled()
})

it.each(['reserved', 'expired'])('refreshes the authoritative %s reservation before reporting completion', async reservationState => {
  const source = readFileSync(new URL('../../pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('  async function handleVerifyBuyerNextActionCompletion()')
  const end = source.indexOf('  async function handleMarkBuyerQualifiedAction()', start)
  const fresh = { leadId: 'buyer', developmentId: 'dev', developmentLeadContext: { preferredUnitId: 'unit', reservationState } }
  const enrich = vi.fn(async () => [fresh]), message = vi.fn(), error = vi.fn()
  const context = {
    organisationId: 'org', selectedLead: { leadId: 'buyer' }, selectedLeadIsSeller: false, selectedLeadIsDevelopment: true, isLeadDetailSaving: false,
    selectedLeadRecordId: 'buyer', selectedLeadBuyerJourneyModel: { nextAction: { key: 'open_development' } }, selectedLeadLinkedTransactionId: '',
    getBuyerNextActionCompletion, setIsLeadDetailSaving: vi.fn(), setError: error, setMessage: message,
    fetchAgencyCrmLeadWorkspace: async () => ({ leads: [{ leadId: 'buyer' }], leadActivities: [] }),
    normalizeLeadIdentityKey: value => value, normalizeText: value => String(value || ''), normalizeKey: value => value,
    enrichDevelopmentBuyerLeads: enrich, isSupabaseConfigured: false, sellerUploadLeadRef: { current: 'buyer' },
    patchSelectedLeadRecord: vi.fn(), setRecords: vi.fn(), parseLeadRawEnquiryPayload: () => ({}), getBuyerSignedOtpDocuments: () => [],
    checkBuyerNextActionEvidence: check, setBuyerDocumentRefreshTick: vi.fn(),
  }
  const complete = new Function('context', `with (context) { ${source.slice(start, end)}; return handleVerifyBuyerNextActionCompletion; }`)(context)
  await complete()
  expect(enrich).toHaveBeenCalledWith('org', [{ leadId: 'buyer' }])
  if (reservationState === 'reserved') expect(message).toHaveBeenCalledWith('Action completed. The buyer journey has advanced to the next step.')
  else {
    expect(error).toHaveBeenCalledWith(expect.stringContaining('reservation'))
    expect(message).not.toHaveBeenCalledWith(expect.stringContaining('advanced'))
  }
})
