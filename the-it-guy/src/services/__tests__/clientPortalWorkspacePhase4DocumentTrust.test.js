import { expect, test } from 'vitest'
import { buildCanonicalBuyerDocumentCenter, buildCanonicalSellerDocumentCenter, buildDocumentCenter } from '../clientPortalWorkspaceService.js'

test('seller portal retains custom requirements and suppresses removed checklist defaults', () => {
  const centre = buildDocumentCenter({
    requiredDocuments: [{ id: 'legacy-title', key: 'seller_title_deed', label: 'Title deed', visibility: 'seller_visible', status: 'required' }],
    listing: { canonicalDocumentSnapshot: {
      requirements: [
        { id: 'removed-title', document_definition_key: 'seller_title_deed', requested_from_role: 'seller', applicability_override: 'removed', status: 'not_applicable' },
        { id: 'custom-sars', custom_label: 'Additional SARS communication', requested_from_role: 'seller', status: 'requested', uploadable_by_roles: ['seller'], requirement_level: 'required' },
      ], documents: [],
    } },
  }, 'selling')
  expect(centre.requiredDocuments.some(row => row.key === 'seller_title_deed' || row.id === 'removed-title')).toBe(false)
  expect(centre.requiredDocuments.find(row => row.id === 'custom-sars')).toMatchObject({
    label: 'Additional SARS communication', canUpload: true,
  })
})

test('Phase 4 buyer document centre uses only exact canonical projection documents', () => {
  const centre = buildCanonicalBuyerDocumentCenter({
    requirements: [{
      id: 'buyer-requirement',
      document_definition_key: 'buyer_id_document',
      pack_key: 'buyer_identity_fica',
      status: 'pending',
      uploadable_by_roles: ['buyer'],
      document_definitions: { display_label: 'Buyer ID', description: 'Identity document.' },
    }],
    documents: [{
      id: 'unrelated-document',
      canonical_requirement_instance_id: 'other-requirement',
      document_type: 'buyer_id_document',
      is_client_visible: true,
    }],
  })

  expect(centre.canonicalOnly).toBe(true)
  expect(centre.requiredDocuments).toHaveLength(1)
  expect(centre.requiredDocuments[0]).toMatchObject({
    status: 'required',
    hasUploadedDocument: false,
    linkedDocument: null,
    authoritativeSource: 'canonical_projection',
  })
  expect(centre.requiredDocuments[0].uploadSpec).toMatchObject({
    requirementInstanceId: 'buyer-requirement',
  })
})

test('Phase 4 fails closed when the buyer projection is unavailable', () => {
  const centre = buildCanonicalBuyerDocumentCenter(null, 'RPC missing')
  expect(centre).toMatchObject({
    canonicalOnly: true,
    requiredDocuments: [],
  })
  expect(centre.loadError).toContain('secure document room')
})

test('unmatched agent evidence is visible but never satisfies a buyer requirement', () => {
  const centre = buildCanonicalBuyerDocumentCenter({
    requirements: [{
      id: 'buyer-requirement',
      document_definition_key: 'buyer_id_document',
      pack_key: 'buyer_identity_fica',
      status: 'pending',
      uploadable_by_roles: ['buyer'],
      document_definitions: { display_label: 'Buyer ID' },
    }],
    documents: [{
      id: 'agent-document',
      name: 'id.pdf',
      document_type: 'buyer_id_document',
      status: 'uploaded',
      source: 'agent_buyer_document_upload',
      canonical_requirement_instance_id: null,
    }],
  })

  expect(centre.requiredDocuments[0]).toMatchObject({ status: 'required', hasUploadedDocument: false })
  expect(centre.unmatchedDocuments).toHaveLength(1)
  expect(centre.unmatchedDocuments[0]).toMatchObject({ awaitingRequirementMatch: true, status: 'uploaded' })
  expect(centre.summary).toMatchObject({ outstanding: 1, uploaded: 1 })
})

test('additional-request buyer uploads remain visible without being mislabelled as unmatched agent evidence', () => {
  const centre = buildCanonicalBuyerDocumentCenter({
    requirements: [],
    documents: [{
      id: 'requested-document', name: 'bank-letter.pdf', status: 'uploaded',
      source: 'client_portal_requested_document_upload',
      canonical_requirement_instance_id: null,
    }],
  })
  expect(centre.standaloneDocuments).toHaveLength(1)
  expect(centre.unmatchedDocuments).toHaveLength(0)
  expect(centre.items[0]).toMatchObject({ status: 'uploaded', awaitingRequirementMatch: false })
})

