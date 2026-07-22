import { resolveMatterDocumentMetadata } from '../documents/matterDocumentMetadata.js'

export const CONVEYANCING_DOCUMENT_PURPOSES = [
  { key: 'client_compliance', label: 'Client identity and FICA', description: 'Buyer and seller identity, address, authority and compliance records.' },
  { key: 'instruction_property', label: 'Instruction and property', description: 'Instruction, OTP, title deed and property information.' },
  { key: 'finance_guarantees', label: 'Finance and guarantees', description: 'Bond, proof of funds, guarantees and payment records.' },
  { key: 'clearances', label: 'Duty and clearances', description: 'Transfer duty, municipal rates, levy and related certificates.' },
  { key: 'signing', label: 'Preparation and signing', description: 'Draft transfer documents, powers of attorney and signed packs.' },
  { key: 'lodgement_registration', label: 'Lodgement and registration', description: 'Lodgement, deeds office, registration and close-out records.' },
  { key: 'other', label: 'Other matter documents', description: 'Additional requirements that do not fit another conveyancing purpose.' },
]

export const CONVEYANCING_DOCUMENT_SHORTCUTS = [
  {
    key: 'rates_clearance',
    label: 'Rates clearance',
    documentType: 'rates_clearance_certificate',
    category: 'Clearance Documents',
    requestedFrom: 'other',
    visibility: 'shared_role_players',
    relatedWorkflow: 'transfer',
    notes: 'Municipal rates clearance certificate required for transfer.',
  },
  {
    key: 'levy_clearance',
    label: 'Levy clearance',
    documentType: 'levy_clearance_certificate',
    category: 'Clearance Documents',
    requestedFrom: 'other',
    visibility: 'shared_role_players',
    relatedWorkflow: 'transfer',
    notes: 'Levy clearance certificate required from the body corporate, HOA or managing agent.',
  },
  {
    key: 'transfer_duty',
    label: 'Transfer duty',
    documentType: 'transfer_duty_receipt',
    category: 'Clearance Documents',
    requestedFrom: 'attorney',
    visibility: 'internal_only',
    relatedWorkflow: 'transfer',
    notes: 'Transfer duty receipt or exemption certificate required for lodgement.',
  },
  {
    key: 'guarantee',
    label: 'Guarantee',
    documentType: 'purchase_price_guarantee',
    category: 'Guarantees',
    requestedFrom: 'bond_originator',
    visibility: 'shared_role_players',
    relatedWorkflow: 'bond',
    notes: 'Purchase price guarantee required in the form approved by the transferring attorney.',
  },
  {
    key: 'bond_grant',
    label: 'Bond grant',
    documentType: 'bond_grant',
    category: 'Guarantees',
    requestedFrom: 'bond_originator',
    visibility: 'client_visible',
    relatedWorkflow: 'bond',
    notes: 'Formal bond grant or approval letter required from the bond originator.',
  },
]

const COMPLETE = new Set(['verified', 'approved', 'accepted', 'complete', 'completed', 'not_applicable'])
const RECEIVED = new Set(['uploaded', 'received', 'pending_review', 'under_review'])

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

