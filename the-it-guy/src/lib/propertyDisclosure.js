export const PROPERTY_DISCLOSURE_DECISION = Object.freeze({
  none: 'none',
  disclose: 'disclose',
})

export const PROPERTY_DISCLOSURE_ANSWER = Object.freeze({
  yes: 'yes',
  no: 'no',
  unsure: 'unsure',
})

export const PROPERTY_DISCLOSURE_REVIEW_STATUS = Object.freeze({
  pendingSellerCompletion: 'pending_seller_completion',
  pendingReview: 'pending_review',
  reviewed: 'reviewed',
  requiresClarification: 'requires_clarification',
})

export const PROPERTY_DISCLOSURE_QUESTIONS = Object.freeze([
  {
    key: 'electrical_faults',
    number: 1,
    text: 'Are you aware of any electrical faults / problems regarding the electrical installation or appliances?',
  },
  {
    key: 'illegal_electrical_extensions',
    number: 2,
    text: 'Are there any illegal electrical extensions, or non-working points and has there been any disconnection or damage, to permanent fixtures / equipment? Eg stoves, oven, extractor fan, aircon, heaters, ceiling fans, light fixtures, water pumps etc...?',
  },
  {
    key: 'water_heater',
    number: 3,
    text: 'Are there any problems regarding the water heater for example: leaks, faulty gaskets, low pressure?',
  },
  {
    key: 'drainage_system',
    number: 4,
    text: 'Are there any problems with the drainage system e.g. clogged drainage pipes, drains, storm water drains or gutters?',
  },
  {
    key: 'leaking_taps_pipes',
    number: 5,
    text: 'Are there any leaking taps, pipes, burst pipes or water heating systems not working properly?',
  },
  {
    key: 'keys_to_all_doors',
    number: 6,
    text: 'Are there keys to all doors?',
  },
  {
    key: 'remote_controls',
    number: 7,
    text: 'How many remote controls exist for electronic gates and garage doors?',
    extraLabel: 'Provide quantity',
  },
  {
    key: 'security_systems',
    number: 8,
    text: 'Are all security systems in good working order e.g. alarms, burglar bars and security gates?',
  },
  {
    key: 'pool_equipment',
    number: 9,
    text: 'a) Is the pool pump, cleaning equipment and pipes in good working condition (general operation of equipment, pipes or filter, etc) b) Is there any damage to the fibreglass/marbelite and are there any cracks or loose tiles?',
  },
  {
    key: 'pool_repairs_six_months',
    number: 10,
    text: 'Were any repairs done to the items specified in 9 above, over the past six months?',
  },
  {
    key: 'rising_damp',
    number: 11,
    text: 'Is there any rising damp in walls in any of the rooms / buildings?',
  },
  {
    key: 'roof_leaks',
    number: 12,
    text: 'Are there any leaks in the roof?',
  },
  {
    key: 'sanitary_fittings',
    number: 13,
    text: 'Are there cracks, leaks or problems with bathtubs, sinks, toilets or showers?',
  },
  {
    key: 'tiles_floors',
    number: 14,
    text: 'Are there any cracked or broken tiles, damaged wooden floors?',
  },
  {
    key: 'structural_defects',
    number: 15,
    text: 'Are there any structural defects which you are aware of for example, cracks in walls or erosion etc?',
  },
  {
    key: 'carpet_damage',
    number: 16,
    text: 'Is there any damage to the carpets such as stains, burn marks, spots etc?',
  },
  {
    key: 'cupboards',
    number: 17,
    text: 'Are all cupboards in working order and acceptable condition?',
  },
  {
    key: 'door_window_locks',
    number: 18,
    text: 'Are all door handles, back doors and window locking systems in working order?',
  },
  {
    key: 'improvements_on_plans',
    number: 19,
    text: 'Are all the improvements carried out at the property reflected on the approved building plans?',
  },
  {
    key: 'approved_plans_possession',
    number: 20,
    text: 'Are you in possession of such approved building plans?',
  },
])

