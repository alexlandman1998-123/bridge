import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchTransactionDocumentAccessGrants,
  replaceTransactionDocumentManualAccessGrants,
  resolveTransactionDocumentResourceAccess,
  resolveDocumentAccessSelectionValues,
  summarizeDocumentAccessGrantHistory,
  summarizeDocumentAccessGrants,
  syncCanonicalRequirementAccessGrants,
  syncDocumentAccessGrantsFromRequest,
  syncDocumentAccessGrantsFromRequirement,
  syncDocumentRequestPermissionRows,
} from '../src/services/documents/documentAccessGrantService.js'
import {
  buildDocumentRequestAccessGrants,
  buildDocumentRequestTargets,
  getDefaultDocumentAccessSelections,
  toggleDocumentAccessSelection,
} from '../src/services/documents/documentRequestAccessForm.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

class FakeQuery {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.type = 'select'
    this.filters = []
    this.payload = null
    this.single = false
  }

  select() {
    this.type = 'select'
    return this
  }

  insert(rows) {
    const normalizedRows = Array.isArray(rows) ? rows : [rows]
    if (!this.client.inserts[this.table]) this.client.inserts[this.table] = []
    this.client.inserts[this.table].push(...normalizedRows)
    return Promise.resolve({ data: null, error: null })
  }

  update(payload) {
    this.type = 'update'
    this.payload = payload
    return this
  }

  eq(column, value) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  in(column, values) {
    this.filters.push({ op: 'in', column, values })
    return this
  }

  is(column, value) {
    this.filters.push({ op: 'is', column, value })
    return this
  }

  maybeSingle() {
    this.single = true
    return this
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject)
  }

  execute() {
    if (this.type === 'update') {
      if (!this.client.updates[this.table]) this.client.updates[this.table] = []
      this.client.updates[this.table].push({ payload: this.payload, filters: this.filters })
      return { data: null, error: null }
    }

    const rows = [
      ...(this.client.seed[this.table] || []),
      ...(this.client.inserts[this.table] || []),
    ]
    const data = rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.op === 'eq') return row[filter.column] === filter.value
        if (filter.op === 'in') return filter.values.includes(row[filter.column])
        if (filter.op === 'is') return (row[filter.column] ?? null) === filter.value
        return true
      }),
    )
    return {
      data: this.single ? data[0] || null : data,
      error: null,
    }
  }
}

class FakeClient {
  constructor(seed = {}) {
    this.seed = seed
    this.inserts = {}
    this.updates = {}
  }

  from(table) {
    return new FakeQuery(this, table)
  }
}

const ACCESS_GRANTS_TABLE = 'transaction_document_access_grants'
const TARGETS_TABLE = 'document_request_targets'

async function testManualRequestCreation() {
  const client = new FakeClient()
  await syncDocumentRequestPermissionRows({
    client,
    transactionId: 'tx-1',
    createdRequests: [{ id: 'request-1', title: 'Latest bank statements' }],
    sourceRequests: [
      {
        requestedFrom: 'buyer',
        targets: ['buyer'],
        accessGrants: [{ role: 'bond_originator' }],
        visibility: 'internal_only',
      },
    ],
    actor: { userId: 'requester-1', role: 'agent' },
    createdAt: '2026-07-09T10:00:00.000Z',
  })

  const targetRows = client.inserts[TARGETS_TABLE] || []
  const grantRows = client.inserts[ACCESS_GRANTS_TABLE] || []
  assert.equal(targetRows.length, 1)
  assert.equal(targetRows[0].target_type, 'client_group')
  assert.equal(targetRows[0].client_group, 'buyer')
  assert.equal(targetRows[0].can_upload, true)

  const requesterGrant = grantRows.find((row) => row.source_detail === 'requester')
  assert.equal(requesterGrant.user_id, 'requester-1')
  assert.equal(requesterGrant.can_download, true)
  assert.equal(requesterGrant.can_manage, true)

  const targetGrant = grantRows.find((row) => row.source_detail === 'request_target')
  assert.equal(targetGrant.client_group, 'buyer')
  assert.equal(targetGrant.can_upload, true)
  assert.equal(targetGrant.can_download, false)

  const selectedAccessGrant = grantRows.find((row) => row.source_detail === 'selected_access')
  assert.equal(selectedAccessGrant.role_type, 'bond_originator')
  assert.equal(selectedAccessGrant.can_download, true)
}