function tokens(row = {}) {
  return [
    row.displayName,
    row.category,
    row.categoryLabel,
    row.requiredDocumentKey,
    row.relatedWorkflow,
    row.requiredParty,
    row.requirement?.key,
    row.requirement?.label,
    row.requirement?.groupKey,
    row.requirement?.visibleSection,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function getConveyancingDocumentPurpose(row = {}) {
  const metadata = resolveMatterDocumentMetadata(row)
  if (metadata.collectionBucketKey === 'finance' || metadata.libraryCategory === 'bond') {
    return 'finance_guarantees'
  }

  const signal = tokens(row)
  if (/rates|municipal|levy|clearance|transfer.?duty|sars|hoa|body.?corporate/.test(signal)) return 'clearances'
  if (/guarantee|grant|bond|finance|proof.?of.?funds|loan|bank.?approval|originator|payment/.test(signal)) return 'finance_guarantees'
  if (/lodg|deeds|registration|registered|close.?out|final.?account/.test(signal)) return 'lodgement_registration'
  if (/sign|signature|power.?of.?attorney|draft|prepare|resolution/.test(signal)) return 'signing'
  if (/fica|identity|id.?document|proof.?of.?address|marriage|company|trust|authority|compliance/.test(signal)) return 'client_compliance'
  if (/instruction|otp|offer.?to.?purchase|sale.?agreement|title.?deed|property|erf|sectional/.test(signal)) return 'instruction_property'
  return 'other'
}

export function normalizeConveyancingDocumentStatus(value = '', hasFile = false) {
  const status = normalize(value)
  if (COMPLETE.has(status)) return 'verified'
  if (status === 'rejected' || status === 'expired' || status === 'reupload_required') return 'rejected'
  if (RECEIVED.has(status) || (hasFile && !status)) return 'pending_review'
  if (status === 'requested' || status === 'awaiting_upload') return 'requested'
  return hasFile ? 'pending_review' : 'missing'
}

export function buildAttorneyDocumentControl({ requiredDocumentRows = [], additionalRequests = [] } = {}) {
  const requirementRows = requiredDocumentRows.map((row) => {
    const status = normalizeConveyancingDocumentStatus(row.status, Boolean(row.fileUrl || row.linkedDocument))
    return {
      ...row,
      registerId: `requirement:${row.id || row.displayName}`,
      purposeKey: getConveyancingDocumentPurpose(row),
      status,
      statusLabel: status === 'pending_review' ? 'Received · review needed' : status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      sourceType: 'requirement',
      needsAttention: !['verified'].includes(status),
    }
  })
  const requestRows = additionalRequests.map((request) => {
    const mapped = {
      id: request.id || request.title,
      displayName: request.title || request.documentType || 'Additional document',
      category: request.category || '',
      requiredDocumentKey: request.documentType || '',
      requiredParty: request.requestedFrom || 'Other',
      relatedWorkflow: request.relatedWorkflow || '',
      fileUrl: request.fileUrl || '',
      status: request.status || 'requested',
      rawRequest: request,
    }
    const status = normalizeConveyancingDocumentStatus(mapped.status, Boolean(mapped.fileUrl))
    return {
      ...mapped,
      registerId: `request:${mapped.id}`,
      purposeKey: getConveyancingDocumentPurpose(mapped),
      status,
      statusLabel: status === 'pending_review' ? 'Received · review needed' : status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      sourceType: 'request',
      blocksStage: Boolean(request.blocksStage || request.priority === 'urgent'),
      needsAttention: !['verified'].includes(status),
    }
  })
  const rows = [...requirementRows, ...requestRows]
  const groups = CONVEYANCING_DOCUMENT_PURPOSES.map((purpose) => {
    const items = rows.filter((row) => row.purposeKey === purpose.key)
    return {
      ...purpose,
      items,
      totalCount: items.length,
      attentionCount: items.filter((item) => item.needsAttention).length,
      blockerCount: items.filter((item) => item.blocksStage && item.needsAttention).length,
      completeCount: items.filter((item) => item.status === 'verified').length,
    }
  }).filter((group) => group.totalCount > 0)
  const counts = rows.reduce((summary, row) => {
    summary[row.status] = (summary[row.status] || 0) + 1
    return summary
  }, { missing: 0, requested: 0, pending_review: 0, verified: 0, rejected: 0 })

  return {
    rows,
    groups,
    counts,
    attentionRows: rows
      .filter((row) => row.needsAttention)
      .sort((left, right) => Number(Boolean(right.blocksStage)) - Number(Boolean(left.blocksStage))),
    blockerCount: rows.filter((row) => row.blocksStage && row.needsAttention).length,
    ready: rows.length > 0 && rows.every((row) => row.status === 'verified'),
  }
}
