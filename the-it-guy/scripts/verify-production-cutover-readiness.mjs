#!/usr/bin/env node
import { readFileSync } from 'node:fs'
const receipt = JSON.parse(readFileSync(new URL('../release/arch9-schema-baseline-rehearsal.json', import.meta.url), 'utf8'))
const train = JSON.parse(readFileSync(new URL('../release/replacement-staging-release-train.example.json', import.meta.url), 'utf8'))
const approval = JSON.parse(readFileSync(new URL('../release/production-cutover-approval.example.json', import.meta.url), 'utf8'))
const checks = [
  ['schema equivalence verified', receipt.status === 'schema_equivalence_verified'],
  ['release train is complete', Object.values(train.steps).every(Boolean)],
  ['explicit approval recorded', approval.status === 'approved' && Boolean(approval.approver) && Boolean(approval.changeWindow)],
  ['freeze confirmed', approval.freezeConfirmed === true],
  ['backup and rollback confirmed', approval.backupAndRollbackConfirmed === true],
  ['candidate differs from production', approval.candidateProjectRef !== approval.productionProjectRef],
]
const failed = checks.filter(([, passed]) => !passed).map(([label]) => label)
console.log(JSON.stringify({ version: 1, ready: failed.length === 0, failed, checks }, null, 2))
if (process.argv.includes('--strict') && failed.length) process.exitCode = 1
