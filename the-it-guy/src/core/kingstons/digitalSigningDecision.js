export const KINGSTONS_DIGITAL_SIGNING_DECISION_VERSION = 'kingstons_digital_signing_decision_phase8_v1'

export const KINGSTONS_DIGITAL_SIGNING_DECISION = Object.freeze({
  version: KINGSTONS_DIGITAL_SIGNING_DECISION_VERSION,
  status: 'paused',
  livePath: 'manual_seller_pack',
  label: '',
  reason: '',
  agentAction: '',
  nextDecision: '',
})

export function buildKingstonsDigitalSigningDecision({
  isKingstons = false,
  requestedAction = '',
} = {}) {
  if (!isKingstons) {
    return {
      version: KINGSTONS_DIGITAL_SIGNING_DECISION_VERSION,
      status: 'available',
      livePath: 'digital_or_physical',
      blocked: false,
      requestedAction,
      message: '',
    }
  }

  return {
    ...KINGSTONS_DIGITAL_SIGNING_DECISION,
    blocked: true,
    requestedAction,
    message: '',
  }
}

export function isKingstonsDigitalSigningPaused(context = {}) {
  return buildKingstonsDigitalSigningDecision(context).blocked === true
}
