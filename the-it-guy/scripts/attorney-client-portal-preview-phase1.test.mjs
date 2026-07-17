import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const {
    CLIENT_PORTAL_ACCESS_KINDS,
    buildClientPortalParityProjection,
    buildClientPortalWorkspaceAccessContract,
    getClientPortalPersonaAvailability,
    getClientPortalWorkspaceDataForAccess,
    normalizeClientPortalAccessContext,
  } = await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')

  const workspaceFixture = {
    portalContext: {
      token: 'real-client-token',
      workspace: 'buying',
      contexts: [
        { contextType: 'buying', status: 'active', transactionId: 'transaction-1' },
        { contextType: 'selling', status: 'active', transactionId: 'transaction-1', sellerWorkspaceToken: 'seller-secret' },
      ],
      hasBuyingContext: true,
      hasSellingContext: true,
      workspaceRoles: ['buyer', 'seller'],
    },
    client: { id: 'buyer-1', name: 'Buyer Example' },
    transaction: { id: 'transaction-1', stage: 'transfer' },
    property: { id: 'property-1' },
    lifecycle: { stage: 'transfer' },
    timeline: [{ id: 'event-1', visibility: 'client' }],
    nextActions: [{ id: 'action-1', role: 'buyer' }],
    documentCenter: { requiredDocuments: [{ id: 'document-1', visibility_scope: 'client' }] },
    activityFeed: [{ id: 'activity-1', visibility: 'client_visible' }],
    notifications: { unreadCount: 1, items: [{ id: 'notification-1' }] },
    visibility: { workspace: 'buying', buyerVisible: true, sellerVisible: false, clientOnly: true },
    permissions: { canUploadDocuments: true, canComment: true, canViewActivityFeed: true },
    legacyPortalData: { accessToken: 'legacy-secret' },
  }

  assert.equal(normalizeClientPortalAccessContext('client-token').kind, CLIENT_PORTAL_ACCESS_KINDS.CLIENT_TOKEN)
  assert.throws(
    () => normalizeClientPortalAccessContext({ kind: CLIENT_PORTAL_ACCESS_KINDS.ATTORNEY_PREVIEW, persona: 'buyer' }),
    /preview session is required/i,
  )

  const availability = getClientPortalPersonaAvailability(workspaceFixture)
  assert.equal(availability.buyer.available, true)
  assert.equal(availability.seller.available, true)
  assert.equal(availability.seller.source, 'client_portal_contexts')
  assert.equal(getClientPortalPersonaAvailability({
    portalContext: {
      hasBuyingContext: true,
      hasSellingContext: true,
      contexts: [{ contextType: 'selling', status: 'active', sellerWorkspaceToken: 'legacy-only' }],
    },
  }).seller.available, false, 'seller preview must exclude contexts without a DB transaction anchor')

  const clientContract = buildClientPortalWorkspaceAccessContract(workspaceFixture, {
    kind: CLIENT_PORTAL_ACCESS_KINDS.CLIENT_TOKEN,
    token: 'real-client-token',
    persona: 'buyer',
  }, 'buying')
  const previewContract = buildClientPortalWorkspaceAccessContract(workspaceFixture, {
    kind: CLIENT_PORTAL_ACCESS_KINDS.ATTORNEY_PREVIEW,
    previewSessionToken: 'preview-secret',
    transactionId: 'transaction-1',
    persona: 'buyer',
  }, 'buying')
  assert.deepEqual(buildClientPortalParityProjection(previewContract), buildClientPortalParityProjection(clientContract))
  assert.equal(previewContract.permissions.readOnly, true)
  assert.equal(previewContract.permissions.canUploadDocuments, false)
  assert.equal(previewContract.permissions.canComment, false)
  assert.equal(previewContract.permissions.canSignDocuments, false)
  assert.equal(JSON.stringify(previewContract).includes('real-client-token'), false)
  assert.equal(JSON.stringify(previewContract).includes('seller-secret'), false)
  assert.equal(JSON.stringify(previewContract).includes('legacy-secret'), false)
  assert.equal(JSON.stringify(previewContract).includes('preview-secret'), false)
  const sharedClientContract = buildClientPortalWorkspaceAccessContract({
    ...workspaceFixture,
    portalContext: { ...workspaceFixture.portalContext, workspace: 'shared' },
    visibility: { workspace: 'shared', buyerVisible: true, sellerVisible: true, clientOnly: true },
  }, {
    kind: CLIENT_PORTAL_ACCESS_KINDS.CLIENT_TOKEN,
    token: 'real-client-token',
  }, 'shared')
  assert.equal(sharedClientContract.portalContext.persona, 'shared')
  assert.equal(sharedClientContract.visibility.buyerVisible, true)
  assert.equal(sharedClientContract.visibility.sellerVisible, true)
  assert.throws(
    () => buildClientPortalWorkspaceAccessContract(workspaceFixture, {
      kind: CLIENT_PORTAL_ACCESS_KINDS.ATTORNEY_PREVIEW,
      previewSessionToken: 'preview-secret',
      transactionId: 'another-transaction',
      persona: 'buyer',
    }, 'buying'),
    /does not match the requested matter/i,
  )

  const loaderCalls = []
  const loadedPreview = await getClientPortalWorkspaceDataForAccess({
    kind: CLIENT_PORTAL_ACCESS_KINDS.ATTORNEY_PREVIEW,
    previewSessionToken: 'preview-secret',
    transactionId: 'transaction-1',
    persona: 'seller',
  }, 'selling', {
    mode: 'core',
    previewWorkspaceLoader: async (request) => {
      loaderCalls.push(request)
      return workspaceFixture
    },
  })
  assert.equal(loadedPreview.access.persona, 'seller')
  assert.equal(loadedPreview.visibility.sellerVisible, true)
  assert.equal(loaderCalls[0].workspace, 'selling')
  assert.equal(loaderCalls[0].mode, 'core')
  await assert.rejects(
    getClientPortalWorkspaceDataForAccess({
      kind: CLIENT_PORTAL_ACCESS_KINDS.ATTORNEY_PREVIEW,
      previewSessionToken: 'preview-secret',
      transactionId: 'transaction-1',
      persona: 'buyer',
    }),
    /secure preview service is configured/i,
  )

  const [serviceSource, portalPage, runbook, packageJsonSource] = await Promise.all([
    readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../docs/attorney-client-portal-preview-phase1.md', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ])
  const packageJson = JSON.parse(packageJsonSource)
  assert.match(serviceSource, /CLIENT_PORTAL_ACCESS_KINDS/)
  assert.match(serviceSource, /previewWorkspaceLoader/)
  assert.match(serviceSource, /canUploadDocuments: false/)
  assert.match(serviceSource, /redactClientPortalPreviewSecrets/)
  assert.match(portalPage, /getClientPortalWorkspaceData\(token, requestedWorkspace/)
  assert.match(runbook, /fails closed until Phase 2/i)
  assert.equal(packageJson.scripts['test:attorney-client-portal-preview-phase1'], 'node scripts/attorney-client-portal-preview-phase1.test.mjs')

  console.log('attorney client-portal preview Phase 1 tests passed')
} finally {
  await server.close()
}
