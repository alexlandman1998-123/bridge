const DOCUMENT_EVIDENCE_ALIAS = {
  SIGNED_OTP_DOCUMENT: [
    'signed_otp',
    'otp_signed',
    'otp',
    'signed_offer_to_purchase',
    'signed_offer',
    'offer_to_purchase_signed',
  ],
  GENERATED_OTP_DOCUMENT: [
    'generated_otp',
    'otp_generated',
    'otp',
    'generated_offer_to_purchase',
  ],
  BUYER_ONBOARDING_COMPLETE: [
    'buyer_onboarding_complete',
    'buyer-onboarding',
    'buyer details',
    'buyer_fica',
    'buyer information',
    'buyer onboarding',
  ],
  SELLER_ONBOARDING_COMPLETE: [
    'seller_onboarding_complete',
    'seller-onboarding',
    'seller details',
    'seller_fica',
    'seller information',
    'seller onboarding',
  ],
  BUYER_FICA_COMPLETE: [
    'buyer_id_document',
    'buyer_fica',
    'buyer_id',
    'buyer proof of address',
    'buyer address',
  ],
  SELLER_FICA_COMPLETE: [
    'seller_id_document',
    'seller_fica',
    'seller_id',
    'seller proof of address',
    'seller address',
  ],
  POF_DOCUMENT: [
    'proof_of_funds',
    'cash_proof',
    'proof of funds',
    'pof',
    'reservation_deposit_proof',
  ],
  BOND_APPLICATION_SUBMITTED: [
    'bond_application_form',
    'bond_application',
    'bond_application_uploaded',
    'bond application',
  ],
  BOND_APPROVAL_LETTER: [
    'bond_approval',
    'bank_approval',
    'approval_letter',
    'grant_letter',
    'bond approval',
  ],
  GUARANTEE_ISSUED: [
    'guarantees',
    'grant',
    'grant_letter',
    'guarantees_grant_issued',
  ],
  TRANSFER_DUTY_DA: [
    'transfer_documents',
    'transfer_duty',
    'transfer duty',
    'transfer pack',
    'lodgement_pack',
    'instruction_pack',
  ],
  CONVEYANCING_DUTY_RECEIPT: [
    'rates_clearance_certificate',
    'rates_account',
    'rates_clearance',
    'rates',
    'levy_statement',
    'hoa_levy_statement',
  ],
  MORTGAGE_CANCELLATION_AUTH: [
    'bond_cancellation_notice',
    'bond_cancellation',
    'mortgage_cancellation',
    'cancellation_auth',
    'cancellation notice',
  ],
  REGISTRATION_LETTER: [
    'registration_confirmation',
    'registration_certificate',
    'registration_letter',
    'final_signed_packet',
    'registration confirmed',
  ],
  TRANSFER_SIGNED_DOCS: [
    'signed_transfer_documents',
    'signed_transfer_pack',
    'transfer_signatures',
  ],
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeToken(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' ')
}

function normalizeSet(values = []) {
  return new Set(values.map((value) => normalizeToken(value)).filter(Boolean))
}

function isSatisfiedDocumentRequirementStatus(status = '') {
  const normalized = normalizeToken(status)
  return ['uploaded', 'under review', 'approved', 'accepted', 'reviewed', 'completed', 'waived', 'not applicable'].includes(normalized)
}

function deriveDocumentMatchedKeys(row = {}) {
  const keys = []
  const key = normalizeToken(row.document_key || row.requirement_key || row.key || row.document_type || row.category || row.type)
  if (key) keys.push(key)
  if (Array.isArray(row.requirement_keys)) {
    for (const item of row.requirement_keys) {
      const normalized = normalizeToken(item)
      if (normalized) keys.push(normalized)
    }
  }
  const docKey = normalizeToken(row.document_type || row.type)
  if (docKey) keys.push(docKey)
  const category = normalizeToken(row.category)
  if (category) keys.push(category)
  const name = normalizeToken(row.name || row.document_name || row.title)
  if (name) keys.push(name)

  return keys
}

function findMatchingItems(rows = [], candidates = new Set(), nameHints = [], docTypeHints = []) {
  const hints = [...(nameHints || []), ...(docTypeHints || [])].map((value) => normalizeToken(value))
  const matches = []

  for (const row of rows) {
    const haystack = new Set([
      ...deriveDocumentMatchedKeys(row),
      normalizeToken(row.document_type || row.type),
      normalizeToken(row.category || row.document_category),
      normalizeToken(row.name || row.document_name),
    ])
    const keyHit = [...haystack].some((token) => candidates.has(token))

    if (!keyHit) {
      const name = normalizeToken(`${row.name || ''} ${row.document_name || ''} ${row.title || ''}`)
      if (!hints.length || !name) {
        continue
      }
      if (!hints.some((hint) => name.includes(hint))) {
        continue
      }
    }

    const rowStatus = normalizeToken(row.status || row.requirement_status || '')
    const satisfied = rowStatus ? isSatisfiedDocumentRequirementStatus(rowStatus) : Boolean(row.is_uploaded || row.uploaded)
    if (satisfied || rowStatus === 'completed' || rowStatus === 'approved') {
      matches.push(row)
    }
  }

  return matches
}

