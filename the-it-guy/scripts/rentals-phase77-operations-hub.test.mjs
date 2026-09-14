import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = await readFile(join(root, 'src/pages/rentals/RentalOperationsDashboardPage.jsx'), 'utf8')

for (const value of ['Active Applications', 'Portfolio Health', 'Vacancy & Letting Performance', 'Lease & Renewal Overview', 'Collections Snapshot', 'Maintenance Overview', 'Recent Activity']) assert.ok(page.includes(value), `Missing operational hub surface: ${value}`)
assert.ok(!page.includes("'/agent/rentals/collections'"), 'Dashboard must not link to an unavailable collections route.')
assert.match(page, /recentActivity\.slice\(0, 6\)\.map\(.*Link[^>]*to=\{item\.href/s, 'Recent activity must link to a valid operational destination.')
console.log('Rentals Phase 77 operations hub checks passed.')
