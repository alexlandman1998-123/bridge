import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildKingstonsSellerProcessActionModel } from '../src/services/sellerProcessActionModelService.js'
import { buildKingstonsSellerProcessRailModel } from '../src/services/sellerProcessRailModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

function sliceFunction(source, functionName, nextMarker) {
  const start = source.indexOf(`function ${functionName}`)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const end = nextMarker ? source.indexOf(nextMarker, start) : source.length
  assert.notEqual(end, -1, `${nextMarker} should exist after ${functionName}`)
  return source.slice(start, end)
}

{
  const railModel = buildKingstonsSellerProcessRailModel({
    sellerProcessProfile: 'kingstons_residential',
  })
  const formalValuation = railModel.stages.find((stage) => stage.key === 'formal_valuation')
  assert.equal(formalValuation?.surface, 'documents')
  assert.equal(formalValuation?.documentType, 'valuation_document')
  assert.equal(formalValuation?.actionKey, 'upload_valuation_document')

  const actionModel = buildKingstonsSellerProcessActionModel({
    sellerProcessProfile: 'kingstons_residential',
    lead: { status: 'Contacted', stage: 'Contacted' },
    appointments: [{ appointmentType: 'seller_valuation', status: 'completed' }],
  })
  assert.equal(actionModel.currentAction?.key, 'upload_valuation_document')
  assert.equal(actionModel.currentAction?.documentType, 'valuation_document')
  assert.equal(actionModel.currentAction?.surface, 'documents')
}

{
  assert.match(agencyPipelineSource, /function ensureKingstonsValuationDocumentRequirement\(rows = \[\]\) \{/)
  assert.match(agencyPipelineSource, /key: 'valuation_document'/)
  assert.match(agencyPipelineSource, /documentType: 'valuation_document'/)
  assert.match(agencyPipelineSource, /category: 'property'/)
  assert.match(agencyPipelineSource, /title: 'Formal Valuation Document'/)
  assert.match(agencyPipelineSource, /source: 'kingstons_seller_process'/)
  assert.match(agencyPipelineSource, /if \(selectedKingstonsSellerProcessActionModel\?\.visible\) \{/)
  assert.match(agencyPipelineSource, /return ensureKingstonsValuationDocumentRequirement\(selectedSellerProcessDocumentRows\)/)
}

{
  assert.match(agencyPipelineSource, /const \[sellerDocumentCenterIntent, setSellerDocumentCenterIntent\] = useState\(null\)/)
  assert.match(agencyPipelineSource, /const \[sellerDocumentActiveCategory, setSellerDocumentActiveCategory\] = useState\('property'\)/)
  assert.match(agencyPipelineSource, /const \[sellerDocumentSearchValue, setSellerDocumentSearchValue\] = useState\(''\)/)
  assert.match(agencyPipelineSource, /sellerDocumentCenterIntent/)
  assert.match(agencyPipelineSource, /sellerDocumentCenterIntent\?\.requestedAt/)
  assert.match(agencyPipelineSource, /setSellerDocumentActiveCategory\(category\)/)
  assert.match(agencyPipelineSource, /setSellerDocumentSearchValue\(search \|\| 'Formal Valuation Document'\)/)
  assert.match(agencyPipelineSource, /data-testid="seller-document-center-controls"/)
  assert.match(agencyPipelineSource, /data-testid="seller-document-center-search"/)
}

{
  const openDocumentCenterSource = sliceFunction(agencyPipelineSource, 'openSellerDocumentCenter', 'function handleSellerJourneyAction')
  assert.match(openDocumentCenterSource, /requestedAt: Date\.now\(\)/)
  assert.match(openDocumentCenterSource, /setLeadWorkspaceTab\('documents'\)/)

  const actionSource = sliceFunction(agencyPipelineSource, 'handleSellerJourneyAction', 'function handleCalendarShift')
  assert.match(actionSource, /id === 'upload_valuation_document'/)
  assert.match(actionSource, /openSellerDocumentCenter\(\{/)
  assert.match(actionSource, /documentType: 'valuation_document'/)
  assert.match(actionSource, /category: 'property'/)
  assert.match(actionSource, /search: 'Formal Valuation Document'/)
  assert.doesNotMatch(actionSource, /uploadPrivateListingDocument\(/)
  assert.doesNotMatch(actionSource, /updatePrivateListing\(/)
}

{
  assert.match(agencyPipelineSource, /selectedSellerDocumentVisibleCategories/)
  assert.match(agencyPipelineSource, /sellerDocumentActiveCategory/)
  assert.match(agencyPipelineSource, /sellerDocumentSearchValue/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-valuation-document-action-phase5'],
    'node scripts/seller-process-valuation-document-action-phase5.test.mjs',
  )
}

console.log('seller process valuation document action Phase 5 contract passed')
