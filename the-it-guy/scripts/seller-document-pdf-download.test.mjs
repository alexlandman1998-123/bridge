import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildSellerMandateDocumentMarkup } from '../src/core/documents/sellerMandateDocumentMarkup.js'
import { buildSellerFicaDueDiligenceMarkup } from '../src/core/documents/sellerFicaDueDiligenceMarkup.js'
import { buildSellerComplianceDocumentModel } from '../src/core/documents/sellerComplianceDocumentModel.js'
import { buildPropertyDisclosureDocumentMarkup } from '../src/lib/propertyDisclosure.js'
import { createSellerCorrectionFixture, sellerCorrectionValues } from './fixtures/seller-document-corrections.mjs'
import { buildSellerSigningCorrectionEditData, renderSellerSigningDocumentCorrections } from '../src/core/documents/sellerSigningDocumentCorrections.js'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const outputDirectory = path.join(appRoot, 'test-results/seller-document-pdf-download')
const generatedAt = '2026-10-04T10:00:00Z'
// A distinctive logo colour lets us check branding in the downloaded PDF,
// rather than only checking that the preview contains an image element.
const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="100"><rect width="480" height="100" fill="#ce147e"/><text x="18" y="67" font-size="44" font-family="Arial" fill="white">TEST AGENCY</text></svg>'
const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`
const branding = {
  organisationName: 'Synthetic Harbour Agency', logoLightUrl: logo, logoDarkUrl: logo,
  primaryColour: '#173d35', accentColour: '#78521b', physicalAddress: '10 Test Road, Cape Town',
  email: 'office@example.test', phone: '0210000000', businessFfcNumber: 'TEST-FFC',
}
const disclosure = {
  decision: 'none', declarationAccepted: true, signatureName: 'Sam Test Seller',
  signature: 'Sam Test Seller', signedAt: generatedAt,
  responses: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i + 1}`, 'no'])),
}
const form = {
  sellerFirstName: 'Sam', sellerSurname: 'Test Seller', email: 'sam@example.test', phone: '0820000001',
  ownerStructureType: 'individual', ownershipType: 'individual', maritalStatus: 'not_married',
  idNumber: 'TEST-ID-1', residentialAddress: '2 Test Road', propertyAddress: '10 Test Street, Cape Town',
  sellerTaxNumber: 'TEST-TAX-1', taxResident: 'sa_resident', popiConsentAccepted: true,
  propertyDisclosure: disclosure, politicallyExposedPerson: 'no', sourceOfFunds: 'Savings', sourceOfWealth: 'Salary',
}
const pack = {
  branding, documentReference: 'SYNTHETIC-PDF-TEST-ONLY',
  seller: { name: 'Sam Test Seller', idNumber: 'TEST-ID-1', residentialAddress: '2 Test Road', email: form.email },
  property: { address: form.propertyAddress, titleDeedNumber: 'T-TEST/2026' },
  mandate: { mandateType: 'sole', askingPrice: '2450000', startDate: '2026-10-04', endDate: '2027-01-04', protectionPeriodDays: 90 },
  signers: [{ name: 'Sam Test Seller', role: 'Seller', email: form.email }],
  practitioner: { name: 'Pat Test Practitioner', ffcNumber: 'TEST-P-FFC' },
}
const approval = { commission: { basis: 'percentage', percentage: 5, vatHandling: 'inclusive' } }
const fixtures = []
function add(id, html, viewport = { width: 1440, height: 1000 }, checks = {}) {
  const expectedPages = (html.match(/class="(?:property-disclosure-page|page)"/g) || []).length
  assert.ok(expectedPages > 0, `${id}: fixture has no printable pages`)
  fixtures.push({ id, html, expectedPages, viewport, ...checks })
}
for (const mandateType of ['sole', 'exclusive', 'open', 'dual']) {
  add(`mandate-${mandateType}`, buildSellerMandateDocumentMarkup({
    signingPack: { ...pack, mandate: { ...pack.mandate, mandateType, otherAgencyName: mandateType === 'dual' ? 'Second Test Agency' : '' } },
    approval, generatedAt,
  }))
}
const owners = Array.from({ length: 6 }, (_, i) => ({
  name: `Owner ${i + 1} Test Person`, role: 'Seller', idNumber: `TEST-ID-${i + 1}`,
  email: `owner${i + 1}@example.test`, residentialAddress: `${i + 1} Test Owner Street, Cape Town`,
}))
const ownerPack = {
  ...pack, seller: { legalOwnerName: owners[0].name, legalOwnerIdentity: owners[0].idNumber, parties: owners },
  signers: owners.map((owner, i) => ({ ...owner, role: `Owner ${i + 1}` })),
  mandate: { ...pack.mandate, specialConditions: Array.from({ length: 60 }, (_, i) => `Condition ${i + 1}: Access by appointment, with owner consent; occupation and fixtures are to be agreed in writing.`).join('\n') },
}
add('mandate-six-owners-long', buildSellerMandateDocumentMarkup({ signingPack: ownerPack, approval, generatedAt }))
add('fica-company', buildSellerFicaDueDiligenceMarkup({
  formData: {
    ...form, ownerStructureType: 'company', ownershipType: 'company', sellerType: 'company',
    companyName: 'Synthetic Property Holdings (Pty) Ltd', companyRegistrationNumber: 'TEST-REG-2026',
    companyRegisteredAddress: '20 Test Company Street', authorisedSignatoryName: 'Sam Test Director',
    authorisedSignatoryEmail: 'director@example.test', authorisedSignatoryCapacity: 'Director',
    companyAuthorityBasis: 'Board resolution authorising sale', companyResolutionDate: '2026-10-01',
    companyDirectors: [{ name: 'Sam', surname: 'Test Director', idNumber: 'TEST-DIRECTOR-1' }],
  },
  signingPack: { ...pack, signers: [{ name: 'Sam Test Director', role: 'Authorised signatory', email: 'director@example.test' }] },
  branding, generatedAt,
}))
const ownerForm = { ...form, ownershipType: 'multiple_owners', ownerStructureType: 'multiple_owners', multipleOwners: owners, owners }
add('fica-six-owners', buildSellerFicaDueDiligenceMarkup({ formData: ownerForm, signingPack: ownerPack, branding, generatedAt }))
const longDisclosure = {
  ...disclosure, decision: 'issues', responses: { ...disclosure.responses, q1: 'yes' },
  issueDetails: { q1: 'Roof leak in the north room; contractor report and repair history available.' },
  comments: Array.from({ length: 60 }, (_, i) => `Explanation ${i + 1}: The disclosed issue and its repair history must be reviewed before any offer is accepted.`).join('\n'),
}
const compliance = buildSellerComplianceDocumentModel({
  formData: { ...ownerForm, propertyDisclosure: longDisclosure }, generatedAt,
  signing: { signers: owners.map((owner, i) => ({ ...owner, id: `owner-${i + 1}`, roleLabel: `Owner ${i + 1}`, status: 'Pending', signedAt: '', signature: '' })), complete: false },
})
add('disclosure-six-owners-long', buildPropertyDisclosureDocumentMarkup(longDisclosure, {
  branding, sellerName: owners.map(owner => owner.name).join(', '), sellerIdNumber: owners.map(owner => owner.idNumber).join(', '),
  propertyAddress: form.propertyAddress, documentReference: pack.documentReference,
  sellerCompliancePack: { ...compliance, ficaSections: [] },
}))
const correctionCopy = createSellerCorrectionFixture('multiple_owners')
for (const [id, key] of [['mandate', 'signed_mandate'], ['fica', 'signed_fica_declaration'], ['disclosure', 'signed_disclosure_form']]) {
  add(`corrected-${id}-two-owners`, renderSellerSigningDocumentCorrections(correctionCopy, key, sellerCorrectionValues(correctionCopy, key), 'SYNTHETIC-CORRECTIONS-ONLY'))
}
const companyCorrection = createSellerCorrectionFixture('company')
const allFicaFields = Object.fromEntries(Object.keys(buildSellerSigningCorrectionEditData(companyCorrection, 'signed_fica_declaration').fica).map(field => [field, `Corrected ${field} detail`]))
add('corrected-fica-company-all-fields', renderSellerSigningDocumentCorrections(companyCorrection, 'signed_fica_declaration', sellerCorrectionValues(companyCorrection, 'signed_fica_declaration', { fica: allFicaFields }), 'SYNTHETIC-CORRECTIONS-ONLY'))
add('mandate-sole-mobile', fixtures[0].html, { width: 390, height: 844 })
// Sequential agencies catch palette leakage between downloads. The exact
// saved colours must be present in the PDF pixels, not just its HTML preview.
for (const [agency, primaryColour, accentColour] of [
  ['violet', '#38165e', '#054f8c'], ['burgundy', '#4f1f2b', '#9b3e00'],
]) {
  const agencyBrand = { ...branding, organisationName: `Synthetic ${agency} agency`, primaryColour, accentColour }
  const agencyPack = { ...pack, branding: agencyBrand }
  const checks = { expectedPalette: [primaryColour, accentColour], repeatLogo: true }
  add(`branding-${agency}-mandate`, buildSellerMandateDocumentMarkup({ signingPack: agencyPack, approval, generatedAt }), undefined, checks)
  add(`branding-${agency}-fica`, buildSellerFicaDueDiligenceMarkup({ formData: form, signingPack: agencyPack, branding: agencyBrand, generatedAt }), undefined, checks)
  add(`branding-${agency}-disclosure`, buildPropertyDisclosureDocumentMarkup(disclosure, { branding: agencyBrand, sellerName: pack.seller.name, propertyAddress: pack.property.address }), undefined, checks)
}
add('mandate-agency-name-without-logo', buildSellerMandateDocumentMarkup({
  signingPack: { ...pack, branding: { ...branding, logoLightUrl: '', logoDarkUrl: '' } }, approval, generatedAt,
}), undefined, { expectedLogo: false })

