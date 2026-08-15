import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {
  KINGSTONS_SELLER_PACK_TRANSACTION_ENFORCEMENT_VERSION,
  applyKingstonsSellerPackReadinessToProgress,
  buildKingstonsSellerPackProgressBlockerDetails,
  buildKingstonsSellerPackProgressBlockers,
  buildKingstonsSellerPackTransactionReadiness,
} from '../src/core/transactions/kingstonsSellerPackTransactionReadiness.js'
import { SELLER_BASE_PACK_COMPLETION_ROUTES } from '../src/lib/sellerBasePackContract.js'

const repoRoot = process.cwd()
const unitDetailPath = path.join(repoRoot, 'src/pages/UnitDetail.jsx')
const unitDetail = fs.readFileSync(unitDetailPath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

const signedMandate = {
  id: 'doc-1',
  name: 'Signed mandate.pdf',
  document_type: 'signed_mandate',
  source: 'seller_portal',
  source_document_id: 'listing-doc-1',
  status: 'approved',
}
const signedDefectForm = {
  id: 'doc-2',
  name: 'Defect disclosure.pdf',
  document_type: 'signed_disclosure_form',
  source: 'seller_portal',
  source_document_id: 'listing-doc-2',
  status: 'uploaded',
}
const signedFicaForm = {
  id: 'doc-3',
  name: 'Signed FICA declaration.pdf',
  document_type: 'signed_fica_declaration',
  source: 'seller_portal',
  source_document_id: 'listing-doc-3',
  status: 'verified',
  completionRoute: SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT,
  uploadContext: {
    sellerType: 'natural',
    contextCapturedAt: '2026-07-20T08:00:00.000Z',
  },
}

const missingFicaReadiness = buildKingstonsSellerPackTransactionReadiness({
  documents: [signedMandate, signedDefectForm],
})
const sellerPackBlockers = buildKingstonsSellerPackProgressBlockers(missingFicaReadiness)

assert.equal(missingFicaReadiness.gate.attorneyHandoffReady, false)
assert.equal(sellerPackBlockers.length, 1)
assert.equal(sellerPackBlockers[0], 'Signed FICA Declaration is missing from transaction documents.')

const baseProgressModel = {
  mainStage: 'FIN',
  currentStageBlockers: ['Bond approval is still outstanding.'],
  transitionBlockersByStage: {
    ATTY: ['Bond approval is still outstanding.'],
    XFER: [],
    REG: [],
  },
  stepBlockersByStage: {
    FIN: ['Bond approval is still outstanding.'],
    ATTY: [],
    XFER: [],
    REG: [],
  },
  stageSummaryByKey: {
    FIN: { blockers: ['Bond approval is still outstanding.'] },
    ATTY: { blockers: [] },
    XFER: { blockers: [] },
    REG: { blockers: [] },
  },
  isAtRisk: false,
  canMoveTo() {
    return true
  },
  getTransitionBlockers(targetStage) {
    return targetStage === 'ATTY' ? ['Bond approval is still outstanding.'] : []
  },
}

const enforcedProgressModel = applyKingstonsSellerPackReadinessToProgress(
  baseProgressModel,
  missingFicaReadiness,
  { enabled: true },
)

assert.equal(enforcedProgressModel.sellerPackTransactionGate.version, KINGSTONS_SELLER_PACK_TRANSACTION_ENFORCEMENT_VERSION)
assert.equal(enforcedProgressModel.sellerPackTransactionGate.status, 'blocked')
assert.equal(enforcedProgressModel.isAtRisk, true)
assert.deepEqual(enforcedProgressModel.sellerPackTransactionGate.gateStageKeys, ['ATTY', 'XFER', 'REG'])
assert.deepEqual(enforcedProgressModel.sellerPackTransactionGate.blockerDetails, [
  {
    key: 'kingstons_seller_pack:signed_fica_declaration',
    documentKey: 'signed_fica_declaration',
    label: 'Signed FICA Declaration',
    reason: 'Signed FICA Declaration is missing from transaction documents.',
  },
])
assert.ok(enforcedProgressModel.currentStageBlockers.includes('Signed FICA Declaration is missing from transaction documents.'))
assert.equal(enforcedProgressModel.canMoveTo('ATTY'), false)
assert.deepEqual(enforcedProgressModel.getTransitionBlockers('ATTY'), [
  'Bond approval is still outstanding.',
  'Signed FICA Declaration is missing from transaction documents.',
])
assert.ok(enforcedProgressModel.transitionBlockersByStage.ATTY.includes('Signed FICA Declaration is missing from transaction documents.'))
assert.ok(enforcedProgressModel.stepBlockersByStage.ATTY.includes('Signed FICA Declaration is missing from transaction documents.'))
assert.ok(enforcedProgressModel.stageSummaryByKey.ATTY.blockers.includes('Signed FICA Declaration is missing from transaction documents.'))

const readyReadiness = buildKingstonsSellerPackTransactionReadiness({
  documents: [signedMandate, signedDefectForm, signedFicaForm],
})
const readyProgressModel = applyKingstonsSellerPackReadinessToProgress(
  baseProgressModel,
  readyReadiness,
  { enabled: true },
)

assert.equal(readyProgressModel.sellerPackTransactionGate, undefined)
assert.equal(readyProgressModel.canMoveTo('ATTY'), true)
assert.deepEqual(readyProgressModel.currentStageBlockers, ['Bond approval is still outstanding.'])

const physicalFicaWithoutContextReadiness = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    signedMandate,
    signedDefectForm,
    {
      id: 'doc-physical-fica-no-context',
      name: 'Signed FICA declaration.pdf',
      document_type: 'signed_fica_declaration',
      source: 'seller_portal',
      source_document_id: 'listing-doc-physical-fica-no-context',
      status: 'uploaded',
      completionRoute: SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT,
    },
  ],
})
const contextBlockerDetails = buildKingstonsSellerPackProgressBlockerDetails(physicalFicaWithoutContextReadiness)
const contextBlockers = buildKingstonsSellerPackProgressBlockers(physicalFicaWithoutContextReadiness)
const contextBlockedProgressModel = applyKingstonsSellerPackReadinessToProgress(
  baseProgressModel,
  physicalFicaWithoutContextReadiness,
  { enabled: true },
)

