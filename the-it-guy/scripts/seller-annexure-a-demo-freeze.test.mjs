import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { chromium } from 'playwright'
import {
  PROPERTY_DISCLOSURE_ANSWER,
  PROPERTY_DISCLOSURE_QUESTIONS,
  buildPropertyDisclosureDocumentMarkup,
} from '../src/lib/propertyDisclosure.js'
import { buildPlatformFeeConsentAcceptance } from '../src/lib/platformFeeConsent.js'
import { buildSellerDocumentSourceOfTruth } from '../src/services/sellerDocumentRequirementsService.js'

const demoBranding = {
  organisationName: 'Demo Realty',
  agencyName: 'Demo Realty',
  legalName: 'Demo Realty (Pty) Ltd',
  registrationNumber: '2024/123456/07',
  vatNumber: 'VAT 4780123456',
  fspNumber: 'PPRA FFC 20261234',
  physicalAddress: '12 Market Street, Cape Town, 8001',
  email: 'hello@demorealty.example',
  phone: '+27 21 555 0100',
  website: 'www.demorealty.example',
}

function dataUrlForSvg(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const logoDataUrl = dataUrlForSvg(`
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96">
    <rect width="320" height="96" rx="10" fill="#111827"/>
    <text x="30" y="60" fill="#ffffff" font-family="Arial" font-size="34" font-weight="700">DEMO REALTY</text>
  </svg>
`)

const signatureDataUrl = dataUrlForSvg(`
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">
    <path d="M34 82 C82 22, 88 94, 126 54 C156 22, 146 100, 198 52 C230 28, 248 78, 292 42" fill="none" stroke="#334155" stroke-width="7" stroke-linecap="round"/>
  </svg>
`)

demoBranding.logoUrl = logoDataUrl
demoBranding.logoLightUrl = logoDataUrl

function buildDisclosureFixture() {
  const responses = Object.fromEntries(
    PROPERTY_DISCLOSURE_QUESTIONS.map((question) => [
      question.key,
      {
        answer: question.key === 'approved_plans_possession'
          ? PROPERTY_DISCLOSURE_ANSWER.unsure
          : PROPERTY_DISCLOSURE_ANSWER.no,
        note: '',
      },
    ]),
  )

  return {
    declarationAccepted: true,
    decision: 'none',
    responses,
    remoteControlsQuantity: '2',
    comments: 'No known material defects disclosed by the seller.',
    signature: signatureDataUrl,
    signedAt: '2026-07-26',
    signedPlace: 'Cape Town',
    platformFeeConsent: buildPlatformFeeConsentAcceptance('seller', {
      acceptedAt: '2026-07-26T08:00:00.000Z',
    }),
    generatedDocument: {
      id: 'demo-disclosure',
      title: 'Property Condition Disclosure',
      fileName: 'seller-disclosure-annexure-a.html',
      generatedAt: '2026-07-26T08:01:00.000Z',
      listingId: 'listing-demo-freeze',
      sellerId: 'seller-demo-freeze',
      propertyId: 'property-demo-freeze',
      transactionId: 'transaction-demo-freeze',
    },
  }
}

function buildDisclosureContext() {
  return {
    sellerName: 'Alexander Landman',
    sellerIdNumber: '8001015009087',
    propertyAddress: 'Unit 4, 12 Market Street, Cape Town',
    listingId: 'listing-demo-freeze',
    transactionId: 'transaction-demo-freeze',
    transactionReference: 'TX-DEMO-001',
    branding: demoBranding,
  }
}

function countMatches(value, pattern) {
  return (String(value).match(pattern) || []).length
}

function assertAnnexureMarkupContract(html, label) {
  assert.match(html, /Declaration by Seller - Annexure A/i, `${label} should render the Annexure A title`)
  assert.match(html, /class="doc-header"/, `${label} should render the branded document header`)
  assert.match(html, /class="agency-brand"/, `${label} should render the top-left agency brand`)
  assert.match(html, /class="document-contact-row"/, `${label} should render the top-right contact block`)
  assert.match(html, /class="document-contact-icon"/, `${label} should render contact icons`)
  assert.match(html, /class="document-contact-value"/, `${label} should render contact values`)
  assert.match(html, /class="doc-footer"/, `${label} should render the document footer`)
  assert.match(html, /class="footer-contact"/, `${label} should render footer contact details`)
  assert.match(html, /Demo Realty \(Pty\) Ltd/, `${label} should include the company legal name`)
  assert.match(html, /2024\/123456\/07/, `${label} should include the registration number`)
  assert.match(html, /hello@demorealty\.example/, `${label} should include the agency email`)
  assert.match(html, /\+27 21 555 0100/, `${label} should include the agency phone`)
  assert.match(html, /www\.demorealty\.example/, `${label} should include the agency website`)
  assert.match(html, /ARCH9 Transaction Platform Fee/, `${label} should include the platform fee consent block`)
  assert.match(html, /Seller declaration and signature/i, `${label} should include the signature declaration`)
  assert.match(html, /Seller signature/i, `${label} should include the seller signature label`)
  assert.match(html, /signature-image/, `${label} should preserve image signatures`)
  assert.match(html, /break-inside: avoid/, `${label} should keep print-safe section boundaries`)
  assert.match(html, /page-break-inside: avoid/, `${label} should keep legacy print section boundaries`)
  assert.match(html, /break-after: page/, `${label} should force page breaks`)
  assert.match(html, /page-break-after: always/, `${label} should force legacy page breaks`)

  assert.equal(
    countMatches(html, /<section class="property-disclosure-page(?: |")/g),
    3,
    `${label} should render exactly three Annexure A pages`,
  )
  assert.equal(
    countMatches(html, /<section class="property-disclosure-page property-disclosure-page--page-break">/g),
    2,
    `${label} should force page breaks only after pages one and two`,
  )
  assert.ok(
    countMatches(html, /<span class="document-contact-item">/g) >= 5,
    `${label} should render a populated contact block, not just a placeholder agency name`,
  )
}

