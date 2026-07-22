#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const operator = readFileSync('scripts/phase28-pilot-operations.mjs', 'utf8')
const workflow = readFileSync('.github/workflows/phase28-pilot-execution-gate.yml', 'utf8')

assert.match(operator, /from '@supabase\/supabase-js'/)
assert.doesNotMatch(operator, /node_modules\/.*@supabase\/supabase-js/)

const installIndex = workflow.indexOf('npm ci --ignore-scripts')
const verifyIndex = workflow.indexOf('npm run application:phase28:verify')
assert.ok(installIndex >= 0, 'The Phase 28 workflow must install its declared root dependencies.')
assert.ok(verifyIndex > installIndex, 'The Phase 28 verification must run after dependency installation.')

const probe = spawnSync(process.execPath, ['scripts/phase28-pilot-operations.mjs', '--action=status'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SUPABASE_PRODUCTION_PROJECT_REF: '',
    VITE_SUPABASE_URL: '',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  },
})

assert.equal(probe.error, undefined)
assert.equal(probe.signal, null)
assert.equal(probe.stderr, '', 'The probe must reach the application guard without a module-loading error.')
assert.equal(probe.status, 2, 'Invalid production credentials must use the documented fail-closed exit code.')
const report = JSON.parse(probe.stdout)
assert.equal(report.status, 'BLOCKED')
assert.equal(report.mutatedData, false)
assert.ok(report.blockers.some((row) => row.code === 'PHASE28_PROJECT_MISMATCH'))
assert.ok(report.blockers.some((row) => row.code === 'PHASE28_SERVICE_ROLE_MISSING'))

console.log('Phase 36 passed: Phase 28 installs declared dependencies and reaches its fail-closed guard without a module-loading crash.')