function mergeEvidenceState(existing = {}, matchedRows = [], evidenceKey = '') {
  const next = {
    ...existing,
    satisfied: existing.satisfied || false,
    sources: [...(existing.sources || [])],
    updatedAt: existing.updatedAt || null,
  }

  for (const row of matchedRows) {
    const rowId = row.id || row.documentId || row.requirement_id || row.document_id
    if (rowId && !next.sources.includes(rowId)) {
      next.sources.push(rowId)
    }

    const candidateUpdatedAt = row.updated_at || row.updatedAt || row.created_at || row.createdAt || null
    if (!next.updatedAt && candidateUpdatedAt) {
      next.updatedAt = candidateUpdatedAt
    }
    next.satisfied = true
  }

  return next
}

function collectDocumentEvidence(allDocuments = [], allRequiredDocuments = []) {
  const documentEvidence = {}

  for (const key of Object.keys(DOCUMENT_EVIDENCE_ALIAS)) {
    documentEvidence[key] = {
      satisfied: false,
      sources: [],
      updatedAt: null,
    }
  }

  for (const [evidenceKey, aliases] of Object.entries(DOCUMENT_EVIDENCE_ALIAS)) {
    const candidates = normalizeSet(aliases)
    const rowMatches = findMatchingItems(allDocuments, candidates)
    const reqMatches = findMatchingItems(allRequiredDocuments, candidates)
    documentEvidence[evidenceKey] = mergeEvidenceState(documentEvidence[evidenceKey], [...rowMatches, ...reqMatches], evidenceKey)
  }

  return documentEvidence
}

function collectOnboardingEvidence(transaction = {}, checklistItems = [], documentRequests = [], events = []) {
  const evidence = {
    BUYER_ONBOARDING_COMPLETE: {
      satisfied: false,
      sources: [],
      updatedAt: null,
    },
    SELLER_ONBOARDING_COMPLETE: {
      satisfied: false,
      sources: [],
      updatedAt: null,
    },
  }

  const buyerStatus = normalizeText(transaction.onboarding_status || transaction.buyer_onboarding_status || '')
  const sellerStatus = normalizeText(transaction.seller_onboarding_status || '')

  if (['submitted', 'reviewed', 'approved', 'complete', 'completed'].includes(buyerStatus)) {
    evidence.BUYER_ONBOARDING_COMPLETE.satisfied = true
    evidence.BUYER_ONBOARDING_COMPLETE.sources.push(`transaction:${transaction.id || 'unknown'}`)
    evidence.BUYER_ONBOARDING_COMPLETE.updatedAt = transaction.updated_at || transaction.created_at || null
  }

  if (['submitted', 'reviewed', 'approved', 'complete', 'completed'].includes(sellerStatus)) {
    evidence.SELLER_ONBOARDING_COMPLETE.satisfied = true
    evidence.SELLER_ONBOARDING_COMPLETE.sources.push(`transaction:${transaction.id || 'unknown'}`)
    evidence.SELLER_ONBOARDING_COMPLETE.updatedAt = transaction.updated_at || transaction.created_at || null
  }

  for (const item of checklistItems) {
    const label = normalizeToken(item.label || item.auto_rule_key || item.title)
    const rawStatus = normalizeToken(item.status || '')
    const sourceCompleted = ['completed', 'waived'].includes(rawStatus)
    if (!sourceCompleted) {
      continue
    }

    if (label.includes('buyer') && label.includes('onboarding')) {
      evidence.BUYER_ONBOARDING_COMPLETE.satisfied = true
      if (!evidence.BUYER_ONBOARDING_COMPLETE.sources.includes(item.id)) {
        evidence.BUYER_ONBOARDING_COMPLETE.sources.push(item.id)
      }
      evidence.BUYER_ONBOARDING_COMPLETE.updatedAt = evidence.BUYER_ONBOARDING_COMPLETE.updatedAt || item.updated_at || item.updatedAt || item.completed_at
      continue
    }

    if (label.includes('seller') && label.includes('onboarding')) {
      evidence.SELLER_ONBOARDING_COMPLETE.satisfied = true
      if (!evidence.SELLER_ONBOARDING_COMPLETE.sources.includes(item.id)) {
        evidence.SELLER_ONBOARDING_COMPLETE.sources.push(item.id)
      }
      evidence.SELLER_ONBOARDING_COMPLETE.updatedAt = evidence.SELLER_ONBOARDING_COMPLETE.updatedAt || item.updated_at || item.updatedAt || item.completed_at
    }
  }

  for (const request of documentRequests) {
    const requestTitle = normalizeToken(request.title || request.document_type || request.category)
    const requestStatus = normalizeText(request.status || '')
    const completed = ['completed', 'uploaded', 'reviewed'].includes(requestStatus)

    if (!completed) {
      continue
    }

    if (requestTitle.includes('buyer') && requestTitle.includes('onboarding')) {
      evidence.BUYER_ONBOARDING_COMPLETE.satisfied = true
      if (!evidence.BUYER_ONBOARDING_COMPLETE.sources.includes(request.id)) {
        evidence.BUYER_ONBOARDING_COMPLETE.sources.push(request.id)
      }
    }

    if (requestTitle.includes('seller') && requestTitle.includes('onboarding')) {
      evidence.SELLER_ONBOARDING_COMPLETE.satisfied = true
      if (!evidence.SELLER_ONBOARDING_COMPLETE.sources.includes(request.id)) {
        evidence.SELLER_ONBOARDING_COMPLETE.sources.push(request.id)
      }
    }
  }

  for (const event of events || []) {
    const eventType = normalizeToken(event.eventType || event.event_type || '')
    const eventLabel = normalizeToken(event.eventData?.title || event.message || '')

    if (eventType.includes('onboarding') && (eventType.includes('completed') || eventType.includes('submitted'))) {
      if (eventLabel.includes('buyer')) {
        evidence.BUYER_ONBOARDING_COMPLETE.satisfied = true
        evidence.BUYER_ONBOARDING_COMPLETE.sources.push(event.id || `${eventType}:${event.created_at || event.createdAt || 'event'}`)
      }

      if (eventLabel.includes('seller')) {
        evidence.SELLER_ONBOARDING_COMPLETE.satisfied = true
        evidence.SELLER_ONBOARDING_COMPLETE.sources.push(event.id || `${eventType}:${event.created_at || event.createdAt || 'event'}`)
      }
    }
  }

  return evidence
}