async function testRequestUploadInheritance() {
  const client = new FakeClient({
    [ACCESS_GRANTS_TABLE]: [
      {
        document_request_id: 'request-1',
        principal_type: 'user',
        user_id: 'requester-1',
        can_download: true,
        can_review: false,
        can_manage: true,
        source_detail: 'requester',
        revoked_at: null,
      },
      {
        document_request_id: 'request-1',
        principal_type: 'client_group',
        client_group: 'buyer',
        can_download: false,
        can_review: false,
        can_manage: false,
        source_detail: 'request_target',
        revoked_at: null,
      },
      {
        document_request_id: 'request-1',
        principal_type: 'role',
        role_type: 'bond_originator',
        can_download: true,
        can_review: false,
        can_manage: false,
        source_detail: 'selected_access',
        revoked_at: null,
      },
    ],
  })

  await syncDocumentAccessGrantsFromRequest({
    client,
    transactionId: 'tx-1',
    documentRequestId: 'request-1',
    documentId: 'document-1',
    actorUserId: 'requester-1',
    createdAt: '2026-07-09T10:10:00.000Z',
  })

  const documentGrants = client.inserts[ACCESS_GRANTS_TABLE] || []
  assert.equal(documentGrants.length, 2)
  assert.equal(documentGrants.some((row) => row.client_group === 'buyer'), false)
  assert.equal(documentGrants.some((row) => row.user_id === 'requester-1' && row.can_download), true)
  assert.equal(documentGrants.some((row) => row.role_type === 'bond_originator' && row.can_download), true)
  assert.equal((client.updates[TARGETS_TABLE] || [])[0].payload.completed_document_id, 'document-1')
}

async function testCanonicalRequirementPolicyAndInheritance() {
  const requirementClient = new FakeClient()
  await syncCanonicalRequirementAccessGrants({
    client: requirementClient,
    instances: [
      {
        id: 'requirement-1',
        transaction_id: 'tx-1',
        visible_to_roles: ['bond_originator'],
        uploadable_by_roles: ['buyer'],
        created_at: '2026-07-09T10:20:00.000Z',
      },
    ],
  })

  const requirementGrants = requirementClient.inserts[ACCESS_GRANTS_TABLE] || []
  assert.equal(requirementGrants.length, 2)
  assert.equal(requirementGrants.find((row) => row.role_type === 'bond_originator').can_download, true)
  assert.equal(requirementGrants.find((row) => row.client_group === 'buyer').can_upload, true)
  assert.equal(requirementGrants.find((row) => row.client_group === 'buyer').can_download, false)

  const uploadClient = new FakeClient({
    [ACCESS_GRANTS_TABLE]: requirementGrants.map((row) => ({
      ...row,
      revoked_at: null,
    })),
  })
  await syncDocumentAccessGrantsFromRequirement({
    client: uploadClient,
    transactionId: 'tx-1',
    requirementInstanceId: 'requirement-1',
    documentId: 'document-2',
    actorUserId: 'uploader-1',
  })

  const documentGrants = uploadClient.inserts[ACCESS_GRANTS_TABLE] || []
  assert.equal(documentGrants.length, 1)
  assert.equal(documentGrants[0].role_type, 'bond_originator')
  assert.equal(documentGrants[0].can_download, true)
  assert.equal(documentGrants.some((row) => row.client_group === 'buyer'), false)
}

async function testCanonicalUploadRepairsMissingRequirementPolicy() {
  const client = new FakeClient({
    document_requirement_instances: [
      {
        id: 'requirement-2',
        transaction_id: 'tx-1',
        visible_to_roles: ['bond_originator'],
        uploadable_by_roles: ['buyer'],
        created_at: '2026-07-09T10:30:00.000Z',
      },
    ],
  })

  await syncDocumentAccessGrantsFromRequirement({
    client,
    transactionId: 'tx-1',
    requirementInstanceId: 'requirement-2',
    documentId: 'document-3',
    actorUserId: 'uploader-1',
  })

  const allGrants = client.inserts[ACCESS_GRANTS_TABLE] || []
  const requirementGrants = allGrants.filter((row) => row.resource_type === 'requirement_instance')
  const documentGrants = allGrants.filter((row) => row.resource_type === 'document')
  assert.equal(requirementGrants.length, 2)
  assert.equal(documentGrants.length, 1)
  assert.equal(documentGrants[0].role_type, 'bond_originator')
  assert.equal(documentGrants.some((row) => row.client_group === 'buyer'), false)
}

