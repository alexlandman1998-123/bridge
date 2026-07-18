import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildC2Scenarios } from './legal-document-phase-c2-scenarios.mjs'
import { inspectDocx } from './legal-document-phase-c1-source.mjs'

const verify = fs.readFileSync('scripts/legal-document-phase-c2-verify.mjs', 'utf8')
const worker = fs.readFileSync('scripts/legal-document-phase-c2-render-worker.ts', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scenarios = buildC2Scenarios()

assert.deepEqual(scenarios.map((row) => row.key), ['individual_single', 'individual_married', 'company', 'trust'])
for (const scenario of scenarios) {
  assert.ok(Object.keys(scenario.placeholders).length > 50)
  for (const key of ['seller_full_name', 'property_address', 'mandate_type', 'agency_legal_name', 'agent_full_name']) assert.ok(Object.hasOwn(scenario.placeholders, key), `${scenario.key} is missing ${key}`)
}
assert.match(worker, /Docxtemplater/)
assert.match(worker, /nullGetter/)
assert.match(worker, /C2_UNRESOLVED/)
assert.match(verify, /C2_UNKNOWN_TEMPLATE_PLACEHOLDERS/)
assert.match(verify, /C2_SCENARIO_RENDER_FAILED/)
assert.match(verify, /individual_single|scenarioCount: 4/)
assert.match(verify, /mutatedData: false/)
assert.doesNotMatch(verify, /\.upload\(|\.update\(|\.insert\(|\.delete\(/)
assert.match(a2, /legal-document-phase-c2-verify\.mjs/)
for (const name of ['test:legal-documents-phase-c2', 'verify:legal-documents:phase-c2']) assert.ok(pkg.scripts?.[name])

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-c2-contract-'))
try {
  const inputFile = path.join(temporaryDirectory, 'input.json')
  const outputFile = path.join(temporaryDirectory, 'output.docx')
  fs.writeFileSync(inputFile, JSON.stringify({ sourcePath: path.resolve('assets/legal-templates/otp_default_v1.docx'), placeholders: scenarios[0].placeholders }))
  const rendered = spawnSync(process.env.DENO_BIN || 'deno', ['run', '--quiet', '--allow-read', '--allow-write', '--config', '../supabase/functions/generate-mandate/deno.json', 'scripts/legal-document-phase-c2-render-worker.ts', `--input=${inputFile}`, `--output=${outputFile}`], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
  assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout)
  assert.equal(inspectDocx(fs.readFileSync(outputFile)).valid, true)
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}

console.log('Legal document C2 canonical render-assurance contract passed.')
