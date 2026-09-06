import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const directory = mkdtempSync(resolve(tmpdir(), 'migration-ledger-map-'))
const ledgerPath = resolve(directory, 'ledger.txt')
const outputPath = resolve(directory, 'map.json')
writeFileSync(ledgerPath, '` ` | `20260906112843` | `2026-09-06 11:28:43`\n`20260906070110` | `20260906070110` | `2026-09-06 07:01:10`\n')

try {
  const scriptPath = fileURLToPath(new URL('./build-migration-ledger-reconciliation.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [scriptPath, '--ledger', ledgerPath, '--output', outputPath], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const map = JSON.parse(readFileSync(outputPath, 'utf8'))
  assert.equal(map.mode, 'read_only')
  assert.equal(map.summary.remoteOnlyCount >= 1, true)
  assert.equal(map.entries.some((entry) => entry.version === '20260906112843' && entry.direction === 'remote_only'), true)
  assert.equal(map.entries.every((entry) => entry.direction !== 'local_only' || /^[a-f0-9]{64}$/u.test(entry.sha256)), true)
  console.log('migration-ledger-reconciliation: passed')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
