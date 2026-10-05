import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildSellerMandateReviewDocumentMarkup, parseSellerMandateReviewWording } from '../src/core/documents/sellerMandateReviewDocumentMarkup.js'
import { createMandateReviewFixture } from './fixtures/seller-mandate-review.mjs'
import { resolveDocumentBrandPalette } from '../src/lib/onboardingBranding.js'

// Local synthetic review only. No Supabase, account, storage or email calls.
const appRoot = fileURLToPath(new URL('../', import.meta.url))
const qaDirectory = path.join(appRoot, 'test-results/mandate-review-layout')
const proofDirectory = path.resolve(appRoot, '../output/pdf')
const checksOnly = process.argv.includes('--check')
const fixtures = []
const normalize = value => value.replace(/\s+/g, ' ').trim()
for (const [id, type] of [['exclusive', 'sole'], ['open', 'open'], ['dual', 'dual']]) {
  const markdown = await fs.readFile(path.join(appRoot, `docs/mandate-wording-review/${id}-mandate-draft.md`), 'utf8')
  const pack = createMandateReviewFixture(type)
  const legalParagraphs = parseSellerMandateReviewWording(markdown).sections.flatMap(section => section.blocks.filter(block => block.kind === 'paragraph').map(block => block.text))
  const add = (name, signingPack, proof = false, viewport = { width: 1440, height: 1000 }) => fixtures.push({
    id: name, proof, signingPack, viewport, legalParagraphs,
    html: buildSellerMandateReviewDocumentMarkup({ signingPack, draftMarkdown: markdown, generatedAt: '2026-10-04T10:00:00Z' }),
  })
  add(id, pack, true)
  if (id === 'open') {
    const fixed = structuredClone(pack)
    fixed.mandate.mandateDuration = 'fixed'; fixed.mandate.endDate = '2027-01-04'
    fixed.mandate.commissionBasis = 'fixed'; fixed.mandate.commissionAmount = '15000'; fixed.mandate.vatHandling = 'none'; fixed.mandate.protectionPeriod = '0'
    add('open-fixed-zero-no-logo', { ...fixed, branding: { organisationName: 'Synthetic Open Agency', primaryColour: '#ffff00', accentColour: '#00ffff' } })
  }
  if (id === 'dual') {
    const stress = structuredClone(pack)
    const long = label => Array.from({ length: 34 }, (_, i) => `${label} ${i + 1}: Owner consent, recorded access and written notices are required.`).join('\n')
    stress.mandate.specialConditions = long('Special condition')
    for (const key of ['authority', 'priceExclusions', 'buyerExclusions', 'existingIntroductions', 'marketing', 'expenses', 'annexures']) {
      stress.mandate.mandateCapture[key].status = 'captured'
      stress.mandate.mandateCapture[key].details = long(key)
    }
    stress.mandate.mandateCapture.expenses.maximumAmount = '1000'
    stress.mandate.mandateCapture.expenses.vatHandling = 'exclusive'
    stress.mandate.mandateCapture.expenses.paymentTrigger = 'After delivery, against the approved invoice.'
    stress.mandate.mandateCapture.allocation.details = long('Allocation')
    stress.signers = Array.from({ length: 6 }, (_, i) => ({ name: `Co-owner ${i + 1} Synthetic Person`, role: 'Registered owner', authorityReference: `OWNER-AUTH-${i + 1}`, email: `owner${i + 1}@example.test` }))
    stress.seller.parties = stress.signers.map((signer, i) => ({ ...signer, role: 'Owner', idNumber: `OWNER-ID-${i + 1}`, residentialAddress: `${i + 1} Example Street` }))
    add('dual-long-schedules-six-owners-mobile', stress, false, { width: 390, height: 844 })
    const maximum = structuredClone(stress)
    const full = label => `${label}: ${'Recorded owner consent and written agency instructions. '.repeat(80)}`.slice(0, 4000)
    maximum.mandate.specialConditions = full('Maximum special conditions')
    for (const key of ['authority', 'priceExclusions', 'buyerExclusions', 'existingIntroductions', 'marketing', 'expenses', 'annexures']) maximum.mandate.mandateCapture[key].details = full(key)
    maximum.mandate.mandateCapture.marketing.accessDetails = full('Access')
    maximum.mandate.mandateCapture.marketing.reporting = full('Reporting')
    maximum.mandate.mandateCapture.allocation.details = full('Allocation')
    add('dual-maximum-schedules', maximum)
    const effective = structuredClone(pack)
    effective.mandate.mandateCapture.allocation.rule = 'effective_cause'
    effective.mandate.mandateCapture.agencyB.vatStatus = 'not_registered'
    effective.mandate.mandateCapture.allocation.agencyBVatHandling = 'none'
    effective.branding = { organisationName: 'Synthetic Violet Agency', primaryColour: '#38165e', accentColour: '#054f8c' }
    add('dual-effective-cause-mixed-vat', effective)
    const unbroken = structuredClone(pack)
    unbroken.mandate.specialConditions = 'A'.repeat(4000)
    unbroken.mandate.mandateCapture.agencyA.privacyNoticeUrl = `https://example.test/${'b'.repeat(480)}`
    unbroken.documentReference = 'REF-'.repeat(125)
    add('dual-long-unbroken-text', unbroken)
    add('dual-incomplete', { mandate: { mandateType: 'dual', mandateCapture: { version: 1 } } })
  }
}
await fs.mkdir(qaDirectory, { recursive: true })
if (!checksOnly) await fs.mkdir(proofDirectory, { recursive: true })
const bundled = await build({ absWorkingDir: appRoot, entryPoints: ['src/lib/htmlDocumentPdf.js'], bundle: true, platform: 'browser', format: 'esm', write: false })
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname === '/pdf-runtime.js') response.writeHead(200, { 'content-type': 'text/javascript' }).end(bundled.outputFiles[0].text)
  else response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><head><meta charset="utf-8"><title>Local mandate review layout checks</title></head><body></body></html>')
})
let browser
const report = []
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  await context.route('**/*', route => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort('blockedbyclient'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(baseUrl)
  await page.evaluate(async () => { window.downloadPdf = (await import('/pdf-runtime.js')).downloadHtmlDocumentPdf })
  for (const fixture of fixtures) {
    await page.setViewportSize(fixture.viewport)
    const preview = await context.newPage({ viewport: fixture.viewport })
    const previewErrors = []
    preview.on('pageerror', error => previewErrors.push(error.message))
    await preview.setContent(fixture.html)
    await preview.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())) })
    assert.deepEqual(previewErrors, [], `${fixture.id}: standalone review must paginate successfully`)
    const layout = await preview.evaluate(() => {
      const pages = [...document.querySelectorAll('.mandate-review-page')]
      const overflows = [], orphanHeadings = []
      pages.forEach((page, index) => {
        const body = page.querySelector('.review-body'), bounds = body.getBoundingClientRect()
        for (const zone of page.querySelectorAll('.review-header,.review-footer')) {
          const rect = zone.getBoundingClientRect()
          for (const child of zone.children) {
            const edge = child.getBoundingClientRect()
            if (edge.top < rect.top - 1 || edge.bottom > rect.bottom + 1 || edge.left < rect.left - 1 || edge.right > rect.right + 1) overflows.push(`${index + 1}: header/footer ${child.textContent.slice(0, 45)}`)
          }
        }
        for (const block of body.children) {
          const rect = block.getBoundingClientRect()
          if (rect.bottom > bounds.bottom + 1 || rect.right > bounds.right + 1 || rect.left < bounds.left - 1) overflows.push(`${index + 1}: ${block.textContent.slice(0, 55)}`)
          if (block.matches('h1,h2,h3') && !block.nextElementSibling) orphanHeadings.push(`${index + 1}: ${block.textContent}`)
        }
      })
      const textByBlock = new Map()
      pages.forEach(page => [...page.querySelector('.review-body').children].forEach(block => {
        const nodes = block.matches('[data-review-text]') ? [block] : [...block.querySelectorAll('[data-review-text]')]
        const value = nodes.map(node => node.textContent).join(' ')
        textByBlock.set(block.dataset.reviewBlock, (textByBlock.get(block.dataset.reviewBlock) || '') + value)
      }))
      return { pages: pages.length, overflows, orphanHeadings, text: [...textByBlock.values()].join(' '), signatureCount: document.querySelectorAll('.review-signature').length,
        numbers: pages.map(page => page.querySelector('[data-review-page-number]').textContent),
        bodyFont: getComputedStyle(pages[0].querySelector('.review-body')).fontSize }
    })
    assert.ok(layout.pages > 0)
    assert.deepEqual(layout.overflows, [], `${fixture.id}: nothing may overlap the footer or leave the A4 content area`)
    assert.deepEqual(layout.orphanHeadings, [], `${fixture.id}: a heading must stay with content`)
    assert.equal(layout.signatureCount, (fixture.signingPack.signers?.length || 1) + (fixture.signingPack.mandate.mandateType === 'dual' ? 2 : 1))
    assert.equal(layout.bodyFont, '14px', 'Contract text must retain 10.5pt type')
    assert.deepEqual(layout.numbers, Array.from({ length: layout.pages }, (_, i) => `Page ${i + 1} of ${layout.pages}`))
    const renderedText = normalize(layout.text)
    for (const paragraph of fixture.legalParagraphs) assert.ok(renderedText.includes(normalize(paragraph)), `${fixture.id}: full legal paragraph lost during pagination`)
    if (fixture.signingPack.mandate.specialConditions) assert.ok(renderedText.includes(normalize(fixture.signingPack.mandate.specialConditions)), `${fixture.id}: special conditions lost during pagination`)
    for (const key of ['authority', 'priceExclusions', 'buyerExclusions', 'existingIntroductions', 'marketing', 'expenses', 'annexures']) {
      const schedule = fixture.signingPack.mandate.mandateCapture?.[key]
      if (schedule?.status === 'captured') assert.ok(renderedText.includes(normalize(schedule.details)), `${fixture.id}: ${key} schedule lost`)
    }
    await fs.writeFile(path.join(qaDirectory, `${fixture.id}.html`), fixture.html)
    // A searchable Chromium proof also verifies text and print pagination;
    // deliverable proofs below use the application's actual download exporter.
    await preview.pdf({ path: path.join(qaDirectory, `${fixture.id}-print.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true })
    await preview.close()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.evaluate(async ({ html, id }) => { await window.downloadPdf(html, `${id}-mandate-review.pdf`, { stageName: 'mandate-review-layout' }) }, fixture),
    ])
    const output = path.join(fixture.proof && !checksOnly ? proofDirectory : qaDirectory, download.suggestedFilename())
    await download.saveAs(output)
    assert.equal(await download.failure(), null)
    assert.equal(await page.locator('[data-mandate-review-layout-pdf-stage], [data-mandate-review-layout-pdf-style], .html2pdf__overlay').count(), 0)
    const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(output)) }).promise
    try {
      assert.equal(pdf.numPages, layout.pages, `${fixture.id}: downloaded page count must match the measured review`)
      for (let i = 1; i <= pdf.numPages; i++) {
        const pdfPage = await pdf.getPage(i)
        const viewport = pdfPage.getViewport({ scale: 0.75 })
        assert.ok(Math.abs(viewport.width / viewport.height - 210 / 297) < 0.001, 'Each downloaded page must be A4')
        const surface = pdf.canvasFactory.create(viewport.width, viewport.height)
        try {
          await pdfPage.render({ canvasContext: surface.context, viewport }).promise
          const pixels = surface.context.getImageData(0, 0, surface.canvas.width, surface.canvas.height).data
          let ink = 0, headerInk = 0, brandPixels = 0
          const brandInk = resolveDocumentBrandPalette(fixture.signingPack.branding).primaryInk
          const rgb = [1, 3, 5].map(offset => parseInt(brandInk.slice(offset, offset + 2), 16))
          for (let j = 0; j < pixels.length; j += 4) {
            if (Math.min(pixels[j], pixels[j + 1], pixels[j + 2]) < 190) { ink++; if (j / 4 < surface.canvas.width * 85) headerInk++ }
            if (j / 4 < surface.canvas.width * 70 && j / 4 % surface.canvas.width < 250 && rgb.every((channel, offset) => Math.abs(channel - pixels[j + offset]) < 25)) brandPixels++
          }
          assert.ok(ink > 1400, `${fixture.id} page ${i}: no blank pages`)
          assert.ok(headerInk > 100, `${fixture.id} page ${i}: branding and draft status must repeat`)
          assert.ok(brandPixels > 35, `${fixture.id} page ${i}: the saved agency logo/name colour must persist (${brandPixels})`)
          await fs.writeFile(path.join(qaDirectory, `${fixture.id}-page-${i}.png`), surface.canvas.toBuffer('image/png'))
        } finally { pdf.canvasFactory.destroy(surface) }
      }
    } finally { await pdf.destroy() }
    report.push({ id: fixture.id, pages: layout.pages, signatures: layout.signatureCount, viewport: fixture.viewport, output })
    console.log(`${fixture.id}: ${layout.pages} A4 pages, ${layout.signatureCount} intact signature blocks; full wording and schedules retained`)
  }
  assert.deepEqual(errors, [], 'Application export must not raise browser errors')
  await fs.writeFile(path.join(qaDirectory, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Mandate review checks passed: ${report.length} PDFs, ${report.reduce((sum, item) => sum + item.pages, 0)} pages. Local synthetic data only.`)
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