// The Home Seekers SVG has a viewBox without explicit width/height. Coloured
// corners prove that capture keeps the entire image, rather than just its roof.
const viewBoxLogoSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 762.36 253.18"><rect width="762.36" height="253.18" fill="#ce147e"/><rect x="10" y="10" width="70" height="70" fill="#04bfc4"/><rect x="682" y="10" width="70" height="70" fill="#e66c08"/><rect x="10" y="173" width="70" height="70" fill="#6633cc"/><rect x="682" y="173" width="70" height="70" fill="#39b54a"/></svg>'
const viewBoxLogo = `data:image/svg+xml;base64,${Buffer.from(viewBoxLogoSvg).toString('base64')}`
const logoCorners = ['#04bfc4', '#e66c08', '#6633cc', '#39b54a']
const homeSeekersSvg = await fs.readFile(path.join(appRoot, 'public/brand/homeseekers/home-seekers-horizontal-black.svg'), 'utf8')
const homeSeekersLogo = `data:image/svg+xml;base64,${Buffer.from(homeSeekersSvg).toString('base64')}`
for (const [id, html] of [
  ['mandate', fixtures[0].html],
  ['fica', buildSellerFicaDueDiligenceMarkup({ formData: form, signingPack: pack, branding, generatedAt })],
  ['disclosure', buildPropertyDisclosureDocumentMarkup(disclosure, { branding, sellerName: pack.seller.name, propertyAddress: pack.property.address })],
]) {
  add(`viewbox-logo-${id}`, html.replaceAll(logo, viewBoxLogo), { width: 390, height: 844 }, { repeatLogo: true, logoCorners })
  add(`home-seekers-logo-${id}`, html.replaceAll(logo, homeSeekersLogo), { width: 390, height: 844 }, { repeatLogo: true, logoColour: [35, 31, 32] })
}
for (const [id, source] of [
  ['uri-encoded', `data:image/svg+xml;charset=utf-8,${encodeURIComponent(viewBoxLogoSvg)}`],
  ['width-only', `data:image/svg+xml;base64,${Buffer.from(viewBoxLogoSvg.replace('<svg ', '<svg width="54mm" ')).toString('base64')}`],
  ['height-only', `data:image/svg+xml;base64,${Buffer.from(viewBoxLogoSvg.replace('<svg ', '<svg height="6.4e1px" ')).toString('base64')}`],
  ['relative-size', `data:image/svg+xml;base64,${Buffer.from(viewBoxLogoSvg.replace('<svg ', '<svg width="100%" height="100%" ')).toString('base64')}`],
]) add(`viewbox-logo-${id}`, fixtures[0].html.replaceAll(logo, source), undefined, { repeatLogo: true, logoCorners })

