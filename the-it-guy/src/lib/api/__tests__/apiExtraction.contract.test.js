// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { expect, it } from 'vitest'
import contract from './fixtures/api-extraction-contract.json'
import domainContract from './fixtures/domain-api-contract.json'
import { canonicalDeclaration, readDomainDeclarations } from '../../../../scripts/helpers/domainApiSource.mjs'
import { loadDomainCapabilities } from '../../../../scripts/helpers/domainApiRuntime.mjs'

it('preserves every existing public API name and the extracted function bodies', () => {
  const names = Object.keys(domainContract.exports), bodies = {}
  const modules = [

    '../shared/readHelpers.js',
    '../../../domains/developments/readApi.js',
    '../../../domains/developments/profileNormalization.js',
    '../../../lib/api/shared/schemaReadCompatibility.js',
    '../../../core/transactions/legacyReadModel.js',
    '../../../domains/developments/scopeReadApi.js',
    '../../../domains/documents/requirementReadModel.js',
    '../../../domains/transactions/summaryReadApi.js',
    '../../../domains/developments/unitReadApi.js',
    '../../../domains/reporting/portfolioReadApi.js',
    '../../../domains/developments/configurationApi.js',
    '../../../domains/developments/detailReadApi.js',
    '../../../domains/partners/readApi.js',
    '../../../domains/developments/selectionReadApi.js',
    '../../../domains/developments/participantReadApi.js',
    '../../../domains/developments/portfolioReadApi.js',
    '../../../domains/transactions/workspaceReadApi.js',
    '../../../domains/transactions/readCache.js',
    '../../../domains/transactions/readinessReadApi.js',
    '../../../domains/transactions/listReadApi.js',
    '../../../domains/documents/listReadApi.js',
    '../../../domains/transactions/activityReadApi.js',
    '../../../domains/developments/creationWorkflow.js',
    '../../../domains/developments/detailActions.js',
    '../../../domains/developments/persistenceHelpers.js',
    '../../../domains/developments/configurationActions.js',
    '../../../domains/developments/financialActions.js',
    '../../../domains/developments/stockActions.js',
    '../../../domains/developments/documentActions.js',
    '../../../lib/api/shared/storage.js',
    '../../../domains/developments/marketingActions.js',
    '../../../domains/partners/invitationActions.js',
    '../../../domains/onboarding/workflow.js',
    '../../../lib/api/shared/schemaCompatibility.js',
    '../../../domains/documents/requirementActions.js',
    '../../../domains/transactions/eventActions.js',
    '../../../domains/access/actorContext.js',
    '../../../domains/developments/accessReadApi.js',
  ]
  for (const [name, record] of readDomainDeclarations()) {
    const body = record.source.replace(/import\("server\/([^"]+)"\)/g, (_match, rest) => "import('../../server/" + rest + "')")
    bodies[name] = createHash('sha256').update(body).digest('hex')
  }
  for (const relative of modules) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
    for (const node of ast.program.body) {
      const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
      if (declaration?.type === 'FunctionDeclaration') {
        // The cover helper now imports the same implementation through its small
        // read-only entry. Ignore that relocated import when comparing bodies.
        const body = source.slice(declaration.start, declaration.end).replace(
          "import('../../../server/services/workflowRecomputeService.js')",
          "import('../../server/services/workflowRecomputeService.js')",
        ).replace(
          "import('../../services/listings/listingCoverReadService.js')",
          "import('../services/privateListingService.js')",
        )
        bodies[declaration.id.name] = createHash('sha256').update(body).digest('hex')
      }
    }
  }
  expect(names.sort()).toEqual(contract.exports)
  for (const [name, hash] of Object.entries(contract.declarations)) expect(bodies[name], `${name} changed during structural extraction`).toBe(hash)
})

