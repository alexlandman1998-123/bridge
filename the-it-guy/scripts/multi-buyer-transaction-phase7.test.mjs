import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildTransactionBuyerOperationalAudit } from '../src/core/transactions/transactionBuyerOperationalAudit.js'
import { resolveTransactionBuyers } from '../src/core/transactions/transactionBuyersModel.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const recoveryContractSource = await readFile(
  new URL('../scripts/buyer-onboarding-projection-recovery-contract.test.mjs', import.meta.url),
  'utf8',
)
const recoverySmokeSource = await readFile(
  new URL('../scripts/buyer-onboarding-projection-recovery-staging-smoke.mjs', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('buyer model preserves participant buyer metadata for operational audits', () => {
  const model = resolveTransactionBuyers({
    id: 'txn-1',
    participants: [
      {
        id: 'participant-1',
        roleType: 'buyer',
        participantEmail: 'buyer@example.com',
        isPrimaryBuyer: true,
        buyerMetadata: {
          lastBuyerOnboardingLinkNonce: 'nonce-1',
        },
      },
    ],
  })

  assert.equal(model.primaryBuyer.metadata.lastBuyerOnboardingLinkNonce, 'nonce-1')
})

test('audit flags submitted transaction with no completed buyer participant as replayable', () => {
  const audit = buildTransactionBuyerOperationalAudit({
    transaction: {
      id: 'txn-1',
      onboarding_status: 'awaiting_signed_otp',
    },
    participants: [
      {
        id: 'participant-1',
        roleType: 'buyer',
        participantEmail: 'buyer@example.com',
        isPrimaryBuyer: true,
        buyerOnboardingStatus: 'sent',
        buyerMetadata: {
          lastBuyerOnboardingLinkNonce: 'nonce-1',
        },
      },
    ],
  })

  assert.equal(audit.health, 'critical')
  assert.equal(audit.criticalCount, 1)
  assert.equal(audit.issues[0].code, 'buyer_participant_completion_missing')
  assert.deepEqual(audit.replayProjections, ['buyer_participant_completion'])
})

test('audit warns when delivery started without targeted-link metadata', () => {
  const audit = buildTransactionBuyerOperationalAudit({
    transaction: {
      id: 'txn-2',
      onboarding_status: 'awaiting_client_onboarding',
    },
    participants: [
      {
        id: 'participant-2',
        roleType: 'buyer',
        participantEmail: 'buyer2@example.com',
        isPrimaryBuyer: true,
        buyerOnboardingStatus: 'sent',
      },
    ],
  })

  assert.equal(audit.health, 'warning')
  assert.equal(audit.warningCount, 1)
  assert.equal(audit.issues[0].code, 'buyer_target_link_metadata_missing')
})

test('audit is healthy when completed buyer participant state is coherent', () => {
  const audit = buildTransactionBuyerOperationalAudit({
    transaction: {
      id: 'txn-3',
      onboarding_status: 'awaiting_signed_otp',
      onboarding_completed_at: '2026-08-15T10:00:00.000Z',
    },
    participants: [
      {
        id: 'participant-3',
        roleType: 'buyer',
        participantEmail: 'buyer3@example.com',
        isPrimaryBuyer: true,
        buyerOnboardingStatus: 'completed',
        buyerOnboardingCompletedAt: '2026-08-15T10:00:00.000Z',
        buyerMetadata: {
          lastBuyerOnboardingLinkNonce: 'nonce-3',
        },
      },
    ],
  })

  assert.equal(audit.health, 'healthy')
  assert.equal(audit.criticalCount, 0)
  assert.equal(audit.warningCount, 0)
  assert.deepEqual(audit.replayProjections, [])
})

test('API exposes buyer operational audit and direct audit helper', () => {
  assert.match(apiSource, /buildTransactionBuyerOperationalAudit/)
  assert.match(apiSource, /buyerOperationalAudit/)
  assert.match(apiSource, /export async function getTransactionBuyerOperationalAudit/)
  assert.match(apiSource, /Your role does not have permission to audit buyer onboarding operations/)
})

test('projection recovery surface includes buyer participant completion', () => {
  assert.match(recoveryContractSource, /projection: 'buyer_participant_completion'/)
  assert.match(recoveryContractSource, /buyer_onboarding_buyer_participant_projection_failed/)
  assert.match(recoveryContractSource, /repairHelper: 'markTransactionBuyerOnboardingCompleted'/)
  assert.match(recoverySmokeSource, /buyer_onboarding_buyer_participant_projection_failed/)
})

test('package exposes the multi-buyer transaction Phase 7 operational audit regression', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase7'],
    'node scripts/multi-buyer-transaction-phase7.test.mjs',
  )
})

console.log('multi-buyer transaction phase 7 tests passed')
