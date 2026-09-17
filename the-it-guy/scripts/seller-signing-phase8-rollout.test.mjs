import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const audit = readFileSync(resolve(root, 'scripts/sql/seller-signing-phase8-entity-confirmation-audit.sql'), 'utf8')
const packetMigration = readFileSync(resolve(root, '..', 'supabase/migrations/20260917153803_seller_signing_packets_multi_signer_phase5.sql'), 'utf8')

assert.match(audit, /Read-only rollout audit/)
assert.match(audit, /entity_not_identified/)
assert.match(audit, /entity_needs_confirmation/)
assert.doesNotMatch(audit, /\b(update|insert|delete|alter|drop)\b/i)
assert.match(packetMigration, /private_listing_seller_signing_packets/)
console.log('seller signing phase 8 rollout audit passed')
