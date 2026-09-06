#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const receipt = JSON.parse(readFileSync(new URL('../release/arch9-schema-baseline-rehearsal.json', import.meta.url), 'utf8'))
const config = JSON.parse(readFileSync(new URL('../config/schema-baseline-staging.example.json', import.meta.url), 'utf8'))
const checks = [
  ['rehearsal project is isolated', receipt.projectRef === config.projectRef && receipt.projectRef !== receipt.productionProjectRef],
  ['legacy staging is not the target', receipt.stagingProjectRef !== config.projectRef],
  ['schema equivalence is verified', receipt.status === 'schema_equivalence_verified'],
  ['test-data-only policy', config.dataPolicy === 'isolated-test-data-only'],
  ['production traffic blocked', config.trafficPolicy === 'no-production-traffic'],
]
const failed = checks.filter(([, passed]) => !passed).map(([label]) => label)
console.log(JSON.stringify({ version: 1, ready: failed.length === 0, failed, checks }, null, 2))
if (process.argv.includes('--strict') && failed.length) process.exitCode = 1
