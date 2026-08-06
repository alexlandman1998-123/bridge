import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildKingstonsSellerProcessRailModel } from '../src/services/sellerProcessRailModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const phase5Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase5-valuation-document-action.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function sliceFunction(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const end = nextFunctionName ? source.indexOf(`function ${nextFunctionName}`, start) : source.length
  assert.notEqual(end, -1, `${nextFunctionName} should exist after ${functionName}`)
  return source.slice(start, end)
}

{
  const model = buildKingstonsSellerProcessRailModel({
    sellerProcessProfile: 'kingstons_residential',
  })
  const formalValuation = model.stages.find((stage) => stage.key === 'formal_valuation')
  assert.equal(formalValuation?.surface, 'documents')
  assert.equal(formalValuation?.documentType, 'valuation_document')
  assert.equal(formalValuation?.actionKey, 'upload_valuation_document')
  assert.equal(formalValuation?.actionEnabled, true)
  assert.equal(model.stages.find((stage) => stage.key === 'seller_pack')?.deferred, true)
  assert.equal(model.stages.find((stage) => stage.key === 'list_property')?.surface, 'listingWorkspace')
}

{
  const railSource = sliceFunction(pageSource, 'KingstonsSellerProcessRail', 'ListingReadinessCircle')
  assert.match(pageSource, /function canTriggerKingstonsRailAction\(stage = \{\}\)/)
  assert.match(pageSource, /const surface = normalizeText\(stage\?\.surface\)\.toLowerCase\(\)/)
  assert.match(pageSource, /\['appointments', 'documents'\]\.includes\(surface\)/)
  assert.match(railSource, /onClick=\{\(\) => onAction\(stage\.actionKey\)\}/)
  assert.match(railSource, /canTriggerKingstonsRailAction\(stage\) && typeof onAction === 'function'/)
  assert.doesNotMatch(railSource, /uploadPrivateListingDocument/)
  assert.doesNotMatch(railSource, /createAppointmentAsync/)
  assert.doesNotMatch(railSource, /updatePrivateListing/)
}

{
  const documentsTabSource = sliceFunction(pageSource, 'SellerDocumentsTab', 'SellerKpiRow')
  assert.match(documentsTabSource, /documentCenterIntent = null/)
  assert.match(documentsTabSource, /documentCenterIntent\?\.requestedAt/)
  assert.match(documentsTabSource, /setActiveTab\(category\)/)
  assert.match(documentsTabSource, /documentCenterIntent\.documentType\) === 'valuation_document'/)
  assert.match(documentsTabSource, /setSearchValue\(search \|\| 'Formal Valuation Document'\)/)
}

{
  const layoutSource = sliceFunction(pageSource, 'SellerLeadWorkspaceLayout', 'OwnershipCard')
  assert.match(layoutSource, /const \[documentCenterIntent, setDocumentCenterIntent\] = useState\(null\)/)
  assert.match(layoutSource, /const openSellerDocumentCenter = useCallback\(\(intent = \{\}\) => \{/)
  assert.match(layoutSource, /requestedAt: Date\.now\(\)/)
  assert.match(layoutSource, /key === 'upload_valuation_document'\) openSellerDocumentCenter\(\{/)
  assert.match(layoutSource, /documentType: 'valuation_document'/)
  assert.match(layoutSource, /category: 'property'/)
  assert.match(layoutSource, /search: 'Formal Valuation Document'/)
  assert.match(layoutSource, /documentCenterIntent=\{documentCenterIntent\}/)
  assert.doesNotMatch(layoutSource, /uploadPrivateListingDocument\(/)
}

{
  assert.match(phase5Doc, /Valuation Document Action/)
  assert.match(phase5Doc, /opens the existing seller document center/)
  assert.match(phase5Doc, /does not upload a file directly/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-rail-valuation-document-action-phase5'],
    'node scripts/seller-process-rail-valuation-document-action-phase5.test.mjs',
  )
}

console.log('seller process rail valuation document action Phase 5 contract passed')
