import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const workflow = readFileSync(resolve(root, '../.github/workflows/attorney-calendar-invite.yml'), 'utf8')

for (const path of [
  'vitest.attorney-calendar.config.js',
  'src/components/attorney/scheduling/__tests__/CreateInviteDrawer.test.jsx',
  'src/services/__tests__/attorneyAppointmentInviteService.test.js',
  'supabase-tests/appointmentCalendarInvite.test.js',
]) {
  assert.equal(existsSync(resolve(root, path)), true, `Phase 6 test asset is missing: ${path}`)
}

const fullGate = packageJson.scripts?.['test:attorney-calendar-invite'] || ''
for (let phase = 1; phase <= 8; phase += 1) {
  assert.ok(fullGate.includes(`test:attorney-calendar-phase${phase}`), `Full calendar gate must include Phase ${phase}`)
}

const phase6Gate = packageJson.scripts?.['test:attorney-calendar-phase6'] || ''
assert.match(phase6Gate, /vitest run/)
assert.match(phase6Gate, /attorney-calendar-phase6-suite\.test\.mjs/)
assert.match(phase6Gate, /npm run build/, 'Phase 6 must include a production build gate')
assert.match(workflow, /npm run test:attorney-calendar-invite/)
assert.doesNotMatch(fullGate, /--live|verify:.*staging/, 'The deterministic CI gate must not mutate staging')

for (const path of [
  'the-it-guy/src/components/attorney/scheduling/**',
  'the-it-guy/src/components/client-portal/appointments/**',
  'the-it-guy/src/core/appointments/**',
  'the-it-guy/src/lib/api.js',
  'the-it-guy/src/lib/appointmentAvailabilityEngine.js',
  'the-it-guy/src/services/appointmentNotificationService.js',
  'the-it-guy/src/services/appointmentRescheduleService.js',
  'the-it-guy/src/services/attorneyOperations.js',
  'the-it-guy/scripts/appointment-**',
  'the-it-guy/scripts/attorney-calendar-**',
  'supabase/functions/send-email/**',
  'supabase/migrations/*attorney_calendar*',
]) {
  assert.ok(workflow.includes(path), `Attorney calendar CI must trigger for ${path}`)
}

console.log('attorney calendar Phase 6 suite and CI contract passed')
