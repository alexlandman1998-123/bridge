import assert from 'node:assert/strict'

import {
  buildMatterDocumentWorkspaceModel,
  normalizeMatterDocumentCategory,
  normalizeDocumentCommandStatus,
} from '../documents/matterDocumentWorkspaceModel.js'

const transaction = {
  id: 'tx-1',
  bond_application_id: 'bond-app-1',
}

const requirements = [
  {
    id: 'req-buyer-proof',
    canonicalRequirementInstanceId: 'cri-buyer-proof',
    key: 'buyer_proof_of_address',
    label: 'Buyer proof of address',
    groupKey: 'buyer',
    status: 'pending',
    isBlocking: true,
    expectedFromRole: 'buyer',
  },
  {
    id: 'req-seller-fica',
    canonicalRequirementInstanceId: 'cri-seller-fica',
    key: 'seller_fica_id',
    label: 'Seller FICA ID',
    groupKey: 'seller',
    status: 'under_review',
    expectedFromRole: 'seller',
  },
  {
    id: 'req-transfer-duty',
    canonicalRequirementInstanceId: 'cri-transfer-duty',
    key: 'transfer_duty_receipt',
    label: 'Transfer duty receipt',
    visibleSection: 'transfer',
    status: 'approved',
    expectedFromRole: 'attorney',
  },
]

const documents = [
  {
    id: 'doc-seller-fica',
    name: 'Seller FICA ID.pdf',
    category: 'Seller FICA / Compliance',
    review_status: 'under_review',
    canonical_requirement_instance_id: 'cri-seller-fica',
    uploaded_by_role: 'seller',
    created_at: '2026-07-23T08:00:00.000Z',
    updated_at: '2026-07-23T08:30:00.000Z',
    file_size: 880640,
    version_number: 2,
    is_favourite: true,
    url: 'https://example.test/seller-fica.pdf',
  },
  {
    id: 'doc-transfer-duty',
    name: 'Transfer Duty Receipt.pdf',
    document_type: 'transfer_duty_receipt',
    status: 'approved',
    canonical_requirement_instance_id: 'cri-transfer-duty',
    uploadedByRole: 'attorney',
    created_at: '2026-07-22T10:00:00.000Z',
    updated_at: '2026-07-22T10:30:00.000Z',
    url: 'https://example.test/transfer-duty.pdf',
  },
  {
    id: 'doc-generated',
    name: 'Generated Power of Attorney.pdf',
    source: 'generated',
    category: 'generated',
    created_at: '2026-07-21T10:00:00.000Z',
  },
  {
    id: 'doc-generated',
    name: 'Generated Power of Attorney duplicate.pdf',
    source: 'generated',
    category: 'generated',
    created_at: '2026-07-21T10:01:00.000Z',
  },
]

const participants = [
  { roleType: 'seller', participantName: 'Jane Smith' },
  { roleType: 'attorney', participantName: 'Alex Landman' },
]

function getLinkedRequirementForDocument(document = {}) {
  return requirements.find((requirement) =>
    String(requirement.canonicalRequirementInstanceId || '') === String(document.canonical_requirement_instance_id || document.canonicalRequirementInstanceId || ''),
  ) || null
}

const baseModel = buildMatterDocumentWorkspaceModel({
  transaction,
  documents,
  requiredDocumentChecklist: requirements,
  documentRequests: [
    {
      id: 'request-absa-proof',
      title: 'ABSA bank requested proof of income',
      status: 'requested',
      requestedFrom: 'buyer',
      priority: 'urgent',
      createdAt: '2026-07-23T09:00:00.000Z',
    },
  ],
  transactionParticipants: participants,
  configuredBanks: [{ bank: 'ABSA' }],
  getLinkedRequirementForDocument,
})

assert.equal(normalizeDocumentCommandStatus('pending', { hasDocument: false }), 'missing')
assert.equal(normalizeDocumentCommandStatus('pending', { hasDocument: true }), 'uploaded')
assert.equal(normalizeDocumentCommandStatus('under_review', { hasDocument: true }), 'pending_review')
assert.equal(normalizeMatterDocumentCategory('generated'), 'general')
assert.equal(normalizeMatterDocumentCategory('internal'), 'general')
assert.equal(normalizeMatterDocumentCategory('bank_requested'), 'finance')

assert.equal(baseModel.requiredRows.length, 3, 'all required documents should be normalized')
assert.equal(baseModel.allLibraryRows.length, 3, 'uploaded document rows should be deduped by render key')
assert.equal(baseModel.categorySummaries.length >= 3, true, 'matter category summaries should include active categories only')

const buyerProofRow = baseModel.requiredRows.find((row) => row.id === 'cri-buyer-proof')
assert.equal(buyerProofRow.status, 'missing', 'pending requirements without an upload should remain missing')
assert.equal(buyerProofRow.category, 'buyer')
assert.equal(buyerProofRow.canonicalCategory, 'buyer')
assert.equal(buyerProofRow.categoryGroupLabel, 'Identity & FICA')
assert.equal(buyerProofRow.blocksStage, true)

