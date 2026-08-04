import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workspace = readFileSync(new URL('../src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/services/attorneyOperations.js', import.meta.url), 'utf8')
const contract = readFileSync(new URL('../src/core/appointments/attorneyInviteContract.js', import.meta.url), 'utf8')

for (const token of [
  '<h1>Calendar</h1>',
  'Manage appointments, deadlines and important dates.',
  'New Event',
  'Today',
  'This Week',
  'Pending',
  'Overdue',
  'MiniMonthPicker',
  'Search matters, clients or appointments...',
  'All Attorneys',
  'All Matter Types',
  'All Statuses',
  'All Boardrooms',
  'StaffVisibilityPanel',
  'Attorneys',
  'VIEW_MODES',
  'event-modal-card',
  'Event Title *',
  'e.g. OTP Signing with Buyer',
  'Link to Matter',
  'Related To',
  'Boardroom',
  'Attorneys / Staff',
  'Send notifications',
]) {
  assert.ok(workspace.includes(token), `Attorney calendar workspace should include "${token}".`)
}

for (const removed of [
  '<span>Attorney Calendar</span>',
  '<h1>Scheduling</h1>',
  'Create Invite is paused for this firm',
  'Upcoming Signings',
]) {
  assert.ok(!workspace.includes(removed), `Attorney calendar workspace should remove "${removed}".`)
}

assert.ok(workspace.includes('appointmentMatchesStaffSelection'), 'Staff panel should filter calendar events without a page refresh.')
assert.ok(workspace.includes('borderLeftColor: staff?.color'), 'Calendar events should use staff colours where available.')
assert.ok(service.includes('resource_id'), 'Scheduling service should load appointment boardroom assignments.')
assert.ok(service.includes('!appointment.transaction_id || scopedMatterIds.has(appointment.transaction_id)'), 'Scheduling service should include firm-level internal events.')
assert.ok(contract.includes('allowsFirmLevelEvent'), 'Internal event contract should allow matterless firm events.')

console.log('attorney calendar workspace refactor contract passed')
