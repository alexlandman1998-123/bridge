#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./supabase-phase12-production-recovery.mjs', import.meta.url), 'utf8')

assert.match(source, /PRODUCTION_RECOVERY_PROVEN/)
assert.match(source, /--approved-by is required for recovery attestation/)
assert.match(source, /backups.*list/)
assert.match(source, /is_physical_backup/)
assert.match(source, /predatesRestoredProject/)
assert.match(source, /idFingerprintMatch/)
assert.match(source, /expectedProductionLedgerState/)
assert.match(source, /reviewedPromotionCount/)
assert.match(source, /recovery baseline plus reviewed promotions/)
assert.match(source, /REVIEWED_SPLIT_BASELINE/)
assert.match(source, /databaseRestoreValidation: 'pass'/)
assert.match(source, /storageObjectRecoveryTested: false/)
assert.match(source, /productionMutated: false/)
assert.doesNotMatch(source, /\['backups',\s*'restore'\]|restore-pitr|update public|insert into|delete from/i)

console.log('Phase 12 production recovery guard tests passed.')