export const RESIDENTIAL_DISCLOSURE_CATEGORIES = Object.freeze([
  { key: 'structural', label: 'Structural', issueTypes: ['Structural defects', 'Cracks', 'Subsidence', 'Foundation issues'] },
  { key: 'roof_damp', label: 'Roof & Damp', issueTypes: ['Roof leaks', 'Water ingress', 'Damp problems'] },
  { key: 'plumbing', label: 'Plumbing', issueTypes: ['Plumbing defects', 'Drainage issues', 'Sewer problems'] },
  { key: 'electrical', label: 'Electrical', issueTypes: ['Electrical defects', 'Compliance concerns', 'Safety concerns'] },
  { key: 'alterations', label: 'Alterations', issueTypes: ['Unapproved alterations', 'Building plan discrepancies', 'Additions not approved'] },
  { key: 'boundaries', label: 'Boundaries', issueTypes: ['Boundary disputes', 'Encroachments', 'Neighbour disputes'] },
  { key: 'municipal', label: 'Municipal', issueTypes: ['Municipal disputes', 'Rates issues', 'Service issues'] },
  { key: 'security_access', label: 'Security & Access', issueTypes: ['Access disputes', 'Servitudes', 'Right-of-way issues'] },
  { key: 'other', label: 'Other', issueTypes: ['Other known issue'] },
])

