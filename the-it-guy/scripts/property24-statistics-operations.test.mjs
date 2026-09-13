import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [service, settingsPage] = await Promise.all([
  readFile(new URL('../src/services/property24StatisticsOperationsService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/settings/SettingsProperty24Page.jsx', import.meta.url), 'utf8'),
])

assert.match(service, /property24_statistics_sync_runs/)
assert.match(service, /runProperty24StatisticsSync/)
assert.match(service, /\/api\/property24\/settings\/statistics-sync/)
assert.match(settingsPage, /Portal statistics/)
assert.match(settingsPage, /Sync portal statistics/)
assert.match(settingsPage, /Refresh history/)
console.log('Property24 statistics operations contract passed.')
