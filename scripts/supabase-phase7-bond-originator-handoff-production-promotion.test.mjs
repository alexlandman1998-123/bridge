#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const markdown = await readFile(
  new URL('../docs/migration-review/20260827-phase7-bond-originator-handoff-production-promotion.md', import.meta.url),
  'utf8',
)
const json = await readFile(
  new URL('../docs/migration-review/20260827-phase7-bond-originator-handoff-production-promotion.json', import.meta.url),
  'utf8',
)

assert.doesNotThrow(() => JSON.parse(json))
const report = JSON.parse(json)

assert.equal(report.status, 'PRODUCTION_PROMOTION_BLOCKED_PENDING_EVIDENCE')
assert.equal(report.mode, 'plan')
assert.equal(report.productionProjectRef, 'isdowlnollckzvltkasn')
assert.equal(report.productionRecoveryLocked, true)
assert.equal(report.selected.version, '20260827160000')
assert.equal(report.selected.file, '20260827160000_canonical_bond_originator_handoff_repair.sql')
assert.equal(report.selected.productionRoute, 'production_apply_sql')
assert.equal(report.selected.readyForProduction, false)
assert.equal(report.commands.length, 0)
assert.ok(report.blockers.includes('phase6_staging_ledger_not_recorded'))
assert.ok(report.blockers.includes('phase6_approver_pending'))

assert.match(markdown, /PRODUCTION_PROMOTION_BLOCKED_PENDING_EVIDENCE/)
assert.match(markdown, /20260827160000_canonical_bond_originator_handoff_repair\.sql/)
assert.match(markdown, /production_apply_sql/)
assert.match(markdown, /No commands are enabled yet\./)
assert.match(markdown, /docs\/staging-evidence\/20260827160000-bond_finance_runtime\.json/)
assert.match(markdown, /docs\/production-evidence\/20260827160000-bond_finance_runtime\.json/)

console.log('Bond-originator handoff phase 7 production promotion artifacts passed.')
