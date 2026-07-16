import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentRecoveryPermission,
  buildLegalDocumentWorkspaceEditPermission,
  buildLegalDocumentWorkspaceModel,
} from '../legalDocumentWorkspaceModel.js'

const definition = {
  key: 'otp',
  packetType: 'otp',
  label: 'Offer to Purchase',
  shortLabel: 'OTP',
}

const liveTemplate = {
  id: 'otp-live',
  packet_type: 'otp',
  template_label: 'Offer to Purchase',
  version_tag: 'v4',
  status: 'published',
  is_default: true,
  is_active: true,
  updated_at: '2026-07-14T08:00:00.000Z',
}

const draftTemplate = {
  id: 'otp-draft',
  packet_type: 'otp',
  template_label: 'Offer to Purchase review draft',
  version_tag: 'v5',
  status: 'draft',
  is_default: false,
  is_active: true,
  updated_at: '2026-07-16T06:00:00.000Z',
  sections: [
    {
      id: 'buyer-details',
      section_key: 'buyer_details',
      section_label: 'Buyer details',
      section_type: 'legal_text',
      sort_order: 0,
      legal_text: 'Buyer: {{buyer.full_name}}',
      placeholder_keys: ['buyer.full_name'],
      metadata_json: {},
    },
    {
      id: 'cash-sale',
      section_key: 'cash_sale_pack',
      section_label: 'Cash purchase',
      section_type: 'legal_text',
      sort_order: 1,
      legal_text: 'The purchase price is payable in cash.',
      condition_json: { enabled: true, field: 'transaction.finance_type', operator: 'equals', value: 'cash' },
      metadata_json: {},
    },
  ],
}

const documentModel = {
  key: 'otp',
  packetType: 'otp',
  label: 'Offer to Purchase',
  status: 'live',
  liveTemplate,
  liveTemplateId: liveTemplate.id,
  templates: [draftTemplate, liveTemplate],
  draftCount: 1,
  rolloutOperations: {
    status: 'healthy',
    healthy: true,
    canRollback: true,
    canonical: true,
    liveTemplateId: 'otp-live',
    liveVersionId: 'otp-version-4',
    rollbackVersionId: 'otp-version-3',
    rollbackTemplateLabel: 'Offer to Purchase v3',
    checks: [{ key: 'recovery_pointer', label: 'Previous live version retained', passed: true }],
    blockers: [],
  },
  launchReadiness: {
    canActivate: false,
    canGenerateLive: false,
    blockers: ['Legal approval is incomplete.'],
    steps: [
      { key: 'structure', label: 'Document structure', passed: true, detail: 'Content is present.' },
      { key: 'approval', label: 'Legal approval', passed: false, detail: 'One item remains.' },
    ],
  },
}

test('builds the complete phase-one workspace projection', () => {
  const workspace = buildLegalDocumentWorkspaceModel({
    definition,
    documentModel,
    template: draftTemplate,
    selectedBlockId: 'cash-sale',
  })

  assert.equal(workspace.schemaVersion, 'legal_document_workspace_v1')
  assert.equal(workspace.document.label, 'Offer to Purchase')
  assert.equal(workspace.document.liveVersion, 'v4')
  assert.equal(workspace.workingDraft.templateId, 'otp-draft')
  assert.equal(workspace.workingDraft.saveStatus, 'saved')
  assert.deepEqual(workspace.outline.map((item) => item.label), ['Buyer details', 'Cash purchase'])
  assert.equal(workspace.selectedBlockId, 'cash-sale')
  assert.equal(workspace.selectedBlock.classification.conditional, true)
  assert.equal(workspace.publication.status, 'blocked')
  assert.equal(workspace.publication.passedChecks, 1)
  assert.equal(workspace.publication.totalChecks, 2)
  assert.equal(workspace.publication.checks[0].label, 'Document content')
  assert.equal(workspace.publication.blockingItems[0].message, 'Legal approval is incomplete.')
  assert.equal(workspace.recovery.status, 'healthy')
  assert.equal(workspace.recovery.canRestore, true)
  assert.equal(workspace.recovery.restoreVersionId, 'otp-version-3')
  assert.equal(workspace.scenarios.length, 4)
  assert.deepEqual(workspace.versionHistory.map((item) => item.version), ['v5', 'v4'])
})

test('limits live-version recovery to administrators in the owning organisation', () => {
  const ownedLiveTemplate = { organisation_id: 'org-1' }
  assert.deepEqual(buildLegalDocumentRecoveryPermission(
    ownedLiveTemplate,
    'org-1',
    { membershipRole: 'principal' },
  ), { allowed: true, reason: '' })
  assert.equal(buildLegalDocumentRecoveryPermission(
    ownedLiveTemplate,
    'org-1',
    { membershipRole: 'agent' },
  ).allowed, false)
  assert.equal(buildLegalDocumentRecoveryPermission(
    ownedLiveTemplate,
    'org-2',
    { membershipRole: 'principal' },
  ).allowed, false)
})

test('selects the first block when the requested block no longer exists', () => {
  const workspace = buildLegalDocumentWorkspaceModel({
    definition,
    documentModel,
    template: draftTemplate,
    selectedBlockId: 'removed-block',
  })

  assert.equal(workspace.selectedBlockId, 'buyer-details')
  assert.equal(workspace.selectedBlock.label, 'Buyer details')
})

test('returns a stable empty workspace for an unconfigured document', () => {
  const workspace = buildLegalDocumentWorkspaceModel({ definition, documentModel: {}, template: null })

  assert.equal(workspace.document.status, 'missing')
  assert.equal(workspace.workingDraft.saveStatus, 'idle')
  assert.deepEqual(workspace.blocks, [])
  assert.equal(workspace.selectedBlock, null)
  assert.equal(workspace.publication.ready, false)
  assert.equal(workspace.publication.blockingItems.length, 1)
})

test('allows only organisation-owned mutable drafts in the simple editor', () => {
  assert.deepEqual(buildLegalDocumentWorkspaceEditPermission({
    organisation_id: 'org-1',
    status: 'draft',
    is_active: false,
  }, 'org-1', { membershipRole: 'principal' }), { editable: true, reason: '' })
  assert.equal(buildLegalDocumentWorkspaceEditPermission({
    organisation_id: 'org-1',
    status: 'published',
    is_active: true,
  }, 'org-1', { membershipRole: 'principal' }).editable, false)
  assert.equal(buildLegalDocumentWorkspaceEditPermission({
    organisation_id: null,
    status: 'draft',
  }, 'org-1', { membershipRole: 'principal' }).editable, false)
  assert.equal(buildLegalDocumentWorkspaceEditPermission({
    organisation_id: 'org-1',
    status: 'draft',
  }, 'org-1', { membershipRole: 'agent' }).editable, false)
})
