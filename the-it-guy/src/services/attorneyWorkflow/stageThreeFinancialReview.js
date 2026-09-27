import { PHASE4_PROPERTY_TASKS, PHASE4_TAX_TASKS, phase4PropertyTaskKeys, phase4TaxTaskKeys, isClearanceValidUntil, isMunicipalClearanceValidUntil } from './transferPhase4Policy.js'
import { resolveTransferTaxDecision } from '../transferTaxDecisionService.js'

const ROUTE_LABELS = {
  transfer_duty: 'Transfer duty', vat: 'Ordinary VAT',
  zero_rated_going_concern: 'Zero-rated going concern', exempt: 'Statutory exemption',
  needs_tax_advice: 'Tax advice needed',
}
const CLEARANCE_TYPES = {
  municipal_rates_clearance_review: ['municipal', 'Municipal rates'],
  body_corporate_levy_clearance_review: ['bodyCorporate', 'Body corporate'],
  hoa_clearance_review: ['hoa', 'HOA'],
}
const TAX_ROUTE_TASKS = {
  transfer_duty: 'transfer_duty_tdc01_submission',
  vat: 'ordinary_vat_basis_verified',
  zero_rated_going_concern: 'going_concern_zero_rate_verified',
  exempt: 'transfer_duty_exemption_basis_verified',
}
const labelValue = (value) => String(value || '').trim()

function check(label, value, { required = true, valid = true, missingLabel = 'Missing', invalidState = 'attention' } = {}) {
  const present = Boolean(labelValue(value))
  return { label, value: present ? labelValue(value) : missingLabel, state: !required ? 'not_applicable' : !present ? 'missing' : valid ? 'ready' : invalidState }
}

function answerCheck(label, value, expected = null) {
  const known = ['yes', 'no'].includes(value)
  return check(label, known ? (value === 'yes' ? 'Yes' : 'No') : '', { valid: !expected || value === expected })
}

function clearanceChecks(type, label, conditions, now) {
  const clearance = conditions.clearances?.[type] || {}
  const dateCurrent = isClearanceValidUntil(clearance.validUntil, now)
  return [
    check(`${label} issuer`, clearance.issuer),
    check(`${label} certificate reference`, clearance.reference || clearance.certificateReference),
    ...(type === 'municipal' && clearance.issuedOn ? [check(`${label} issued on`, clearance.issuedOn)] : []),
    check(`${label} valid until`, clearance.validUntil, {
      valid: type === 'municipal' ? isMunicipalClearanceValidUntil(clearance, now) : dateCurrent,
      missingLabel: 'Date missing', invalidState: dateCurrent ? 'attention' : 'expired',
    }),
  ]
}