test('seller transaction requirements replace legacy checklist rows but retain listing paperwork', () => {
  const centre = buildCanonicalSellerDocumentCenter({
    role: 'seller',
    requirements: [{
      id: 'seller-fica', document_definition_key: 'seller_id_document',
      pack_key: 'seller_identity_fica', status: 'requested',
      uploadable_by_roles: ['seller'],
      document_definitions: { display_label: 'Seller ID' },
    }],
    documents: [],
  }, {
    requiredDocuments: [{ id: 'legacy-duplicate', key: 'seller_id_document' }],
    uploadedDocuments: [{ id: 'signed-mandate', name: 'Signed mandate', status: 'approved' }],
    saleDocuments: [{ id: 'otp', title: 'Signed OTP' }],
  })
  expect(centre.requiredDocuments).toHaveLength(1)
  expect(centre.requiredDocuments[0].canonicalRequirementInstanceId).toBe('seller-fica')
  expect(centre.requiredDocuments[0].uploadSpec.requirementInstanceId).toBe('seller-fica')
  expect(centre.items.map((item) => item.sourceId)).not.toContain('legacy-duplicate')
  expect(centre.standaloneDocuments.map((item) => item.id)).toContain('signed-mandate')
  expect(centre.saleDocuments).toHaveLength(1)
})

test('custom buyer requirements retain a usable canonical upload key and label', () => {
  const centre = buildCanonicalBuyerDocumentCenter({ requirements: [{ id: 'custom-id', custom_label: 'SARS letter', document_definition_key: null,
    requested_from_role: 'buyer', pack_key: 'buyer_identity_fica', status: 'pending', uploadable_by_roles: ['buyer'] }], documents: [] })
  expect(centre.requiredDocuments[0].title).toBe('SARS letter')
  expect(centre.requiredDocuments[0].uploadSpec).toMatchObject({ requirementInstanceId: 'custom-id', requirementKey: 'custom_custom-id' })
})

test('legacy checklist rejects a same-type file linked to another request and prefers its exact file', () => {
  const requirement = { id: 'request-A', key: 'buyer_proof_of_address', label: 'Proof of address', status: 'required', expectedFromRole: 'buyer' }
  const wrongFile = { id: 'wrong-file', requirement_id: 'request-B', requirementKey: requirement.key,
    document_type: requirement.key, status: 'approved', visibility: 'client', file_path: 'synthetic/wrong.pdf' }
  for (const linkedFields of [{}, { uploadedDocument: wrongFile }, { uploaded_document_id: wrongFile.id }]) {
    const missing = buildDocumentCenter({ requiredDocuments: [{ ...requirement, ...linkedFields }], documents: [wrongFile] }, 'buying')
    expect(missing.items.find(row => row.sourceType === 'required_document')).toMatchObject({ status: 'required', linkedDocument: null })
  }

  const unlinked = { ...wrongFile, id: 'unlinked', requirement_id: null }
  const exact = { ...wrongFile, id: 'exact-file', requirement_id: requirement.id, status: 'uploaded' }
  const legacy = buildDocumentCenter({ requiredDocuments: [requirement], documents: [unlinked] }, 'buying')
  expect(legacy.items.find(row => row.sourceType === 'required_document').linkedDocument?.id).toBe('unlinked')
  const received = buildDocumentCenter({ requiredDocuments: [requirement], documents: [unlinked, wrongFile, exact] }, 'buying')
  expect(received.items.find(row => row.sourceType === 'required_document')).toMatchObject({ status: 'uploaded', linkedDocument: { id: 'exact-file' } })
  const renamedFile = { ...exact, requirementKey: 'old_type', document_type: 'old_type' }
  const renamed = buildDocumentCenter({ requiredDocuments: [requirement], documents: [renamedFile] }, 'buying')
  expect(renamed.items.find(row => row.sourceType === 'required_document').linkedDocument?.id).toBe('exact-file')
})

test.each(['buyer', 'seller'])('canonical %s checklist keeps optional and recommended documents uploadable without required actions', role => {
  const centre = buildCanonicalBuyerDocumentCenter({ requirements: ['optional', 'recommended', 'required', 'blocker'].map(level => ({
    id: `${role}-${level}`, document_definition_key: `${role}_${level}`, requirement_level: level,
    status: 'pending', uploadable_by_roles: [role], document_definitions: { display_label: `${level} document` },
  })), documents: [] }, '', role)
  for (const level of ['optional', 'recommended']) {
    expect(centre.items.find(row => row.sourceId === `${role}-${level}`)).toMatchObject({
      required: false, isCoreRequirement: false, requirementLevel: level,
      uploadSpec: { requirementInstanceId: `${role}-${level}` },
    })
  }
  expect(centre.summary).toMatchObject({ total: 2, outstanding: 2, blocking: 2 })
})
