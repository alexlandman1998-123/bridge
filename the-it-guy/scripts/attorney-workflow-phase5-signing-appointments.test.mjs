#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runAttorneyWorkflowPhase5SigningAppointments } from './attorney-workflow-phase5-signing-appointments.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const detailSource = read('src/pages/AttorneyTransactionDetail.jsx')
const serviceSource = read('src/services/attorneyOperations.js')
const packageSource = read('package.json')
const phase0AuditSource = read('docs/audits/attorney-workflow-contract-phase0.md')
const phase5AuditSource = read('docs/audits/attorney-workflow-phase5-signing-appointments.md')
const launchReadinessSource = read('docs/phase-8-launch-readiness.md')

assert.match(detailSource, /createAttorneyAppointmentInvite/, 'Phase 5 must use the real appointment creation service.')
assert.match(detailSource, /Schedule Signing Appointment/, 'Phase 5 must render a signing appointment modal.')
assert.match(detailSource, /attorney-signing-appointment-form/, 'Phase 5 must submit an appointment form.')
assert.match(detailSource, /SIGNING_APPOINTMENT_TYPE_OPTIONS/, 'Phase 5 must expose appointment type choices.')
assert.match(detailSource, /transfer_signing/, 'Phase 5 must support transfer signing appointments.')
assert.match(detailSource, /bond_signing/, 'Phase 5 must support bond signing appointments.')
assert.match(detailSource, /setSigningAppointmentDraft/, 'Phase 5 must open an appointment draft, not a note draft.')
assert.match(detailSource, /location\.state\?\.attorneyQueueAction !== 'schedule_appointment'/, 'Queue schedule intent should open the appointment workflow.')
assert.match(detailSource, /relatedEntityType: 'appointment'/, 'Appointment creation should create linked matter activity.')
assert.match(detailSource, /loadData\(\{ background: true \}\)/, 'Appointment creation should refresh the transaction workspace.')
assert.doesNotMatch(detailSource, /Signing appointment to be scheduled\./, 'Phase 5 must remove the old note-based signing shortcut.')

assert.match(serviceSource, /export async function createAttorneyAppointmentInvite/, 'Attorney operations service must expose appointment creation.')
assert.match(serviceSource, /\.from\('appointments'\)[\s\S]*\.insert\(insertPayload\)/, 'Appointment creation must insert appointments.')
assert.match(serviceSource, /\.from\('appointment_participants'\)\.insert\(participantRows\)/, 'Appointment creation must insert appointment participants.')
assert.match(serviceSource, /notifyAppointmentParticipants/, 'Appointment creation must notify participants.')
assert.match(serviceSource, /scheduleAppointmentReminders/, 'Appointment creation must schedule reminders.')

assert.match(packageSource, /"test:attorney-workflow-phase5-signing-appointments":\s*"node scripts\/attorney-workflow-phase5-signing-appointments\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase5-signing-appointments":\s*"node scripts\/attorney-workflow-phase5-signing-appointments\.mjs"/)
assert.match(phase0AuditSource, /Attorney workflow Phase 5 signing appointments/)
assert.match(phase0AuditSource, /\| B-ATTY-0-5 \| Closed \| Attorney UX \| Signing shortcut now opens a real appointment workflow backed by `appointments` and `appointment_participants`\. \| Phase 5 \|/)
assert.match(phase5AuditSource, /# Attorney Workflow Phase 5 Signing Appointments/)
assert.match(phase5AuditSource, /Decision: GO TO PHASE 6 WITH SIGNING APPOINTMENTS WIRED/)
assert.match(launchReadinessSource, /Attorney workflow Phase 5 signing appointments: `docs\/audits\/attorney-workflow-phase5-signing-appointments\.md`/)
assert.match(launchReadinessSource, /npm run verify:attorney-workflow-phase5-signing-appointments/)

const staticOnlyReport = await runAttorneyWorkflowPhase5SigningAppointments({
  staticOnly: true,
  skipPrerequisites: true,
})
assert.equal(staticOnlyReport.summary.staticBlockedCount, 0, 'Phase 5 static contract should pass.')
assert.equal(staticOnlyReport.summary.status, 'READY_STATIC_ONLY', 'Static-only Phase 5 should not claim full prerequisite sign-off.')

console.log('attorney workflow Phase 5 signing appointment tests passed')
