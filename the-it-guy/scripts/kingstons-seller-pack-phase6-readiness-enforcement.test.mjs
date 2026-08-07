import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {
  KINGSTONS_SELLER_PACK_TRANSACTION_ENFORCEMENT_VERSION,
  applyKingstonsSellerPackReadinessToProgress,
  buildKingstonsSellerPackProgressBlockers,
  buildKingstonsSellerPackTransactionReadiness,
} from '../src/core/transactions/kingstonsSellerPackTransactionReadiness.js'

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
  document_type: 'property_condition_disclosure',
  source: 'seller_portal',
  source_document_id: 'listing-doc-2',
  status: 'uploaded',
}
const signedFicaForm = {
  id: 'doc-3',
  name: 'Signed FICA form.pdf',
  document_type: 'signed_fica_form',
  source: 'seller_portal',
  source_document_id: 'listing-doc-3',
  status: 'verified',
}

const missingFicaReadiness = buildKingstonsSellerPackTransactionReadiness({
  documents: [signedMandate, signedDefectForm],
})
const sellerPackBlockers = buildKingstonsSellerPackProgressBlockers(missingFicaReadiness)

assert.equal(missingFicaReadiness.gate.attorneyHandoffReady, false)
assert.equal(sellerPackBlockers.length, 1)
assert.equal(sellerPackBlockers[0], 'Signed FICA Form is missing from transaction documents.')

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
assert.ok(enforcedProgressModel.currentStageBlockers.includes('Signed FICA Form is missing from transaction documents.'))
assert.equal(enforcedProgressModel.canMoveTo('ATTY'), false)
assert.deepEqual(enforcedProgressModel.getTransitionBlockers('ATTY'), [
  'Bond approval is still outstanding.',
  'Signed FICA Form is missing from transaction documents.',
])
assert.ok(enforcedProgressModel.transitionBlockersByStage.ATTY.includes('Signed FICA Form is missing from transaction documents.'))
assert.ok(enforcedProgressModel.stepBlockersByStage.ATTY.includes('Signed FICA Form is missing from transaction documents.'))
assert.ok(enforcedProgressModel.stageSummaryByKey.ATTY.blockers.includes('Signed FICA Form is missing from transaction documents.'))

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
  'data-testid="kingstons-attorney-handoff-gate"',
  'Documents tab must render a visible Kingston attorney handoff gate message.',
)

console.log('Kingstons seller pack phase 6 readiness enforcement guard passed.')
