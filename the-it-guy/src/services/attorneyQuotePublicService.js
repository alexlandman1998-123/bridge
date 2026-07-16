import { assertEdgeFunctionSuccess, invokeEdgeFunction } from '../lib/supabaseClient.js'

export const ATTORNEY_QUOTE_DECISION_FUNCTION = 'attorney-quote-decision'

function normalizeText(value = '', maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function sanitizeColour(value, fallback) {
  const colour = normalizeText(value, 20)
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback
}

export function normalizeAttorneyPublicQuote(value) {
  const row = value && typeof value === 'object' ? value : {}
  return {
    state: ['active', 'accepted', 'declined'].includes(row.state) ? row.state : 'unavailable',
    firmName: normalizeText(row.firm_name, 180) || 'Your conveyancing team',
    logoUrl: normalizeText(row.logo_url, 2000),
    primaryColour: sanitizeColour(row.primary_colour, '#173f45'),
    secondaryColour: sanitizeColour(row.secondary_colour, '#d3a866'),
    contactEmail: normalizeText(row.contact_email, 254),
    contactPhone: normalizeText(row.contact_phone, 50),
    clientFirstName: normalizeText(row.client_first_name, 120),
    serviceType: normalizeText(row.service_type, 80),
    quoteNumber: normalizeText(row.quote_number, 40),
    versionNumber: Number(row.version_number || 1),
    currency: normalizeText(row.currency, 3) || 'ZAR',
    professionalFee: Number(row.professional_fee || 0),
    vatAmount: Number(row.vat_amount || 0),
    disbursements: Number(row.disbursements || 0),
    totalAmount: Number(row.total_amount || 0),
    validUntil: row.valid_until || null,
    decisionReason: normalizeText(row.decision_reason, 1000),
  }
}

export async function resolveAttorneyPublicQuote(token) {
  const scopedToken = normalizeText(token, 64).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(scopedToken)) throw new Error('This quote link is unavailable.')
  const result = await invokeEdgeFunction(ATTORNEY_QUOTE_DECISION_FUNCTION, {
    body: { action: 'resolve', token: scopedToken },
  })
  assertEdgeFunctionSuccess(result, 'We could not load this quote right now.')
  return normalizeAttorneyPublicQuote(result.data?.quote)
}

export async function decideAttorneyPublicQuote({ token, decision, reason = '' } = {}) {
  const scopedToken = normalizeText(token, 64).toLowerCase()
  const scopedDecision = normalizeText(decision, 20).toLowerCase()
  const scopedReason = normalizeText(reason, 1000)
  if (!/^[0-9a-f]{64}$/.test(scopedToken)) throw new Error('This quote link is unavailable.')
  if (!['accepted', 'declined'].includes(scopedDecision)) throw new Error('Choose a valid quote decision.')
  if (scopedDecision === 'declined' && !scopedReason) throw new Error('Please add a reason before declining.')
  const result = await invokeEdgeFunction(ATTORNEY_QUOTE_DECISION_FUNCTION, {
    body: { action: 'decide', token: scopedToken, decision: scopedDecision, reason: scopedReason || null },
  })
  assertEdgeFunctionSuccess(result, 'We could not record your quote decision right now.')
  return { accepted: result.data?.accepted === true, state: normalizeText(result.data?.state, 20) }
}