it('keeps legacy read exports bound to the extracted implementations', async () => {
  const legacy = await loadDomainCapabilities()
  const reads = await import('../../../domains/developments/api.js')
  for (const name of Object.keys(reads)) expect(legacy[name], name).toBe(reads[name])
  {
    const implementation = await import('../../../domains/developments/selectionReadApi.js')
    for (const name of ["fetchDevelopmentOptions","fetchUnitsForTransactionSetup","invalidateDevelopmentOptionsCache"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/participantReadApi.js')
    for (const name of ["fetchDevelopmentParticipants","STAKEHOLDER_STATUS_VALUES","fetchAssignedDevelopmentIdsForRole"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/portfolioReadApi.js')
    for (const name of ["fetchDevelopmentsData"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/transactions/workspaceReadApi.js')
    for (const name of ["fetchTransactionRouteCoreById","fetchTransactionCoreById","fetchTransactionPropertyContextById"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/transactions/listReadApi.js')
    for (const name of ["fetchUnitsDataSummary","fetchUnitsData","fetchTransactionsData"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/transactions/readinessReadApi.js')
    for (const name of ["ONBOARDING_STATUSES","TRANSACTION_ISSUE_TYPES"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/documents/listReadApi.js')
    for (const name of ["fetchDocumentsData","fetchDocumentsByUnit"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/transactions/activityReadApi.js')
    for (const name of ["fetchTransactionEvents","TRANSACTION_EVENT_TYPES","fetchTransactionProxyUpdates"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/transactions/readCache.js')
    for (const name of ["invalidateTransactionWorkspaceCoreCache"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/creationWorkflow.js')
    for (const name of ["createDevelopmentWorkspace"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/detailActions.js')
    for (const name of ["createDevelopment","saveDevelopmentDetails"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/configurationActions.js')
    for (const name of ["updateDevelopmentSettings","saveDevelopmentAttorneyConfig","saveDevelopmentBondConfig"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/financialActions.js')
    for (const name of ["saveDevelopmentFinancials"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/stockActions.js')
    for (const name of ["saveDevelopmentStructureNodes","saveDevelopmentProductCatalogue","saveDevelopmentUnit","createUnit"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/documentActions.js')
    for (const name of ["uploadDevelopmentDocumentAsset","saveDevelopmentDocument","deleteDevelopmentDocument","createDevelopmentDocumentRequirement","deleteDevelopmentDocumentRequirement"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/marketingActions.js')
    for (const name of ["createDevelopmentMarketingAccess","sendDevelopmentMarketingAccessInvite","acceptDevelopmentMarketingInvite","createDevelopmentMarketingEvent"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/partners/invitationActions.js')
    for (const name of ["createDeveloperPartnerInvite","sendDeveloperPartnerInvitation"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/onboarding/workflow.js')
    for (const name of ["getOrCreateTransactionOnboarding","recordBuyerOnboardingSent"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/documents/requirementActions.js')
    for (const name of ["ensureTransactionRequiredDocuments"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/access/actorContext.js')
    for (const name of ["FIRM_ROLE_VALUES"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/developments/accessReadApi.js')
    for (const name of ["fetchDeveloperAccessOptions"]) expect(legacy[name], name).toBe(implementation[name])
  }
  {
    const implementation = await import('../../../domains/transactions/eventActions.js')
    for (const name of ["createTransactionEvent"]) expect(legacy[name], name).toBe(implementation[name])
  }
}, 40_000)


it('preserves every remaining declaration during final domain extraction', () => {
  const declarations = readDomainDeclarations()
  for (const item of domainContract.declarations) {
    const record = declarations.get(item.names[0] || item.module + ':' + item.kind)
    expect(record, item.names.join(', ') || item.kind).toBeTruthy()
    const hash = createHash('sha256').update(canonicalDeclaration(record.source, record.location)).digest('hex')
    expect(hash, item.names.join(', ') || item.kind).toBe(item.hash)
  }
}, 30000)

it('keeps all historical public capabilities available from their owning module', async () => {
  const capabilities = await loadDomainCapabilities()
  expect(Object.keys(capabilities).sort()).toEqual(contract.exports)
  for (const [name, value] of Object.entries(capabilities)) expect(value, name).not.toBeUndefined()
})