const sellerLibraryRow = baseModel.allLibraryRows.find((row) => row.id === 'doc-seller-fica')
assert.equal(sellerLibraryRow.category, 'seller')
assert.equal(sellerLibraryRow.canonicalCategory, 'seller')
assert.equal(sellerLibraryRow.status, 'pending_review')
assert.equal(sellerLibraryRow.uploadedBy, 'Jane Smith')
assert.equal(sellerLibraryRow.requiredDocumentCanonicalId, 'cri-seller-fica')
assert.equal(sellerLibraryRow.ownerLabel, 'Seller')
assert.equal(sellerLibraryRow.documentTypeLabel, 'Seller FICA ID')
assert.equal(sellerLibraryRow.categoryGroupLabel, 'Identity & FICA')
assert.equal(sellerLibraryRow.versionLabel, 'v2')
assert.equal(sellerLibraryRow.fileSizeLabel, '860 KB')
assert.equal(sellerLibraryRow.linkedToLabel, 'Matter library')
assert.equal(sellerLibraryRow.isFavourite, true)

const sellerSummary = baseModel.categorySummaries.find((row) => row.key === 'seller')
assert.equal(sellerSummary.totalDocuments, 1)
assert.equal(sellerSummary.requiredCount, 1)
assert.equal(sellerSummary.pendingReviewCount, 1, 'linked document plus requirement should count as one pending-review item')
assert.equal(sellerSummary.totalItems, 1, 'category summary status rows should de-duplicate linked documents and requirements')
assert.equal(sellerSummary.groupSummaries[0].label, 'Identity & FICA')
assert.equal(sellerSummary.groupSummaries[0].count, 1)

const buyerSummary = baseModel.categorySummaries.find((row) => row.key === 'buyer')
assert.equal(buyerSummary.label, 'Buyer Documents')
assert.equal(buyerSummary.requiredCount, 1)
assert.equal(buyerSummary.missingCount, 1)
assert.equal(buyerSummary.totalDocuments, 0)

const generalSummary = baseModel.categorySummaries.find((row) => row.key === 'general')
assert.equal(generalSummary.totalDocuments, 1, 'generated and internal documents should roll up to General Documents')
assert.equal(generalSummary.requiredCount, 0)
assert.equal(generalSummary.uploadedOrUnreviewedCount, 1)
assert.equal(generalSummary.progressPercent, 100)
assert.equal(generalSummary.groupSummaries[0].label, 'Generated')

assert.equal(baseModel.healthSummary.requiredCount, 3)
assert.equal(baseModel.healthSummary.missingCount, 1)
assert.equal(baseModel.healthSummary.pendingReviewCount, 1)
assert.equal(baseModel.healthSummary.approvedCount, 1)
assert.equal(baseModel.readiness.missingDocuments[0].id, 'cri-buyer-proof')

const missingModel = buildMatterDocumentWorkspaceModel({
  transaction,
  documents,
  requiredDocumentChecklist: requirements,
  activeFilter: 'missing',
  getLinkedRequirementForDocument,
})
assert.deepEqual(
  missingModel.libraryRows.map((row) => row.displayName),
  ['Buyer proof of address'],
  'missing filter should render requirement rows with no upload',
)

const bankRequestedModel = buildMatterDocumentWorkspaceModel({
  transaction,
  documents,
  requiredDocumentChecklist: requirements,
  documentRequests: [
    {
      id: 'request-absa-proof',
      title: 'ABSA bank requested proof of income',
      status: 'requested',
      requestedFrom: 'buyer',
      priority: 'urgent',
      createdAt: '2026-07-23T09:00:00.000Z',
    },
  ],
  configuredBanks: [{ bank: 'ABSA' }],
  activeFilter: 'bank_requested',
  getLinkedRequirementForDocument,
})
assert.equal(bankRequestedModel.libraryRows.length, 1)
assert.equal(bankRequestedModel.libraryRows[0].category, 'bank_requested')
assert.equal(bankRequestedModel.libraryRows[0].categoryLabel, 'ABSA')
assert.equal(bankRequestedModel.libraryRows[0].priority, 'Urgent')
assert.equal(bankRequestedModel.libraryRows[0].documentTypeLabel, 'ABSA Bank Requested Proof Of Income')
assert.equal(bankRequestedModel.libraryRows[0].linkedToLabel, 'ABSA request')

const searchModel = buildMatterDocumentWorkspaceModel({
  transaction,
  documents,
  requiredDocumentChecklist: requirements,
  transactionParticipants: participants,
  activeFilter: 'all',
  search: 'jane',
  getLinkedRequirementForDocument,
})
assert.deepEqual(
  searchModel.libraryRows.map((row) => row.id),
  ['doc-seller-fica'],
  'search should match uploaded-by labels from participants',
)

const generalModel = buildMatterDocumentWorkspaceModel({
  transaction,
  documents,
  requiredDocumentChecklist: requirements,
  activeFilter: 'general',
  getLinkedRequirementForDocument,
})
assert.deepEqual(
  generalModel.libraryRows.map((row) => row.id),
  ['doc-generated'],
  'general filter should include generated/internal matter records through canonical category mapping',
)

assert.equal(baseModel.documentsByWorkflow.finance.length > 0, true)
assert.equal(baseModel.documentsByWorkflow.transfer.length > 0, true)

console.log('matter document workspace model tests passed')
