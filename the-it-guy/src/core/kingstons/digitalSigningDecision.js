import { DOCUMENT_GENERATOR_RETIRED_MESSAGE } from '../documents/documentGeneratorRetirement.js'
export const KINGSTONS_DIGITAL_SIGNING_DECISION_VERSION = 'kingstons_digital_signing_decision_phase8_v1'

export const KINGSTONS_DIGITAL_SIGNING_DECISION = Object.freeze({
  version: KINGSTONS_DIGITAL_SIGNING_DECISION_VERSION,
  status: 'retired',
  livePath: 'manual_seller_pack',
  label: '',
  reason: '',
  agentAction: '',
  nextDecision: '',
})

export function buildKingstonsDigitalSigningDecision({
  requestedAction = '',
} = {}) {
  return {
    ...KINGSTONS_DIGITAL_SIGNING_DECISION,
    blocked: true,
    requestedAction,
    digitalOtpEnabled: false,
    message: DOCUMENT_GENERATOR_RETIRED_MESSAGE,
  }
}

export function isKingstonsDigitalSigningPaused(context = {}) {
  return buildKingstonsDigitalSigningDecision(context).blocked === true
}
