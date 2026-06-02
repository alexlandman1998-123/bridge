/* global process */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const servicesDir = path.join(repoRoot, 'server/services')
const allowedFiles = new Set([
  path.join(servicesDir, 'transactionStageCompatibilityService.js'),
])

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(nextPath))
      continue
    }
    if (entry.isFile() && nextPath.endsWith('.js')) {
      files.push(nextPath)
    }
  }
  return files
}

const directWritePatterns = [
  /from\(['"]transactions['"]\)\.update\([\s\S]{0,600}?current_main_stage\s*:/m,
  /from\(['"]transactions['"]\)\.update\([\s\S]{0,600}?current_sub_stage_summary\s*:/m,
  /from\(['"]transactions['"]\)\.update\([\s\S]{0,600}?stage\s*:/m,
]

for (const filePath of walk(servicesDir)) {
  if (allowedFiles.has(filePath)) {
    continue
  }

  const contents = fs.readFileSync(filePath, 'utf8')
  for (const pattern of directWritePatterns) {
    assert.equal(
      pattern.test(contents),
      false,
      `Legacy transaction lifecycle fields must only be written via transactionStageCompatibilityService: ${path.relative(repoRoot, filePath)}`,
    )
  }
}

console.log('legacyLifecycleWriteGuard tests passed')
