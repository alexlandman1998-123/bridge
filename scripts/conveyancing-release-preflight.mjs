#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'docs', 'conveyancing-production-release-manifest-20260912.json')
const json = process.argv.includes('--json')

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.release, 'conveyancing-workflow-20260912')
  assert.ok(Array.isArray(manifest.migrations) && manifest.migrations.length > 0, 'Release migrations are required')

  let previousVersion = ''
  const verified = manifest.migrations.map((migration) => {
    assert.match(migration.version, /^\d{14}$/)
    assert.ok(migration.version > previousVersion, `Migration order is not strictly increasing at ${migration.version}`)
    previousVersion = migration.version
    const filePath = path.join(root, 'supabase', 'migrations', migration.file)
    assert.ok(existsSync(filePath), `Missing release migration: ${migration.file}`)
    assert.equal(sha256(filePath), migration.sha256, `Release migration changed after manifest review: ${migration.file}`)
    return { version: migration.version, file: migration.file, kind: migration.kind }
  })

  const report = {
    release: manifest.release,
    migrationCount: verified.length,
    migrations: verified,
    localManifestIntegrity: 'PASS',
    productionReady: false,
    productionBlockers: manifest.productionBlockers,
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`Conveyancing release manifest integrity passed (${report.migrationCount} migrations).`)
    console.log('Production promotion remains blocked until the listed live acceptance and recovery gates pass.')
  }
}

main()
