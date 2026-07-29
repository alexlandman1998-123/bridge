import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'output', 'pdf')
const outputPdf = path.join(outputDir, 'mandate-vnext-sample-review.pdf')
const outputHtml = path.join(outputDir, 'mandate-vnext-sample-review.html')

const sampleData = Object.freeze({
  agent_email: 'alex.agent@arch9.example',
  agent_ffc_number: 'FFC-AGENT-2026-0001',
  agent_full_name: 'Alex Agent',
  agent_phone: '+27 11 555 0142',
  annexures_list: 'Mandatory disclosure form; Company resolution; Body corporate conduct rules',
  asking_price: 'R 2 850 000',
  commission_structure: 'Percentage commission',
  document_reference: 'MANDATE-VNEXT-SAMPLE-001',
  erf_number: '',
  erf_size: '',
  floor_size: '132 m2',
  mandate_commission_amount: 'As calculated from the accepted sale price',
  mandate_commission_percent: '5% plus VAT',
  mandate_end_date: '30 November 2026',
  mandate_start_date: '1 August 2026',
  mandate_type: 'Sole mandate',
  organisation_ffc_number: 'FFC-FIRM-2026-0001',
  organisation_fsp_number: 'FSP 000000',
  organisation_legal_name: 'Arch9 Realty Proprietary Limited',
  organisation_registered_address: '1 Review Avenue, Bryanston, Johannesburg, 2191',
  organisation_registration_number: '2020/000000/07',
  organisation_trading_name: 'Arch9 Realty',
  property_address: 'Unit 12, The Junction, 45 Main Road, Bryanston, Johannesburg',
  property_city: 'Johannesburg',
  property_complex_name: 'The Junction',
  property_display_address: 'Unit 12, The Junction, Bryanston',
  property_estate_name: 'Bryanston Residential Estate',
  property_section_number: '12',
  property_suburb: 'Bryanston',
  property_title_type: 'Sectional Title',
  property_type: 'Apartment',
  property_unit_number: '12',
  sectional_title_number: 'SS 123/2020',
  seller_authority_basis: 'Board resolution approving the mandate and authorising the representative',
  seller_company_registration_number: '2018/123456/07',
  seller_domicilium_address: 'Suite 4, 18 Commerce Road, Sandton, Johannesburg, 2196',
  seller_email: 'seller.representative@example.com',
  seller_entity_type: 'Company',
  seller_full_name: 'Sample Seller Proprietary Limited',
  seller_id_number: '2018/123456/07',
  seller_initials: '',
  seller_marital_status: '',
  seller_phone: '+27 82 555 0199',
  seller_representative_capacity: 'Director',
  seller_representative_name: 'Casey Seller',
  seller_resolution_date: '24 July 2026',
  seller_signature: '',
  seller_spouse_consent_required: 'No',
  seller_spouse_email: '',
  seller_spouse_full_name: '',
  seller_spouse_id_number: '',
  seller_trust_registration_number: '',
  seller_trustee_names: '',
  signed_date: '',
  special_conditions: 'Viewings by appointment with at least 24 hours notice. Existing tenant access arrangements must be respected.',
  vat_handling: 'Commission amounts are exclusive of VAT unless expressly stated otherwise',
  witness_signature: '',
})

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeValue(value = '') {
  return String(value ?? '').trim()
}

function humanize(value = '') {
  return normalizeValue(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeComparisonValue(value = '') {
  return normalizeValue(value)
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase()
}

function replaceMergeFields(text = '') {
  return String(text).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return normalizeValue(sampleData[key])
  })
}

function fieldExists(field) {
  return normalizeValue(sampleData[field]) !== ''
}

function evaluateRule(rule = {}) {
  const actual = normalizeValue(sampleData[rule.field])
  switch (rule.operator) {
    case 'exists':
      return actual !== ''
    case 'missing':
      return actual === ''
    case 'equals':
      return normalizeComparisonValue(actual) === normalizeComparisonValue(rule.value)
    case 'in': {
      const values = Array.isArray(rule.value) ? rule.value : []
      return values.map(normalizeComparisonValue).includes(normalizeComparisonValue(actual))
    }
    default:
      return false
  }
}

function includeSection(section) {
  if (section.is_required) return true
  const condition = section.condition_json || {}
  if (!condition.enabled) {
    return section.placeholder_keys.some(fieldExists)
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some((item) => evaluateRule(item.rule || item))
  }
  return evaluateRule(condition.rule || condition)
}

function renderTextBlock(text = '') {
  const blocks = replaceMergeFields(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length === 1 && /^[A-Z0-9 /&-]+$/.test(lines[0])) {
      return `<h3>${escapeHtml(lines[0])}</h3>`
    }

    const rowLines = lines.filter((line) => /^[^:]{2,80}:\s*/.test(line))
    if (rowLines.length === lines.length && rowLines.length > 0) {
      const rows = rowLines
        .map((line) => {
          const [rawLabel, ...valueParts] = line.split(':')
          const value = normalizeValue(valueParts.join(':'))
          if (!value) return ''
          return `<div class="field-row"><dt>${escapeHtml(rawLabel)}</dt><dd>${escapeHtml(value)}</dd></div>`
        })
        .filter(Boolean)
        .join('')
      return rows ? `<dl class="field-grid">${rows}</dl>` : ''
    }

    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
  }).filter(Boolean).join('')
}

