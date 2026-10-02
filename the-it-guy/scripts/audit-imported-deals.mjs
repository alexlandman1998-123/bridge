import { readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { auditImportedDealBatch } from '../src/core/transactions/dealSetupCompatibilityAudit.js'
import { buildImportedDealRecoveryPlan } from '../src/core/transactions/importedDealRecoveryPlan.js'

const inputPath = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length)
if (!inputPath) throw new Error('Provide --input=<read-only-audit-snapshot.json>.')
const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'))
const sourceDirectory = process.argv.find((arg) => arg.startsWith('--source-dir='))?.slice('--source-dir='.length)
function inventoryPdfs(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return inventoryPdfs(path)
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pdf')) return []
    const bytes = readFileSync(path)
    return [{ name: basename(path), path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }]
  })
}
const report = sourceDirectory
  ? buildImportedDealRecoveryPlan({ snapshot, sourceFiles: inventoryPdfs(resolve(sourceDirectory)) })
  : auditImportedDealBatch(snapshot)
console.log(JSON.stringify(report, null, 2))
