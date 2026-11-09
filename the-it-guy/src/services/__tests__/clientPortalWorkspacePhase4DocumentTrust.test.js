import { expect, test } from 'vitest'
import { buildCanonicalBuyerDocumentCenter, buildCanonicalSellerDocumentCenter, buildDocumentCenter } from '../clientPortalWorkspaceService.js'

test('legacy portal links never substitute a same-type file belonging to another request', () => {
  const centre = buildDocumentCenter({
    requiredDocuments: [{ id: 'wanted', key: 'buyer_id_document', label: 'ID', status: 'required' }],
    additionalDocumentRequests: [{ id: 'request-one', title: 'ID', documentKey: 'buyer_id_document', requestedFrom: 'buyer', visibility: 'client_visible', requestedDocumentId: 'missing-file' }],
    documents: [{ id: 'wrong-file', document_type: 'buyer_id_document', requirement_id: 'other', status: 'approved' }],
  }, 'buying')
  expect(centre.items.find(row => row.sourceType === 'required_document' && row.sourceId === 'buyer_id_document')).toMatchObject({ hasUploadedDocument: false, linkedDocument: null })
  expect(centre.items.find(row => row.sourceId === 'request-one')).toMatchObject({ hasUploadedDocument: false, linkedDocument: null })
})

test('explicit legacy links take priority over the first same-type upload', () => {
  const centre = buildDocumentCenter({
    requiredDocuments: [{ id: 'wanted', key: 'buyer_id_document', label: 'ID', status: 'required' }],
    documents: [
      { id: 'wrong', document_type: 'buyer_id_document', requirement_id: 'other' },
      { id: 'right', document_type: 'buyer_id_document', requirement_id: 'wanted' },
    ],
  }, 'buying')
  expect(centre.requiredDocuments.find(row => row.id === 'wanted').uploadedDocumentId).toBe('right')
})

test('canonical portals never show another requirement’s satisfier or a superseded file as current', () => {
  const requirement = { id: 'wanted', context_type: 'transaction', document_definition_key: 'buyer_id_document', status: 'pending', uploadable_by_roles: ['buyer'] }
  const history = { id: 'old', canonical_requirement_instance_id: 'wanted', is_current_evidence: false }
  const current = { id: 'new', canonical_requirement_instance_id: 'wanted', is_current_evidence: true }
  const project = (extra, documents) => buildCanonicalBuyerDocumentCenter({ requirements: [{ ...requirement, ...extra }], documents }).requiredDocuments[0]
  expect(project({}, [history, current]).linkedDocument.id).toBe('new')
  expect(project({}, [history]).linkedDocument).toBeNull()
  expect(project({ satisfied_by_document_id: 'missing' }, [current]).linkedDocument).toBeNull()
  expect(project({ satisfied_by_document_id: 'wrong' }, [{ id: 'wrong', canonical_requirement_instance_id: 'other' }]).linkedDocument).toBeNull()
})

test('optional and recommended legacy requirements do not block the portal checklist', () => {
  const centre = buildDocumentCenter({ requiredDocuments: [
    { id: 'optional', key: 'optional_attachment', label: 'Optional attachment', requirement_level: 'optional' },
    { id: 'recommended', key: 'recommended_attachment', label: 'Recommended attachment', requirementLevel: 'recommended' },
  ] }, 'buying')
  const rows = centre.items.filter(row => ['optional_attachment', 'recommended_attachment'].includes(row.sourceId))
  expect(rows).toHaveLength(2)
  expect(rows.every(row => row.required === false)).toBe(true)
})

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


test('an empty canonical room cannot claim a buyer is caught up while saved checklist rows await setup', () => {
  const centre = buildDocumentCenter({
    canonicalDocumentProjection: { requirements: [], documents: [] },
    requiredDocuments: [{ key: 'id_document', status: 'missing', isRequired: true }],
  }, 'buying')
  expect(centre.loadError).toContain('checklist is still being prepared')
  expect(centre.canonicalOnly).toBe(true)
  expect(centre.requiredDocuments).toEqual([])
  const legitimatelyEmpty = buildDocumentCenter({ canonicalDocumentProjection: { requirements: [], documents: [] },
    requiredDocuments: [{ key: 'retired', status: 'not_required', enabled: false }] }, 'buying')
  expect(legitimatelyEmpty.loadError).toBeFalsy()
})


test('a buyer-visible document supplied by the team remains visible without blocking buyer actions', () => {
  const centre = buildCanonicalBuyerDocumentCenter({ requirements: [{ id: 'rules', document_definition_key: 'body_corporate_rules',
    status: 'pending', pack_key: 'property', uploadable_by_roles: ['agent','seller'], document_definitions: { display_label: 'Body corporate rules' } }], documents: [] })
  expect(centre.requiredDocuments[0]).toMatchObject({ waitingForTeam: true, uploadSpec: null })
  expect(centre.summary.total).toBe(1)
  expect(centre.summary.blocking).toBe(0)
  expect(centre.summary.outstanding).toBe(0)
})

test('withdrawn and replaced files disappear from normal portal lists and cannot satisfy a legacy request', () => {
  const old={id:'old',name:'Old ID',document_type:'buyer_id_document',requirement_id:'wanted',canonical_requirement_instance_id:'wanted',is_current_evidence:false}
  const portal=buildDocumentCenter({requiredDocuments:[{id:'wanted',key:'buyer_id_document',label:'ID',status:'required'}],documents:[old]},'buying')
  expect(portal.uploadedDocuments).toHaveLength(0)
  expect(portal.requiredDocuments.find(row=>row.id==='wanted').uploadedDocumentId).toBeFalsy()
  const canonical=buildCanonicalBuyerDocumentCenter({requirements:[{id:'wanted',document_definition_key:'buyer_id_document',status:'pending',satisfied_by_document_id:null}],documents:[old]})
  expect(canonical.uploadedDocuments).toHaveLength(0)
  expect(canonical.requiredDocuments[0].linkedDocument).toBeNull()
})
