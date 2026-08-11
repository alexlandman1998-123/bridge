import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workspaceSource = await readFile(new URL('../src/components/appointments/KingstonsSellerAppointmentsWorkspace.jsx', import.meta.url), 'utf8')
const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

for (const requiredCopy of [
  'Manage upcoming appointments and client meetings across your pipeline.',
  'View Calendar',
  'Today',
  'This Week',
  'This Month',
  'Requests',
  'No appointments scheduled',
  'Upcoming Appointments',
  'Date &amp; Time',
  'Type',
  'With',
  'Property',
  'Status',
  'Actions',
  'All Appointments',
  'Schedule Appointment',
]) {
  assert.ok(workspaceSource.includes(requiredCopy), `Simplified seller appointments workspace should include "${requiredCopy}".`)
}

for (const removedCopy of [
  'TabsContent',
  'TabsTrigger',
  'Schedule Valuation Appointment',
  'No past appointments yet.',
  'AppointmentCard',
]) {
  assert.ok(!workspaceSource.includes(removedCopy), `Seller appointments workspace should not render the old tabbed/card UI marker "${removedCopy}".`)
}

assert.ok(workspaceSource.includes('handleOpenAppointmentModal(appointment)'), 'Appointment rows should still open the existing appointment modal.')
assert.ok(workspaceSource.includes('handleMarkAppointmentComplete(appointment)'), 'Appointment rows should still support marking appointments complete.')
assert.ok(workspaceSource.includes('handleCancelAppointment(appointment)'), 'Appointment rows should still support cancelling appointments.')
assert.ok(pipelineSource.includes("handleViewCalendar={() => navigate('/pipeline/calendar')}"), 'Seller lead workspace should wire View Calendar to the pipeline calendar route.')

console.log('Seller lead appointments simplified workspace verified.')
