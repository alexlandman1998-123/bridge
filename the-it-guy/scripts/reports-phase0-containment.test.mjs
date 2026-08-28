import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const flagsSource = await readFile(new URL('../src/lib/featureFlags.js', import.meta.url), 'utf8')
const rolesSource = await readFile(new URL('../src/lib/roles.js', import.meta.url), 'utf8')
const mobileMoreSource = await readFile(new URL('../src/pages/mobile/MobileMore.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

test('the core reports module is launch-locked off by default', () => {
  assert.match(flagsSource, /const REPORTS_MODULE_LAUNCH_DISABLED = true/)
  assert.match(flagsSource, /export const REPORTS_MODULE_ENABLED = REPORTS_MODULE_LAUNCH_DISABLED\s*\? false/)
})

test('desktop and mobile report routes cannot mount their query-owning components while locked', () => {
  assert.match(appSource, /path="\/reports"[\s\S]*?element=\{<ReportsUnavailable \/>\}/)
  assert.match(appSource, /path="\/mobile\/reports" element=\{<ReportsUnavailable \/>\}/)
  assert.doesNotMatch(appSource, /lazy\(\(\) => import\('\.\/pages\/Report'\)\)/)
  assert.match(appSource, /No report data is loaded on this route\./)
  assert.match(apiSource, /async function fetchReportRows[\s\S]*?throw new Error\('Reports module is disabled for this release\.'\)/)
  assert.doesNotMatch(apiSource, /export async function fetchReportRows/)
  assert.match(appSource, /path="\/reports"[\s\S]*?element=\{<ReportsUnavailable \/>\}/)
})

test('report links are removed from desktop and mobile navigation while locked', () => {
  assert.match(rolesSource, /CORE_REPORT_NAV_KEYS = new Set\(\['reports', 'rental_reports'\]\)/)
  assert.match(rolesSource, /if \(REPORTS_MODULE_ENABLED\) return items/)
  assert.match(mobileMoreSource, /MORE_ITEMS\.filter\(\(item\) => REPORTS_MODULE_ENABLED \|\| item\.key !== 'insights'\)/)
})
