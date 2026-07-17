import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [quickCreate, leadsPage, schedulingWorkspace] = await Promise.all([
  readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AttorneyLeadsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx', import.meta.url), 'utf8'),
])

for (const token of [
  "state: { openCreateLead: true, creationIntent: 'matter' }",
  "state: { openCreateLead: true, creationIntent: 'lead' }",
  'state: { openCreateAppointment: true }',
]) {
  assert.ok(quickCreate.includes(token), `Quick Create should publish the route-state contract: ${token}`)
}

for (const token of [
  'useLocation',
  'useNavigate',
  'manualDrawerOpen',
  'routeCreateIntent',
  'clearCreateLeadRouteState',
  'Start a Matter',
  'Capture the client instruction first',
  'Capture Instruction',
]) {
  assert.ok(leadsPage.includes(token), `Attorney Leads should consume the create contract: ${token}`)
}
assert.match(leadsPage, /delete nextState\.openCreateLead/)
assert.match(leadsPage, /delete nextState\.creationIntent/)
assert.match(leadsPage, /replace:\s*true/)

for (const token of [
  'inviteRequestedFromCreateMenu',
  'inviteDrawerOpen',
  'clearCreateAppointmentRouteState',
  'delete nextState.openCreateAppointment',
  'onClose={closeInviteDrawer}',
]) {
  assert.ok(schedulingWorkspace.includes(token), `Attorney Scheduling should consume the create contract: ${token}`)
}
assert.match(schedulingWorkspace, /open=\{inviteDrawerOpen\}/)
assert.match(schedulingWorkspace, /replace:\s*true/)

console.log('Attorney quick-create Phase 2 checks passed.')
