import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAttorneyDocumentVersionGroups, buildAttorneyVersionUploadContext, getCurrentAttorneyEvidenceDocuments, mergeSavedAttorneyDocumentVersion } from '../attorneyDocumentVersionModel.js'
import { buildMatterDocumentWorkspaceModel, resolveMatterDocumentVersionLabel } from '../matterDocumentWorkspaceModel.js'

const evidence = { id: 'signed', transaction_id: 'matter', name: 'signed.pdf', document_type: 'signed_transfer',
  canonical_requirement_instance_id: 'requirement', attorney_version_root_id: 'draft', attorney_version_number: 3,
  attorney_version_kind: 'signed', attorney_version_document_type: 'signed_transfer', attorney_target_requirement_id: 'requirement',
  attorney_target_request_id: 'request', related_entity_type: 'transaction_participant', related_entity_id: 'seller-person', lane_key: 'transfer', review_status: 'approved',
  client_recipient_role: 'seller', visibility_scope: 'client', file_path: 'signed.pdf',
}
const draft = { ...evidence, id: 'draft-4', name: 'revision.docx', attorney_version_number: 4, attorney_version_previous_id: 'signed',
  attorney_version_kind: 'draft', document_type: 'attorney_working_copy', canonical_requirement_instance_id: null,
  visibility_scope: 'internal', client_recipient_role: null, review_status: null,
}
test('working copies do not displace accepted evidence and only the newest evidence enters matching', () => {
  const older = { ...evidence, id: 'older', attorney_version_number: 2 }
  const ordinary = { id: 'ordinary', name: 'identity.pdf' }
  assert.deepEqual(getCurrentAttorneyEvidenceDocuments([draft, older, evidence, ordinary]).map(row => row.id), ['signed','ordinary'])
  assert.equal(resolveMatterDocumentVersionLabel(draft), 'v4')
})
test('version history groups exact roots within a matter and shows the active evidence separately from latest draft', () => {
  const groups = buildAttorneyDocumentVersionGroups({ documents: [evidence,draft,{...evidence,id:'foreign',transaction_id:'other'}],
    requirements: [{ id:'requirement',displayName:'Signed transfer pack',linkedDocument:evidence }] })
  assert.equal(groups.length,2)
  const group = groups.find(row => row.current.transaction_id === 'matter')
  assert.equal(group.current.id,'draft-4')
  assert.equal(group.activeEvidenceId,'signed')
  assert.deepEqual(group.versions.map(row => row.id),['draft-4','signed'])
})
test('next version retains exact requirement, request, participant and audience', () => {
  const context = buildAttorneyVersionUploadContext(evidence)
  assert.equal(context.canonicalRequirementInstanceId,'requirement')
  assert.equal(context.documentRequestId,'request')
  assert.equal(context.relatedEntityId,'seller-person')
  assert.equal(context.clientRecipientRole,'seller')
  assert.equal(context.attorneyPreviousVersionId,'signed')
  assert.equal(buildAttorneyVersionUploadContext(draft).documentType,'signed_transfer')
})
test('the matter reader scopes drafting and excludes unsigned files from library and checklist readiness', () => {
  const requirement = { id:'requirement',canonicalRequirementInstanceId:'requirement',key:'signed_transfer',label:'Signed transfer pack',
    uploadedDocumentId:'signed',status:'approved',owningWorkflow:'transfer',isRequired:true }
  const model = buildMatterDocumentWorkspaceModel({ documents:[draft,evidence,{...draft,id:'bond-draft',lane_key:'bond'}],
    requiredDocumentChecklist:[requirement],getLinkedRequirementForDocument:()=>requirement,
    matterScope:{scoped:true,visibleLaneKeys:['transfer']},transaction:{id:'matter'} })
  assert.deepEqual(model.allLibraryRows.map(row=>row.id),['signed'])
  assert.equal(model.requiredRows[0].linkedDocument.id,'signed')
  assert.equal(model.requiredRows[0].status,'verified')
  assert.equal(model.versionDocuments.some(row=>row.id==='draft-4'),true)
  assert.equal(model.versionDocuments.some(row=>row.id==='bond-draft'),false)
})
test('adopting a legacy upload shows retained v1 immediately; repeating a saved response does not duplicate it', () => {
  const legacy = { id:'legacy', document_type:'resolution', name:'original.pdf' }
  const saved = {...evidence,id:'new',attorney_version_root_id:'legacy',attorney_version_previous_id:'legacy',attorney_version_number:2}
  const merged = mergeSavedAttorneyDocumentVersion([legacy],saved)
  assert.equal(merged[1].attorney_version_number,1)
  assert.equal(merged[1].attorney_version_root_id,'legacy')
  assert.equal(mergeSavedAttorneyDocumentVersion(merged,saved).length,2)
})
