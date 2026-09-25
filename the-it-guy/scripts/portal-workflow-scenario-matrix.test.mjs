import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildDealSetupDocumentRequirements } from '../src/core/transactions/dealSetupDocumentRequirements.js'
import { deriveFinanceManagedBy, normalizeFinanceType } from '../src/core/transactions/financeType.js'
import { evaluateMvpFinanceGate } from '../src/core/transactions/mvpFinanceGate.js'
import { resolveMvpLaunchRolePlan } from '../src/core/transactions/mvpLaunchRoles.js'
import { buildMvpTransactionDocumentBootstrap } from '../src/core/transactions/mvpTransactionDocumentBootstrap.js'
import { buildMvpTransactionWorkflowBootstrap } from '../src/core/transactions/mvpTransactionWorkflowBootstrap.js'
import { evaluateMvpTransferGate } from '../src/core/transactions/mvpTransferGate.js'
import { buildSignedOtpHandoffReleaseDecision } from '../src/core/transactions/signedOtpHandoffRelease.js'
import { resolveSellerPortalWorkflowProjection } from '../src/core/clientPortal/sellerPortalWorkflowProjection.js'
import { buildSellerPortalSaleJourneyGate } from '../src/core/clientPortal/sellerPortalSaleJourneyGate.js'
import { resolveSellerPortalSyncPolicy } from '../src/core/clientPortal/sellerPortalSyncPolicy.js'
import { fetchSharedMatterJourney } from '../src/services/sharedMatterJourneyReader.js'

function requirementKeys(requirements = []) {
  return new Set(requirements.map((requirement) => requirement.key || requirement.document_key))
}

function hasBlocker(result, key) {
  return result.blockers.some((blocker) => blocker.key === key)
}

function financeDocuments({ proofOfFunds = 'verified', bondPreapproval = 'approved' } = {}) {
  return [
    { document_key: 'proof_of_funds', status: proofOfFunds },
    { document_key: 'bond_preapproval', status: bondPreapproval },
  ]
}

const COMPLETE_BOND_PARTICIPANTS = [
  { role_type: 'bond_originator' },
  { role_type: 'attorney', legal_role: 'transfer' },
  { role_type: 'attorney', legal_role: 'bond' },
]

test('cash scenario requests proof of funds and never opens an originator bond lane', () => {
  const dealRequirements = requirementKeys(buildDealSetupDocumentRequirements({ setup: {
    finance: { type: 'cash' },
    buyers: [{ id: 'buyer-1', signing_required: true }],
  },
  }).requirements)
  const bootstrapRequirements = requirementKeys(buildMvpTransactionDocumentBootstrap({ financeType: 'cash' }).requirements)
  const workflow = buildMvpTransactionWorkflowBootstrap({ financeType: 'cash' })
  const gate = evaluateMvpFinanceGate({
    routingProfile: { financeType: 'cash' },
    documentRequirements: financeDocuments({ proofOfFunds: 'uploaded' }),
  })

  assert.equal(normalizeFinanceType('cash'), 'cash')
  assert.equal(deriveFinanceManagedBy({ financeType: 'cash' }), 'client')
  assert.equal(dealRequirements.has('proof_of_funds'), true)
  assert.equal(dealRequirements.has('bond_application'), false)
  assert.equal(bootstrapRequirements.has('proof_of_funds'), true)
  assert.equal(bootstrapRequirements.has('bond_preapproval'), false)
  assert.equal(workflow.lanes.some((lane) => lane.laneType === 'bond'), false)
  assert.equal(hasBlocker(gate, 'document:proof_of_funds'), true)
})

test('originator-managed bond scenario requires the bond handoff and approval evidence', () => {
  const dealRequirements = requirementKeys(buildDealSetupDocumentRequirements({ setup: {
    finance: { type: 'bond' },
    buyers: [{ id: 'buyer-1', signing_required: true }],
  },
  }).requirements)
  const workflow = buildMvpTransactionWorkflowBootstrap({ financeType: 'bond' })
  const blocked = evaluateMvpFinanceGate({
    routingProfile: { financeType: 'bond' },
    documentRequirements: financeDocuments({ bondPreapproval: 'pending' }),
  })
  const ready = evaluateMvpFinanceGate({
    routingProfile: { financeType: 'bond' },
    participants: COMPLETE_BOND_PARTICIPANTS,
    documentRequirements: financeDocuments(),
  })
  const handoff = buildSignedOtpHandoffReleaseDecision({
    transaction: { id: 'bond-1', finance_type: 'bond', finance_managed_by: 'bond_originator' },
    bondOriginatorActivation: { activated: true },
  })

  assert.equal(deriveFinanceManagedBy({ financeType: 'bond' }), 'bond_originator')
  assert.equal(dealRequirements.has('proof_of_funds'), false)
  assert.equal(dealRequirements.has('bond_application'), true)
  assert.equal(workflow.lanes.some((lane) => lane.laneType === 'bond'), true)
  assert.equal(hasBlocker(blocked, 'participant:bond_originator'), true)
  assert.equal(hasBlocker(blocked, 'document:bond_preapproval'), true)
  assert.equal(ready.satisfied, true)
  assert.deepEqual(handoff.releasedLanes, ['transfer_attorney', 'bond_originator'])
})

