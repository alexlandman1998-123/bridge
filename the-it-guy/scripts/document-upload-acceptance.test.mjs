import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

test('acceptance CLI prepares untested cases and validates actual local evidence artifacts without remote access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arch9-document-acceptance-'))
  const script = new URL('./document-upload-acceptance.mjs', import.meta.url).pathname
  const input = join(dir, 'evidence.json')
  const report = join(dir, 'report.json')
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  try {
    assert.equal(run('--prepare', '--output', input).status, 0)
    const packet = JSON.parse(await readFile(input))
    assert.equal(Object.keys(packet.evidenceBySurface).length, 27)
    assert.equal(packet.evidenceBySurface.buyer.required.upload.status, 'not_run')
    const args = ['--evidence', input, '--environment', 'preview', '--project', 'fixture', '--build', 'fixture-build', '--run', 'fixture-run', '--output', report]
    assert.equal(run(...args).status, 1)
    assert.equal(JSON.parse(await readFile(report)).summary.readySurfaces, 0)
    const receipt = packet.evidenceBySurface.buyer.required.upload
    receipt.status = 'passed'
    receipt.artifact = 'observation.json'
    const contents = JSON.stringify({ mode: 'local', observation: 'gate test only' })
    receipt.artifactSha256 = createHash('sha256').update(contents).digest('hex')
    await writeFile(input, JSON.stringify(packet))
    assert.equal(run(...args).status, 1)
    assert.equal(JSON.parse(await readFile(report)).artifactErrors.length, 1, 'missing artifact rejected')
    await writeFile(join(dir, receipt.artifact), contents)
    assert.equal(run(...args).status, 1)
    assert.equal(JSON.parse(await readFile(report)).artifactErrors.length, 0)
    Object.assign(receipt, { environment: 'preview', projectId: 'fixture', buildId: 'fixture-build', runId: 'fixture-run', checkedAt: '2000-01-01T00:00:00Z', observation: { documentId: 'one', bucket: 'documents', path: 'tenant/one.pdf', metadataSaved: true, objectExists: true, sourceSha256: 'a'.repeat(64), sourceBytes: 42 } })
    packet.now = Date.parse(receipt.checkedAt)
    const context = { tenantId: 'tenant-one', ownerType: 'transaction', ownerId: 'tx-one', slotKey: 'proof', partyId: 'buyer-one' }
    receipt.observation.intendedContext = { ...context }
    receipt.observation.recordContext = { ...context }
    packet.maxEvidenceAgeMs = 1e15
    await writeFile(input, JSON.stringify(packet)); run(...args)
    assert.ok(JSON.parse(await readFile(report)).matrix.find((row) => row.id === 'buyer').missingScenarios.includes('required:upload'), 'evidence cannot rewind the verifier clock or extend its lifetime')
    await writeFile(join(dir, receipt.artifact), 'tampered')
    run(...args)
    assert.match(JSON.parse(await readFile(report)).artifactErrors[0].message, /hash mismatch/)
    receipt.artifact = '../outside.json'
    await writeFile(input, JSON.stringify(packet)); run(...args)
    assert.equal(JSON.parse(await readFile(report)).artifactErrors.length, 1)
    receipt.artifact = 'escape.json'
    await symlink(process.execPath, join(dir, 'escape.json'))
    await writeFile(input, JSON.stringify(packet)); run(...args)
    assert.match(JSON.parse(await readFile(report)).artifactErrors[0].message, /escapes/)
    assert.equal(run(...args.slice(0, -1), input).status, 1, 'cannot overwrite evidence')
    assert.equal(run('--evidence', input, '--output', report).status, 1, 'target must be explicit')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
