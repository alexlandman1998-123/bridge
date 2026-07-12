import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const appSource = await read('../src/App.jsx')
const viteConfig = await read('../vite.config.js')
const agentDataService = await read('../src/lib/agentDataService.js')
const attorneyMockData = await read('../src/core/transactions/attorneyMockData.js')
const mockData = await read('../src/lib/mockData.js')
const attorneyTransactionDetail = await read('../src/pages/AttorneyTransactionDetail.jsx')

assert.match(
  mockData,
  /MOCK_DATA_ENABLED\s*=\s*false/,
  'Mock data should remain disabled after removing seed payloads.',
)
assert.doesNotMatch(
  appSource,
  /agentDemoSeed/,
  'App should not import removed agent demo seed data.',
)

for (const [label, source] of [
  ['agent data service', agentDataService],
  ['attorney mock data', attorneyMockData],
]) {
  assert.doesNotMatch(
    source,
    /agentDemoSeed/,
    `${label} should not statically import the full seed module.`,
  )
}

assert.match(
  attorneyTransactionDetail,
  /import\('html2pdf\.js\/src\/index\.js'\)/,
  'Bond application PDF export should import html2pdf source entry so PDF dependencies can be split.',
)
assert.doesNotMatch(
  attorneyTransactionDetail,
  /import\('html2pdf\.js'\)/,
  'Bond application PDF export should avoid the bundled html2pdf dist entry.',
)

assert.match(
  viteConfig,
  /chunkSizeWarningLimit:\s*1600/,
  'Vite should keep an explicit app-shell chunk warning budget instead of relying on the default.',
)
assert.match(
  viteConfig,
  /vite\/preload-helper/,
  'Vite preload helpers should stay in a neutral runtime chunk instead of a lazy PDF/export chunk.',
)

for (const chunkName of [
  'vendor-runtime',
  'html2pdf-runtime',
  'vendor-html2canvas',
  'vendor-jspdf',
  'vendor-dompurify',
  'vendor-fflate',
  'vendor-canvg',
]) {
  assert.match(viteConfig, new RegExp(chunkName), `Vite config should keep ${chunkName} manual chunking in place.`)
}

console.log('build chunk hygiene tests passed')
