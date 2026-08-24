import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/DeveloperLeadsPage.jsx', import.meta.url), 'utf8')

for (const token of [
  'function getLeadWorkspaceReadiness(',
  'function getLeadWorkspaceContextLine(',
  'function getLeadWorkspaceReadinessRows(',
  'Buyer Readiness',
  'Actions',
  'Buyer Lead',
  'Qualification',
  'conic-gradient(#2f87aa',
  'headerReadinessRows.map',
  'Back to Leads',
  'function getDeveloperLeadQualificationRows(',
  'function getDeveloperQualificationStatusMeta(',
  'handleLogActivity',
  'Phone qualification questions',
  'Activity Logger',
  'Capture touchpoint',
  'Set as next action',
  'Log Activity',
]) {
  assert.match(
    pageSource,
    new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `developer lead workspace header should include ${token}`,
  )
}

assert.match(
  pageSource,
  /grid lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(360px,0\.95fr\)\]/,
  'developer lead workspace header should use the split hero grid from the reference design',
)

assert.match(
  pageSource,
  /renderCopyOnboardingAction\(\)[\s\S]*renderPrimaryAction\(\)/,
  'developer lead workspace action menu should preserve copy onboarding and primary actions',
)

console.log('developer lead workspace header refactor test passed')
