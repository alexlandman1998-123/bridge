#!/usr/bin/env node

import { readFileSync } from 'node:fs'
const base = new URL('../', import.meta.url)
const receipt = JSON.parse(readFileSync(new URL('../release/arch9-schema-baseline-rehearsal.json', import.meta.url), 'utf8'))
const governance = JSON.parse(readFileSync(new URL('../release/clean-baseline-migration-governance.json', import.meta.url), 'utf8'))
const checks = [
  ['historical ledger remains evidence', governance.historicalLedger.rule.includes('never mass-repair')],
  ['production migration repair prohibited', governance.prohibited.includes('supabase migration repair against production')],
  ['legacy staging promotion prohibited', governance.prohibited.includes('promoting legacy staging')],
  ['equivalence prerequisite met', receipt.status === 'schema_equivalence_verified'],
]
const failed = checks.filter(([, passed]) => !passed).map(([label]) => label)
console.log(JSON.stringify({ version: 1, ready: failed.length === 0, failed, checks }, null, 2))
if (process.argv.includes('--strict') && failed.length) process.exitCode = 1
