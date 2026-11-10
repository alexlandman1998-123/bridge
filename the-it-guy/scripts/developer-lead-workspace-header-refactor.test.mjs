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
  'Save as follow-up note',
  'checked={activityDraft.setAsNextAction}',
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
  /grid lg:grid-cols-\[minmax\(0,[\d.]+fr\)_minmax\(\d+px,[\d.]+fr\)\]/,
  'developer lead workspace header should use the split hero grid without fixing presentation-only column sizes',
)

assert.match(
  pageSource,
  /renderCopyOnboardingAction\(\)[\s\S]*renderPrimaryAction\(\)/,
  'developer lead workspace action menu should preserve copy onboarding and primary actions',
)

console.log('developer lead workspace header refactor test passed')
