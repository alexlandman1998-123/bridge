import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const { buildWorkspaceBrandingIntegrityDiagnostics } = await server.ssrLoadModule('/src/services/workspaceBrandingIntegrityService.js')

  const healthy = buildWorkspaceBrandingIntegrityDiagnostics([
    { integrity_status: 'healthy_overlap', membership_source_count: 2, logo_present: true, identity_normalized: false },
  ])
  assert.equal(healthy.summary.status, 'healthy')
  assert.equal(healthy.gate.status, 'pass')
  assert.equal(healthy.dryRun, true)
  assert.deepEqual(healthy.actions, [])

  const attention = buildWorkspaceBrandingIntegrityDiagnostics([
    { integrity_status: 'healthy_overlap', membership_source_count: 2, logo_present: true, identity_normalized: true },
    { integrity_status: 'unbranded', membership_source_count: 2, logo_present: false, identity_normalized: false },
  ])
  assert.equal(attention.summary.status, 'attention')
  assert.equal(attention.gate.status, 'warning')
  assert.equal(attention.summary.normalizedIdentityCount, 1)
  assert.equal(attention.actions[0].key, 'configure_workspace_branding')

  const blocked = buildWorkspaceBrandingIntegrityDiagnostics([
    { integrity_status: 'missing_attorney_membership', membership_source_count: 1, logo_present: true, identity_normalized: false },
    { integrity_status: 'inactive_attorney_membership', membership_source_count: 2, logo_present: true, identity_normalized: false },
  ])
  assert.equal(blocked.summary.status, 'blocked')
  assert.equal(blocked.gate.status, 'blocked')
  assert.equal(blocked.summary.blockingCount, 2)
  assert.deepEqual(blocked.actions.map((action) => action.key), [
    'review_missing_attorney_memberships',
    'review_inactive_attorney_memberships',
  ])

  const page = await readFile(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const runbook = await readFile(new URL('../docs/workspace-branding-rollout-phase7.md', import.meta.url), 'utf8')
  assert.match(page, /Workspace branding integrity/)
  assert.match(page, /getWorkspaceBrandingIntegrityDiagnostics/)
  assert.match(page, /Repair preview/)
  assert.match(page, /No records were changed\./)
  assert.equal(
    packageJson.scripts['verify:workspace-branding-rollout:staging'],
    'npm run test:workspace-branding-rollout-phase7 && npm run audit:workspace-branding-integrity -- --strict',
  )
  assert.match(runbook, /missing_attorney_membership.*blocks rollout/i)
  assert.match(runbook, /repair preview is advisory only/i)
  assert.match(runbook, /Roll back the application release first/i)

  console.log('workspace branding rollout Phase 7 tests passed')
} finally {
  await server.close()
}
