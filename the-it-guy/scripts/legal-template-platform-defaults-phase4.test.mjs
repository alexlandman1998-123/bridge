import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const adminData = await readFile(new URL('../../apps/admin/src/lib/adminData.js', import.meta.url), 'utf8')
const adminApp = await readFile(new URL('../../apps/admin/src/App.jsx', import.meta.url), 'utf8')
const adminCss = await readFile(new URL('../../apps/admin/src/styles/admin.css', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase4'],
  'node scripts/legal-template-platform-defaults-phase4.test.mjs',
  'package.json should expose the Phase 4 platform-default readiness contract.',
)

for (const token of [
  'PHASE4_B3_RELEASE_CONTRACT',
  'assessAdminLegalTemplateApproval',
  'templateApprovalReady',
  'legalTemplateMatchesReadinessRequirement',
  'resolveLegalTemplateReadinessCandidate',
  'platform_default',
  'platform_default_with_draft_override',
  'selected_default_not_approved',
  'no_runtime_released_template',
  "acc[check.severity] = (acc[check.severity] || 0) + 1",
]) {
  assert.ok(adminData.includes(token), `admin readiness should enforce Phase 4 semantics: ${token}`)
}

assert.ok(
  adminData.includes("const RESIDENTIAL_LEGAL_TEMPLATE_MODULES = new Set(['residential', 'agency'])"),
  'Residential readiness should accept agency-scoped legal defaults used by the runtime router.',
)

assert.ok(
  adminData.includes("summary: { ready: 0, warning: 0, blocked: 0, total: 0 }"),
  'Admin readiness should report blocked checks instead of treating launch blockers as missing only.',
)

for (const token of [
  'Draft Override',
  'Blocked',
  'readiness.summary.blocked',
]) {
  assert.ok(adminApp.includes(token), `Legal template UI should surface Phase 4 readiness state: ${token}`)
}

assert.ok(
  adminCss.includes('.legal-template-readiness-list article.blocked'),
  'Legal template readiness list should style blocked checks as danger states.',
)

console.log('Legal template platform defaults Phase 4 contract passed.')
