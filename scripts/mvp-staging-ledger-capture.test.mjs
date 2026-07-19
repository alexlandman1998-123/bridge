import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-ledger-'))
const inputPath = path.join(directory, 'raw-ledger.json')
const outputPath = path.join(directory, 'evidence.json')
try {
  writeFileSync(inputPath, JSON.stringify([{ local: '202607180046', remote: '202607180046' }, { local: '202607190001', remote: '202607190001' }]))
  const result = spawnSync(process.execPath, [
    'scripts/mvp-staging-ledger-capture.mjs', '--project-ref=staging-ref', `--input=${inputPath}`, `--output=${outputPath}`,
  ], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const evidence = JSON.parse(readFileSync(outputPath, 'utf8'))
  assert.equal(evidence.projectRef, 'staging-ref')
  assert.deepEqual(evidence.appliedVersions, ['202607180046', '202607190001'])
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging ledger capture tests passed.')