export function resolveTransactionWorkflowEvidence(context = {}) {
  const transaction = context.transaction || {}
  const documents = Array.isArray(context.documents) ? context.documents : []
  const requiredDocuments = Array.isArray(context.requiredDocuments) ? context.requiredDocuments : []
  const checklistItems = Array.isArray(context.checklistItems) ? context.checklistItems : []
  const documentRequests = Array.isArray(context.documentRequests) ? context.documentRequests : []
  const events = Array.isArray(context.events) ? context.events : []

  const documentEvidence = collectDocumentEvidence(documents, requiredDocuments)
  const onboardingEvidence = collectOnboardingEvidence(transaction, checklistItems, documentRequests, events)
  const evidence = {
    ...documentEvidence,
    ...onboardingEvidence,
  }

  // Explicitly infer cancellation/document evidence from cancellation-specific checklist or events
  const cancellationChecklist = checklistItems.filter((item) => {
    const label = normalizeToken(item.label || item.auto_rule_key || item.title)
    return label.includes('cancellation') && ['completed', 'waived'].includes(normalizeToken(item.status || ''))
  })
  if (cancellationChecklist.length) {
    evidence.MORTGAGE_CANCELLATION_AUTH.satisfied = true
    evidence.MORTGAGE_CANCELLATION_AUTH.sources.push(...cancellationChecklist.map((item) => item.id).filter(Boolean))
  }

  if (!cancellationChecklist.length) {
    const cancellationEvents = events.filter((event) => {
      const eventType = normalizeToken(event.eventType || event.event_type || '')
      return eventType.includes('cancellation') || eventType.includes('bond')
    })
    if (cancellationEvents.length) {
      evidence.MORTGAGE_CANCELLATION_AUTH.satisfied = true
      evidence.MORTGAGE_CANCELLATION_AUTH.sources.push(...cancellationEvents.map((event) => event.id || `event:${event.eventType}`).filter(Boolean))
    }
  }

  return evidence
}

export function pickEvidenceSources(evidence = {}) {
  const keys = []
  for (const [key, value] of Object.entries(evidence || {})) {
    const sourceIds = Array.isArray(value?.sources) ? value.sources : []
    for (const source of sourceIds) {
      if (source && String(source).trim()) {
        keys.push(String(source))
      }
    }
  }
  return [...new Set(keys)]
}

export function isEvidenceSatisfied(evidence = {}, key = '') {
  return Boolean(evidence?.[key]?.satisfied)
}

export function getEvidenceUpdatedAt(evidence = {}) {
  const dates = Object.values(evidence || {})
    .map((entry) => entry?.updatedAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)

  if (!dates.length) return null
  const max = Math.max(...dates)
  return new Date(max).toISOString()
}
