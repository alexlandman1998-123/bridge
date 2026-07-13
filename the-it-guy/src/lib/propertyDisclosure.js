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

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function isImageSignature(value = '') {
  return /^data:image\//i.test(normalizeText(value))
}

function resolveDocumentAssetUrl(value = '', assetBaseUrl = '') {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  const path = raw.startsWith('/') ? raw : `/${raw}`
  const base = normalizeText(assetBaseUrl).replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

function resolvePropertyDisclosureBranding(context = {}) {
  const branding = context.branding && typeof context.branding === 'object' ? context.branding : {}
  const organisationName = firstNonEmpty(
    branding.organisationName,
    branding.organisation_name,
    branding.agencyName,
    branding.agency_name,
    branding.name,
    context.organisationName,
    context.agencyName,
    'Agency Workspace',
  )
  const agencyLogoUrl = resolveDocumentAssetUrl(
    firstNonEmpty(
      branding.logoLightUrl,
      branding.logo_light_url,
      branding.logoLight,
      branding.organisationLogoUrl,
      branding.organisation_logo_url,
      branding.logoUrl,
      branding.logo_url,
      branding.logoDarkUrl,
      branding.logoDark,
      context.logoUrl,
    ),
    context.assetBaseUrl,
  )

  return {
    organisationName,
    agencyLogoUrl,
  }
}

function renderDisclosureHeader(branding = {}) {
  const agencyBrand = branding.agencyLogoUrl
    ? `<img src="${escapeHtml(branding.agencyLogoUrl)}" alt="${escapeHtml(branding.organisationName)} logo" />`
    : escapeHtml(branding.organisationName)

  return `
    <header class="doc-header">
      <span class="agency-brand">${agencyBrand}</span>
    </header>
  `
}

function renderDisclosureFooter(branding = {}, pageNumber = 1, pageTotal = 1) {
  const agencyBrand = branding.agencyLogoUrl
    ? `<img src="${escapeHtml(branding.agencyLogoUrl)}" alt="${escapeHtml(branding.organisationName)} logo" />`
    : escapeHtml(branding.organisationName)

  return `
    <footer class="doc-footer">
      <span class="footer-brand">${agencyBrand}</span>
      <span class="page-no">Page ${pageNumber} of ${pageTotal}</span>
    </footer>
  `
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
    sellerName: normalizeText(context.sellerName),
    sellerIdNumber: normalizeText(context.sellerIdNumber || context.sellerIdNo || context.idNumber),
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
  const sellerName = normalizeText(context.sellerName || snapshot.sellerName || 'Seller')
  const sellerIdNumber = normalizeText(context.sellerIdNumber || snapshot.sellerIdNumber)
  const propertyAddress = normalizeText(context.propertyAddress)
  const documentReference = firstNonEmpty(context.documentReference, context.listingReference, context.listingId, propertyAddress, snapshot.title)
  const branding = resolvePropertyDisclosureBranding(context)
  const sellerSignatureIsImage = isImageSignature(snapshot.sellerSignature)
  const sellerSignatureMarkup = sellerSignatureIsImage
    ? `<img class="signature-image" src="${escapeHtml(snapshot.sellerSignature)}" alt="Seller signature" />`
    : (escapeHtml(snapshot.sellerSignature) || '&nbsp;')
  const answerCell = (answer, value) => (answer === value ? '<span class="answer-mark">&#10003;</span>' : '&nbsp;')
  const pageTotal = 3
  const renderRows = (items) => items.map((item) => `
    <tr>
      <td class="question-cell">
        <span class="question-number">${item.number}.</span>
        <span class="question-text">${escapeHtml(item.question)}</span>
        ${item.extraLabel ? `<span class="question-extra">${escapeHtml(item.extraLabel)}: ${escapeHtml(item.extraValue)}</span>` : ''}
      </td>
      <td class="answer-cell">${answerCell(item.answer, PROPERTY_DISCLOSURE_ANSWER.yes)}</td>
      <td class="answer-cell">${answerCell(item.answer, PROPERTY_DISCLOSURE_ANSWER.no)}</td>
      <td class="answer-cell">${answerCell(item.answer, PROPERTY_DISCLOSURE_ANSWER.unsure)}</td>
    </tr>
  `).join('')
  const pageOneRows = renderRows(snapshot.answers.filter((item) => Number(item.number) <= 10))
  const pageTwoRows = renderRows(snapshot.answers.filter((item) => Number(item.number) > 10))
  const comments = escapeHtml(snapshot.comments).replace(/\n/g, '<br />')
  const renderTitle = (subtitle = '') => `
    <section class="doc-title">
      <h1>Declaration by Seller - Annexure A</h1>
      <p>Document reference: ${escapeHtml(documentReference)}${subtitle ? `<br />${escapeHtml(subtitle)}` : ''}</p>
    </section>
  `
  const renderQuestionTable = (rows) => `
    <table class="annexure-table">
      <colgroup>
        <col class="question-col" />
        <col class="answer-col" />
        <col class="answer-col" />
        <col class="answer-col" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Disclosure question</th>
          <th scope="col">Yes</th>
          <th scope="col">No</th>
          <th scope="col">Unsure</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(snapshot.title)}</title>
  <style>
    * { box-sizing: border-box; }
    :root { color-scheme: light; font-family: Helvetica, Arial, sans-serif; }
    body { margin: 0; padding: 0; background: #ffffff; color: #1f2937; font-family: Helvetica, Arial, sans-serif; }
    .property-disclosure-document { width: 210mm; margin: 0 auto; background: #ffffff; }
    .property-disclosure-page { width: 210mm; height: 296mm; min-height: 296mm; margin: 0 auto; background: #ffffff; color: #1f2937; position: relative; overflow: hidden; }
    .doc-header { display: flex; align-items: center; justify-content: center; gap: 24px; padding: 18mm 18mm 8mm; border-bottom: 1px solid #d7d7d7; }
    .agency-brand { display: inline-flex; align-items: center; justify-content: center; min-width: 0; color: #1f2937; font-size: 16px; font-weight: 800; letter-spacing: 0; }
    .agency-brand img { max-width: 54mm; max-height: 17mm; object-fit: contain; }
    .doc-title { padding: 8mm 18mm 5mm; text-align: center; border-bottom: 1px solid #e4e4e4; }
    .doc-title h1 { margin: 0; color: #111827; font-size: 22px; font-weight: 700; letter-spacing: 0; line-height: 1.2; text-transform: uppercase; }
    .doc-title p { margin: 6px 0 0; color: #5c6670; font-size: 11.5px; line-height: 1.45; }
    .doc-body { padding: 7mm 18mm 24mm; }
    .intro { margin: 0 0 3mm; color: #1f2937; font-size: 11.5px; line-height: 1.5; }
    .meta { margin: 0 0 5mm; color: #3f4a56; font-size: 11px; line-height: 1.45; }
    .annexure-table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #1f2937; font-size: 9.35pt; line-height: 1.34; }
    .annexure-table th, .annexure-table td { border: 1px solid #d7d7d7; vertical-align: top; padding: 2mm 2.3mm; }
    .annexure-table th { background: #f6f7f8; color: #111827; font-size: 8.7pt; font-weight: 700; text-align: left; text-transform: uppercase; }
    .annexure-table th:not(:first-child) { text-align: center; }
    .question-col { width: 76%; }
    .answer-col { width: 8%; }
    .question-cell { color: #1f2937; }
    .question-number { display: inline-block; min-width: 5mm; color: #111827; font-weight: 700; }
    .question-extra { display: block; margin-top: 1.5mm; padding-left: 5mm; color: #3f4a56; font-size: 8.8pt; }
    .answer-cell { text-align: center; vertical-align: middle; color: #111827; }
    .answer-mark { display: inline-block; font-size: 12pt; font-weight: 700; line-height: 1; }
    .comments-title { color: #111827; font-weight: 700; text-transform: uppercase; }
    .comments-box { min-height: 32mm; color: #1f2937; line-height: 1.45; }
    .signature-section { margin-top: 8mm; color: #1f2937; font-size: 10.5pt; line-height: 1.5; }
    .signature-section h2 { margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 1px solid #d7d7d7; color: #111827; font-size: 11pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .execution-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 5mm; }
    .execution-field { min-height: 17mm; border: 1px solid #d7d7d7; padding: 3mm; }
    .execution-label { display: block; color: #5c6670; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; }
    .execution-value { display: block; margin-top: 2mm; color: #111827; font-size: 11pt; font-weight: 700; }
    .signature-panel { margin-top: 8mm; break-inside: avoid; page-break-inside: avoid; }
    .signature-box { display: flex; align-items: center; justify-content: center; min-height: 34mm; border: 1px solid #111827; background: #ffffff; padding: 3mm; color: #111827; font-size: 11pt; font-weight: 700; }
    .signature-image { max-width: 100%; max-height: 28mm; object-fit: contain; }
    .signature-label { margin-top: 1.5mm; color: #3f4a56; font-size: 10px; font-weight: 700; text-align: right; text-transform: uppercase; }
    .doc-footer { position: absolute; left: 18mm; right: 18mm; bottom: 6mm; display: flex; align-items: center; justify-content: space-between; gap: 8mm; padding-top: 4mm; border-top: 1px solid #d8d8d8; color: #606a75; font-size: 10px; }
    .footer-brand { display: inline-flex; align-items: center; min-width: 34mm; max-width: 48mm; }
    .doc-footer img { max-width: 34mm; max-height: 9mm; object-fit: contain; }
    .page-no { flex: 1; text-align: center; font-weight: 700; }
    @media print {
      body { background: #fff; }
      .property-disclosure-document, .property-disclosure-page { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="property-disclosure-document">
    <section class="property-disclosure-page">
      ${renderDisclosureHeader(branding)}
      ${renderTitle()}
      <section class="doc-body">
        <p class="intro">This statement declares the actual current state of the property according to the best of my knowledge. I/ We declare that as far as we are concerned no material defects to the building or equipment exist except those as stated below.</p>
        <p class="intro">Please answer Yes, No, or Unsure, and where necessary provide an explanation in clause 21 hereunder.</p>
        ${propertyAddress ? `<p class="meta"><strong>Property:</strong> ${escapeHtml(propertyAddress)}</p>` : ''}
        ${renderQuestionTable(pageOneRows)}
      </section>
      ${renderDisclosureFooter(branding, 1, pageTotal)}
    </section>
    <section class="property-disclosure-page">
      ${renderDisclosureHeader(branding)}
      ${renderTitle('Continuation and comments section')}
      <section class="doc-body">
        ${renderQuestionTable(`${pageTwoRows}
          <tr><td class="comments-title" colspan="4">21. Comments or explanation for any of the above</td></tr>
          <tr><td class="comments-box" colspan="4">${comments || '&nbsp;'}</td></tr>
        `)}
      </section>
      ${renderDisclosureFooter(branding, 2, pageTotal)}
    </section>
    <section class="property-disclosure-page">
      ${renderDisclosureHeader(branding)}
      ${renderTitle('Signature section')}
      <section class="doc-body">
        <section class="signature-section">
          <h2>Seller declaration and signature</h2>
          <p class="intro">I declare that the information in this Annexure A is true and complete to the best of my knowledge and that all known material facts relating to the property have been disclosed.</p>
          <div class="execution-grid">
            <div class="execution-field">
              <span class="execution-label">Seller name</span>
              <span class="execution-value">${escapeHtml(sellerName)}</span>
            </div>
            <div class="execution-field">
              <span class="execution-label">ID / passport number</span>
              <span class="execution-value">${escapeHtml(sellerIdNumber) || '&nbsp;'}</span>
            </div>
            <div class="execution-field">
              <span class="execution-label">Date signed</span>
              <span class="execution-value">${escapeHtml(snapshot.sellerSignedAt) || '&nbsp;'}</span>
            </div>
            <div class="execution-field">
              <span class="execution-label">Signed at</span>
              <span class="execution-value">${escapeHtml(snapshot.sellerSignedPlace) || '&nbsp;'}</span>
            </div>
          </div>
          <div class="signature-panel">
            <div class="signature-box">${sellerSignatureMarkup}</div>
            <div class="signature-label">Seller signature</div>
          </div>
        </section>
      </section>
      ${renderDisclosureFooter(branding, 3, pageTotal)}
    </section>
  </main>
</body>
</html>`
}
