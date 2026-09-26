const key = (value) => String(value || '').trim().toLowerCase()
const sellers = (scenarioProfile) => (Array.isArray(scenarioProfile?.parties) ? scenarioProfile.parties : [])
  .filter((party) => party?.role === 'seller')

export const PHASE4_TAX_TASKS = Object.freeze([
  'transfer_tax_route_confirmed', 'transfer_duty_tdc01_submission', 'sars_evidence_request_response',
  'transfer_duty_assessment_payment', 'vat_exemption_evidence_verified',
  'ordinary_vat_basis_verified', 'going_concern_zero_rate_verified', 'transfer_duty_exemption_basis_verified',
  'non_resident_seller_withholding_review', 'non_resident_seller_applicability_review',
  'non_resident_seller_directive_review', 'non_resident_seller_withholding_payment_review',
  'sars_transfer_tax_receipt_verified',
])

export const PHASE4_PROPERTY_TASKS = Object.freeze([
  'municipal_rates_clearance_review', 'levy_hoa_clearance_review',
  'body_corporate_levy_clearance_review', 'hoa_clearance_review',
  'property_conditions_applicability_review', 'title_conditions_review', 'property_compliance_review',
])

export function phase4TaxTaskKeys(decision = {}, scenarioProfile = {}) {
  const tasks = ['transfer_tax_route_confirmed']
  if (decision.route === 'transfer_duty') {
    tasks.push('transfer_duty_tdc01_submission')
    if (key(decision.dutyPaymentRequired) === 'yes') tasks.push('transfer_duty_assessment_payment')
  } else if (decision.route === 'vat') tasks.push('ordinary_vat_basis_verified')
  else if (decision.route === 'zero_rated_going_concern') tasks.push('going_concern_zero_rate_verified')
  else if (decision.route === 'exempt') tasks.push('transfer_duty_exemption_basis_verified')
  if (key(decision.sarsEvidenceRequest) === 'yes' || key(decision.sarsStatus) === 'query') tasks.push('sars_evidence_request_response')
  const potential = sellers(scenarioProfile).filter((party) => party.taxResidence !== 'south_africa')
  if (potential.length || key(decision.sellerNonResidentReview) === 'yes') {
    tasks.push('non_resident_seller_applicability_review')
    if (potential.some((party) => key(decision.nonResidentSellers?.[party.id]?.directiveStatus) === 'issued')) {
      tasks.push('non_resident_seller_directive_review')
    }
    if (potential.some((party) => key(decision.nonResidentSellers?.[party.id]?.withholdingRequired) === 'yes') ||
      key(decision.sellerNonResidentReview) === 'yes') {
      tasks.push('non_resident_seller_withholding_payment_review')
    }
  }
  tasks.push('sars_transfer_tax_receipt_verified')
  return tasks
}

export function phase4PropertyTaskKeys(profile = {}) {
  const tenure = key(profile.propertyTenure)
  const hoa = key(profile.hoaApplicable)
  const conditions = profile.propertyConditions || profile.mvpProfile?.propertyConditions || {}
  const tasks = ['municipal_rates_clearance_review', 'property_conditions_applicability_review']
  if (tenure === 'sectional_title') tasks.push('body_corporate_levy_clearance_review')
  if (tenure === 'estate_hoa' || hoa === 'yes') tasks.push('hoa_clearance_review')
  if (conditions.titleRestrictions !== 'no') tasks.push('title_conditions_review')
  if (conditions.complianceCertificates !== 'no') tasks.push('property_compliance_review')
  return tasks
}