await fs.mkdir(outputDirectory, { recursive: true })
const bundled = await build({
  absWorkingDir: appRoot, entryPoints: ['src/lib/htmlDocumentPdf.js'], bundle: true,
  platform: 'browser', format: 'esm', write: false,
})
const assetRequests = []
const serveAsset = (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  assetRequests.push({ path: url.pathname, query: url.search })
  if (url.pathname === '/corrupt.svg') response.writeHead(200, { 'content-type': 'image/svg+xml' }).end('corrupt image bytes')
  else if (url.pathname === '/slow.svg') {
    const timer = setTimeout(() => response.writeHead(200, { 'content-type': 'image/svg+xml' }).end(logoSvg), 1500)
    response.on('close', () => clearTimeout(timer))
  } else if (url.pathname === '/cors.svg' || url.pathname === '/no-cors.svg' || url.pathname === '/storage/v1/object/public/organisation-branding/logo.svg' || (url.pathname === '/storage/v1/object/sign/documents/signature.svg' && url.searchParams.get('token') === 'synthetic-private-token')) {
    response.writeHead(200, { 'content-type': 'image/svg+xml', ...(url.pathname === '/cors.svg' ? { 'access-control-allow-origin': '*' } : {}) }).end(logoSvg)
  } else response.writeHead(404).end()
}
const assetServer = createServer(serveAsset)
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/pdf-runtime.js') {
    response.writeHead(200, { 'content-type': 'text/javascript' }).end(bundled.outputFiles[0].text)
  } else if (pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><head><meta charset="utf-8"><title>Seller PDF download regression</title></head><body><p>Local synthetic records only</p></body></html>')
  } else {
    serveAsset(request, response)
  }
})
let browser
const report = []
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  await new Promise(resolve => assetServer.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const assetUrl = `http://127.0.0.1:${assetServer.address().port}`
  const withLogo = source => fixtures[0].html.replaceAll(logo, source.replaceAll('&', '&amp;'))
  add('mandate-cross-origin-logo', withLogo(`${assetUrl}/cors.svg`), undefined, { repeatLogo: true })
  add('mandate-durable-public-logo', withLogo(`${baseUrl}/storage/v1/object/sign/organisation-branding/logo.svg?token=synthetic-expired-token`), undefined, { repeatLogo: true })
  add('mandate-private-image-access', withLogo(`${baseUrl}/storage/v1/object/sign/documents/signature.svg?token=synthetic-private-token`), undefined, { repeatLogo: true })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  // This check needs no account, remote database, storage or email service.
  await context.route('**/*', route => [baseUrl, assetUrl].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort('blockedbyclient'))
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(baseUrl)
  await page.evaluate(async () => { window.downloadPdf = (await import('/pdf-runtime.js')).downloadHtmlDocumentPdf })
  assert.match(await page.evaluate(async () => {
    try { await window.downloadPdf('') } catch (error) { return error.message }
  }), /does not have a printable draft/)
  // Isolate the injected canvas failure: html2canvas caches its SVG support
  // probe, and an intentionally broken canvas must not poison later exports.
  const failurePage = await context.newPage()
  await failurePage.goto(baseUrl)
  await failurePage.evaluate(async () => { window.downloadPdf = (await import('/pdf-runtime.js')).downloadHtmlDocumentPdf })
  const forcedFailure = await failurePage.evaluate(async html => {
    const toDataURL = HTMLCanvasElement.prototype.toDataURL
    try {
      HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('Synthetic PDF encoding failure') }
      try { await window.downloadPdf(html, 'failed-export.pdf', { stageName: 'seller-download-test' }) }
      catch (error) { return error.message }
    } finally {
      HTMLCanvasElement.prototype.toDataURL = toDataURL
    }
  }, fixtures[0].html)
  assert.equal(forcedFailure, 'Synthetic PDF encoding failure', 'A failed export must reach the caller')
  assert.equal(await failurePage.locator('[data-seller-download-test-pdf-stage], [data-seller-download-test-pdf-style], .html2pdf__overlay').count(), 0, 'A failed export must also remove temporary rendering elements')
  await failurePage.close()
  let downloadCount = 0
  page.on('download', () => downloadCount++)
  const imageFailures = [
    ['missing', `${baseUrl}/missing.svg?token=synthetic-secret`],
    ['corrupt', `${baseUrl}/corrupt.svg`],
    ['timeout', `${baseUrl}/slow.svg`],
    ['invalid-inline', 'data:image/png;base64,bm90LWFuLWltYWdl'],
    ['invalid-inline-svg', 'data:image/svg+xml,%3Csvg%3E'],
    ['cross-origin-without-cors', `${assetUrl}/no-cors.svg`],
    ['expired-private', `${baseUrl}/storage/v1/object/sign/documents/signature.svg?token=synthetic-expired-token`],
  ]
  for (const [id, source] of imageFailures) {
    const before = downloadCount
    const message = await page.evaluate(async html => {
      try { await window.downloadPdf(html, 'failed-image.pdf', { stageName: 'seller-download-test', imageTimeoutMs: 250 }) }
      catch (error) { return error.message }
    }, withLogo(source))
    assert.match(message, /document logo or signature could not be loaded/, `${id}: unusable image must stop the export`)
    assert.ok(!message.includes('token') && !message.includes('http'), `${id}: image errors must not expose signed URLs`)
    assert.equal(downloadCount, before, `${id}: no incomplete PDF may be downloaded`)
    assert.equal(await page.locator('[data-seller-download-test-pdf-stage], [data-seller-download-test-pdf-style], .html2pdf__overlay').count(), 0, `${id}: temporary rendering elements must be removed`)
  }
  console.log(`Image failure safeguards passed: ${imageFailures.length} cases; no incomplete downloads or leaked URLs`)
  for (const fixture of fixtures) {
    await page.setViewportSize(fixture.viewport)
    const signatureOverflows = await page.evaluate(async html => {
      const preview = document.createElement('iframe')
      preview.style.width = '794px'
      preview.style.height = '1123px'
      try {
        const loaded = new Promise(resolve => { preview.onload = resolve })
        preview.srcdoc = html
        document.body.appendChild(preview)
        await loaded
        return Array.from(preview.contentDocument.querySelectorAll('.signer-card .signature')).map(element => element.scrollWidth - element.clientWidth)
      } finally { preview.remove() }
    }, fixture.html)
    assert.ok(signatureOverflows.every(overflow => overflow <= 1), `${fixture.id}: FICA signature content must stay inside its box`)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.evaluate(async ({ html, id }) => {
        await window.downloadPdf(html, `${id}.html`, { stageName: 'seller-download-test' })
      }, fixture),
    ])
    assert.equal(download.suggestedFilename(), `${fixture.id}.pdf`)
    const pdfPath = path.join(outputDirectory, download.suggestedFilename())
    await download.saveAs(pdfPath)
    assert.equal(await download.failure(), null)
    assert.equal(await page.locator('[data-seller-download-test-pdf-stage], [data-seller-download-test-pdf-style], .html2pdf__overlay').count(), 0, `${fixture.id}: temporary rendering elements must be removed`)
    const data = await fs.readFile(pdfPath)
    const pdf = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise
    try {
      assert.equal(pdf.numPages, fixture.expectedPages, `${fixture.id}: downloaded page count must match the prepared document`)
      const pages = []
      for (let number = 1; number <= pdf.numPages; number++) {
        const pdfPage = await pdf.getPage(number)
        // Fine coloured rules and small heading text need enough resolution
        // to avoid mixing their entire stroke into the white background.
        const viewport = pdfPage.getViewport({ scale: fixture.expectedPalette || fixture.logoCorners ? 1.5 : 0.75 })
        const surface = pdf.canvasFactory.create(viewport.width, viewport.height)
        try {
          await pdfPage.render({ canvasContext: surface.context, viewport }).promise
          const pixels = surface.context.getImageData(0, 0, surface.canvas.width, surface.canvas.height).data
          let ink = 0
          let logoPixels = 0
          const logoRgb = fixture.logoColour || [206, 20, 126]
          const paletteRgb = (fixture.expectedPalette || []).map(colour => [1, 3, 5].map(index => parseInt(colour.slice(index, index + 2), 16)))
          const palettePixels = paletteRgb.map(() => 0)
          const cornerRgb = (fixture.logoCorners || []).map(colour => [1, 3, 5].map(index => parseInt(colour.slice(index, index + 2), 16)))
          const cornerPixels = cornerRgb.map(() => 0)
          for (let i = 0; i < pixels.length; i += 4) {
            const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]]
            if (Math.min(r, g, b) < 210) ink++
            if ([r, g, b].every((channel, offset) => Math.abs(channel - logoRgb[offset]) < 35)) logoPixels++
            // The exporter uses JPEG: chroma subsampling shifts narrow colour
            // strokes. These palettes remain distinct from the old defaults.
            paletteRgb.forEach((rgb, index) => { if ([r, g, b].every((channel, offset) => Math.abs(channel - rgb[offset]) < 28)) palettePixels[index]++ })
            if (i / 4 / surface.canvas.width < 150) cornerRgb.forEach((rgb, index) => { if ([r, g, b].every((channel, offset) => Math.abs(channel - rgb[offset]) < 28)) cornerPixels[index]++ })
          }
          const inkRatio = ink / (pixels.length / 4)
          assert.ok(inkRatio > 0.005, `${fixture.id} page ${number}: downloaded page is blank or nearly blank (${inkRatio})`)
          if (fixture.expectedLogo === false) assert.equal(logoPixels, 0, `${fixture.id}: absent configured logo must retain agency-name branding`)
          else if (!fixture.logoCorners && (number === 1 || fixture.repeatLogo)) assert.ok(logoPixels > 50, `${fixture.id} page ${number}: agency logo must appear in the downloaded PDF`)
          if (number === 1 && fixture.expectedPalette) assert.ok(palettePixels.every(count => count > 20), `${fixture.id}: saved primary/accent colours must appear in PDF pixels (${palettePixels})`)
          assert.ok(cornerPixels.every(count => count > 20), `${fixture.id} page ${number}: all four logo corners must survive PDF capture (${cornerPixels})`)
          await fs.writeFile(path.join(outputDirectory, `${fixture.id}-page-${number}.png`), surface.canvas.toBuffer('image/png'))
          pages.push({ page: number, inkRatio, logoPixels, ...(fixture.expectedPalette ? { palettePixels } : {}) })
        } finally {
          pdf.canvasFactory.destroy(surface)
        }
      }
      report.push({ id: fixture.id, viewport: fixture.viewport, pages: pdf.numPages, expectedPages: fixture.expectedPages, bytes: data.length, pageChecks: pages })
      console.log(`${fixture.id}: ${pdf.numPages} visible PDF pages, ${fixture.expectedLogo === false ? 'agency-name branding' : 'logo present'}, rendering elements cleaned up`)
    } finally {
      await pdf.destroy()
    }
  }
  assert.deepEqual(pageErrors, [], 'PDF downloads must not raise browser errors')
  assert.ok(assetRequests.some(request => request.path === '/storage/v1/object/public/organisation-branding/logo.svg'), 'Old public-branding URLs must use durable public access')
  assert.ok(assetRequests.some(request => request.path === '/storage/v1/object/sign/documents/signature.svg' && request.query === '?token=synthetic-private-token'), 'Private images must keep their signed access')
  assert.ok(!assetRequests.some(request => request.path === '/storage/v1/object/public/documents/signature.svg'), 'Private documents must never be converted to public access')
  await fs.writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Seller PDF downloads passed: ${report.length} documents, ${report.reduce((total, item) => total + item.pages, 0)} pages. No remote writes.`)
} finally {
  await browser?.close()
  await new Promise(resolve => assetServer.close(resolve))
  await new Promise(resolve => server.close(resolve))
}
