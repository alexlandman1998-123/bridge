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

  return {
    ok: blockers.length === 0,
    blockers,
    payload: {
      offerAmount,
      depositAmount: depositAmount || null,
      financeType,
      conditionsJson: {
        clientIntakePreference: 'agent_assisted',
        offerEntryMode: 'agent_assisted',
        agentAssisted: true,
        agentCapturedAt: now,
        buyerName: text(buyer.name),
        buyerEmail: text(buyer.email).toLowerCase(),
        buyerPhone: text(buyer.phone),
        specialConditions: text(draft.specialConditions),
      },
    },
  }
}
