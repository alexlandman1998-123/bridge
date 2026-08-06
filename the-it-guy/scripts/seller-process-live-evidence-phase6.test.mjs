import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildKingstonsSellerProcessActionModel } from '../src/services/sellerProcessActionModelService.js'
import { buildKingstonsSellerProcessRailModel } from '../src/services/sellerProcessRailModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

const kingstonsBase = {
  sellerProcessProfile: 'kingstons_residential',
  lead: {
    id: 'kingston-live-evidence-lead',
    status: 'Contacted',
  },
  listing: {
    id: 'kingston-live-evidence-listing',
    listingStatus: 'draft',
  },
  appointments: [
    { appointmentType: 'seller_valuation', status: 'scheduled' },
  ],
  activities: [
    { activityType: 'Seller Contact - Call', status: 'completed' },
  ],
}

{
  const pendingPlaceholderOnly = buildKingstonsSellerProcessActionModel({
    ...kingstonsBase,
    documents: [
      {
        key: 'valuation_document',
        documentType: 'valuation_document',
        title: 'Formal Valuation Document',
        status: 'pending',
        source: 'kingstons_seller_process',
      },
    ],
  })

  assert.equal(pendingPlaceholderOnly.visible, true)
  assert.equal(
    pendingPlaceholderOnly.currentAction?.key,
    'upload_valuation_document',
    'the UI-only pending valuation requirement must not advance Kingston evidence',
  )
  assert.equal(
    pendingPlaceholderOnly.evaluation.evidence.valuation_document_uploaded.satisfied,
    false,
  )
}

{
  const uploadedSellerDocumentRow = {
    key: 'valuation_document',
    requirementKey: 'valuation_document',
    documentType: 'valuation_document',
    title: 'Formal Valuation Document',
    status: 'uploaded',
    fileUrl: 'https://example.test/valuation.pdf',
    source: 'seller_document_center',
  }
  const actionModel = buildKingstonsSellerProcessActionModel({
    ...kingstonsBase,
    documents: [uploadedSellerDocumentRow],
  })
  const railModel = buildKingstonsSellerProcessRailModel({
    ...kingstonsBase,
    documents: [uploadedSellerDocumentRow],
  })

  assert.equal(actionModel.evaluation.evidence.valuation_document_uploaded.satisfied, true)
  assert.equal(actionModel.currentAction?.key, 'schedule_valuation_presentation')
  assert.equal(railModel.stages.find((stage) => stage.key === 'formal_valuation')?.complete, true)
  assert.equal(railModel.currentStageKey, 'valuation_presentation')
}

{
  assert.match(
    agencyPipelineSource,
    /const selectedSellerProcessDocumentRows = useMemo\(\(\) => buildSellerLeadDocumentRowsFromSource/,
    'AgencyPipelinePage should normalize seller document rows once for live process evidence',
  )
  assert.match(
    agencyPipelineSource,
    /const selectedSellerProcessEvidenceDocuments = useMemo\(\(\) => \[/,
    'AgencyPipelinePage should build a dedicated evidence document collection',
  )
  assert.match(
    agencyPipelineSource,
    /buildKingstonsSellerProcessRailModel\(\{[\s\S]*?documents: selectedSellerProcessEvidenceDocuments,/,
    'Kingston rail model must receive live evidence documents',
  )
  assert.match(
    agencyPipelineSource,
    /buildKingstonsSellerProcessActionModel\(\{[\s\S]*?documents: selectedSellerProcessEvidenceDocuments,/,
    'Kingston next-best-action model must receive live evidence documents',
  )

  const evidenceDeclarationIndex = agencyPipelineSource.indexOf('const selectedSellerProcessEvidenceDocuments')
  const placeholderApplicationIndex = agencyPipelineSource.indexOf('ensureKingstonsValuationDocumentRequirement(selectedSellerProcessDocumentRows)')
  assert.ok(evidenceDeclarationIndex > -1)
  assert.ok(placeholderApplicationIndex > -1)
  assert.ok(
    evidenceDeclarationIndex < placeholderApplicationIndex,
    'pending Kingston valuation requirement should be added after evidence documents are built',
  )

  assert.equal(
    packageJson.scripts?.['test:seller-process-live-evidence-phase6'],
    'node scripts/seller-process-live-evidence-phase6.test.mjs',
  )
}

console.log('seller process live evidence Phase 6 contract passed')