async function importBuildDocumentCenter() {
  const bundleDir = await mkdtemp(path.join(tmpdir(), 'annexure-a-demo-freeze-client-portal-'))
  const entryPath = path.join(bundleDir, 'entry.mjs')
  const bundlePath = path.join(bundleDir, 'bundle.mjs')
  const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')

  await writeFile(
    entryPath,
    `export { buildDocumentCenter } from ${JSON.stringify(servicePath)}\n`,
  )

  await build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    define: {
      'import.meta.env': '{}',
    },
    logLevel: 'silent',
  })

  return import(pathToFileURL(bundlePath).href)
}

async function assertBrowserPrintContract(html) {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'annexure-a-demo-freeze-render-'))
  const htmlPath = path.join(outputDir, 'annexure-a.html')
  const pdfPath = path.join(outputDir, 'annexure-a.pdf')
  const pageOneScreenshotPath = path.join(outputDir, 'annexure-a-page-1.png')
  const signatureScreenshotPath = path.join(outputDir, 'annexure-a-signature-page.png')

  await writeFile(htmlPath, html)

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1600 } })
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })

    const pageCount = await page.locator('.property-disclosure-page').count()
    assert.equal(pageCount, 3, 'browser render should expose exactly three document pages')

    const firstPage = page.locator('.property-disclosure-page').first()
    const firstPageBox = await firstPage.boundingBox()
    const brandBox = await firstPage.locator('.agency-brand').boundingBox()
    const contactBox = await firstPage.locator('.document-contact-row').boundingBox()
    assert.ok(firstPageBox, 'first document page should have a measurable browser box')
    assert.ok(brandBox, 'agency logo/brand should have a measurable browser box')
    assert.ok(contactBox, 'contact block should have a measurable browser box')
    assert.ok(
      brandBox.x < firstPageBox.x + firstPageBox.width * 0.35,
      'agency logo/brand should sit in the top-left header area',
    )
    assert.ok(
      contactBox.x > firstPageBox.x + firstPageBox.width * 0.45,
      'contact details should sit in the top-right header area',
    )
    assert.ok(
      brandBox.y < firstPageBox.y + firstPageBox.height * 0.12 &&
        contactBox.y < firstPageBox.y + firstPageBox.height * 0.12,
      'header brand and contact details should stay near the top of the page',
    )

    await firstPage.screenshot({ path: pageOneScreenshotPath })
    await page.locator('.property-disclosure-page').nth(2).screenshot({ path: signatureScreenshotPath })
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
    })
  } finally {
    await browser.close()
  }

  const pdf = await getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    disableWorker: true,
  }).promise
  try {
    assert.equal(pdf.numPages, 3, 'printed Annexure A PDF should remain three pages')
  } finally {
    await pdf.destroy()
  }
}

