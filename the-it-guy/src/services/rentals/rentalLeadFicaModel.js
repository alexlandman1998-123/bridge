export const RENTAL_LEAD_FICA_VERSION = 'arch9_rental_lead_fica_v1'
export const RENTAL_LEAD_FICA_ITEMS = Object.freeze(['identity', 'proof_of_address', 'bank_details', 'source_of_funds'])
export const RENTAL_LEAD_FICA_STATUSES = Object.freeze(['not_requested', 'requested', 'received', 'verified', 'rejected'])

const text = (value) => String(value ?? '').trim()

export function createRentalLeadFicaChecklist(values = {}) {
  const source = values && typeof values === 'object' ? values : {}
  return Object.fromEntries(RENTAL_LEAD_FICA_ITEMS.map((item) => [item, RENTAL_LEAD_FICA_STATUSES.includes(text(source[item])) ? text(source[item]) : 'not_requested']))
}

export function getRentalLeadFicaReadiness(values = {}) {
  const checklist = createRentalLeadFicaChecklist(values)
  const verified = RENTAL_LEAD_FICA_ITEMS.filter((item) => checklist[item] === 'verified')
  const rejected = RENTAL_LEAD_FICA_ITEMS.filter((item) => checklist[item] === 'rejected')
  return { checklist, verified, rejected, complete: verified.length === RENTAL_LEAD_FICA_ITEMS.length && rejected.length === 0 }
}

export function assertRentalLeadFicaCompletion(values = {}, evidenceReference = '') {
  const readiness = getRentalLeadFicaReadiness(values)
  if (!readiness.complete) throw new Error('Every required FICA item must be verified before completion.')
  if (!text(evidenceReference)) throw new Error('A FICA evidence reference is required before completion.')
  return readiness
}
