const text = value => String(value || '').trim()
export const sastToday = (now = new Date()) => new Date(new Date(now).getTime() + 7200000).toISOString().slice(0, 10)
export function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

// The attorney records the payment event and directive terms; a sale or
// registration date alone does not establish when withholding occurred.
export function withholdingRemittanceIssues(review = {}, { now = new Date(), closing = false } = {}) {
  if (review.applicable !== 'yes' || review.withholdingRequired !== 'yes') return []
  if (text(review.paymentReference)) return [] // Retain previously recorded paid evidence.
  if (closing) return ['withholding remittance payment proof before financial close-out']
  const issues = []
  for (const [field, label] of [['reservedFundsReference', 'reserved withholding funds'], ['remittanceOwner', 'remittance owner'], ['paymentEvent', 'withholding payment event and directive terms']]) {
    if (!text(review[field])) issues.push(label)
  }
  if (!['planned', 'withheld'].includes(review.remittanceStatus)) issues.push('remittance status')
  if (!validReviewDate(review.dueOn) || review.dueOn <= sastToday(now)) issues.push('future remittance deadline or payment proof')
  if (review.remittanceStatus === 'withheld') {
    if (!validReviewDate(review.withheldOn) || review.withheldOn > sastToday(now)) issues.push('actual withholding date')
    if (!['resident', 'non_resident'].includes(review.purchaserResidence)) issues.push('purchaser tax residence for remittance')
    if (validReviewDate(review.withheldOn) && validReviewDate(review.dueOn) && ['resident', 'non_resident'].includes(review.purchaserResidence)) {
      const elapsed = (Date.parse(review.dueOn) - Date.parse(review.withheldOn)) / 86400000
      if (elapsed < 0 || elapsed > (review.purchaserResidence === 'resident' ? 14 : 28)) issues.push('deadline within the applicable remittance period')
    }
  }
  return issues
}

export function electricalNotApplicable(conditions = {}) {
  return conditions.certificates?.electrical === 'no' && Boolean(text(conditions.electricalBasisNote))
}

export function sellerWithholdingReviewIssues(review = {}, options = {}) {
  const issues = []
  if (!['yes', 'no'].includes(review.applicable) || !text(review.basisNote)) issues.push('current seller-specific withholding applicability and basis')
  if (review.applicable === 'yes') {
    if (!['issued', 'not_required'].includes(review.directiveStatus) || !['yes', 'no'].includes(review.withholdingRequired) || !text(review.proofReference) ||
      (review.directiveStatus === 'issued' && !text(review.directiveReference))) issues.push('current seller-specific directive, withholding and evidence decision')
    issues.push(...withholdingRemittanceIssues(review, options))
  }
  return issues
}

