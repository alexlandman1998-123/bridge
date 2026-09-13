import { mergeResidentialOfferTermsIntoConditions } from '../core/offers/residentialOfferTerms.js'

function text(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function buildManualBuyerCapture({ draft = {}, mode = 'agent_assisted', now = new Date().toISOString() } = {}) {
  const captureSource = text(draft.manualCaptureSource).toLowerCase().replace(/[\s-]+/g, '_') || 'agent_meeting'
  const documentStatus = text(draft.manualDocumentStatus).toLowerCase().replace(/[\s-]+/g, '_') || 'not_received'
  return {
    mode: text(mode) || 'agent_assisted',
    captureSource,
    notes: text(draft.manualCaptureNotes),
    documentStatus,
    documentsRequireUpload: documentStatus === 'received_pending_upload',
    capturedAt: now,
  }
}

export function buildAgentAssistedOfferEntry({ buyer = {}, draft = {}, now = new Date().toISOString() } = {}) {
  const offerAmount = money(draft.offerAmount)
  const depositAmount = money(draft.depositAmount)
  const financeType = text(draft.financeType).toLowerCase() || 'cash'
  const manualCapture = buildManualBuyerCapture({ draft, mode: 'agent_assisted', now })
  const blockers = []
  if (!offerAmount) blockers.push('Enter the buyer’s offer amount before saving an agent-assisted offer.')
  const conditionsJson = mergeResidentialOfferTermsIntoConditions(
    {
      clientIntakePreference: 'agent_assisted',
      offerEntryMode: 'agent_assisted',
      agentAssisted: true,
      agentCapturedAt: now,
      manualBuyerCapture: manualCapture,
      buyerName: text(buyer.name),
      buyerEmail: text(buyer.email).toLowerCase(),
      buyerPhone: text(buyer.phone),
      specialConditions: text(draft.specialConditions),
    },
    {
      ...draft,
      fullName: text(buyer.name),
      email: text(buyer.email).toLowerCase(),
      phone: text(buyer.phone),
      offerAmount,
      depositAmount,
      financeType,
      specialConditions: text(draft.specialConditions),
    },
    {
      source: 'agent_assisted_offer_entry',
      captureMethod: 'agent_assisted',
      capturedAt: now,
      sourceContext: draft,
    },
  )

  return {
    ok: blockers.length === 0,
    blockers,
    payload: {
      offerAmount,
      depositAmount: depositAmount || null,
      financeType,
      conditionsJson,
    },
  }
}