export const COMMERCIAL_DISCLOSURE_CATEGORIES = Object.freeze([
  ...RESIDENTIAL_DISCLOSURE_CATEGORIES,
  { key: 'tenancies', label: 'Tenancies', issueTypes: ['Existing tenants', 'Tenant disputes', 'Rental arrears', 'Occupancy concerns'] },
  { key: 'leases', label: 'Leases', issueTypes: ['Lease disputes', 'Early termination issues', 'Lease obligations affecting sale'] },
  { key: 'zoning', label: 'Zoning', issueTypes: ['Zoning concerns', 'Consent use issues', 'Land use restrictions'] },
  { key: 'commercial_compliance', label: 'Compliance', issueTypes: ['Fire compliance concerns', 'Occupational health and safety concerns', 'Compliance certificates unavailable'] },
  { key: 'environmental', label: 'Environmental', issueTypes: ['Environmental risks', 'Contamination concerns', 'Hazardous material concerns'] },
  { key: 'property_operations', label: 'Property Operations', issueTypes: ['Building management disputes', 'Common area disputes', 'Body corporate disputes'] },
  { key: 'legal_matters', label: 'Legal Matters', issueTypes: ['Pending litigation', 'Legal notices', 'Municipal enforcement actions'] },
  { key: 'access_servitudes', label: 'Access & Servitudes', issueTypes: ['Servitude disputes', 'Access restrictions', 'Shared access concerns'] },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function hasText(value) {
  return normalizeText(value).length > 0
}

function normalizeAnswer(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(normalized)) return PROPERTY_DISCLOSURE_ANSWER.yes
  if (['no', 'n', 'false', '0'].includes(normalized)) return PROPERTY_DISCLOSURE_ANSWER.no
  if (['unsure', 'unknown', 'not_sure', 'not sure', 'uncertain'].includes(normalized)) return PROPERTY_DISCLOSURE_ANSWER.unsure
  return ''
}

function normalizeResponses(source = {}) {
  const responseSource =
    source.responses && typeof source.responses === 'object'
      ? source.responses
      : source.questionResponses && typeof source.questionResponses === 'object'
        ? source.questionResponses
        : source.annexureAResponses && typeof source.annexureAResponses === 'object'
          ? source.annexureAResponses
          : {}
  const responses = {}
  PROPERTY_DISCLOSURE_QUESTIONS.forEach((question) => {
    const byKey = responseSource[question.key]
    const byNumber = responseSource[String(question.number)] || responseSource[`q${question.number}`]
    const raw = byKey && typeof byKey === 'object' ? byKey.answer : byKey || (byNumber && typeof byNumber === 'object' ? byNumber.answer : byNumber)
    const answer = normalizeAnswer(raw)
    responses[question.key] = {
      answer,
      note: normalizeText(
        (byKey && typeof byKey === 'object' ? byKey.note || byKey.comment || byKey.comments : '') ||
          (byNumber && typeof byNumber === 'object' ? byNumber.note || byNumber.comment || byNumber.comments : ''),
      ),
    }
  })
  return responses
}

function deriveDecisionFromResponses(responses = {}) {
  const values = PROPERTY_DISCLOSURE_QUESTIONS.map((question) => responses?.[question.key]?.answer).filter(Boolean)
  if (!values.length) return ''
  return values.some((answer) => answer === PROPERTY_DISCLOSURE_ANSWER.yes || answer === PROPERTY_DISCLOSURE_ANSWER.unsure)
    ? PROPERTY_DISCLOSURE_DECISION.disclose
    : PROPERTY_DISCLOSURE_DECISION.none
}

function escapeHtml(value = '') {
  return normalizeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function createBlankDisclosureIssue(categoryKey = '') {
  return {
    id: `disclosure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryKey,
    issueType: '',
    description: '',
    dateFirstIdentified: '',
    currentStatus: '',
    supportingDocuments: '',
  }
}

export function getDisclosureCategories(kind = 'residential') {
  return kind === 'commercial' ? COMMERCIAL_DISCLOSURE_CATEGORIES : RESIDENTIAL_DISCLOSURE_CATEGORIES
}

export function normalizePropertyDisclosure(disclosure = {}, { kind = 'residential' } = {}) {
  const source = disclosure && typeof disclosure === 'object' ? disclosure : {}
  const categories = getDisclosureCategories(kind)
  const categoryKeys = new Set(categories.map((category) => category.key))
  const issues = Array.isArray(source.issues) ? source.issues : []
  const normalizedIssues = issues
    .filter((issue) => issue && typeof issue === 'object')
    .map((issue, index) => ({
      id: normalizeText(issue.id) || `disclosure-${index + 1}`,
      categoryKey: categoryKeys.has(normalizeText(issue.categoryKey || issue.category_key))
        ? normalizeText(issue.categoryKey || issue.category_key)
        : normalizeText(issue.categoryKey || issue.category_key),
      issueType: normalizeText(issue.issueType || issue.issue_type),
      description: normalizeText(issue.description),
      dateFirstIdentified: normalizeText(issue.dateFirstIdentified || issue.date_first_identified),
      currentStatus: normalizeText(issue.currentStatus || issue.current_status),
      supportingDocuments: normalizeText(issue.supportingDocuments || issue.supporting_documents),
    }))

  const decision = normalizeText(source.decision || source.hasKnownIssues || source.has_known_issues)
  const responses = normalizeResponses(source)
  const responseDecision = deriveDecisionFromResponses(responses)
  const normalizedDecision =
    decision === PROPERTY_DISCLOSURE_DECISION.none || decision === 'false' || decision === 'no'
      ? PROPERTY_DISCLOSURE_DECISION.none
      : decision === PROPERTY_DISCLOSURE_DECISION.disclose || decision === 'true' || decision === 'yes'
        ? PROPERTY_DISCLOSURE_DECISION.disclose
        : responseDecision

  return {
    version: normalizeText(source.version) || 'property_disclosure_annexure_a_2026_v1',
    kind,
    decision: normalizedDecision,
    responses,
    remoteControlsQuantity: normalizeText(source.remoteControlsQuantity || source.remote_controls_quantity),
    issues: normalizedIssues,
    otherDisclosure: normalizeText(source.otherDisclosure || source.other_disclosure || source.comments || source.commentary),
    comments: normalizeText(source.comments || source.commentary || source.otherDisclosure || source.other_disclosure),
    declarationAccepted: Boolean(source.declarationAccepted ?? source.declaration_accepted),
    signature: normalizeText(source.signature),
    signedAt: normalizeText(source.signedAt || source.signed_at),
    signedPlace: normalizeText(source.signedPlace || source.signed_place),
    sellerWitness1: normalizeText(source.sellerWitness1 || source.seller_witness_1),
    sellerWitness2: normalizeText(source.sellerWitness2 || source.seller_witness_2),
    purchaserSignature1: normalizeText(source.purchaserSignature1 || source.purchaser_signature_1),
    purchaserSignature2: normalizeText(source.purchaserSignature2 || source.purchaser_signature_2),
    purchaserSignedAt: normalizeText(source.purchaserSignedAt || source.purchaser_signed_at),
    purchaserSignedPlace: normalizeText(source.purchaserSignedPlace || source.purchaser_signed_place),
    purchaserWitness1: normalizeText(source.purchaserWitness1 || source.purchaser_witness_1),
    purchaserWitness2: normalizeText(source.purchaserWitness2 || source.purchaser_witness_2),
    uploadedDocumentReviewed: Boolean(source.uploadedDocumentReviewed ?? source.uploaded_document_reviewed),
    reviewedAt: normalizeText(source.reviewedAt || source.reviewed_at),
    reviewedBy: normalizeText(source.reviewedBy || source.reviewed_by),
    clarificationRequest: normalizeText(source.clarificationRequest || source.clarification_request),
    generatedDocument: source.generatedDocument && typeof source.generatedDocument === 'object' ? source.generatedDocument : null,
    lockedSnapshot: source.lockedSnapshot && typeof source.lockedSnapshot === 'object' ? source.lockedSnapshot : null,
  }
}

export function isPropertyDisclosureDigitallyComplete(disclosure = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  if (!normalized.declarationAccepted || !normalized.signature || !normalized.signedAt) return false
  const annexureResponsesComplete = PROPERTY_DISCLOSURE_QUESTIONS.every((question) => normalizeAnswer(normalized.responses?.[question.key]?.answer))
  if (annexureResponsesComplete) return true
  if (!normalized.decision) return false
  if (normalized.decision === PROPERTY_DISCLOSURE_DECISION.none) return true
  const issueComplete = normalized.issues.some((issue) =>
    hasText(issue.categoryKey) &&
    hasText(issue.issueType) &&
    hasText(issue.description) &&
    hasText(issue.dateFirstIdentified) &&
    hasText(issue.currentStatus),
  )
  return issueComplete || hasText(normalized.otherDisclosure)
}

export function getPropertyDisclosureStatus(disclosure = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  if (normalized.reviewedAt || normalized.reviewedBy) return PROPERTY_DISCLOSURE_REVIEW_STATUS.reviewed
  if (normalized.clarificationRequest) return PROPERTY_DISCLOSURE_REVIEW_STATUS.requiresClarification
  if (isPropertyDisclosureDigitallyComplete(normalized) || normalized.uploadedDocumentReviewed) {
    return PROPERTY_DISCLOSURE_REVIEW_STATUS.pendingReview
  }
  return PROPERTY_DISCLOSURE_REVIEW_STATUS.pendingSellerCompletion
}

export function getPropertyDisclosureStatusLabel(status = '') {
  const normalized = normalizeText(status)
  if (normalized === PROPERTY_DISCLOSURE_REVIEW_STATUS.reviewed) return 'Reviewed'
  if (normalized === PROPERTY_DISCLOSURE_REVIEW_STATUS.requiresClarification) return 'Requires Clarification'
  if (normalized === PROPERTY_DISCLOSURE_REVIEW_STATUS.pendingReview) return 'Pending Review'
  return 'Pending Seller Completion'
}

export function buildPropertyDisclosureDocument(disclosure = {}, context = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || context.kind || 'residential' })
  const annexureSnapshot = buildPropertyDisclosureAnnexureSnapshot(normalized, context)
  return {
    id: `property-disclosure-${normalizeText(context.listingId || context.propertyId || context.sellerId || 'draft')}`,
    type: 'property_disclosure',
    title: 'Declaration by Seller - Annexure A',
    annexure: 'Annexure A',
    status: isPropertyDisclosureDigitallyComplete(normalized) ? 'ready_for_generation' : 'incomplete',
    generatedAt: new Date().toISOString(),
    sellerId: normalizeText(context.sellerId),
    propertyId: normalizeText(context.propertyId),
    listingId: normalizeText(context.listingId),
    transactionId: normalizeText(context.transactionId),
    fileName: 'seller-disclosure-annexure-a.pdf',
    annexureSnapshot,
    disclosure: normalized,
  }
}

export function getPropertyDisclosureAnswerSummary(disclosure = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  const answers = PROPERTY_DISCLOSURE_QUESTIONS.map((question) => normalized.responses?.[question.key]?.answer).filter(Boolean)
  return {
    answered: answers.length,
    total: PROPERTY_DISCLOSURE_QUESTIONS.length,
    yes: answers.filter((answer) => answer === PROPERTY_DISCLOSURE_ANSWER.yes).length,
    no: answers.filter((answer) => answer === PROPERTY_DISCLOSURE_ANSWER.no).length,
    unsure: answers.filter((answer) => answer === PROPERTY_DISCLOSURE_ANSWER.unsure).length,
  }
}

export function buildPropertyDisclosureAnnexureSnapshot(disclosure = {}, context = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || context.kind || 'residential' })
  const summary = getPropertyDisclosureAnswerSummary(normalized)
  return {
    type: 'property_disclosure_annexure_a',
    title: 'Declaration by Seller - Annexure A',
    annexureLabel: 'Annexure A',
    version: normalized.version,
    status: isPropertyDisclosureDigitallyComplete(normalized) ? 'complete' : 'incomplete',
    generatedAt: normalizeText(context.generatedAt) || new Date().toISOString(),
    lockedAt: normalizeText(context.lockedAt),
    lockedByPacketId: normalizeText(context.lockedByPacketId),
    lockedByPacketVersionId: normalizeText(context.lockedByPacketVersionId),
    sellerId: normalizeText(context.sellerId),
    propertyId: normalizeText(context.propertyId),
    listingId: normalizeText(context.listingId),
    transactionId: normalizeText(context.transactionId),
    answers: PROPERTY_DISCLOSURE_QUESTIONS.map((question) => ({
      key: question.key,
      number: question.number,
      question: question.text,
      answer: normalized.responses?.[question.key]?.answer || '',
      note: normalized.responses?.[question.key]?.note || '',
      extraLabel: question.extraLabel || '',
      extraValue: question.key === 'remote_controls' ? normalized.remoteControlsQuantity : '',
    })),
    comments: normalized.comments || normalized.otherDisclosure,
    sellerSignature: normalized.signature,
    sellerSignedAt: normalized.signedAt,
    sellerSignedPlace: normalized.signedPlace,
    sellerWitness1: normalized.sellerWitness1,
    sellerWitness2: normalized.sellerWitness2,
    purchaserSignature1: normalized.purchaserSignature1,
    purchaserSignature2: normalized.purchaserSignature2,
    purchaserSignedAt: normalized.purchaserSignedAt,
    purchaserSignedPlace: normalized.purchaserSignedPlace,
    purchaserWitness1: normalized.purchaserWitness1,
    purchaserWitness2: normalized.purchaserWitness2,
    summary,
  }
}

export function buildPropertyDisclosureDocumentMarkup(disclosure = {}, context = {}) {
  const snapshot = buildPropertyDisclosureAnnexureSnapshot(disclosure, context)
  const sellerName = normalizeText(context.sellerName || snapshot.sellerSignature || 'Seller')
  const propertyAddress = normalizeText(context.propertyAddress)
  const year = normalizeText(snapshot.sellerSignedAt).slice(0, 4) || String(new Date().getFullYear())
  const answerCell = (answer, value) => (answer === value ? '&#10003;' : '')
  const renderRows = (items) => items.map((item) => `
    <tr>
      <td class="question"><span class="number">${item.number}</span> ${escapeHtml(item.question)}${item.extraLabel ? `<div class="extra">${escapeHtml(item.extraLabel)}: ${escapeHtml(item.extraValue)}</div>` : ''}</td>
      <td>${answerCell(item.answer, PROPERTY_DISCLOSURE_ANSWER.yes)}</td>
      <td>${answerCell(item.answer, PROPERTY_DISCLOSURE_ANSWER.no)}</td>
      <td>${answerCell(item.answer, PROPERTY_DISCLOSURE_ANSWER.unsure)}</td>
    </tr>
  `).join('')
  const pageOneRows = renderRows(snapshot.answers.filter((item) => Number(item.number) <= 17))
  const pageTwoRows = renderRows(snapshot.answers.filter((item) => Number(item.number) > 17))
  const comments = escapeHtml(snapshot.comments).replace(/\n/g, '<br />')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(snapshot.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 8.5in; min-height: 11in; margin: 0 auto 18px; padding: 0.72in 0.72in 0.45in; background: #fff; page-break-after: always; position: relative; }
    .page:last-child { page-break-after: auto; }
    h1 { margin: 0 0 24px; text-align: center; font-size: 19px; text-decoration: underline; }
    .intro { margin: 0 0 4px; font-size: 13px; line-height: 1.25; }
    .meta { margin: 0 0 10px; font-size: 11px; color: #222; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12.4px; }
    th, td { border: 1px solid #000; vertical-align: top; padding: 4px 6px; }
    th { background: #d9d9d9; text-align: center; font-weight: 700; }
    td:not(.question) { text-align: center; font-size: 14px; font-weight: 700; }
    .question { width: 74%; line-height: 1.22; }
    .number { display: inline-block; min-width: 18px; }
    .extra { margin-top: 5px; }
    .comments-title { font-weight: 700; }
    .comments-box { min-height: 145px; line-height: 1.35; }
    .signature-block { margin-top: 34px; font-size: 14px; }
    .line { display: inline-block; min-width: 185px; border-bottom: 1px solid #000; height: 18px; vertical-align: bottom; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 38px 72px; margin-top: 28px; align-items: end; }
    .signature-line { border-bottom: 1px solid #000; height: 22px; }
    .signature-label { margin-top: 3px; text-align: right; font-size: 13px; }
    .footer { position: absolute; left: 0.72in; right: 0.72in; bottom: 0.22in; text-align: center; font-size: 10px; line-height: 1.2; }
    .page-number { position: absolute; right: 0.72in; bottom: 0.39in; font-size: 11px; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <section class="page">
    <h1>DECLARATION BY SELLER - ANNEXURE A</h1>
    <p class="intro">This statement declares the actual current state of the property according to the best of my knowledge. I/ We declare that as far as we are concerned no material defects to the building or equipment exist except those as stated below.</p>
    <p class="intro">Please answer Yes or No, and where necessary provide an explanation in clause 21 hereunder:</p>
    ${propertyAddress ? `<p class="meta">Property: ${escapeHtml(propertyAddress)}</p>` : ''}
    <table>
      <thead><tr><th class="question"></th><th>YES</th><th>NO</th><th>UNSURE</th></tr></thead>
      <tbody>${pageOneRows}</tbody>
    </table>
    <div class="signature-block"><span class="line"></span><br /><strong style="float:right">Initial</strong></div>
    <div class="footer">Prepared by: Jan L Jordaan Inc.<br />Registration number: 2012/018715/21<br />Tel no: 011 748 4500, Physical Address: 1 Forster Street, Rynfield, Benoni</div>
    <div class="page-number">1</div>
  </section>
  <section class="page">
    <div style="text-align:right; margin-bottom:18px;">Page 2</div>
    <table>
      <thead><tr><th class="question"></th><th>YES</th><th>NO</th><th>UNSURE</th></tr></thead>
      <tbody>
        ${pageTwoRows}
        <tr><td class="comments-title" colspan="4">21 COMMENTS OR EXPLANATION FOR ANY OF THE ABOVE</td></tr>
        <tr><td class="comments-box" colspan="4">${comments || '&nbsp;'}</td></tr>
      </tbody>
    </table>
    <div class="signature-block">
      SIGNED AT <span class="line">${escapeHtml(snapshot.sellerSignedPlace)}</span> ON <span class="line">${escapeHtml(snapshot.sellerSignedAt)}</span> ${escapeHtml(year)}
      <p>As Witnesses:</p>
      <div class="signature-grid">
        <div>1. <span class="line">${escapeHtml(snapshot.sellerWitness1)}</span></div>
        <div><div class="signature-line">${escapeHtml(sellerName)}</div><div class="signature-label">SELLER</div></div>
        <div>2. <span class="line">${escapeHtml(snapshot.sellerWitness2)}</span></div>
        <div><div class="signature-line"></div><div class="signature-label">SELLER</div></div>
      </div>
    </div>
    <div class="signature-block">
      SIGNED AT <span class="line">${escapeHtml(snapshot.purchaserSignedPlace)}</span> ON <span class="line">${escapeHtml(snapshot.purchaserSignedAt)}</span> ${escapeHtml(year)}
      <p>As Witnesses:</p>
      <div class="signature-grid">
        <div>1. <span class="line">${escapeHtml(snapshot.purchaserWitness1)}</span></div>
        <div><div class="signature-line">${escapeHtml(snapshot.purchaserSignature1)}</div><div class="signature-label">PURCHASER</div></div>
        <div>2. <span class="line">${escapeHtml(snapshot.purchaserWitness2)}</span></div>
        <div><div class="signature-line">${escapeHtml(snapshot.purchaserSignature2)}</div><div class="signature-label">PURCHASER</div></div>
      </div>
    </div>
    <div class="footer">Prepared by: Jan L Jordaan Inc.<br />Registration number: 2012/018715/21<br />Tel no: 011 748 4500, Physical Address: 1 Forster Street, Rynfield, Benoni</div>
    <div class="page-number">2</div>
  </section>
</body>
</html>`
}