async function testReadSideAccessResolution() {
  const client = new FakeClient({
    transaction_participants: [
      {
        id: 'participant-bond',
        transaction_id: 'tx-1',
        user_id: 'user-bond',
        role_type: 'bond_originator',
        legal_role: null,
        participant_email: 'bond@example.test',
        status: 'active',
        removed_at: null,
        can_view: true,
      },
      {
        id: 'participant-buyer',
        transaction_id: 'tx-1',
        user_id: 'user-buyer',
        role_type: 'buyer',
        participant_email: 'buyer@example.test',
        status: 'active',
        removed_at: null,
        can_view: true,
      },
    ],
    [ACCESS_GRANTS_TABLE]: [
      {
        transaction_id: 'tx-1',
        resource_type: 'document',
        document_id: 'document-bond',
        principal_type: 'role',
        role_type: 'bond_originator',
        can_view: true,
        can_download: true,
        can_upload: false,
        can_review: false,
        can_manage: false,
        revoked_at: null,
      },
      {
        transaction_id: 'tx-1',
        resource_type: 'document',
        document_id: 'document-buyer',
        principal_type: 'client_group',
        client_group: 'buyer',
        can_view: true,
        can_download: true,
        can_upload: false,
        can_review: false,
        can_manage: false,
        revoked_at: null,
      },
      {
        transaction_id: 'tx-1',
        resource_type: 'document_request',
        document_request_id: 'request-bond',
        principal_type: 'role',
        role_type: 'bond_originator',
        can_view: true,
        can_download: true,
        can_upload: false,
        can_review: false,
        can_manage: false,
        revoked_at: null,
      },
      {
        transaction_id: 'tx-1',
        resource_type: 'document_request',
        document_request_id: 'request-buyer-target',
        principal_type: 'client_group',
        client_group: 'buyer',
        can_view: true,
        can_download: false,
        can_upload: true,
        can_review: false,
        can_manage: false,
        revoked_at: null,
      },
    ],
  })

  const access = await resolveTransactionDocumentResourceAccess({
    client,
    actor: { userId: 'user-bond', email: 'bond@example.test' },
    documents: [
      { id: 'document-bond', transaction_id: 'tx-1' },
      { id: 'document-buyer', transaction_id: 'tx-1' },
      { id: 'document-legacy', transaction_id: 'tx-1' },
    ],
    documentRequests: [
      { id: 'request-bond', transaction_id: 'tx-1' },
      { id: 'request-buyer-target', transaction_id: 'tx-1' },
      { id: 'request-legacy', transaction_id: 'tx-1' },
    ],
  })

  assert.equal(access.available, true)
  assert.equal(access.documents.get('document-bond').hasGrantRows, true)
  assert.equal(access.documents.get('document-bond').canDownload, true)
  assert.equal(access.documents.get('document-buyer').hasGrantRows, true)
  assert.equal(access.documents.get('document-buyer').canView, false)
  assert.equal(access.documents.get('document-legacy').hasGrantRows, false)
  assert.equal(access.documentRequests.get('request-bond').canDownload, true)
  assert.equal(access.documentRequests.get('request-buyer-target').hasGrantRows, true)
  assert.equal(access.documentRequests.get('request-buyer-target').canUpload, false)
  assert.equal(access.documentRequests.get('request-legacy').hasGrantRows, false)
}

function testPhase4AccessFormHelpers() {
  assert.deepEqual(getDefaultDocumentAccessSelections('client_visible'), ['requested_party'])
  assert.deepEqual(getDefaultDocumentAccessSelections('professional_shared'), ['professional_group'])
  assert.deepEqual(getDefaultDocumentAccessSelections('internal'), [])
  assert.deepEqual(toggleDocumentAccessSelection(['requested_party'], 'bond_originator'), ['requested_party', 'bond_originator'])
  assert.deepEqual(toggleDocumentAccessSelection(['requested_party', 'bond_originator'], 'requested_party'), ['bond_originator'])

  const draft = {
    requestedFrom: 'buyer',
    visibility: 'client_visible',
    accessSelections: ['requested_party', 'bond_originator', 'professional_group'],
  }
  const targets = buildDocumentRequestTargets(draft)
  const grants = buildDocumentRequestAccessGrants(draft)
  assert.equal(targets.length, 1)
  assert.equal(targets[0].clientGroup, 'buyer')
  assert.equal(grants.some((grant) => grant.clientGroup === 'buyer' && grant.canDownload), true)
  assert.equal(grants.some((grant) => grant.role === 'bond_originator' && grant.canDownload), true)
  assert.equal(grants.some((grant) => grant.professionalGroup === true && grant.canDownload), true)
}