function renderSignatureSection() {
  const panels = [
    {
      title: 'Seller',
      rows: [
        ['Name', sampleData.seller_full_name],
        ['Representative', sampleData.seller_representative_name],
        ['Capacity', sampleData.seller_representative_capacity],
      ],
    },
    {
      title: 'Agency',
      rows: [
        ['Trading Name', sampleData.organisation_trading_name],
        ['Agent', sampleData.agent_full_name],
        ['Agent FFC Number', sampleData.agent_ffc_number],
      ],
    },
    {
      title: 'Witness',
      rows: [
        ['Name', ''],
        ['Date', ''],
      ],
    },
  ]

  return `
    <section class="section signature-zone">
      <div class="section-kicker">Signature Pages</div>
      <h2>Signatures</h2>
      <div class="signature-grid">
        ${panels.map((panel) => `
          <div class="signature-panel">
            <h3>${escapeHtml(panel.title)}</h3>
            ${panel.rows.map(([label, value]) => `
              <div class="signature-meta">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value || ' ')}</strong>
              </div>
            `).join('')}
            <div class="signature-line"></div>
            <div class="signature-caption">Signature</div>
            <div class="date-line"></div>
            <div class="signature-caption">Date</div>
          </div>
        `).join('')}
      </div>
    </section>
  `
}

function renderSection(section) {
  if (section.section_type === 'signature_zone') {
    return renderSignatureSection()
  }

  return `
    <section class="section">
      <div class="section-kicker">${escapeHtml(humanize(section.section_key))}</div>
      <h2>${escapeHtml(section.section_label)}</h2>
      ${renderTextBlock(section.legal_text)}
    </section>
  `
}

function buildHtml() {
  const sections = listMandateTemplateWordingVNextSections()
    .filter(includeSection)
    .sort((a, b) => a.sort_order - b.sort_order)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mandate vNext Sample Review</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 15mm 18mm 15mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #17202a;
      background: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
    }

    .cover {
      border-bottom: 2px solid #1f5f5b;
      display: grid;
      gap: 8px;
      margin-bottom: 14mm;
      padding-bottom: 8mm;
    }

    .brand {
      color: #1f5f5b;
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      color: #111827;
      font-size: 22pt;
      letter-spacing: 0;
      line-height: 1.15;
      margin: 0;
    }

    .document-meta {
      color: #4b5563;
      display: grid;
      gap: 2px;
      font-size: 9pt;
    }

    .section {
      break-inside: avoid;
      margin: 0 0 9mm;
      padding: 0;
    }

    .section-kicker {
      color: #1f5f5b;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0;
      margin-bottom: 2mm;
      text-transform: uppercase;
    }

    h2 {
      color: #111827;
      font-size: 14pt;
      letter-spacing: 0;
      line-height: 1.2;
      margin: 0 0 3mm;
      padding-bottom: 2mm;
      border-bottom: 1px solid #d7dee8;
    }

    h3 {
      color: #111827;
      font-size: 10.5pt;
      letter-spacing: 0;
      line-height: 1.2;
      margin: 0 0 3mm;
      text-transform: uppercase;
    }

    p {
      margin: 0 0 3mm;
    }

    .field-grid {
      display: grid;
      gap: 1.4mm;
      margin: 0 0 4mm;
    }

    .field-row {
      align-items: start;
      border-bottom: 1px solid #eef2f6;
      display: grid;
      grid-template-columns: 45mm 1fr;
      gap: 5mm;
      min-height: 7mm;
      padding: 1.3mm 0;
    }

    dt {
      color: #55606e;
      font-size: 8.5pt;
      font-weight: 700;
      margin: 0;
    }

    dd {
      color: #17202a;
      margin: 0;
      overflow-wrap: anywhere;
    }

    .signature-zone {
      break-before: page;
    }

    .signature-grid {
      display: grid;
      gap: 5mm;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .signature-panel {
      border: 1px solid #d7dee8;
      break-inside: avoid;
      min-height: 75mm;
      padding: 5mm;
    }

    .signature-panel h3 {
      color: #1f5f5b;
      margin-bottom: 5mm;
    }

    .signature-meta {
      display: grid;
      grid-template-columns: 26mm 1fr;
      gap: 3mm;
      margin-bottom: 2mm;
    }

    .signature-meta span {
      color: #55606e;
      font-size: 8.5pt;
      font-weight: 700;
    }

    .signature-meta strong {
      color: #17202a;
      font-size: 9pt;
      font-weight: 500;
    }

    .signature-line {
      border-bottom: 1px solid #17202a;
      height: 16mm;
      margin-top: 7mm;
    }

    .date-line {
      border-bottom: 1px solid #17202a;
      height: 9mm;
      margin-top: 5mm;
      width: 55%;
    }

    .signature-caption {
      color: #55606e;
      font-size: 8pt;
      margin-top: 1mm;
    }
  </style>
</head>
<body>
  <header class="cover">
    <div class="brand">${escapeHtml(sampleData.organisation_trading_name)}</div>
    <h1>Mandate Agreement Review Sample</h1>
    <div class="document-meta">
      <span>Template version: ${escapeHtml(MANDATE_TEMPLATE_WORDING_VNEXT_VERSION)}</span>
      <span>Document reference: ${escapeHtml(sampleData.document_reference)}</span>
      <span>Scenario: company seller, sectional title property, special conditions included</span>
    </div>
  </header>
  <main>
    ${sections.map(renderSection).join('\n')}
  </main>
</body>
</html>`
}

await fs.mkdir(outputDir, { recursive: true })
const html = buildHtml()
await fs.writeFile(outputHtml, html, 'utf8')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({
    path: outputPdf,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #6b7280; width: 100%; padding: 0 15mm; display: flex; justify-content: space-between;">
        <span>Mandate vNext review sample</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
    margin: {
      top: '18mm',
      right: '15mm',
      bottom: '18mm',
      left: '15mm',
    },
  })
} finally {
  await browser.close()
}

const stat = await fs.stat(outputPdf)
console.log(JSON.stringify({
  status: 'rendered',
  templateVersion: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
  pdf: outputPdf,
  html: outputHtml,
  bytes: stat.size,
}, null, 2))
