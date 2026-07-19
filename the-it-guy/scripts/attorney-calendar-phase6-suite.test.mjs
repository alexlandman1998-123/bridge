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
for (let phase = 1; phase <= 6; phase += 1) {
  assert.ok(fullGate.includes(`test:attorney-calendar-phase${phase}`), `Full calendar gate must include Phase ${phase}`)
}

assert.match(packageJson.scripts?.['test:attorney-calendar-phase6'] || '', /vitest run/)
assert.match(workflow, /npm run test:attorney-calendar-invite/)
assert.doesNotMatch(fullGate, /--live|verify:.*staging/, 'The deterministic CI gate must not mutate staging')

console.log('attorney calendar Phase 6 suite and CI contract passed')
