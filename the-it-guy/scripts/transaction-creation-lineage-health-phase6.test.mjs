import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MVP_TRANSACTION_CREATION_LINEAGE_VERSION,
  resolveMvpTransactionCreationLineage,
} from '../src/core/transactions/mvpTransactionCreationLineage.js'
import { buildMvpTransactionHealthPanel } from '../src/core/transactions/mvpTransactionHealthPanel.js'
import { buildMvpTransactionAuditRecovery } from '../src/core/transactions/mvpTransactionAuditRecovery.js'

const healthSource = readFileSync(new URL('../src/core/transactions/mvpTransactionHealthPanel.js', import.meta.url), 'utf8')
const auditSource = readFileSync(new URL('../src/core/transactions/mvpTransactionAuditRecovery.js', import.meta.url), 'utf8')
const migrationSource = readFileSync(new URL('../../supabase/migrations/20260815213628_transaction_override_boundary_phase5.sql', import.meta.url), 'utf8')
const contractSource = readFileSync(new URL('../docs/lead-listing-transaction-workflow-contract-phase0.md', import.meta.url), 'utf8')
const phaseDoc = readFileSync(new URL('../docs/transaction-creation-lineage-health-phase6.md', import.meta.url), 'utf8')

const acceptedOfferLineage = resolveMvpTransactionCreationLineage({
  transaction: {
    id: 'tx-lineage-1',
    accepted_offer_id: 'offer-lineage-1',
    creation_idempotency_key: 'mvp_tx_org_offer_offer-lineage-1',
  },
  conversionReceipt: {
    ready: true,
    status: 'created',
    transactionId: 'tx-lineage-1',
    acceptedOfferId: 'offer-lineage-1',
  },
})
assert.equal(acceptedOfferLineage.version, MVP_TRANSACTION_CREATION_LINEAGE_VERSION)
assert.equal(acceptedOfferLineage.mode, 'accepted_offer')
assert.equal(acceptedOfferLineage.confirmed, true)
assert.equal(acceptedOfferLineage.auditVisible, true)

const overrideLineage = resolveMvpTransactionCreationLineage({
  transaction: {
    id: 'tx-lineage-2',
    creation_idempotency_key: 'manual-override-lineage-2',
    routing_profile_json: {
      transactionCreationOverride: {
        version: 'arch9_mvp_transaction_override_authorization_v1',
        reason: 'Principal approved a legacy in-flight transaction setup.',
        actorId: 'principal-2',
        actorRole: 'principal',
        authorised: true,
      },
    },
  },
})
assert.equal(overrideLineage.mode, 'manual_override')
assert.equal(overrideLineage.confirmed, true)
assert.equal(overrideLineage.override.actorRole, 'principal')

const hiddenOverride = resolveMvpTransactionCreationLineage({
  transaction: {
    id: 'tx-lineage-3',
    creation_idempotency_key: 'manual-override-lineage-3',
    transaction_creation_override_reason: 'Principal approved a legacy in-flight transaction setup.',
  },
})
assert.equal(hiddenOverride.mode, 'manual_override')
assert.equal(hiddenOverride.confirmed, false)
assert.ok(hiddenOverride.issues.includes('override_actor_missing'))
assert.ok(hiddenOverride.issues.includes('override_authorisation_not_visible'))

const health = buildMvpTransactionHealthPanel({
  transaction: {
    id: 'tx-lineage-4',
    creation_idempotency_key: 'manual-override-lineage-4',
    routingProfile: {
      transactionCreationOverride: {
        reason: 'Principal approved test migration transaction setup.',
        actorId: 'principal-4',
        actorRole: 'branch manager',
        authorised: true,
      },
    },
  },
})
assert.equal(health.creation.mode, 'manual_override')
assert.equal(health.creation.override.actorRole, 'branch_manager')
assert.equal(health.creation.confirmed, true)

const audit = buildMvpTransactionAuditRecovery({
  transaction: { id: 'tx-lineage-5' },
  health: { creation: hiddenOverride },
})
assert.equal(audit.status, 'action_required')
assert.equal(audit.issues.some((item) => item.key === 'creation:override_audit_incomplete'), true)

assert.match(healthSource, /resolveMvpTransactionCreationLineage/, 'health panel must use the shared creation lineage resolver')
assert.match(auditSource, /creation:override_audit_incomplete/, 'audit recovery must flag incomplete override lineage')
assert.match(migrationSource, /jsonb_set\(\s*v_profile,\s*'\{transactionCreationOverride\}'/s, 'RPC should persist override lineage into routing_profile_json')
assert.match(migrationSource, /'actorId', auth\.uid\(\)/, 'RPC override lineage should include the authenticated actor id')
assert.match(contractSource, /Transaction Creation Lineage Health - Phase 6/, 'workflow contract should reference Phase 6 creation lineage health')
assert.match(phaseDoc, /accepted-offer conversion, reused conversion, manual override, or missing lineage/, 'Phase 6 docs should name the visible creation modes')

console.log('Transaction creation lineage health Phase 6 checks passed.')
