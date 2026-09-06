#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { API_SPLIT_CRITICAL_CONTRACTS, API_SPLIT_EXPORT_SURFACE_BASELINE } from './api-split-phase1-contract-registry.mjs'

const appRoot = resolve(import.meta.dirname, '..')
const plan = JSON.parse(readFileSync(resolve(appRoot, 'config/api-split-extraction-order.json'), 'utf8'))
const facade = resolve(appRoot, plan.legacyFacade)
const missingTests = API_SPLIT_CRITICAL_CONTRACTS.flatMap((contract) => contract.tests.filter((test) => !existsSync(resolve(appRoot, test))).map((test) => `${contract.name}: ${test}`))
const checks = [
  ['legacy compatibility facade exists', existsSync(facade)],
  ['critical contracts are registered', API_SPLIT_CRITICAL_CONTRACTS.length > 0],
  ['export baseline is pinned', Number.isInteger(API_SPLIT_EXPORT_SURFACE_BASELINE.exportCount) && /^[a-f0-9]{64}$/u.test(API_SPLIT_EXPORT_SURFACE_BASELINE.sha256)],
  ['no production activation', plan.productionActivation === false],
  ['contract tests exist', missingTests.length === 0],
]
const failed = checks.filter(([, passed]) => !passed).map(([label]) => label)
console.log(JSON.stringify({ version: 1, ready: failed.length === 0, failed, missingTests, extractionOrder: plan.order }, null, 2))
if (process.argv.includes('--strict') && failed.length) process.exitCode = 1
