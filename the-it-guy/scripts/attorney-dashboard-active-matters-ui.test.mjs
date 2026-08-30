import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const page = readFileSync(resolve(root, 'src/pages/AttorneyDashboardPage.jsx'), 'utf8')
const service = readFileSync(resolve(root, 'src/services/attorneyDashboard.js'), 'utf8')

for (const token of [
  'bg-[#f7faf9]',
  'border-l-4',
  'border-l-[#00614f]',
  'snap-proximity',
  'sm:w-[335px]',
  'Matter progress',
  'aria-label="Scroll active matters forward"',
]) {
  assert.ok(page.includes(token), `Active Matters cards should include ${token}`)
}

for (const token of [
  'export function mapMatterToActiveMatterCard',
  'getAttorneyStageDefinitionsForLane',
  'resolveMatterCardWorkflowProgress',
  'resolveMatterCardStatus',
  'resolveMatterCardContext',
]) {
  assert.ok(service.includes(token), `Active Matters mapper should include ${token}`)
}
assert.doesNotMatch(service, /daysSince\(transaction\.created_at\) \+ 1\) \/ 90/)

console.log('Attorney dashboard Active Matters UI contract passed.')
