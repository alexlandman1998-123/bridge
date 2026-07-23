import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

const RETIRED_ACTIVATORS = Object.freeze([
  ['A3', 'legal-document-phase-a3-activate.mjs'],
  ['Q2', 'legal-document-phase-q2-activate-expansion.mjs'],
  ['V2', 'legal-document-phase-v2-activate-expansion.mjs'],
])

for (const [phase, filename] of RETIRED_ACTIVATORS) {
  const scriptPath = path.join(SCRIPT_DIR, filename)
  const source = fs.readFileSync(scriptPath, 'utf8')
  const guardIndex = source.indexOf('LEGAL_DOCUMENT_LEGACY_EXPANSION_RETIRED')
  const exitIndex = source.indexOf('process.exit(1)')
  const legacyWriteIndex = source.indexOf("'secrets', 'set'")
  assert.ok(guardIndex >= 0, `${phase} must identify itself as a retired legacy expansion command`)
  assert.ok(exitIndex > guardIndex, `${phase} must terminate after reporting the retirement hold`)
  assert.ok(legacyWriteIndex > exitIndex, `${phase} must terminate before its retained historical secret-write implementation`)

  // Exercise the actual entrypoint, including --apply and its former write
  // flag.  It must stop locally before it can read a plan or invoke Supabase.
  const result = spawnSync(process.execPath, [scriptPath, '--apply'], {
    cwd: path.resolve(SCRIPT_DIR, '..'),
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      LEGAL_DOCUMENT_PHASE_A3_WRITE: 'true',
      LEGAL_DOCUMENT_PHASE_Q2_WRITE: 'true',
      LEGAL_DOCUMENT_PHASE_V2_WRITE: 'true',
    },
  })
  assert.equal(result.status, 1, `${phase} must fail closed even when its former apply flag is supplied`)
  assert.equal(result.error, undefined, `${phase} retirement command must complete locally`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'RETIRED_HOLD', `${phase} must return a transparent retired hold`)
  assert.equal(report.errorCode, 'LEGAL_DOCUMENT_LEGACY_EXPANSION_RETIRED', `${phase} must return the canonical retirement code`)
  assert.equal(report.mutatedData, false, `${phase} must report no mutation`)
}

console.log('Phase 6 legacy expansion retirement tests passed.')
