import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agentsPage = await readFile(new URL('../src/pages/Agents.jsx', import.meta.url), 'utf8')
const branchWorkspacePage = await readFile(new URL('../src/pages/agency/AgencyBranchWorkspacePage.jsx', import.meta.url), 'utf8')

function functionBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, `Unable to find ${startMarker}`)
  return source.slice(start, end)
}

const organisationInviteSubmit = functionBody(agentsPage, 'async function handleSubmitInvite(event)', 'async function handleSaveRole()')
const branchInviteSubmit = functionBody(branchWorkspacePage, 'async function handleSubmit(event)', '  return (')

for (const [label, submit] of [
  ['organisation invite', organisationInviteSubmit],
  ['branch invite', branchInviteSubmit],
]) {
  assert.match(submit, /createWorkspaceUserInvite\(/, `${label} must send through the canonical workspace invite service.`)
  assert.doesNotMatch(submit, /if\s*\([^)]*commissionStructureId[^)]*\)\s*\{[^}]*return/, `${label} must not reject an invite because no commission structure was selected.`)
}

for (const [label, source] of [
  ['organisation', agentsPage],
  ['branch', branchWorkspacePage],
]) {
  assert.match(source, /Commission Structure \(Optional\)|Optionally set a sales commission structure now/, `${label} invite UI must describe commission assignment as optional.`)
  assert.match(source, /assign one later before creating a commissionable transaction/i, `${label} invite UI must explain the deferred assignment path.`)
}

assert.match(agentsPage, /<Button type="submit" form="agent-invite-form" disabled=\{submitting\}>/, 'Organisation invite action should only be disabled while submitting.')
assert.match(branchWorkspacePage, /<Button type="submit" form="branch-agent-invite-form" disabled=\{submitting\}>/, 'Branch invite action should only be disabled while submitting.')

console.log('Agent invite commission readiness contract passed.')
