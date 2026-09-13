import { buildFicaDeclarationDocumentModel } from './ficaDeclarationDocumentModel.js'

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

function chunk(items = [], size = 2) {
  const result = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result.length ? result : [[]]
}

function renderHeader(branding = {}) {
  const name = text(branding.organisationName || branding.organizationName || branding.agencyName || 'Arch9')
  const logo = text(branding.logoUrl || branding.logo_url || branding.logoLightUrl || branding.logo_light_url)
  const details = [branding.physicalAddress || branding.physical_address, branding.email, branding.phone].map(text).filter(Boolean)
  return `<header class="doc-header"><div class="agency-brand">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}" />` : escapeHtml(name)}</div><div class="company-details"><strong>${escapeHtml(name)}</strong>${details.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></header>`
}

function renderFooter(branding = {}, pageNumber = 1, pageTotal = 1) {
  const name = text(branding.organisationName || branding.organizationName || branding.agencyName || 'Arch9')
  return `<footer class="doc-footer"><span>${escapeHtml(name)}</span><span>Page ${pageNumber} of ${pageTotal}</span><span>FICA declaration</span></footer>`
}

function renderSection(section = {}) {
  const rows = Array.isArray(section.rows) ? section.rows : []
  return `<section class="data-section"><h2>${escapeHtml(section.title)}</h2><dl>${rows.map((row) => `<div class="data-row"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl></section>`
}

function renderSigner(signer = {}) {
  const signature = text(signer.signature)
  const signatureMarkup = signature
    ? isImageSignature(signature)
      ? `<img src="${escapeHtml(signature)}" alt="${escapeHtml(signer.name || 'Signer')} signature" />`
      : escapeHtml(signature)
    : 'Awaiting signature'
  return `<article class="signer-card"><div><span class="eyebrow">${escapeHtml(signer.roleLabel || 'Signer')}</span><strong>${escapeHtml(signer.name || 'Signer')}</strong>${signer.email ? `<span>${escapeHtml(signer.email)}</span>` : ''}${signer.mobile ? `<span>${escapeHtml(signer.mobile)}</span>` : ''}</div><div><span class="status">${escapeHtml(signer.status || 'Pending')}</span><span>${escapeHtml(signer.signedAt || 'Not signed yet')}</span><span>${signer.authorityRequired ? escapeHtml(signer.authorityLabel || 'Authority document required') : 'Own signature'}</span></div><div class="signature">${signatureMarkup}</div></article>`
}

export function buildFicaDeclarationDocumentMarkup(input = {}) {
  const model = input?.contract ? input : buildFicaDeclarationDocumentModel(input)
  const pages = chunk(model.sections)
  const pageTotal = pages.length + 1
  const dataPages = pages.map((sections, index) => `<section class="page">${renderHeader(model.branding)}<main><div class="title"><p class="eyebrow">${escapeHtml(model.partyLabel)} compliance</p><h1>${escapeHtml(model.title)}</h1><p>Document reference: ${escapeHtml(model.documentReference || 'Pending transaction reference')}</p></div>${index === 0 ? `<p class="intro">This declaration records the information supplied for the property transaction and its FICA/KYC compliance requirements.</p>` : ''}<div class="section-grid">${sections.map(renderSection).join('')}</div></main>${renderFooter(model.branding, index + 1, pageTotal)}</section>`).join('')
  const signerPage = `<section class="page">${renderHeader(model.branding)}<main><div class="title"><p class="eyebrow">${escapeHtml(model.partyLabel)} compliance</p><h1>Declaration and signatures</h1><p>Document reference: ${escapeHtml(model.documentReference || 'Pending transaction reference')}</p></div><section class="declaration"><h2>Declaration</h2><p>${escapeHtml(model.declaration.wording)}</p><p class="wording-version">Wording version: ${escapeHtml(model.declaration.wordingVersion)}</p></section><section class="signers"><h2>Signatures</h2>${model.signers.length ? model.signers.map(renderSigner).join('') : '<p class="empty">Signature capture is completed in the onboarding step.</p>'}</section></main>${renderFooter(model.branding, pageTotal, pageTotal)}</section>`

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(model.title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#1f2937;font-family:Helvetica,Arial,sans-serif}.document,.page{width:210mm;background:#fff}.document{margin:0 auto}.page{min-height:296mm;position:relative;page-break-after:always;padding-bottom:20mm}.page:last-child{page-break-after:auto}.doc-header{display:flex;justify-content:space-between;gap:10mm;padding:11mm 18mm 6mm;border-bottom:1px solid #e1e6e3}.agency-brand{font-size:16px;font-weight:800}.agency-brand img{max-width:54mm;max-height:17mm;object-fit:contain}.company-details{display:grid;justify-items:end;gap:1px;max-width:74mm;color:#43546a;font-size:8.3pt;line-height:1.25;text-align:right}.company-details strong{color:#111827}main{padding:7mm 18mm}.title{text-align:center;border-bottom:1px solid #e6ebe8;padding-bottom:5mm}.title h1{margin:0;color:#0f2f22;font-size:20px;text-transform:uppercase}.title p{margin:5px 0 0;color:#66758a;font-size:10.5px}.eyebrow{margin:0 0 2mm;color:#176c43;font-size:8.5pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.intro{color:#334155;font-size:10.3pt;line-height:1.5}.section-grid{display:grid;grid-template-columns:1fr 1fr;gap:4.5mm;margin-top:5mm}.data-section,.declaration,.signers{border:1px solid #dfe9e3;border-radius:3mm;overflow:hidden}.data-section h2,.declaration h2,.signers h2{margin:0;padding:3mm 4mm;background:#edf8f1;color:#14543a;font-size:9.2pt;letter-spacing:.03em;text-transform:uppercase}.data-section dl{margin:0}.data-row{display:grid;grid-template-columns:38% 1fr;gap:2.5mm;padding:2mm 3.5mm;border-top:1px solid #edf1ee;font-size:8.4pt;line-height:1.32}.data-row dt{color:#64748b;font-weight:700}.data-row dd{margin:0;color:#111827;font-weight:800;overflow-wrap:anywhere}.declaration{margin-top:5mm}.declaration p{padding:0 4mm;line-height:1.5}.wording-version{color:#64748b;font-size:8.5pt}.signers{margin-top:5mm}.signer-card{display:grid;grid-template-columns:1.1fr .9fr 36mm;gap:4mm;padding:4mm;border-top:1px solid #edf1ee}.signer-card>div{display:grid;align-content:start;gap:1mm}.signer-card strong{font-size:11pt}.signer-card span{color:#64748b;font-size:8.2pt;line-height:1.3}.status{width:max-content;padding:1mm 2mm;border-radius:999px;background:#e9f8ee;color:#136d42!important;font-weight:800}.signature{display:flex!important;align-items:center;justify-content:center;min-height:18mm;border:1px solid #d5ddd8;border-radius:2mm;text-align:center}.signature img{max-width:30mm;max-height:16mm;object-fit:contain}.empty{padding:4mm;color:#64748b}.doc-footer{position:absolute;bottom:6mm;left:18mm;right:18mm;display:flex;justify-content:space-between;gap:8mm;padding-top:4mm;border-top:1px solid #d8d8d8;color:#606a75;font-size:10px}@media print{.document{margin:0}.page{margin:0;box-shadow:none}}</style></head><body><div class="document">${dataPages}${signerPage}</div></body></html>`
}