const disclosure = buildDisclosureFixture()
const context = buildDisclosureContext()
const directHtml = buildPropertyDisclosureDocumentMarkup(disclosure, context)
assertAnnexureMarkupContract(directHtml, 'direct Annexure A generator')
assert.match(directHtml, /Unit 4, 12 Market Street, Cape Town/, 'direct generator should include property address when supplied')
assert.match(directHtml, /Alexander Landman/, 'direct generator should include seller name')
assert.match(directHtml, /8001015009087/, 'direct generator should include seller ID/passport number')

const sourceOfTruth = buildSellerDocumentSourceOfTruth({
  listing: {
    id: 'listing-demo-freeze',
    sellerProfileId: 'seller-demo-freeze',
    propertyProfileId: 'property-demo-freeze',
    branding: demoBranding,
    sellerOnboarding: {
      status: 'completed',
      formData: {
        sellerName: context.sellerName,
        sellerIdNumber: context.sellerIdNumber,
        sellerType: 'natural_person',
        propertyStructureType: 'full_title',
        propertyDisclosure: disclosure,
      },
    },
  },
  mandatePacket: {
    state: 'fully_signed',
    packet: {
      id: 'packet-demo-freeze',
      status: 'completed',
    },
    version: {
      id: 'version-demo-freeze',
      final_signed_file_name: 'Signed Mandate.pdf',
      final_signed_file_path: 'mandates/listing-demo-freeze/signed-mandate.pdf',
    },
  },
})

const sourceDisclosure = sourceOfTruth.rows.find((row) => row.key === 'property_condition_disclosure')
assert.equal(Boolean(sourceDisclosure), true, 'source of truth should expose the property disclosure document')
assert.equal(sourceDisclosure.upload.generatedFileName, 'seller-disclosure-annexure-a.pdf')
assertAnnexureMarkupContract(sourceDisclosure.upload.generatedHtml, 'seller source-of-truth disclosure')

const { buildDocumentCenter } = await importBuildDocumentCenter()
const portalDocumentCenter = buildDocumentCenter({
  listing: {
    id: 'listing-demo-freeze',
    sellerProfileId: 'seller-demo-freeze',
    propertyProfileId: 'property-demo-freeze',
    branding: demoBranding,
    sellerOnboarding: {
      status: 'completed',
      formData: {
        sellerName: context.sellerName,
        sellerIdNumber: context.sellerIdNumber,
        propertyDisclosure: disclosure,
      },
    },
  },
  activeSellingContext: {
    branding: demoBranding,
    mandatePacket: {
      id: 'packet-demo-freeze',
      state: 'fully_signed',
      packetVersionId: 'version-demo-freeze',
      finalSignedRecorded: true,
      finalSignedFileName: 'Signed Mandate.pdf',
      version: {
        id: 'version-demo-freeze',
        final_signed_file_name: 'Signed Mandate.pdf',
      },
    },
  },
  requiredDocuments: [
    {
      id: 'req-disclosure-demo-freeze',
      key: 'defects_declaration',
      label: 'Property Condition Disclosure',
      status: 'required',
      visibility: 'seller_visible',
    },
  ],
  documents: [],
  additionalDocumentRequests: [],
}, 'selling')

const portalDisclosure = portalDocumentCenter.uploadedDocuments.find((item) => item.requirementKey === 'property_condition_disclosure')
const portalDisclosureSaleDocument = portalDocumentCenter.saleDocuments.find((item) => item.sourceId === 'seller-declaration-disclosure')
const portalDisclosureRequirement = portalDocumentCenter.items.find((item) => item.sourceId === 'property_condition_disclosure')
const portalMandate = portalDocumentCenter.uploadedDocuments.find((item) => item.canonicalFinalArtifact)

assert.equal(Boolean(portalDisclosure), true, 'seller portal should expose a generated disclosure upload')
assert.equal(Boolean(portalDisclosureSaleDocument), true, 'seller portal sale documents should expose the disclosure')
assert.equal(Boolean(portalDisclosureRequirement), true, 'seller portal should satisfy the disclosure requirement with the generated document')
assert.equal(portalDisclosure.generatedFileName, 'seller-disclosure-annexure-a.pdf')
assert.equal(portalDisclosureRequirement.downloadableDocument?.generatedFileName, 'seller-disclosure-annexure-a.pdf')
assertAnnexureMarkupContract(portalDisclosure.generatedHtml, 'seller portal disclosure')
assert.equal(portalMandate?.document_name, 'Signed Mandate.pdf', 'seller portal should still expose the signed mandate final artifact')
assert.equal(portalMandate?.packet_version_id, 'version-demo-freeze', 'seller portal should preserve the signed mandate version link')

await assertBrowserPrintContract(directHtml)

console.log('seller Annexure A demo freeze tests passed')
