import { readSellerMandateTerms, normalizeSellerMandateCapture, isMandateCalendarDate } from '../../lib/sellerMandateCapture.js'
import { resolveOnboardingBranding, resolveDocumentBrandPalette } from '../../lib/onboardingBranding.js'
import { paginateSellerMandateReview } from '../../lib/sellerMandateReviewPagination.js'

export const SELLER_MANDATE_REVIEW_VERSION = 'review-2026-10-04'
const text = value => String(value ?? '').trim()
const escape = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const shown = value => text(value) || 'Not captured - confirm before approval'
const paragraph = value => `<p data-review-text>${escape(value)}</p>`
const heading = (value, breakBefore = false) => `<h2${breakBefore ? ' data-review-break-before' : ''}>${escape(value)}</h2>`
const field = (label, value) => `<div class="review-field"><div class="review-label">${escape(label)}</div><div data-review-text>${escape(shown(value))}</div></div>`
const date = value => isMandateCalendarDate(value) ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : shown(value)
const rand = value => /^\d+(?:\.\d{1,2})?$/.test(text(value)) ? `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : shown(value)
const vat = value => ({ inclusive: 'VAT included', exclusive: 'VAT added where lawfully chargeable', none: 'No VAT chargeable' })[value] || shown('')
const schedule = value => value?.status === 'none' ? 'None recorded' : value?.status === 'not_applicable' ? 'Not applicable (recorded)' : value?.status === 'captured' ? shown(value.details) : shown('')

/** Read the Phase 1 Markdown directly, keeping every legal paragraph intact.
 * Merge-field tables are replaced with the captured schedules; nothing here
 * approves wording, verifies evidence or creates a signable document.
 */
export function parseSellerMandateReviewWording(markdown) {
  const sections = []
  let section
  for (const line of text(markdown).split(/\r?\n/)) {
    if (line.startsWith('## ')) { section = { title: line.slice(3), blocks: [] }; sections.push(section) }
    else if (section && line.trim() && !line.startsWith('|') && !line.startsWith('[')) section.blocks.push({ kind: 'paragraph', text: line.trim() })
    else if (section && line.startsWith('| Marketing commitment') && !section.blocks.some(block => block.kind === 'marketing')) section.blocks.push({ kind: 'marketing' })
  }
  if (sections.filter(section => /^[1-7] /.test(section.title)).length !== 7) throw new Error('The complete seven-clause mandate review wording is required.')
  const definitions = text(markdown).split(/\r?\n/).find(line => line.startsWith('FFC means '))
  if (!definitions) throw new Error('Mandate review definitions are missing.')
  return { sections, definitions }
}

function agencyFields(agency, label) {
  return heading(`${label} - identity and notices`) + [
    ['Legal name / trading name', [agency.legalName, agency.tradingName].filter(Boolean).join(' / ')],
    ['Registration', agency.registrationStatus === 'not_applicable' ? 'Not applicable (recorded)' : agency.registrationStatus === 'captured' ? agency.registrationNumber : ''],
    ['Business address', agency.address],
    ['Business FFC', [agency.businessFfcNumber, agency.businessFfcExpiry ? `Valid to ${date(agency.businessFfcExpiry)}` : '', agency.businessFfcReference].filter(Boolean).join(' | ')],
    ['Responsible practitioner / FFC', [agency.practitionerName, agency.practitionerFfcNumber, agency.practitionerFfcExpiry ? `Valid to ${date(agency.practitionerFfcExpiry)}` : '', agency.practitionerFfcReference].filter(Boolean).join(' | ')],
    ['Agency representative', [agency.representativeName, agency.representativeCapacity, agency.representativeEmail].filter(Boolean).join(' | ')],
    ['Notice contact', [agency.noticeEmail, agency.noticeAddress].filter(Boolean).join('\n')],
    ['VAT registration', agency.vatStatus === 'not_registered' ? 'Not VAT registered' : agency.vatStatus === 'registered' ? `VAT registered: ${shown(agency.vatNumber)}` : ''],
    ['Privacy notice', agency.privacyNoticeUrl], ['Information Officer', agency.informationOfficerContact], ['PAIA Manual', agency.paiaManualUrl],
  ].map(([label, value]) => field(label, value)).join('')
}

function marketingFields(capture, dual) {
  const marketing = capture.marketing, expenses = capture.expenses
  return [
    [dual ? 'Joint marketing tasks / coordination' : 'Photographs, preparation and advertising', schedule(marketing)],
    ['Agreed marketing launch', marketing.status === 'captured' ? date(marketing.startDate) : ''],
    ['Viewings and access', marketing.status === 'captured' ? marketing.accessDetails : ''],
    ['Weekly seller reporting', marketing.status === 'captured' ? marketing.reporting : ''],
    ['Separately payable expenses', schedule(expenses)],
    ...(expenses.status === 'captured' ? [['Expense maximum / VAT', `${rand(expenses.maximumAmount)} | ${vat(expenses.vatHandling)}`], ['Expense payment trigger', expenses.paymentTrigger]] : []),
  ].map(([label, value]) => field(label, value)).join('')
}

function signatureCard(title, rows, acceptance = '', breakBefore = false, signerEmail = '', signingCopy = false) {
  return `<section class="review-signature" data-mandate-signer="${escape(signerEmail.toLowerCase())}"${breakBefore ? ' data-review-break-before' : ''}><h3>${escape(title)}</h3>${acceptance ? paragraph(acceptance) : ''}${rows.map(([label, value]) => `<div class="review-signature-detail"><span class="review-label">${escape(label)}</span><span>${escape(shown(value))}</span></div>`).join('')}<div class="review-signature-lines"><div>${signingCopy ? 'Signature' : 'Signature - review draft only'}</div><div>Date and place</div></div></section>`
}

/** Review-only renderer. Supply the exact Phase 1 draft for the selected type.
 * It intentionally has no fallback into the active signing renderer.
 */
export function buildSellerMandateReviewDocumentMarkup(input = {}) {
  return buildSellerMandateLayoutMarkup({ ...input, signingCopy: false })
}

// Shared layout; callers must enforce approval before storing any signing copy.
export function buildSellerMandateLayoutMarkup({ signingCopy = false, wordingVersion = SELLER_MANDATE_REVIEW_VERSION, signingPack = {}, draftMarkdown = '', generatedAt = new Date().toISOString() } = {}) {
  const terms = readSellerMandateTerms(signingPack.mandate)
  const type = { sole: 'Exclusive', open: 'Open', dual: 'Dual' }[terms.mandateType]
  if (!type) throw new Error('Select Exclusive, Open or Dual for the mandate review.')
  if (!draftMarkdown.startsWith(`# ${type} mandate to sell Draft`)) throw new Error('The review wording does not match the mandate type.')
  const wording = parseSellerMandateReviewWording(draftMarkdown)
  const capture = normalizeSellerMandateCapture(terms.mandateCapture || {})
  const branding = resolveOnboardingBranding(signingPack.branding)
  const palette = resolveDocumentBrandPalette(branding)
  const seller = signingPack.seller || {}, property = signingPack.property || {}
  const legalType = text(seller.legalType || seller.ownershipType).toLowerCase()
  const sellerAddress = legalType.includes('trust') ? seller.trustRegisteredAddress : legalType.includes('company') || legalType === 'close_corporation' ? seller.companyRegisteredAddress : seller.residentialAddress
  const dual = type === 'Dual'
  const owner = seller.legalOwnerName ?? seller.companyName ?? seller.trustName ?? seller.name
  const identity = seller.legalOwnerIdentity ?? seller.companyRegistrationNumber ?? seller.trustRegistrationNumber ?? seller.idNumber
  const signers = Array.isArray(signingPack.signers) && signingPack.signers.length ? signingPack.signers : [{ name: '', capacity: '' }]
  const reference = text(signingPack.documentReference) || 'Unallocated review reference'
  const footerReference = reference.length > 45 ? `${reference.slice(0, 42)}...` : reference
  const logoUrl = branding.logoLightUrl || branding.logoDarkUrl || branding.logoIconUrl
  const brandName = shown(branding.organisationName || capture.agencyA.tradingName || capture.agencyA.legalName)
  const headerBrandName = brandName.length > 70 ? `${brandName.slice(0, 67)}...` : brandName
  const fee = terms.commissionBasis === 'percentage' ? `${shown(terms.commissionPercentage)}% of the purchase price` : terms.commissionBasis === 'fixed' ? rand(terms.commissionAmount) : shown('')
  const end = type === 'Open' && terms.mandateDuration === 'until_cancelled' ? 'Until cancelled by recorded notice' : date(terms.endDate)
  const period = type === 'Open' && terms.mandateDuration === 'until_cancelled' ? `From ${date(terms.startDate)}; until cancelled by recorded notice` : `${date(terms.startDate)} to ${end}`
  const notice = signingCopy ? 'Reviewed mandate signing copy' : 'DRAFT FOR REVIEW - NOT FOR SIGNATURE<br>Proposed wording and captured schedules. Legal and commercial approval pending. Supplied certificate references do not establish verification.'
  let content = `<h1>${type} mandate to sell</h1><p class="review-kicker">Parties and commercial terms</p><div class="review-draft-note">${notice}</div>`
  content += [
    ['Document reference', reference],
    ['Seller / legal owner', owner], ['Identity / registration', identity], ['Property', property.address],
    ['Title / erf / section / unit / scheme', [property.titleDeedNumber, property.erfNumber && `Erf ${property.erfNumber}`, property.sectionNumber && `Section ${property.sectionNumber}`, property.unitNumber && `Unit ${property.unitNumber}`, property.schemeName].filter(Boolean).join(' | ')],
    ['Contracting agency', capture.agencyA.legalName], ...(dual ? [['Second contracting agency', capture.agencyB.legalName]] : []),
    ['Recorded period', period], ['Asking price', rand(terms.askingPrice)],
    [dual ? 'One combined seller commission' : 'Commission', `${fee} | ${vat(terms.vatHandling)}`],
    ['Buyer protection', terms.protectionPeriod === '' ? '' : `${terms.protectionPeriod} calendar days${terms.protectionPeriod === '0' ? ' - none' : ''}`],
  ].map(([label, value]) => field(label, value)).join('')
  // Exact appointment paragraphs from the draft give private-sale implications
  // equal prominence to the fee. They also remain in the full numbered clauses.
  const appointment = wording.sections.find(section => section.title.startsWith('1 '))
  const privateSale = type === 'Exclusive' ? wording.sections.find(section => section.title.startsWith('4 ')).blocks[0].text : appointment.blocks[dual ? 1 : 0].text
  content += heading('Private sales and commission') + paragraph(privateSale)
  content += heading('Seller contacts, signers and authority', true)
  content += field('Seller notice contact', [capture.notices.sellerEmail, capture.notices.sellerAddress].filter(Boolean).join('\n'))
  content += field('Seller address / contact', [sellerAddress, seller.email, seller.phone].filter(Boolean).join(' | '))
  const owners = Array.isArray(seller.parties) ? seller.parties.filter(person => /^(seller|owner)$/i.test(text(person.role))) : []
  owners.forEach((person, i) => { content += field(`Owner ${i + 1} - identity and address`, [person.name, person.idNumber, person.residentialAddress].filter(Boolean).join(' | ')) })
  signers.forEach((signer, i) => { content += field(`Required seller signer ${i + 1}`, [signer.name, signer.capacity || signer.role, signer.authorityReference, signer.email].filter(Boolean).join(' | ')) })
  content += field('Signing capacity', capture.authority.capacity) + field('Authority record', schedule(capture.authority))
  content += field('Mandatory Disclosure Form reference', signingPack.disclosureReference)
  content += agencyFields(capture.agencyA, dual ? 'Agency A' : 'Contracting agency')
  if (dual) content += agencyFields(capture.agencyB, 'Agency B')
  content += heading('Exclusions and existing introductions')
  content += field('Purchase-price exclusions', schedule(capture.priceExclusions)) + field('Excluded buyers / transactions', schedule(capture.buyerExclusions)) + field('Existing mandates / introductions', schedule(capture.existingIntroductions))
  if (dual) {
    const allocation = capture.allocation
    content += heading('One total fee and agency allocation')
    content += field('Recorded rule', { effective_cause: 'Effective agency receives the commission', agreed_split: 'Express allocation annexure' }[allocation.rule])
    if (allocation.rule === 'agreed_split') content += field('Commission shares', `Agency A: ${shown(allocation.agencyAPercentage)}% | Agency B: ${shown(allocation.agencyBPercentage)}%`) + field('Allocation instructions', allocation.details) + field('Allocation annexure', allocation.annexureReference)
    content += field('Agency A portion VAT', vat(allocation.agencyAVatHandling)) + field('Agency B portion VAT', vat(allocation.agencyBVatHandling))
  }
  content += heading('Terms of appointment') + paragraph(wording.definitions)
  const commercial = wording.sections.find(section => section.title === 'Parties and commercial terms')
  commercial.blocks.forEach(block => { if (block.kind === 'paragraph') content += paragraph(block.text) })
  wording.sections.filter(section => /^[1-7] /.test(section.title)).forEach(section => {
    content += heading(section.title)
    section.blocks.forEach(block => { content += block.kind === 'marketing' ? marketingFields(capture, dual) : paragraph(block.text) })
  })
  content += heading('Special Conditions and annexures') + field('Special Conditions', terms.specialConditions) + field('Annexures', schedule(capture.annexures))
  content += heading('Seller signatures', true)
  content += wording.sections.find(section => section.title === 'Seller signatures').blocks.map(block => paragraph(block.text)).join('')
  signers.forEach((signer, index) => {
    const naturalOwner = ['individual', 'married', 'foreign_individual', 'multiple_owners'].includes(legalType) || !legalType && /^(registered owner|owner|seller)$/i.test(text(signer.capacity || signer.role))
    content += signatureCard(`Seller signer ${index + 1}`, [['Full name', signer.name], ['Legal owner', signer.legalOwnerName || (naturalOwner ? signer.name : owner)], ['Capacity', signer.capacity || signer.role || capture.authority.capacity], ['Authority reference', signer.authorityReference || 'See seller authority record in this mandate']], '', false, signer.email || '', signingCopy)
  })
  ;(dual ? ['agencyA', 'agencyB'] : ['agencyA']).forEach((key, index) => {
    const agency = capture[key], title = dual ? `Agency ${index === 0 ? 'A' : 'B'} acceptance` : 'Agency acceptance'
    const acceptance = wording.sections.find(section => section.title === title).blocks.map(block => block.text).join('\n')
    content += signatureCard(title, [['Contracting agency', agency.legalName], ['Authorised signatory / capacity', [agency.representativeName, agency.representativeCapacity].filter(Boolean).join(' | ')], ['Responsible practitioner / FFC', [agency.practitionerName, agency.practitionerFfcNumber].filter(Boolean).join(' | ')], ['Disclosure / authority records', [shown(signingPack.disclosureReference), 'See seller authority record in this mandate'].join(' | ')]], acceptance, dual && index === 0, agency.representativeEmail || '', signingCopy)
  })
  return `<!doctype html><html><head><meta charset="utf-8"><title>${type} mandate - ${signingCopy ? 'reviewed signing copy' : 'review draft'}</title><style>
@page{size:A4;margin:0}body{margin:0;background:#eef1f4}.mandate-review-document,.mandate-review-document *{box-sizing:border-box}.mandate-review-document{--review-primary:${palette.primaryInk};--review-accent:${palette.accentColour};--review-tint:${palette.accentTint};width:210mm;margin:0 auto;color:#24313c;font:10.5pt/1.38 Arial,Helvetica,sans-serif}.mandate-review-page{width:210mm;height:296mm;padding:12mm 17mm 9mm;background:#fff;display:grid;grid-template-rows:20mm minmax(0,1fr) 9mm;gap:4mm;break-after:page}.mandate-review-page:last-child{break-after:auto}.review-header{display:flex;align-items:center;justify-content:space-between;gap:10mm;border-bottom:2px solid var(--review-accent);padding-bottom:4mm}.review-brand{font-size:15pt;font-weight:700;color:var(--review-primary);max-width:100mm;overflow-wrap:anywhere}.review-brand img{display:block;width:52mm;height:15mm;object-fit:contain;object-position:left center}.review-meta{max-width:66mm;font-size:8pt;line-height:1.4;text-align:right;color:#526271;overflow-wrap:anywhere}.review-body{min-height:0;display:flow-root;overflow:visible}.mandate-review-document h1{font-size:25pt;line-height:1.1;color:var(--review-primary);margin:2mm 0 3mm;letter-spacing:-.5pt}.mandate-review-document h2{font-size:12pt;line-height:1.3;color:var(--review-primary);margin:4mm 0 2mm;padding-bottom:1.5mm;border-bottom:1px solid #d5dde3}.mandate-review-document h3{font-size:11pt;margin:0 0 2mm;color:var(--review-primary)}.mandate-review-document p{margin:0 0 2.5mm;overflow-wrap:anywhere;white-space:pre-wrap}.review-kicker{font-size:9pt;letter-spacing:.5pt;color:#526271}.review-draft-note{border-left:3px solid var(--review-accent);background:var(--review-tint);padding:3mm 4mm;font-size:9pt;line-height:1.5;margin-bottom:3mm}.review-field{display:grid;grid-template-columns:49mm minmax(0,1fr);gap:4mm;padding:2mm 0;border-bottom:1px solid #e4e9ed;overflow-wrap:anywhere;white-space:pre-wrap}.review-label{font-size:9pt;color:#526271;font-weight:600}.review-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:6mm;border-top:1px solid #d5dde3;padding-top:2mm;font-size:8pt;line-height:1.4;color:#526271}.review-footer [data-review-page-number]{white-space:nowrap}.review-signature{padding:3mm 0 1.5mm;border-bottom:1px solid #d5dde3;margin-bottom:2mm;break-inside:avoid;overflow-wrap:anywhere}.review-signature p{font-size:10.5pt}.review-signature-detail{display:grid;grid-template-columns:49mm minmax(0,1fr);gap:4mm;margin-top:1.5mm}.review-signature-lines{display:grid;grid-template-columns:1.1fr 1fr;gap:10mm;margin-top:15mm}.review-signature-lines div{border-top:1px solid #51606b;padding-top:2mm;font-size:8pt;color:#526271}[data-review-source]{width:176mm;position:absolute;left:-10000px}@media print{body{background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.mandate-review-document{margin:0}}
</style></head><body><div class="mandate-review-document" data-review-layout="seller-mandate-review"${signingCopy ? ' data-mandate-signing-copy="full-v1"' : ''}><template data-review-header><header class="review-header"><div class="review-brand">${logoUrl ? `<img src="${escape(logoUrl)}" alt="${escape(brandName)} logo">` : escape(headerBrandName)}</div><div class="review-meta">${escape(type)} mandate<br>${signingCopy ? 'Reviewed signing copy' : 'DRAFT - NOT FOR SIGNATURE'}<br>Prepared ${escape(date(text(generatedAt).slice(0, 10)))}</div></header></template><template data-review-footer><footer class="review-footer"><span>${escape(footerReference)}<br>${escape(wordingVersion)} | ${signingCopy ? 'Reviewed signing copy' : 'Draft for review'}</span><span data-review-page-number></span></footer></template><div data-review-source>${content}</div></div><script>(${paginateSellerMandateReview.toString()})(document.querySelector('[data-review-layout="seller-mandate-review"]'));</script></body></html>`
}
