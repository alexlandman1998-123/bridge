// Isolated request-count comparison. Vite timings are local observations only.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { startListingDiagnosticBrowserFixture } from './lib/listingDiagnosticBrowserFixture.mjs'
const out = resolve(process.argv[2] || '../output/playwright/listing-editor-performance')
const beforePath = process.argv[3]
await mkdir(out, { recursive: true })
const measurements = []
for (const version of beforePath ? ['before', 'after'] : ['after']) {
  const fixture = await startListingDiagnosticBrowserFixture(out, { traceEvents: false, saleSource: version === 'before' ? await readFile(resolve(beforePath), 'utf8') : null })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const size of [10, 1000]) {
      fixture.setPortfolioSize(size)
      const context = await browser.newContext()
      await context.route('**/*', route => new URL(route.request().url()).origin === fixture.origin || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort())
      const page = await context.newPage()
      page.setDefaultTimeout(45000)
      page.setDefaultNavigationTimeout(90000)
      for (const run of ['cold-context', 'warm-reload']) {
        const startIndex = fixture.events.length
        const started = performance.now()
        await page.goto(fixture.origin + '/listings/new', { waitUntil: 'domcontentloaded' })
        await page.getByRole('combobox', { name: 'Property type *', exact: true }).waitFor()
        const formVisibleMs = Math.round(performance.now() - started)
        // Count enrichment to completion; a visible editor alone can hide background work.
        let previous = -1, stableAt = performance.now()
        while (performance.now() - stableAt < 500) {
          if (fixture.events.length !== previous) { previous = fixture.events.length; stableAt = performance.now() }
          if (performance.now() - started > 60000) throw new Error('Fixture did not settle')
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        const events = fixture.events.slice(startIndex)
        const counts = events.reduce((result, event) => ({ ...result, [event.kind]: (result[event.kind] || 0) + 1 }), {})
        const measured = { version, portfolioSize: size, run, formVisibleMs, requests: counts }
        measurements.push(measured)
        console.log(JSON.stringify(measured))
        if (version === 'after') for (const kind of ['all', 'workspace-transactions', 'workspace-assignments', 'workspace-developments', 'website-status']) assert.equal(counts[kind] || 0, 0, `${kind} must not run in the ordinary editor`)
      }
      await context.close()
    }
  } finally { await browser.close(); await fixture.close() }
}
await writeFile(out + '/editor-performance.json', JSON.stringify({ limitations: 'Local Vite + synthetic accounts/portfolio. Cold observations include compilation. Request counts are structural evidence; milliseconds are not production timings. No remote services called.', measurements }, null, 2))