assert.equal(physicalFicaWithoutContextReadiness.gate.attorneyHandoffReady, false)
assert.equal(contextBlockers[0], 'Physical FICA declaration upload is missing seller-context metadata.')
assert.deepEqual(contextBlockerDetails, [
  {
    key: 'kingstons_seller_pack:signed_fica_declaration',
    documentKey: 'signed_fica_declaration',
    label: 'Signed FICA Declaration',
    reason: 'Physical FICA declaration upload is missing seller-context metadata.',
  },
])
assert.equal(contextBlockedProgressModel.canMoveTo('ATTY'), false)
assert.deepEqual(contextBlockedProgressModel.getTransitionBlockers('ATTY'), [
  'Bond approval is still outstanding.',
  'Physical FICA declaration upload is missing seller-context metadata.',
])
assert.deepEqual(contextBlockedProgressModel.sellerPackTransactionGate.blockerDetails, contextBlockerDetails)

const disabledProgressModel = applyKingstonsSellerPackReadinessToProgress(
  baseProgressModel,
  missingFicaReadiness,
  { enabled: false },
)

assert.equal(disabledProgressModel.sellerPackTransactionGate, undefined)
assert.equal(disabledProgressModel.canMoveTo('ATTY'), true)
assert.deepEqual(disabledProgressModel.currentStageBlockers, ['Bond approval is still outstanding.'])

assertIncludes(
  unitDetail,
  'applyKingstonsSellerPackReadinessToProgress',
  'UnitDetail must import the Seller Pack progress enforcement helper.',
)
assertIncludes(
  unitDetail,
  'const baseStageProgressModel = buildTransactionStageProgressModel',
  'UnitDetail must keep the ordinary progress model as the base model.',
)
assertIncludes(
  unitDetail,
  'const stageProgressModel = applyKingstonsSellerPackReadinessToProgress',
  'UnitDetail must use the Seller Pack-enforced progress model for downstream transaction UI.',
)
assertIncludes(
  unitDetail,
  'enabled: shouldShowSellerPackTransactionReadiness',
  'Seller Pack enforcement must remain scoped to listing-origin or Seller Pack transactions.',
)
assertIncludes(
  unitDetail,
  'const sellerPackAttorneyHandoffBlocked = Boolean',
  'UnitDetail must expose an explicit Seller Pack attorney handoff gate.',
)
assertIncludes(
  unitDetail,
  'if (sellerPackAttorneyHandoffBlocked)',
  'Move-to-transfer handler must stop attorney handoff while Seller Pack readiness is blocked.',
)
assertIncludes(
  unitDetail,
  'Cannot move to Transfer yet. ${sellerPackAttorneyHandoffReason}',
  'Blocked attorney handoff must explain the Seller Pack blockers.',
)
assertIncludes(
  unitDetail,
  "label: sellerPackAttorneyHandoffBlocked",
  'Move-to-transfer action must show that the Seller Pack is required.',
)
assertIncludes(
  unitDetail,
  'disabled: isBusy || sellerPackAttorneyHandoffBlocked',
  'Move-to-transfer action must be disabled while Seller Pack attorney handoff is blocked.',
)
assertIncludes(
  unitDetail,
  "reason: sellerPackAttorneyHandoffBlocked ? sellerPackAttorneyHandoffReason : ''",
  'Move-to-transfer action must expose the Seller Pack blocker reason while disabled.',
)
assertIncludes(
  unitDetail,
  'data-testid="kingstons-attorney-handoff-gate"',
  'Documents tab must render a visible Kingston attorney handoff gate message.',
)
assertIncludes(
  unitDetail,
  'sellerPackAttorneyHandoffReason',
  'Move-to-transfer enforcement must reuse the resolved Seller Pack blocker reason.',
)

console.log('Kingstons seller pack phase 6 readiness enforcement guard passed.')
