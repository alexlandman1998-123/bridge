import { mergeResidentialOfferTermsIntoConditions } from '../core/offers/residentialOfferTerms.js'

function text(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function buildAgentAssistedOfferEntry({ buyer = {}, draft = {}, now = new Date().toISOString() } = {}) {
  const offerAmount = money(draft.offerAmount)
  const depositAmount = money(draft.depositAmount)
  const financeType = text(draft.financeType).toLowerCase() || 'cash'
  const blockers = []
  if (!offerAmount) blockers.push('Enter the buyer’s offer amount before saving an agent-assisted offer.')
  const conditionsJson = mergeResidentialOfferTermsIntoConditions(
    {
      clientIntakePreference: 'agent_assisted',
      offerEntryMode: 'agent_assisted',
      agentAssisted: true,
      agentCapturedAt: now,
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