async function testPhase5ManualAccessReplacement() {
  const client = new FakeClient({
    [ACCESS_GRANTS_TABLE]: [
      {
        id: 'grant-requester',
        transaction_id: 'tx-1',
        resource_type: 'document',
        document_id: 'document-1',
        principal_type: 'user',
        user_id: 'requester-1',
        can_view: true,
        can_download: true,
        can_upload: false,
        can_review: false,
        can_manage: true,
        grant_source: 'upload_inheritance',
        source_detail: 'document_request_upload',
        revoked_at: null,
      },
      {
        id: 'grant-selected-bond',
        transaction_id: 'tx-1',
        resource_type: 'document',
        document_id: 'document-1',
        principal_type: 'role',
        role_type: 'bond_originator',
        can_view: true,
        can_download: true,
        can_upload: false,
        can_review: false,
        can_manage: false,
        grant_source: 'upload_inheritance',
        source_detail: 'document_request_upload',
        revoked_at: null,
      },
      {
        id: 'grant-manual-buyer',
        transaction_id: 'tx-1',
        resource_type: 'document',
        document_id: 'document-1',
        principal_type: 'client_group',
        client_group: 'buyer',
        can_view: true,
        can_download: true,
        can_upload: false,
        can_review: false,
        can_manage: false,
        grant_source: 'manual',
        source_detail: 'manual_access',
        revoked_at: null,
      },
    ],
  })

  const before = await fetchTransactionDocumentAccessGrants({
    client,
    transactionId: 'tx-1',
    resourceType: 'document',
    resourceId: 'document-1',
  })
  assert.deepEqual(resolveDocumentAccessSelectionValues(before.rows).sort(), ['bond_originator', 'buyer'])

  const result = await replaceTransactionDocumentManualAccessGrants({
    client,
    transactionId: 'tx-1',
    resourceType: 'document',
    resourceId: 'document-1',
    accessGrants: [{ role: 'agent', canView: true, canDownload: true }],
    actorUserId: 'requester-1',
    createdAt: '2026-07-09T11:00:00.000Z',
  })

  assert.equal(result.revokedCount, 2)
  assert.equal(result.grantCount, 1)
  const revoke = client.updates[ACCESS_GRANTS_TABLE]?.[0]
  assert.deepEqual(revoke.filters.find((filter) => filter.op === 'in').values.sort(), ['grant-manual-buyer', 'grant-selected-bond'])
  assert.equal(revoke.payload.revoked_by, 'requester-1')

  const inserted = client.inserts[ACCESS_GRANTS_TABLE] || []
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].grant_source, 'manual')
  assert.equal(inserted[0].source_detail, 'manual_access')
  assert.equal(inserted[0].role_type, 'agent')
  assert.equal(inserted[0].can_download, true)
}

function testPhase6AccessSummaries() {
  const summary = summarizeDocumentAccessGrants([
    {
      principal_type: 'user',
      user_id: 'requester-1',
      principal_label: 'Requester',
      can_view: true,
      can_download: true,
      can_manage: true,
      source_detail: 'requester',
      revoked_at: null,
    },
    {
      principal_type: 'client_group',
      client_group: 'buyer',
      can_view: true,
      can_download: true,
      can_manage: false,
      revoked_at: null,
    },
    {
      principal_type: 'role',
      role_type: 'bond_originator',
      can_view: true,
      can_download: true,
      can_manage: false,
      revoked_at: null,
    },
    {
      principal_type: 'professional_group',
      can_view: true,
      can_upload: true,
      can_download: false,
      can_manage: false,
      revoked_at: null,
    },
  ])

  assert.deepEqual(summary.downloadLabels, ['Requester', 'Buyer', 'Bond originator'])
  assert.equal(summary.summary, 'Requester, Buyer, Bond originator')
  assert.equal(summary.uploadSummary, 'Requester, Professional roleplayers')
  assert.equal(summary.manageSummary, 'Requester')
}

function testPhase7AccessHistorySummaries() {
  const history = summarizeDocumentAccessGrantHistory([
    {
      id: 'grant-active',
      principal_type: 'role',
      role_type: 'bond_originator',
      can_view: true,
      can_download: true,
      grant_source: 'manual',
      source_detail: 'manual_access',
      granted_at: '2026-07-09T10:00:00.000Z',
      granted_by: 'requester-1',
      revoked_at: null,
    },
    {
      id: 'grant-revoked',
      principal_type: 'client_group',
      client_group: 'buyer',
      can_view: true,
      can_download: true,
      grant_source: 'manual',
      source_detail: 'manual_access',
      granted_at: '2026-07-09T09:00:00.000Z',
      revoked_at: '2026-07-09T11:00:00.000Z',
      revoked_by: 'requester-1',
      revoked_reason: 'manual_access_replaced',
    },
  ])

  assert.equal(history.length, 2)
  assert.equal(history[0].id, 'grant-revoked')
  assert.equal(history[0].action, 'revoked')
  assert.equal(history[0].principalLabel, 'Buyer')
  assert.equal(history[0].permissionSummary, 'Download')
  assert.equal(history[0].sourceLabel, 'Manual access')
  assert.equal(history[1].action, 'granted')
  assert.equal(history[1].principalLabel, 'Bond originator')
}

