import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = await readFile(join(root, 'src/pages/rentals/RentalOperationsDashboardPage.jsx'), 'utf8')

for (const value of ['QUICK_ACTIONS', 'upcomingHref', 'Pilot readiness', 'Rollout controls', 'Screening', 'Reminders', 'Operational report', 'Nothing currently needs a Rentals intervention.']) assert.ok(page.includes(value), `Missing operational hub surface: ${value}`)
assert.ok(!page.includes("'/agent/rentals/collections'"), 'Dashboard must not link to an unavailable collections route.')
assert.match(page, /upcoming.map\(.*Link to=\{upcomingHref\(item\)\}/s, 'Upcoming actions must link to a valid operational destination.')
console.log('Rentals Phase 77 operations hub checks passed.')
