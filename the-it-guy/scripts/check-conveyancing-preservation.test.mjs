import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('preservation guard rejects source drift, missing files and escaped paths without rewriting evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'arch9-preservation-'))
  try {
    const app = join(root, 'app')
    mkdirSync(join(app, 'scripts'), { recursive: true })
    mkdirSync(join(app, 'docs'))
    const script = join(app, 'scripts/check-conveyancing-preservation.mjs')
    writeFileSync(script, readFileSync(new URL('./check-conveyancing-preservation.mjs', import.meta.url)))
    writeFileSync(join(app, 'scripts/legal-workspace-shell-review.mjs'), readFileSync(new URL('./legal-workspace-shell-review.mjs', import.meta.url)))
    const original = 'protected baseline\n'
    const hash = createHash('sha256').update(original).digest('hex')
    writeFileSync(join(app, 'workflow.js'), original)
    writeFileSync(join(app, 'routes.js'), original)
    const manifest = { version: 1, protectedFiles: [{ path: 'app/workflow.js', sha256: hash }], reviewFiles: [{ path: 'app/routes.js', sha256: hash }] }
    const manifestPath = join(app, 'docs/conveyancing-preservation-baseline.json')
    const saved = JSON.stringify(manifest)
    writeFileSync(manifestPath, saved)
    const run = () => spawnSync(process.execPath, [script, '--sources-only'], { encoding: 'utf8' })
    assert.equal(run().status, 0, 'matching source should pass')
    writeFileSync(join(app, 'workflow.js'), 'changed workflow')
    assert.match(run().stderr, /Protected conveyancing source changed/)
    assert.equal(run().status, 1)
    writeFileSync(join(app, 'workflow.js'), original)
    writeFileSync(join(app, 'routes.js'), 'changed route')
    assert.match(run().stderr, /Shared surface requires conveyancing review/)
    assert.equal(run().status, 1)
    assert.equal(readFileSync(manifestPath, 'utf8'), saved, 'verification must never rewrite the baseline')
    writeFileSync(join(app, 'routes.js'), original)
    rmSync(join(app, 'workflow.js'))
    assert.equal(run().status, 1, 'missing protected code should fail')
    manifest.protectedFiles[0].path = '../outside.js'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    assert.match(run().stderr, /Invalid baseline entry/)
    assert.notEqual(run().status, 0, 'paths outside the repository should fail')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
