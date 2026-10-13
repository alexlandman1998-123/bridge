import { buildFicaDeclarationDocumentModel } from './ficaDeclarationDocumentModel.js'
import { resolveOnboardingBranding, resolveDocumentBrandPalette } from '../../lib/onboardingBranding.js'

function text(value) {
  return String(value ?? '').trim()
}

function escapeHtml(value = '') {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isImageSignature(value = '') {
  return /^data:image\//i.test(text(value))
}

function chunk(items = [], size = 4) {
  const result = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result.length ? result : [[]]
}

function renderHeader(branding = {}) {
  branding = { ...branding, ...resolveOnboardingBranding(branding) }
  const name = text(branding.organisationName || branding.organizationName || branding.agencyName || 'Agency')
  const logo = text(branding.logoLightUrl || branding.logo_light_url || branding.logoUrl || branding.logo_url || branding.logoDarkUrl || branding.logo_dark_url)
  const details = [branding.physicalAddress || branding.physical_address, branding.email, branding.phone].map(text).filter(Boolean)
  return `<header class="doc-header"><div class="agency-brand">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}" />` : escapeHtml(name)}</div><div class="company-details"><strong>${escapeHtml(name)}</strong>${details.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></header>`
}

function renderFooter(branding = {}, pageNumber = 1, pageTotal = 1) {
  const name = text(branding.organisationName || branding.organizationName || branding.agencyName || 'Agency')
  return `<footer class="doc-footer"><span>${escapeHtml(name)}</span><span>Page ${pageNumber} of ${pageTotal}</span><span>FICA declaration</span></footer>`
}

function renderSection(section = {}) {
  const rows = Array.isArray(section.rows) ? section.rows : []
  return `<section class="data-section"><h2>${escapeHtml(section.title)}</h2><dl>${rows.map((row) => `<div class="data-row"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl></section>`
}

function renderSigner(signer = {}) {
  const signature = text(signer.signature)
  const signedDate = text(signer.signedAt).slice(0, 10)
  const displayDate = /^\d{4}-\d{2}-\d{2}$/.test(signedDate) ? new Date(`${signedDate}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : text(signer.signedAt)
  const signatureMarkup = signature
    ? isImageSignature(signature)
      ? `<img src="${escapeHtml(signature)}" alt="${escapeHtml(signer.name || 'Signer')} signature" />`
      : escapeHtml(signature)
    : '<div style="width:100%;padding:2mm"><div style="border-bottom:1px solid #64748b;padding-bottom:4mm;text-align:left">Signature</div><div style="border-bottom:1px solid #64748b;margin-top:2mm;padding-bottom:2mm;text-align:left">Date</div></div>'
  return `<article class="signer-card"><div><span class="eyebrow">${escapeHtml(signer.roleLabel || 'Signer')}</span><strong>${escapeHtml(signer.name || 'Signer')}</strong>${signer.email ? `<span>${escapeHtml(signer.email)}</span>` : ''}${signer.mobile ? `<span>${escapeHtml(signer.mobile)}</span>` : ''}</div><div><span class="status">${escapeHtml(signer.status || 'Pending')}</span><span>${escapeHtml(displayDate || 'Date completed when signed')}</span>${signer.signedPlace ? `<span>${escapeHtml(signer.signedPlace)}</span>` : ''}<span>${signer.authorityRequired ? escapeHtml(signer.authorityLabel || 'Authority document required') : 'Own signature'}</span></div><div class="signature">${signatureMarkup}</div></article>`
}

export function buildFicaDeclarationDocumentMarkup(input = {}) {
  const supplied = input?.contract ? input : buildFicaDeclarationDocumentModel(input)
  const model = { ...supplied, branding: { ...supplied.branding, ...resolveOnboardingBranding(supplied.branding) } }
  const palette = resolveDocumentBrandPalette(model.branding)
  const declarationQuestions = model.partyType === 'seller'
    ? model.sections.filter((section) => section.title === 'FICA declarations')
    : []
  const dataSections = model.partyType === 'seller'
    ? model.sections.filter((section) => section.title !== 'FICA declarations')
    : model.sections
  // Long people lists become continued sections, rather than one clipped card.
  const continuedSections = dataSections.flatMap((section) => {
    const rows = section.rows.flatMap((row) => {
      const lines = text(row.value).split('\n').flatMap((line) => line.match(/.{1,90}(?:\s|$)|\S{1,90}/g) || [''])
      return chunk(lines, 8).map((part, index) => ({ ...row, label: row.label + (index ? ' (continued)' : ''), value: part.join('\n') }))
    })
    const groups = []
    let current = [], height = 0
    for (const row of rows) {
      const weight = Math.max(1, row.value.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 80)), 0), Math.ceil(row.label.length / 33))
      if (current.length && height + weight > 18) { groups.push(current); current = []; height = 0 }
      current.push(row); height += weight
    }
    if (current.length) groups.push(current)
    return groups.map((rows, index) => ({ ...section, title: section.title + (index ? ' (continued)' : ''), rows }))
  })
  const sectionHeight = section => 10 + section.rows.reduce((total, row) => total + 2.6 + 4.5 * Math.max(1, row.value.split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / 80)), 0), Math.ceil(row.label.length / 33)), 0)
  const pages = []
  let currentPage = [], pageHeight = 0
  for (const section of continuedSections) {
    const height = sectionHeight(section)
    if (currentPage.length && pageHeight + height > (pages.length ? 190 : 165)) {
      pages.push(currentPage); currentPage = []; pageHeight = 0
    }
    currentPage.push(section); pageHeight += height
  }
  if (currentPage.length) pages.push(currentPage)
  if (!pages.length) pages.push([])
  const signerGroups = chunk(model.signers, 2)
  // A short tax section can share the execution page, avoiding a nearly empty page.
  const finalData = pages.length > 1 ? pages.at(-1) : []
  const executionHeight = declarationQuestions.reduce((sum, section) => sum + sectionHeight(section), 0)
    + 42 + 14 + 29 * signerGroups[0].length + 13
  const executionSections = finalData.length && finalData.reduce((sum, section) => sum + sectionHeight(section), 0) + executionHeight <= 194
    ? pages.pop() : []
  const pageTotal = pages.length + signerGroups.length
  const dataPages = pages.map((sections, index) => `<section class="page">${renderHeader(model.branding)}<main><div class="title"><p class="eyebrow">${escapeHtml(model.partyLabel)} compliance</p><h1>${escapeHtml(model.title)}</h1><p class="reference">Document reference: ${escapeHtml(model.documentReference || 'Pending transaction reference')}</p></div>${index === 0 ? `<p class="intro">This declaration records the information supplied for the property transaction and its FICA/KYC compliance requirements.</p>` : ''}<div class="section-grid">${sections.map(renderSection).join('')}</div></main>${renderFooter(model.branding, index + 1, pageTotal)}</section>`).join('')
  const signerPage = signerGroups.map((signers, index) => `<section class="page">${renderHeader(model.branding)}<main><div class="title"><p class="eyebrow">${escapeHtml(model.partyLabel)} compliance</p><h1>Declaration and signatures</h1><p class="reference">Document reference: ${escapeHtml(model.documentReference || 'Pending transaction reference')}</p></div>${index === 0 ? [...executionSections, ...declarationQuestions].map(renderSection).join('') : ''}<section class="declaration" data-wording-version="${escapeHtml(model.declaration.wordingVersion)}"><h2>Declaration</h2><p>${escapeHtml(model.declaration.wording)}</p></section><section class="signers"><h2>Signatures</h2>${signers.length ? signers.map(renderSigner).join('') : '<p class="empty">Signature capture is completed in the onboarding step.</p>'}</section><p class="review-note">Not yet verified by the agency. The information above was supplied by the client. Agency verification and review of supporting evidence are recorded separately.</p></main>${renderFooter(model.branding, pages.length + index + 1, pageTotal)}</section>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(model.title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#243044;font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;line-height:1.5}
.document,.page{width:210mm;background:#fff}.document{--doc-primary:${palette.primaryColour};--doc-accent:${palette.accentColour};--doc-primary-ink:${palette.primaryInk};--doc-accent-ink:${palette.accentInk};--doc-tint:${palette.primaryTint};--doc-accent-tint:${palette.accentTint};margin:0 auto}
.page{min-height:296mm;position:relative;page-break-after:always;padding-bottom:22mm}.page:last-child{page-break-after:auto}
.doc-header{display:flex;align-items:center;justify-content:space-between;gap:12mm;margin:0 18mm;padding:12mm 0 7mm;border-bottom:1px solid #dce3e8}.agency-brand{color:var(--doc-primary-ink);font-size:15pt;font-weight:700}.agency-brand img{display:block;max-width:60mm;max-height:18mm;object-fit:contain}
.company-details{display:grid;justify-items:end;gap:1px;max-width:75mm;color:#667085;font-size:8pt;line-height:1.4;text-align:right}.company-details strong{color:#243044;font-weight:600}
main{padding:6mm 18mm}.title{padding-bottom:6mm}.title h1{margin:0;color:var(--doc-primary-ink);font-size:21pt;line-height:1.2;font-weight:700;letter-spacing:-.03em;text-transform:none}.title p{margin:3mm 0 0;color:#667085;font-size:8.5pt}.title .eyebrow{margin:0 0 3mm;color:var(--doc-accent-ink);font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.intro{margin:0 0 6mm;color:#526074;font-size:9.5pt;line-height:1.6}
.section-grid{display:block}.data-section{margin-bottom:4mm;break-inside:avoid}.data-section h2,.declaration h2,.signers h2{margin:0 0 1mm;padding:0 0 2.5mm;border-bottom:2px solid var(--doc-primary);color:var(--doc-primary-ink);font-size:10pt;font-weight:700;letter-spacing:.01em}.data-section dl{margin:0}.data-row{display:grid;grid-template-columns:30% minmax(0,1fr);gap:5mm;padding:1.3mm 0;border-bottom:1px solid #edf0f3;font-size:9pt;line-height:1.4;break-inside:avoid}.data-row dt{color:#687487;font-weight:400}.data-row dd{white-space:pre-line;margin:0;color:#243044;font-weight:500;overflow-wrap:anywhere}
.declaration{margin-top:5mm;break-inside:avoid}.declaration p{margin:0;padding:3mm 0;font-size:9.5pt;line-height:1.65}.signers{margin-top:5mm;break-inside:avoid}.signer-card{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr) 43mm;gap:5mm;padding:5mm 0;border-bottom:1px solid #dce3e8;break-inside:avoid}.signer-card>div{display:grid;align-content:start;gap:1.5mm;min-width:0}.signer-card strong{font-size:10pt;font-weight:600;overflow-wrap:anywhere}.signer-card span{color:#687487;font-size:8.2pt;line-height:1.4;overflow-wrap:anywhere}.status{width:fit-content;max-width:100%;padding:1mm 2mm;border-radius:1mm;background:var(--doc-tint);color:var(--doc-primary-ink)!important;font-weight:600}.signature{display:flex!important;align-items:center;justify-content:center;min-height:23mm;text-align:center}.signature img{max-width:43mm;max-height:20mm;object-fit:contain}.empty{padding:4mm 0;color:#687487}.review-note{margin-top:5mm;padding:3mm 0;color:#687487;font-size:8pt;line-height:1.5;border-top:1px solid #dce3e8}.doc-footer{position:absolute;bottom:8mm;left:18mm;right:18mm;display:flex;justify-content:space-between;gap:8mm;padding-top:3mm;border-top:1px solid #dce3e8;color:#687487;font-size:8pt}
@media print{.document{margin:0}.page{margin:0;box-shadow:none}}
</style></head><body><div class="document">${dataPages}${signerPage}</div></body></html>`
}