test('hybrid and canonical combination values require both cash and bond evidence', () => {
  const hybridDealRequirements = requirementKeys(buildDealSetupDocumentRequirements({ setup: {
    finance: { type: 'hybrid' },
    buyers: [{ id: 'buyer-1', signing_required: true }],
  },
  }).requirements)
  const canonicalBootstrapRequirements = requirementKeys(buildMvpTransactionDocumentBootstrap({ financeType: 'combination' }).requirements)
  const launchRoles = resolveMvpLaunchRolePlan({ financeType: 'combination' })
  const workflow = buildMvpTransactionWorkflowBootstrap({ financeType: 'combination' })
  const blocked = evaluateMvpFinanceGate({
    routingProfile: { financeType: 'combination' },
    documentRequirements: financeDocuments({ proofOfFunds: 'pending', bondPreapproval: 'pending' }),
  })
  const ready = evaluateMvpTransferGate({
    routingProfile: { financeType: 'combination' },
    participants: COMPLETE_BOND_PARTICIPANTS,
    documentRequirements: financeDocuments(),
  })

  assert.equal(normalizeFinanceType('hybrid'), 'combination')
  assert.equal(hybridDealRequirements.has('proof_of_funds'), true)
  assert.equal(hybridDealRequirements.has('bond_application'), true)
  assert.equal(canonicalBootstrapRequirements.has('proof_of_funds'), true)
  assert.equal(canonicalBootstrapRequirements.has('bond_preapproval'), true)
  assert.equal(launchRoles.requiredByFinance.some((role) => role.key === 'bond_originator'), true)
  assert.equal(launchRoles.requiredByTransfer.some((role) => role.key === 'bond_attorney'), true)
  assert.equal(workflow.lanes.some((lane) => lane.laneType === 'bond'), true)
  assert.equal(hasBlocker(blocked, 'document:proof_of_funds'), true)
  assert.equal(hasBlocker(blocked, 'participant:bond_originator'), true)
  assert.equal(hasBlocker(blocked, 'document:bond_preapproval'), true)
  assert.equal(ready.satisfied, true)
})

test('buyer-managed bond finance bypasses an originator handoff but retains the attorney transfer handoff', () => {
  const handoff = buildSignedOtpHandoffReleaseDecision({
    transaction: { id: 'buyer-managed-1', finance_type: 'bond', finance_managed_by: 'client' },
  })

  assert.equal(deriveFinanceManagedBy({ financeType: 'bond', financeManagedBy: 'client' }), 'client')
  assert.equal(handoff.status, 'transfer_handoff_released_buyer_managed_finance')
  assert.deepEqual(handoff.releasedLanes, ['transfer_attorney'])
  assert.equal(handoff.releasedLanes.includes('bond_originator'), false)
})

test('the client-safe journey reader reflects attorney task changes without exposing a second portal workflow', async () => {
  let taskStatus = 'not_started'
  const rpcCalls = []
  const client = {
    rpc: async (name) => {
      rpcCalls.push(name)
      return {
        data: {
          schemaVersion: 1,
          transactionId: 'matter-1',
          revision: 1,
          planRevision: 1,
          lanes: [{
            key: 'transfer',
            phases: [{
              key: 'financial_preparation',
              label: 'Financial preparation',
              clientLabel: 'Financial preparation',
              tasks: [{ key: 'task_1', label: 'Rates clearance requested', status: taskStatus, revision: 1 }],
            }],
          }],
        },
        error: null,
      }
    },
  }

  const before = await fetchSharedMatterJourney(client, 'matter-1', { audience: 'buyer' })
  taskStatus = 'completed'
  const after = await fetchSharedMatterJourney(client, 'matter-1', { audience: 'buyer' })

  assert.equal(before.status, 'ready')
  assert.equal(after.status, 'ready')
  assert.equal(before.snapshot.legalProgress.percent, 0)
  assert.equal(after.snapshot.legalProgress.percent, 100)
  assert.deepEqual(rpcCalls, ['bridge_read_shared_matter_journey', 'bridge_read_shared_matter_journey'])
  assert.match(after.snapshot.lanes[0].phases[0].tasks[0].key, /task_1$/)
})

test('seller stays in the listing lane until acceptance, then moves to transaction refresh', () => {
  const listingWorkflow = resolveSellerPortalWorkflowProjection({
    listing: { listingStatus: 'live' },
    offers: [{ id: 'offer-1', status: 'under_review' }],
  })
  const transactionWorkflow = resolveSellerPortalWorkflowProjection({
    listing: { listingStatus: 'live' },
    offers: [{ id: 'offer-1', status: 'accepted' }],
    transaction: { id: 'transaction-1', stage: 'OTP' },
  })
  const listingGate = buildSellerPortalSaleJourneyGate({ workflow: listingWorkflow.workflow, offers: [{ id: 'offer-1', status: 'under_review' }] })
  const listingRefresh = resolveSellerPortalSyncPolicy({ listingId: 'listing-1', hasSecureSession: true })
  const transactionRefresh = resolveSellerPortalSyncPolicy({ listingId: 'listing-1', transactionId: 'transaction-1', hasSecureSession: true })

  assert.equal(listingWorkflow.workflow, 'listing')
  assert.equal(listingGate.isTransaction, false)
  assert.equal(listingRefresh.useListingRefresh, true)
  assert.equal(transactionWorkflow.workflow, 'transaction')
  assert.equal(transactionRefresh.mode, 'transaction')
  assert.equal(transactionRefresh.useListingRefresh, false)
})

test('buyer portal UI keeps application access conditional and directs cash buyers to proof-of-funds work', async () => {
  const source = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
  assert.match(source, /bond_application: isOriginatorManagedPortalFinance/, 'bond application navigation must be originator-managed only')
  assert.match(source, /Because this is a cash purchase, proof of funds is required\./, 'cash buyers must receive proof-of-funds guidance')
  assert.match(source, /Because this is a hybrid purchase, both proof of funds for the cash portion and bond documents are required\./, 'hybrid buyers must receive both finance requirements')
  assert.match(source, /This is a cash purchase, so there is no bond application to complete in the portal\./, 'cash buyers must not be offered a bond application')
})