export function buildStageThreeFinancialReview({ taskKey = '', routingProfile = {}, now = new Date() } = {}) {
  if (![...PHASE4_TAX_TASKS, ...PHASE4_PROPERTY_TASKS].includes(taskKey)) return null
  const decision = resolveTransferTaxDecision(routingProfile.transferTaxDecision)
  const conditions = routingProfile.propertyConditions || routingProfile.mvpProfile?.propertyConditions || {}
  const scenarioProfile = routingProfile.scenarioProfile || {}
  const route = labelValue(decision.route) || 'needs_tax_advice'
  const tenure = labelValue(routingProfile.propertyTenure) || 'unknown'
  const hoa = labelValue(routingProfile.hoaApplicable || routingProfile.mvpProfile?.hoaApplicable) || 'unknown'
  const applicableTax = phase4TaxTaskKeys(decision, scenarioProfile)
  const applicableProperty = phase4PropertyTaskKeys({ ...routingProfile, propertyConditions: conditions, hoaApplicable: hoa })
  const legacyApplicable = taskKey === 'vat_exemption_evidence_verified'
    ? ['vat', 'zero_rated_going_concern', 'exempt'].includes(route)
    : taskKey === 'levy_hoa_clearance_review' && (tenure === 'sectional_title' || tenure === 'estate_hoa' || hoa === 'yes')
  const applicable = applicableTax.includes(taskKey) || applicableProperty.includes(taskKey) || legacyApplicable
  const checks = []
  const add = (...items) => checks.push(...items)
  if (taskKey === 'transfer_tax_route_confirmed') {
    add(check('Confirmed tax route', route === 'needs_tax_advice' ? '' : ROUTE_LABELS[route] || route))
    add(check('Attorney route confirmation', decision.status === 'confirmed' ? 'Confirmed' : ''))
    add(check('Attorney tax basis', decision.basisNote))
  } else if (taskKey === 'transfer_duty_tdc01_submission') {
    add(check('TDC01 submission reference', decision.tdc01Reference))
  } else if (taskKey === 'transfer_duty_assessment_payment') {
    add(check('SARS assessment reference', decision.assessmentReference))
    add(check('Duty payment proof', decision.paymentReference))
  } else if (['ordinary_vat_basis_verified', 'going_concern_zero_rate_verified', 'vat_exemption_evidence_verified'].includes(taskKey)) {
    add(answerCheck('Seller VAT registered', decision.sellerVatRegistered, 'yes'))
    add(check('Seller VAT evidence reference', decision.sellerVatNumberReference))
    add(answerCheck('Enterprise supply', decision.supplyInCourseOfEnterprise, 'yes'))
    if (route === 'zero_rated_going_concern') {
      add(answerCheck('Buyer VAT registered', decision.buyerVatRegistered, 'yes'))
      add(check('Buyer VAT evidence reference', decision.buyerVatNumberReference))
      add(check('Written going-concern agreement', decision.goingConcernAgreementReference))
    }
  } else if (taskKey === 'transfer_duty_exemption_basis_verified') {
    const claims = Array.isArray(decision.exemptionClaims) ? decision.exemptionClaims : []
    add(check('Applicable statutory exemption', claims.some((claim) => claim.applicable === 'yes') ? 'Recorded' : ''))
    claims.filter((claim) => claim.applicable === 'yes').forEach((claim, index) => {
      add(check(`Exemption ${index + 1} statutory basis`, claim.statutoryBasis))
      add(check(`Exemption ${index + 1} person or share`, claim.appliesTo))
      add(check(`Exemption ${index + 1} proof`, claim.evidenceReference))
    })
  } else if (taskKey === 'sars_evidence_request_response') {
    add(check('SARS query response reference', decision.sarsQueryResponseReference))
  } else if (taskKey === 'sars_transfer_tax_receipt_verified') {
    add(check('SARS receipt or exemption proof', decision.sarsProofReference))
    add(check('SARS receipt status', decision.sarsStatus === 'receipted' ? 'Receipt verified' : '', { missingLabel: 'Not yet receipted' }))
  } else if (taskKey.startsWith('non_resident_seller_')) {
    const sellers = (scenarioProfile.parties || []).filter((party) => party.role === 'seller' && party.taxResidence !== 'south_africa')
    add(check('Potentially non-resident sellers', sellers.length ? `${sellers.length} to review` : ''))
    sellers.forEach((seller) => {
      const review = decision.nonResidentSellers?.[seller.id] || {}
      const name = seller.name || seller.id
      add(answerCheck(`${name}: withholding applies`, review.applicable))
      add(check(`${name}: seller-specific basis`, review.basisNote))
      if (review.applicable === 'yes') {
        add(check(`${name}: review evidence`, review.proofReference))
        if (taskKey === 'non_resident_seller_directive_review' || review.directiveStatus === 'issued')
          add(check(`${name}: directive reference`, review.directiveReference))
        if (taskKey === 'non_resident_seller_withholding_payment_review' || review.withholdingRequired === 'yes')
          add(check(`${name}: payment proof`, review.paymentReference))
      }
    })
  } else if (CLEARANCE_TYPES[taskKey]) {
    const [type, label] = CLEARANCE_TYPES[taskKey]
    add(...clearanceChecks(type, label, conditions, now))
  } else if (taskKey === 'levy_hoa_clearance_review') {
    if (tenure === 'sectional_title') add(...clearanceChecks('bodyCorporate', 'Body corporate', conditions, now))
    if (tenure === 'estate_hoa' || hoa === 'yes') add(...clearanceChecks('hoa', 'HOA', conditions, now))
  } else if (taskKey === 'property_conditions_applicability_review') {
    add(answerCheck('HOA applies', hoa))
    add(answerCheck('Title restrictions apply', conditions.titleRestrictions))
    add(answerCheck('Additional certificates apply', conditions.complianceCertificates))
  } else if (taskKey === 'title_conditions_review') {
    add(check('Title-condition evidence reference', conditions.titleConditionsReference))
  } else if (taskKey === 'property_compliance_review') {
    add(answerCheck('Additional certificates apply', conditions.complianceCertificates))
    if (conditions.complianceCertificates === 'yes') {
      for (const [type, label] of [['gas', 'Gas'], ['electricFence', 'Electric fence'], ['beetle', 'Beetle / wood-borer']])
        add(answerCheck(`${label} certificate applies`, conditions.certificates?.[type]))
    }
  }
  const alternativeRoutes = Object.entries(TAX_ROUTE_TASKS)
    .filter(([candidate]) => route !== 'needs_tax_advice' && candidate !== route)
    .map(([candidate]) => ROUTE_LABELS[candidate])
  const notApplicable = [
    ...alternativeRoutes,
    ...(tenure !== 'unknown' && tenure !== 'sectional_title' ? ['Body-corporate clearance'] : []),
    ...(tenure !== 'estate_hoa' && hoa === 'no' ? ['HOA clearance'] : []),
    ...(conditions.titleRestrictions === 'no' ? ['Title-condition review'] : []),
    ...(conditions.complianceCertificates === 'no' ? ['Additional compliance certificates'] : []),
  ]
  return {
    applicable,
    route: ROUTE_LABELS[route] || 'Tax advice needed',
    property: tenure.replaceAll('_', ' '),
    checks,
    missing: checks.filter((item) => item.state !== 'ready').length,
    notApplicable,
    unknownRoute: route === 'needs_tax_advice',
    routeUnconfirmed: decision.status !== 'confirmed',
  }
}