export function phase4DecisionIssues(decision = {}, scenarioProfile = {}, propertyConditions = null, profile = {}) {
  const issues = []
  const requireText = (field, label) => { if (!String(decision[field] || '').trim()) issues.push(label) }
  if (decision.route === 'transfer_duty') {
    requireText('tdc01Reference', 'TDC01 submission reference')
    if (!['yes', 'no'].includes(decision.dutyPaymentRequired)) issues.push('duty payment applicability')
    if (decision.dutyPaymentRequired === 'yes') {
      requireText('assessmentReference', 'SARS assessment reference')
      requireText('paymentReference', 'duty payment proof')
    }
  } else if (decision.route === 'vat' || decision.route === 'zero_rated_going_concern') {
    if (decision.sellerVatRegistered !== 'yes' || decision.supplyInCourseOfEnterprise !== 'yes') issues.push('VAT vendor and enterprise basis')
    requireText('sellerVatNumberReference', 'seller VAT evidence')
    if (decision.route === 'zero_rated_going_concern') {
      if (decision.buyerVatRegistered !== 'yes') issues.push('buyer VAT vendor status for going concern')
      requireText('buyerVatNumberReference', 'buyer VAT evidence')
      requireText('goingConcernAgreementReference', 'going-concern agreement evidence')
    }
  } else if (decision.route === 'exempt') {
    const claims = Array.isArray(decision.exemptionClaims) ? decision.exemptionClaims : []
    if (!claims.some((claim) => claim.applicable === 'yes')) issues.push('at least one applicable statutory exemption')
    claims.forEach((claim, index) => {
      if (!['yes', 'no'].includes(claim.applicable)) issues.push(`exemption ${index + 1}: applicability`)
      if (!String(claim.statutoryBasis || '').trim()) issues.push(`exemption ${index + 1}: statutory basis`)
      if (!String(claim.appliesTo || '').trim()) issues.push(`exemption ${index + 1}: person or share covered`)
      if (claim.applicable === 'yes' && !String(claim.evidenceReference || '').trim()) issues.push(`exemption ${index + 1}: proof`)
      if (!String(claim.basisNote || '').trim()) issues.push(`exemption ${index + 1}: attorney decision`)
    })
  } else issues.push('confirmed tax route')
  requireText('basisNote', 'attorney tax basis')
  requireText('sarsProofReference', 'SARS receipt or exemption proof')
  if (decision.sarsStatus !== 'receipted') issues.push('SARS receipt status')
  if (decision.sarsEvidenceRequest === 'yes' || decision.sarsStatus === 'query') requireText('sarsQueryResponseReference', 'SARS query response')
  if (decision.sellerNonResidentReview === 'yes' && sellers(scenarioProfile).length === 0) issues.push('seller-by-seller tax residence facts')
  for (const party of sellers(scenarioProfile).filter((item) => item.taxResidence !== 'south_africa')) {
    const review = decision.nonResidentSellers?.[party.id] || {}
    const label = party.name || party.id
    if (!['yes', 'no'].includes(review.applicable)) issues.push(`${label}: non-resident withholding applicability`)
    if (!String(review.basisNote || '').trim()) issues.push(`${label}: seller-specific withholding basis`)
    if (review.applicable === 'yes') {
      if (!['issued', 'not_required'].includes(review.directiveStatus)) issues.push(`${label}: directive decision`)
      if (review.directiveStatus === 'issued' && !String(review.directiveReference || '').trim()) issues.push(`${label}: directive proof`)
      if (!['yes', 'no'].includes(review.withholdingRequired)) issues.push(`${label}: withholding decision`)
      if (review.withholdingRequired === 'yes' && !String(review.paymentReference || '').trim()) issues.push(`${label}: withholding payment proof`)
      if (!String(review.proofReference || '').trim()) issues.push(`${label}: non-resident review evidence`)
    }
  }
  if (propertyConditions) {
    if (!['yes', 'no'].includes(profile.hoaApplicable)) issues.push('HOA applicability')
    const clearance = propertyConditions.clearances || {}
    for (const type of ['municipal', ...(profile.propertyTenure === 'sectional_title' ? ['bodyCorporate'] : []),
      ...(['estate_hoa'].includes(profile.propertyTenure) || profile.hoaApplicable === 'yes' ? ['hoa'] : [])]) {
      const item = clearance[type] || {}
      if (!String(item.issuer || '').trim()) issues.push(`${type} clearance issuer`)
      if (!item.validUntil || Number.isNaN(Date.parse(item.validUntil)) || Date.parse(item.validUntil) <= Date.now()) issues.push(`${type} clearance validity`)
    }
    if (!['yes', 'no'].includes(propertyConditions.titleRestrictions)) issues.push('title conditions applicability')
    if (!['yes', 'no'].includes(propertyConditions.complianceCertificates)) issues.push('compliance certificate applicability')
    if (propertyConditions.titleRestrictions === 'yes' && !String(propertyConditions.titleConditionsReference || '').trim()) issues.push('title condition evidence')
    if (propertyConditions.complianceCertificates === 'yes') {
      // Electrical proof remains a baseline canonical lodgement blocker.
      for (const type of ['gas', 'electricFence', 'beetle']) {
        if (!['yes', 'no'].includes(propertyConditions.certificates?.[type])) issues.push(`${type} certificate applicability`)
      }
    }
  }
  return issues
}
