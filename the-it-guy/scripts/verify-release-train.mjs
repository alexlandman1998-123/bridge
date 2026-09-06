#!/usr/bin/env node
import { readFileSync } from 'node:fs'
const train = JSON.parse(readFileSync(new URL('../release/replacement-staging-release-train.example.json', import.meta.url), 'utf8'))
const receipt = JSON.parse(readFileSync(new URL('../release/arch9-schema-baseline-rehearsal.json', import.meta.url), 'utf8'))
const required = Object.entries(train.steps).filter(([, value]) => value !== true).map(([key]) => key)
const baselineReady = receipt.status === 'schema_equivalence_verified'
const report = { version: 1, ready: baselineReady && required.length === 0, baselineReady, missingEvidence: required, targetProjectRef: train.targetProjectRef }
console.log(JSON.stringify(report, null, 2))
if (process.argv.includes('--strict') && !report.ready) process.exitCode = 1
