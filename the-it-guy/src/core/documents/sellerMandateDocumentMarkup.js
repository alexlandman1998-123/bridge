import { buildSellerMandateWordingMarkup } from './sellerMandateWordingMarkup.js'
export { SELLER_MANDATE_DOCUMENT_CONTRACT, requireSellerMandateWording, buildSellerMandateDocumentModel } from './sellerMandateWordingMarkup.js'

export const SELLER_MANDATE_DOCUMENT_TEMPLATE_VERSION = 'seller_mandate_reference_layout_v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const first = (...values) => values.map(text).find(Boolean) || ''
const readable = (value) => text(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const escape = (value) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const line = (value) => escape(value || '________________________________')
const colour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(text(value)) ? value : fallback
const logo = (value) => /^(https?:\/\/|data:image\/)/i.test(text(value)) ? text(value) : ''

function formatMoney(value) {
  const amount = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? `R ${amount.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : text(value)
}

function agencyIdentity(pack = {}) {
  const branding = record(pack.branding)
  const practitioner = record(pack.practitioner)
  return {
    name: first(branding.organisationName, branding.agencyName, branding.tradingName, 'Agency name'),
    legalName: first(branding.legalName, branding.registeredName, branding.companyName),
    registration: first(branding.registrationNumber, branding.companyRegistrationNumber),
    ffc: first(branding.businessFfcNumber, branding.ffcNumber, branding.fidelityFundCertificateNumber),
    address: first(branding.physicalAddress, branding.officeAddress, branding.registeredAddress),
    email: first(branding.email, practitioner.email),
    phone: first(branding.phone, practitioner.phone),
    practitionerName: first(practitioner.name, branding.practitionerName, branding.agentName),
    practitionerFfc: first(practitioner.ffcNumber, branding.practitionerFfcNumber),
    logo: logo(first(branding.logoDarkUrl, branding.logoUrl, branding.logoLightUrl)),
    primary: colour(first(branding.primaryColour, branding.primaryColor), '#243b50'),
    accent: colour(first(branding.accentColour, branding.accentColor), '#b12d32'),
  }
}

function header(agency, title, reference, variant) {
  return `<header class="doc-header ${variant}"><div class="brand-copy"><strong>${escape(agency.name)}</strong><span>${escape(agency.legalName || 'PROPERTY PRACTITIONERS')}</span></div>${agency.logo ? `<img class="brand-logo" src="${escape(agency.logo)}" alt="${escape(agency.name)} logo" />` : ''}<div class="header-rule"></div><h1>${escape(title)} <small>IMMOVABLE PROPERTY</small></h1><p class="header-ref">Mandate reference ${line(reference)} &nbsp; | &nbsp; Prepared for review and signature</p></header>`
}

function footer(agency, title, page, total) {
  return `<footer class="doc-footer"><span>${escape([agency.legalName || agency.name, agency.registration && `Reg ${agency.registration}`, agency.ffc && `Business FFC ${agency.ffc}`].filter(Boolean).join(' · '))}</span><span>${escape(title)} · ${page} / ${total}</span></footer>`
}

function bar(code, title) {
  return `<h2 class="part"><b>${escape(code)}</b><span>${escape(title)}</span></h2>`
}

function field(label, value) {
  return `<div class="field"><span>${escape(label)}</span><strong>${line(value)}</strong></div>`
}

function clause(number, title, body) {
  return `<div class="clause"><b>${escape(number)} ${escape(title)}</b><p>${escape(body)}</p></div>`
}

function sellerCard(person = {}, index = 1) {
  const party = record(person)
  return `<div class="seller-card"><b>SELLER ${index}</b>${field('Full name / entity', first(party.name, party.fullName))}${field('ID / registration no.', first(party.idNumber, party.registrationNumber))}${field('Representative / capacity', first(party.capacity, party.authorityBasis))}${field('Mobile', first(party.phone, party.mobile))}${field('Email', party.email)}${field('Residential / registered address', party.residentialAddress)}</div>`
}

function firstPage(pack, approval, agency, exclusive, title, reference, total) {
  const seller = record(pack.seller)
  const property = record(pack.property)
  const mandate = record(pack.mandate)
  const commission = record(approval.commission)
  const parties = Array.isArray(seller.parties) && seller.parties.length ? seller.parties : [seller]
  const commissionValue = commission.basis === 'fixed' ? formatMoney(commission.amount) : commission.percentage ? `${escape(commission.percentage)}% of the accepted price` : ''
  const price = formatMoney(mandate.askingPrice)
  return `<section class="page">
    ${header(agency, title, reference, exclusive ? 'exclusive' : 'open')}
    <div class="page-body"><div class="plain"><b>In plain language.</b> ${exclusive ? `${escape(agency.name)} is appointed as the only agency to market the property during the stated period.` : `This is a non-exclusive mandate. The seller may market privately or appoint other agencies.`} The seller decides whether to accept an offer. The terms below record the property, marketing authority and commission.</div>
    ${bar('A', 'Seller details')}<div class="seller-grid">${sellerCard(parties[0], 1)}${sellerCard(parties[1] || {}, 2)}</div>
    <div class="soft-panel"><b>MARITAL STATUS AND CONSENT</b><p>Seller status: ${line(readable(first(seller.maritalStatus, seller.maritalRegime)))} &nbsp; Spouse / co-owner: ${line(seller.spouseName)}</p><p>Required spouse, co-owner or entity consent must be recorded before signature.</p></div>
    ${bar('B', 'Agency and property practitioner')}<div class="two-col"><div>${field('Agency legal name', agency.legalName || agency.name)}${field('Company registration', agency.registration)}${field('Business FFC', agency.ffc)}${field('Office', agency.address)}</div><div>${field('Property practitioner', agency.practitionerName)}${field('Practitioner FFC', agency.practitionerFfc)}${field('Telephone', agency.phone)}${field('Email', agency.email)}</div></div>
    ${bar('C', 'Property details')}<div class="soft-panel property-grid">${field('Street address', first(mandate.propertyAddress, property.address))}${field('Title deed / erf / portion', first(property.titleDeedNumber, property.erfNumber))}${field('Unit / section / scheme', [property.unitNumber, property.sectionNumber, property.schemeName].map(text).filter(Boolean).join(' / '))}${field('Occupation', property.occupationStatus)}</div>
    ${bar('D', 'Mandate and financial terms')}<div class="terms-grid"><div><b>MANDATE PERIOD</b><span>Starts: ${line(mandate.startDate)}</span><span>Ends: ${line(mandate.endDate)}</span></div><div><b>ASKING PRICE</b><strong>${line(price)}</strong><small>Commission is calculated on the accepted price where applicable.</small></div><div><b>COMMISSION</b><strong>${line(commissionValue)}</strong><small>VAT treatment: ${line(commission.vatHandling)}</small></div><div><b>PROTECTION PERIOD</b><strong>${mandate.protectionPeriod ? `${escape(mandate.protectionPeriod)} calendar days` : 'Only if agreed in writing'}</strong><small>For buyers introduced and named in writing, subject to the signed terms.</small></div></div>
    <div class="minor-row">VAT position: ${line(['true', 'yes', '1'].includes(text(seller.vatRegistered).toLowerCase()) ? 'VAT registered' : ['false', 'no', '0'].includes(text(seller.vatRegistered).toLowerCase()) ? 'Not VAT registered' : '')} &nbsp; Estimated net to seller: ${line(formatMoney(mandate.estimatedNet))}</div>
    </div>${footer(agency, title, 1, total)}</section>`
}

function exclusiveTermsPage(agency, title, page, total, clauses) {
  return `<section class="page">${header(agency, title, '', 'compact')}<div class="page-body">${bar('E', 'Terms and conditions')}<div class="clauses">${clauses.map((item) => clause(...item)).join('')}</div><div class="initials">Seller 1 initials _________ &nbsp;&nbsp; Seller 2 initials _________ &nbsp;&nbsp; Agent initials _________</div></div>${footer(agency, title, page, total)}</section>`
}

function signatureBlock(label, person = {}) {
  return `<div class="signature-block"><b>${escape(label)}</b><span>Signature ___________________________________</span><span>Full name ${line(person.name)}</span><span>ID / capacity ${line(person.idNumber || person.capacity)}</span><span>Date ________________________________________</span></div>`
}

function exclusiveFinalPage(pack, agency, title) {
  const seller = record(pack.seller)
  const parties = Array.isArray(seller.parties) && seller.parties.length ? seller.parties : [seller]
  return `<section class="page">${header(agency, title, '', 'compact')}<div class="page-body">${bar('F', 'Agreed marketing plan')}<div class="soft-panel checklist">□ Professional photography / video &nbsp; □ Property portals &nbsp; □ Buyer database<br>□ Social media &nbsp; □ For-sale board &nbsp; □ Show houses by arrangement<br>□ Buyer qualification &nbsp; □ Regular activity feedback<br>Special instructions: ${line(record(pack.mandate).specialConditions)}</div>${bar('G', 'Confirmations and signatures')}<div class="confirmations">□ Seller information and signing authority are correct.<br>□ The mandatory disclosure form has been completed and supplied.<br>□ Mandate, commission, cancellation and protection terms were explained.</div><p class="signed-at">Signed at __________________________ on ______ / ______ / 20______</p><div class="signature-grid">${signatureBlock('SELLER 1', parties[0])}${signatureBlock('SELLER 2 / CO-OWNER', parties[1])}${signatureBlock('SPOUSE CONSENT, IF REQUIRED')}${signatureBlock('PROPERTY PRACTITIONER', { name: agency.practitionerName })}</div><div class="agency-acceptance"><b>AGENCY ACCEPTANCE</b><p>Agency authorised signatory ______________________________ &nbsp; Date ____________________</p><p>Practitioner FFC ${line(agency.practitionerFfc)} &nbsp; Business FFC ${line(agency.ffc)}</p></div><p class="small-note">The signed disclosure and any required authority documents accompany this mandate.</p></div>${footer(agency, title, 4, 4)}</section>`
}

function openFinalPage(pack, agency, title) {
  const seller = record(pack.seller)
  const parties = Array.isArray(seller.parties) && seller.parties.length ? seller.parties : [seller]
  const clauses = [
    ['1.', 'Appointment', `The seller appoints ${agency.name} on a non-exclusive basis to market the property and introduce prospective purchasers. The seller may market privately or appoint other agencies.`],
    ['2.', 'Marketing and access', 'The agency may advertise through approved channels, arrange reasonable viewings and present written offers. The seller supplies accurate property information and reasonable access.'],
    ['3.', 'Commission and introduced buyers', 'Commission is earned where the agency is the effective cause of a binding sale. Payment is due on registration of transfer unless the signed terms record another trigger. A buyer introduced during the mandate may remain protected for the period stated on page one if identified to the seller in writing.'],
    ['4.', 'Cancellation', 'The seller may terminate this open mandate by written notice. Termination does not remove commission already earned or rights concerning an introduced buyer under the signed terms.'],
    ['5.', 'Disclosure and compliance', 'The seller supplies a completed mandatory disclosure form and documents reasonably required for FICA, ownership checks and transfer. Personal information is processed for the mandate and resulting transaction.'],
    ['6.', 'Authority and general terms', 'Each signatory confirms ownership or authority to sign. Amendments and special instructions must be recorded in writing. South African law applies.'],
  ]
  return `<section class="page">${header(agency, title, '', 'compact')}<div class="page-body">${bar('E', 'Marketing authorisation')}<div class="soft-panel checklist">□ Property portals / website &nbsp; □ Social media &nbsp; □ Photography / video<br>□ For-sale board &nbsp; □ Show houses &nbsp; □ Co-operation with other practitioners<br>Previously introduced prospects: ${line(record(pack.mandate).excludedProspects)}</div>${bar('F', 'Terms of the open mandate')}<div class="clauses open-clauses">${clauses.map((item) => clause(...item)).join('')}</div><p class="signed-at">Signed at __________________________ on ______ / ______ / 20______</p><div class="signature-grid compact-signatures">${signatureBlock('SELLER 1', parties[0])}${signatureBlock('SELLER 2 / CO-OWNER', parties[1])}${signatureBlock('PROPERTY PRACTITIONER', { name: agency.practitionerName })}${signatureBlock('SPOUSE CONSENT, IF REQUIRED')}</div></div>${footer(agency, title, 2, 2)}</section>`
}

/** A reviewed, unsigned mandate copy shared by physical and later portal routes. */
function buildSellerMandateReferenceMarkup({ signingPack = {}, formalPackApproval = {} } = {}) {
  const pack = record(signingPack)
  const mandateType = first(record(pack.mandate).mandateType, 'sole').toLowerCase()
  const exclusive = ['sole', 'exclusive', 'sole_mandate'].includes(mandateType)
  if (!exclusive && mandateType !== 'open') throw new Error('A matching mandate template is unavailable for this mandate type.')
  const title = exclusive ? 'Exclusive Mandate to Sell' : 'Open Mandate to Sell'
  const agency = agencyIdentity(pack)
  const reference = first(pack.documentReference, pack.listingReference, record(pack.property).reference)
  const clausesA = [
    ['1.', 'Appointment and duration', `The seller appoints ${agency.name} as the exclusive agency to market the property during the period recorded in Part D. Extension requires the parties to agree in writing.`],
    ['2.', 'Exclusivity', 'During the mandate period the seller will refer property enquiries to the agency and will not appoint another agency or market privately, except for any prospect expressly excluded in writing. The seller retains the decision to accept or reject an offer.'],
    ['3.', 'Agency services', 'The agency will market the property through the agreed channels, arrange reasonable access and present written offers. Marketing does not guarantee a sale, particular price or transfer.'],
    ['4.', 'Seller information and authority', 'The seller confirms that all owners or authorised representatives have signed and will supply required consents, resolutions, FICA documents and accurate property information.'],
    ['5.', 'Marketing material', 'The agency may create and publish property marketing material through approved channels. Seller identity and compliance documents are not published as marketing content.'],
    ['6.', 'Offers and negotiations', 'The agency will present bona fide written offers promptly. No sale is concluded unless the seller accepts a written agreement of sale.'],
    ['7.', 'Access and occupation', 'Viewing and marketing access is arranged with reasonable notice and remains subject to occupant, estate and security rules.'],
  ]
  const clausesB = [
    ['8.', 'Commission', 'Commission is calculated using the approved terms in Part D. It is earned where the agency is the effective cause of a binding sale or otherwise where expressly due under this exclusive mandate. Payment is due on registration of transfer unless the parties record another written trigger.'],
    ['9.', 'Introduced prospects', 'The protection period in Part D applies to buyers introduced by the agency and identified to the seller in writing after the mandate ends, subject to the signed terms and applicable law.'],
    ['10.', 'Cancellation and breach', 'Any cancellation, cooling-off right, notice period or charge is subject to applicable law. A material breach should be recorded and a reasonable opportunity to remedy given where required.'],
    ['11.', 'Costs and tax', 'VAT treatment, transfer duty, bond costs, clearances and other transaction expenses are determined by law and the eventual sale agreement. Any net estimate is indicative only.'],
    ['12.', 'Disclosure and certificates', 'The seller must supply the completed mandatory disclosure form and procure certificates required for transfer in accordance with law and the sale agreement.'],
    ['13.', 'FICA and privacy', 'The agency may collect and process information reasonably needed for identity verification, FICA compliance, marketing and transaction administration.'],
    ['14.', 'Notices', 'The parties use their recorded addresses and contact details for notices unless changed in writing.'],
    ['15.', 'General', 'This mandate and its recorded annexures contain the agreed appointment. Amendments must be recorded in writing. South African law applies.'],
  ]
  const pages = exclusive
    ? [firstPage(pack, formalPackApproval, agency, true, title, reference, 4), exclusiveTermsPage(agency, title, 2, 4, clausesA), exclusiveTermsPage(agency, title, 3, 4, clausesB), exclusiveFinalPage(pack, agency, title)]
    : [firstPage(pack, formalPackApproval, agency, false, title, reference, 2), openFinalPage(pack, agency, title)]
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)} — reviewed signing copy</title><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#242b31;background:#fff;font:9.2pt/1.38 Arial,Helvetica,sans-serif}.document{width:210mm;margin:auto;--primary:${agency.primary};--accent:${agency.accent}}.page{width:210mm;height:297mm;position:relative;overflow:hidden;break-after:page;page-break-after:always;padding:9mm 13mm 14mm}.page:last-child{break-after:auto;page-break-after:auto}.doc-header{position:relative;min-height:31mm;text-align:center}.brand-copy{display:flex;flex-direction:column;align-items:flex-start;gap:0;max-width:calc(100% - 48mm);min-height:14mm;text-align:left}.brand-copy strong{font:bold 16pt Georgia,serif;letter-spacing:.04em;text-transform:uppercase}.brand-copy span{font-size:7pt;letter-spacing:.08em;color:var(--accent)}.brand-logo{position:absolute;right:0;top:0;max-width:45mm;max-height:14mm;object-fit:contain}.header-rule{height:1px;background:var(--accent);margin:3mm 0 2mm}.doc-header h1{margin:0;font-size:14pt;line-height:1.1;letter-spacing:.08em;text-transform:uppercase}.doc-header h1 small{display:block;margin-top:1mm;color:var(--accent);font-size:7pt;letter-spacing:.24em}.header-ref{margin:2mm 0;color:#69737d;font-size:7pt}.doc-header.compact{min-height:24mm}.doc-header.compact .brand-copy strong{font-size:12pt}.doc-header.compact h1{font-size:11pt}.doc-header.compact .header-ref{display:none}.page-body{padding-top:2mm}.plain,.soft-panel{background:#f5f6f7;padding:3mm 3.5mm}.plain{font-size:8.2pt;line-height:1.38}.part{display:flex;align-items:center;margin:4mm 0 1.5mm;background:var(--primary);color:#fff;font-size:8pt;letter-spacing:.13em;text-transform:uppercase}.part b{display:grid;place-items:center;min-width:11mm;height:7mm;background:var(--accent)}.part span{padding:0 3mm}.seller-grid,.two-col{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.seller-card{padding:1mm;border-right:1px solid #d9dfe3}.seller-card:last-child{border:0}.seller-card>b,.soft-panel>b,.terms-grid b{color:var(--accent);font-size:7.3pt;letter-spacing:.08em}.field{display:grid;grid-template-columns:38% 1fr;gap:1mm;border-bottom:1px solid #d9dfe3;padding:1.05mm 0;font-size:7.5pt;min-height:5.2mm}.field span{color:#68737c}.field strong{font-weight:600;overflow-wrap:anywhere}.soft-panel p{margin:1mm 0;font-size:7.5pt}.property-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 4mm}.terms-grid{display:grid;grid-template-columns:repeat(4,1fr);background:#f5f6f7}.terms-grid>div{display:grid;align-content:start;gap:1.5mm;min-height:25mm;padding:2.5mm;border-right:1px solid #d9dfe3}.terms-grid>div:last-child{border:0}.terms-grid span,.terms-grid small{font-size:7.1pt}.terms-grid strong{font-size:9.2pt}.minor-row{margin-top:2mm;font-size:7.3pt}.doc-footer{position:absolute;bottom:5mm;left:13mm;right:13mm;display:flex;justify-content:space-between;gap:5mm;border-top:1px solid #d6dce0;padding-top:1.5mm;color:#73808b;font-size:6.7pt}.clauses{display:grid;gap:2.5mm}.clause{break-inside:avoid;page-break-inside:avoid}.clause b{font-size:8.2pt}.clause p{margin:.5mm 0 0;font-size:8pt;line-height:1.4}.initials{margin-top:5mm;border-top:1px solid #d9dfe3;padding-top:2mm;text-align:right;font-size:7pt}.checklist{font-size:8.1pt;line-height:1.8}.confirmations{font-size:8.2pt;line-height:1.75}.signed-at{margin:3mm 0;font-weight:700}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm 6mm}.signature-block{display:grid;gap:1mm;min-height:25mm;padding:2mm;border:1px solid #d9dfe3;font-size:7.3pt}.signature-block b{color:var(--accent);font-size:7.2pt}.agency-acceptance{margin-top:3mm;padding:2.5mm;background:#f5f6f7;font-size:7.5pt}.agency-acceptance p{margin:1.5mm 0}.small-note{color:#66727d;font-size:7pt}.open-clauses{gap:1.6mm}.open-clauses .clause p{font-size:7.6pt;line-height:1.3}.compact-signatures .signature-block{min-height:18mm;padding:1.5mm;font-size:6.9pt}
    .brand-logo{filter:drop-shadow(0 0 .35mm #233540)}@media print{.document{margin:0}.page{margin:0}}
  </style></head><body><main class="document">${pages.join('')}</main></body></html>`
}
export function buildSellerMandateDocumentMarkup(input = {}) {
  return Object.prototype.hasOwnProperty.call(input, 'approval')
    ? buildSellerMandateWordingMarkup(input)
    : buildSellerMandateReferenceMarkup(input)
}
