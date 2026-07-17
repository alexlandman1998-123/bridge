import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [leadsPage, schedulingWorkspace] = await Promise.all([
  readFile(new URL('../src/pages/AttorneyLeadsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx', import.meta.url), 'utf8'),
])

for (const token of [
  'MATTER_INSTRUCTION_SERVICE_OPTIONS',
  'Property Transfer',
  'Bond Registration',
  'Bond Cancellation',
  "serviceType: startsMatter ? 'property_transfer' : 'transfer_quote'",
  "startsMatter ? 'Matter type' : 'Service required'",
  "startsMatter ? 'Instruction source' : 'Lead / referral source'",
  "startsMatter ? 'Property / matter reference' : 'Property address'",
  "startsMatter ? 'Instruction notes' : 'Lead notes'",
  'Matter ownership is assigned after the instruction is qualified',
  'disabled={saving || !canSubmit}',
]) {
  assert.ok(leadsPage.includes(token), `Attorney instruction form should include: ${token}`)
}

const manualDrawerStart = leadsPage.indexOf('function ManualLeadDrawer')
const manualDrawerEnd = leadsPage.indexOf('function PublicLinkDrawer')
const manualDrawer = leadsPage.slice(manualDrawerStart, manualDrawerEnd)
for (const removedField of ['Campaign code', 'Property value', 'Buyer or seller']) {
  assert.ok(!manualDrawer.includes(removedField), `Simplified create form should remove ${removedField}`)
}

for (const token of [
  'aria-label="Create attorney appointment"',
  '<span>New Appointment</span>',
  '<h2>Schedule appointment</h2>',
  'Choose the matter, appointment type, attendee, time and location.',
  'Schedule Appointment',
]) {
  assert.ok(schedulingWorkspace.includes(token), `Attorney appointment form should include: ${token}`)
}

console.log('Attorney quick-create Phase 3 checks passed.')
