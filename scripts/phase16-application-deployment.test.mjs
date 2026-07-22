#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase16/production-deployment.json', 'utf8'))
assert.equal(evidence.status, 'PRODUCTION_APPLICATION_DEPLOYED')
assert.equal(evidence.projectId, 'prj_rbfXykMU6mU1eECbc0lJS9sPspmp')
assert.equal(evidence.productionDomain, 'https://app.arch9.co.za')
assert.equal(evidence.previewDeployment.status, 'READY')
assert.equal(evidence.productionDeployment.status, 'READY')
assert.equal(evidence.productionDeployment.target, 'production')
assert.equal(evidence.verification.guardedBuild, 'pass')
assert.equal(evidence.verification.releaseManifest, 'pass')
assert.equal(evidence.verification.productionManifestMatchesPreview, true)
assert.equal(evidence.verification.productionBrowserErrors, 0)
assert.equal(evidence.verification.productionRuntimeErrorLogs, 0)
assert.equal(evidence.verification.productionHttp500Logs, 0)
assert.equal(evidence.phase0MigrationFreezeRemainsActive, true)
console.log('Phase 16 application deployment evidence tests passed.')
