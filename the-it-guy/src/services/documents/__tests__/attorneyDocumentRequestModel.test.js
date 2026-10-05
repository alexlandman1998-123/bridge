import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAttorneyDocumentRequestRows, buildAttorneyRequestRequirementOptions, getAttorneyRequestUploadAudience } from '../attorneyDocumentRequestModel.js'
import { reviewAttorneyMatterDocumentRequest } from '../../../lib/transactionWorkspaceApi.js'

test('the matter workspace exposes the request review action', () => {
  assert.equal(typeof reviewAttorneyMatterDocumentRequest, 'function')
})

test('requested uploads retain the selected client and restrict professional files to role players', () => {
  assert.deepEqual(getAttorneyRequestUploadAudience({ requestedFrom: 'buyer' }, 'client_visible'), { visibilityScope: 'client', clientRecipientRole: 'buyer' })
  assert.deepEqual(getAttorneyRequestUploadAudience({ requested_from: 'developer' }, 'client_visible'), { visibilityScope: 'client', clientRecipientRole: 'seller' })
  assert.deepEqual(getAttorneyRequestUploadAudience({ requestedFrom: 'bond_originator' }, 'shared'), { visibilityScope: 'professional_shared', clientRecipientRole: null })
  assert.equal(getAttorneyRequestUploadAudience({ requestedFrom: 'buyer' }, 'internal').visibilityScope, 'internal')
  assert.equal(getAttorneyRequestUploadAudience({ requestedFrom: 'buyer_and_seller' }, 'client_visible').clientRecipientRole, null)
})

const requirement = { canonicalRequirementInstanceId: 'seller-id', label: 'Seller ID', requiredFromRole: 'seller', key: 'id_document', partyName: 'Nomsa', status: 'pending' }
const requiredRows = [{ displayName: 'Seller ID', requiredParty: 'Seller', requirement }]

test('requests choose an exact instance and recipient, and disable open or received requirements', () => {
  const options = buildAttorneyRequestRequirementOptions([
    ...requiredRows,
    { requirement: { ...requirement, canonicalRequirementInstanceId: 'other-seller', partyName: 'Sipho' } },
    { requirement: { ...requirement, canonicalRequirementInstanceId: 'received', status: 'under_review' } },
    { requirement: { ...requirement, canonicalRequirementInstanceId: 'attorney', requiredFromRole: 'transferring_attorney' } },
    { requirement: { ...requirement, canonicalRequirementInstanceId: 'unsupported', requiredFromRole: 'bond_attorney' } },
  ], [{ canonicalRequirementInstanceId: 'seller-id', status: 'requested' }])
  assert.equal(options.length, 4)
  assert.equal(options[0].disabled, true)
  assert.match(options[0].label, /Nomsa/)
  assert.equal(options[1].disabled, false)
  assert.match(options[1].label, /Sipho/)
  assert.equal(options[2].disabled, true)
  assert.equal(options[3].requestedFrom, 'attorney')
})

test('the queue attaches only the exact received file, independent of matching titles', () => {
  const rows = buildAttorneyDocumentRequestRows({
    requests: [{ id: 'request', title: 'ID', requestedDocumentId: 'file-a', status: 'uploaded' }],
    documents: [{ raw: { id: 'file-b', name: 'ID', file_path: 'wrong-file' }, fileUrl: 'wrong-url' }],
  })
  assert.equal(rows[0].document, null)
  assert.equal(rows[0].hasFile, false)
  assert.equal(rows[0].canReview, false)
  assert.equal(rows[0].statusLabel, 'Review needed')
})

test('stale files cannot be reviewed and corrections remain visible until a replacement is received', () => {
  const rows = buildAttorneyDocumentRequestRows({
    requests: [
      { id: 'stale', canonicalRequirementInstanceId: 'seller-id', requestedDocumentId: 'old', status: 'uploaded' },
      { id: 'correction', requestedDocumentId: 'old', status: 'rejected', rejectedReason: 'Certified copy needed', dueDate: '2026-10-01' },
      { id: 'completed', status: 'completed', dueDate: '2026-10-01' },
      { id: 'cancelled', status: 'cancelled' },
    ],
    documents: [{ id: 'old', file_path: 'old-file', name: 'Old copy' }],
    requiredRows: [{ requirement: { ...requirement, uploadedDocumentId: 'replacement' } }],
    now: new Date(2026, 9, 3, 10),
  })
  const stale = rows.find(row => row.id === 'stale')
  assert.equal(stale.stale, true)
  assert.equal(stale.canReview, false)
  assert.equal(rows[0].id, 'correction')
  assert.equal(rows[0].correctionReason, 'Certified copy needed')
  assert.equal(rows[0].overdue, true)
  assert.equal(rows.find(row => row.id === 'completed').overdue, false)
  assert.equal(rows.find(row => row.id === 'cancelled').status, 'cancelled')
})

test('a stored file remains reviewable when its temporary URL could not be resolved', () => {
  const [row] = buildAttorneyDocumentRequestRows({
    requests: [{ id: 'request', requested_document_id: 'file', status: 'under_review', requested_from: 'buyer' }],
    documents: [{ raw: { id: 'file', file_path: 'stored-file' }, fileUrl: '' }],
  })
  assert.equal(row.hasFile, true)
  assert.equal(row.canReview, true)
  assert.equal(row.requestedFrom, 'buyer')
})