const field = (key, label, type = 'text', options) => ({ key, label, type, options })
export const AGREEMENT_CONDITION_REGISTER = {
  label: 'Agreement conditions and material payment dates',
  help: 'Add only applicable conditions. Record amendments, the responsible person and evidence of fulfilment, a valid waiver or payment security. An extension alone does not fulfil a suspensive condition.',
  fields: [field('description', 'Condition / obligation'), field('kind', 'Kind', 'select', ['suspensive', 'payment', 'other']),
    field('deadline', 'Deadline (where specified)', 'date'), field('owner', 'Responsible person'),
    field('status', 'Decision', 'select', ['pending', 'fulfilled', 'waived', 'secured', 'extended', 'not_applicable']),
    field('evidenceReference', 'Evidence / amendment reference'), field('basisNote', 'Attorney decision and authority')],
}
export const SECURITY_ACCOUNT_REGISTER = {
  label: 'Registered securities and settlement accounts',
  help: 'One row per registered bond and linked loan account. Repeat the bond reference for additional accounts. Include paid-up registered bonds. Confirm the list against the title search; a specialist instrument must remain on hold until reviewed.',
  fields: [field('bondReference', 'Registered bond reference'), field('property', 'Affected property / share'),
    field('lender', 'Bondholder / lender'), field('account', 'Loan account / no account basis'), field('owner', 'Responsible attorney'),
    field('disposition', 'Instrument', 'select', ['cancellation', 'release', 'substitution', 'specialist_hold']),
    field('instrumentReference', 'Reviewed instrument / authority reference'), field('figuresReference', 'Current figures reference'),
    field('validUntil', 'Figures usable before', 'date'), field('consentReference', 'Bondholder consent reference'),
    field('settlementAmount', 'Settlement amount (R)', 'number'), field('allocatedAmount', 'Funds / guarantees allocated (R)', 'number'),
    field('allocationReference', 'Allocation and shortfall resolution evidence')],
}
export const SETTLEMENT_REGISTER = {
  label: 'Settlement and registration evidence by security account',
  help: 'Use the same bond and account references as the settlement allocation record. Keep registration and payment evidence separate, including a reason where no payment is due.',
  fields: [field('bondReference', 'Registered bond reference'), field('account', 'Loan account / no account basis'),
    field('registrationReference', 'Registration / release reference'), field('settlementReference', 'Payment / zero balance reconciliation reference')],
}
export const COMMUNICATION_REGISTER = {
  label: 'Registration communication record',
  help: 'Record an already sent communication. Identify all appropriate recipients; financial records stay private. This saves evidence and does not send a message.',
  fields: [field('channel', 'Channel', 'select', ['email', 'letter', 'phone', 'meeting', 'portal', 'other']),
    field('sentOn', 'Communicated on', 'date'), field('audience', 'Audience', 'select', ['buyer', 'seller', 'both']),
    field('recipients', 'Recipients / agreed audience'), field('reference', 'Evidence reference')],
}

export function agreementConditionIssues(response = {}, now = new Date()) {
  if (response.answer === 'not_applicable' && text(response.note) && !(response.items || []).length) return []
  if (response.answer !== 'yes' || !(response.items || []).length) return ['Review agreement conditions or record why none apply.']
  return response.items.flatMap((row, i) => {
    const prefix = `Agreement item ${i + 1}`
    const complete = ['description', 'owner', 'evidenceReference', 'basisNote'].every(key => text(row[key])) &&
      ['suspensive', 'payment', 'other'].includes(row.kind) && (!text(row.deadline) || validReviewDate(row.deadline))
    const resolved = ['fulfilled', 'waived', 'not_applicable'].includes(row.status) ||
      (row.kind === 'payment' && row.status === 'secured' && validReviewDate(row.deadline) && row.deadline > sastToday(now))
    return complete && resolved ? [] : [`${prefix}: current decision, owner, deadline and supporting evidence are required.`]
  })
}

export function securityAccountIssues(response = {}, now = new Date()) {
  if (response.answer !== 'yes' || !(response.items || []).length) return ['Review every registered security and settlement account.']
  const identities = new Set()
  return response.items.flatMap((row, i) => {
    const identity = `${text(row.bondReference)}:${text(row.account)}`
    const duplicate = identities.has(identity); identities.add(identity)
    const complete = ['bondReference', 'property', 'lender', 'account', 'owner', 'instrumentReference', 'figuresReference', 'consentReference', 'allocationReference'].every(key => text(row[key])) &&
      ['cancellation', 'release', 'substitution'].includes(row.disposition) && validReviewDate(row.validUntil) && row.validUntil > sastToday(now) &&
      /^\d+(\.\d{1,2})?$/.test(row.settlementAmount || '') && /^\d+(\.\d{1,2})?$/.test(row.allocatedAmount || '') &&
      Number(row.allocatedAmount) >= Number(row.settlementAmount)
    return complete && !duplicate ? [] : [`Security account ${i + 1}: resolve the instrument, current figures, consent and full allocation; avoid duplicate accounts.`]
  })
}

export function cancellationSignatureIssues(task = {}) {
  const review = task.taskConfirmations?.seller_signature_applicability || task.task_confirmations?.seller_signature_applicability || {}
  if (!['yes', 'no'].includes(review.answer) || !text(review.note)) return ['Record whether seller signatures are required, with the lender / instrument basis.']
  if (review.answer === 'yes' && task.status !== 'completed') return ['Complete the required seller signing review.']
  if (review.answer === 'no' && !['completed', 'not_applicable'].includes(task.status)) return ['Record the reviewed not-applicable seller signature outcome.']
  return []
}