function testWiring() {
  const api = fs.readFileSync(path.join(repoRoot, 'src/lib/api.js'), 'utf8')
  const canonicalResolver = fs.readFileSync(path.join(repoRoot, 'src/services/documents/transactionCanonicalDocumentRequirementService.js'), 'utf8')
  const canonicalLifecycle = fs.readFileSync(path.join(repoRoot, 'src/services/documents/canonicalDocumentLifecycleService.js'), 'utf8')
  const wrapper = fs.readFileSync(path.join(repoRoot, 'src/services/transactionAdditionalDocumentRequests.js'), 'utf8')
  const attorneyTransactionDetail = fs.readFileSync(path.join(repoRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
  const attorneyWorkflowPanel = fs.readFileSync(path.join(repoRoot, 'src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx'), 'utf8')
  const attorneyWorkflowService = fs.readFileSync(path.join(repoRoot, 'src/services/attorneyWorkflow/attorneyWorkflowLaneService.js'), 'utf8')
  const accessGrid = fs.readFileSync(path.join(repoRoot, 'src/components/documents/DocumentAccessSelectionGrid.jsx'), 'utf8')
  const accessForm = fs.readFileSync(path.join(repoRoot, 'src/services/documents/documentRequestAccessForm.js'), 'utf8')

  assert.match(api, /can_request_documents/)
  assert.match(api, /applyDocumentAccessToRows/)
  assert.match(api, /applyDocumentRequestAccessToRows/)
  assert.match(api, /respectAccess/)
  assert.match(api, /requestVisibilityFilterAvailable/)
  assert.match(api, /syncDocumentRequestPermissionRows/)
  assert.match(api, /syncDocumentAccessGrantsFromRequest/)
  assert.match(api, /syncDocumentAccessGrantsFromRequirement/)
  assert.match(api, /fetchTransactionDocumentAccessSettings/)
  assert.match(api, /updateTransactionDocumentAccessSettings/)
  assert.match(api, /accessSummary/)
  assert.match(api, /accessHistory/)
  assert.match(api, /previousAccessSummary/)
  assert.match(api, /nextAccessSummary/)
  assert.match(canonicalResolver, /syncCanonicalRequirementAccessGrants/)
  assert.match(canonicalLifecycle, /accessSync/)
  assert.match(wrapper, /accessGrants/)
  assert.match(wrapper, /targetParticipantIds/)
  assert.match(attorneyTransactionDetail, /DocumentAccessSelectionGrid/)
  assert.match(attorneyTransactionDetail, /accessGrants: buildDocumentRequestAccessGrants/)
  assert.match(attorneyTransactionDetail, /targets: buildDocumentRequestTargets/)
  assert.match(attorneyTransactionDetail, /openDocumentAccessManager/)
  assert.match(attorneyTransactionDetail, /handleSaveDocumentAccess/)
  assert.match(attorneyTransactionDetail, />Access</)
  assert.match(attorneyTransactionDetail, /Current download access/)
  assert.match(attorneyTransactionDetail, /Recent access changes/)
  assert.match(attorneyWorkflowPanel, /DocumentAccessSelectionGrid/)
  assert.match(attorneyWorkflowPanel, /accessGrants: buildDocumentRequestAccessGrants/)
  assert.match(attorneyWorkflowService, /syncDocumentRequestPermissionRows/)
  assert.match(attorneyWorkflowService, /accessGrants = \[\]/)
  assert.match(accessGrid, /Can view\/download uploaded file/)
  assert.match(accessForm, /requested_party/)
  assert.match(accessForm, /bond_originator/)
}

await testManualRequestCreation()
await testRequestUploadInheritance()
await testCanonicalRequirementPolicyAndInheritance()
await testCanonicalUploadRepairsMissingRequirementPolicy()
await testReadSideAccessResolution()
testPhase4AccessFormHelpers()
await testPhase5ManualAccessReplacement()
testPhase6AccessSummaries()
testPhase7AccessHistorySummaries()
testWiring()

console.log('Document access grants Phase 2/3/4/5/6/7 checks passed')
