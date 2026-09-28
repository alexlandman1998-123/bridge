export const SELLER_MANDATE_DOCUMENT_CONTRACT = 'arch9-seller-mandate-document-v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const first = (...values) => values.map(text).find(Boolean) || ''

function escapeHtml(value = '') {
  return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function mandateType(value) {
  const key = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (['sole', 'exclusive', 'sole_mandate', 'exclusive_mandate'].includes(key)) return 'exclusive'
  if (['open', 'open_mandate', 'non_exclusive'].includes(key)) return 'open'
  if (['dual', 'dual_mandate'].includes(key)) return 'dual'
  if (['prime', 'prime_mandate'].includes(key)) return 'prime'
  return ''
}

export function requireSellerMandateWording(value) {
  const type = mandateType(value)
  if (type === 'prime') throw new Error('Confirm the meaning and approved wording of a prime mandate before preparing its signing copy.')
  if (!type) throw new Error('Select a supported mandate type before preparing its signing copy.')
  return type
}

function ownerName(seller = {}) {
  const type = text(seller.legalType).toLowerCase()
  if (type.includes('company') || type === 'close_corporation') return first(seller.companyName, seller.name)
  if (type.includes('trust')) return first(seller.trustName, seller.name)
  return first(seller.name, [seller.firstName, seller.surname].filter(Boolean).join(' '))
}

function ownerIdentity(seller = {}) {
  const type = text(seller.legalType).toLowerCase()
  if (type.includes('company') || type === 'close_corporation') return first(seller.companyRegistrationNumber, seller.idNumber)
  if (type.includes('trust')) return first(seller.trustRegistrationNumber, seller.idNumber)
  return text(seller.idNumber)
}

function commissionLabel(commission = {}) {
  const value = commission.basis === 'fixed'
    ? `R ${first(commission.amount, '________')}`
    : `${first(commission.percentage, '________')}% of the purchase price`
  const vat = text(commission.vatHandling).toLowerCase()
  return `${value}${vat === 'inclusive' ? ' (VAT included)' : vat === 'exclusive' ? ' plus VAT, where applicable' : ''}`
}

function variantTerms(type, mandate = {}, agencyName = '') {
  if (type === 'exclusive') return {
    heading: 'Exclusive mandate to sell',
    appointment: `The Seller appoints ${agencyName} as the sole agency authorised to market the Property during the mandate period. The Seller will refer direct enquiries to the Agency and will not appoint another agency for the Property during that period, subject to any written exclusions or special conditions recorded below.`,
    commissionTerms: 'The agreed commission may be payable if the Property is sold during the exclusive period, including through the Seller or another source, subject to the exclusions and other terms expressly recorded in this mandate.',
    cancellation: 'The mandate ends on the recorded end date unless extended by agreement. Any earlier cancellation and any reasonable amount claimed on cancellation remain subject to applicable law and the written terms agreed by the parties.',
  }
  if (type === 'open') return {
    heading: 'Open mandate to sell',
    appointment: `The Seller appoints ${agencyName} on a non-exclusive basis. The Seller may market the Property privately and appoint other agencies. Signing this mandate alone does not create a commission obligation.`,
    commissionTerms: 'Commission is payable only where the Agency is the effective cause of a binding sale, including to a purchaser it introduced. The Seller should disclose a competing introduction before accepting an offer so that any competing commission claim can be addressed.',
    cancellation: 'The Seller may cancel this open mandate by written or other recorded notice. Cancellation does not affect commission already earned or the agreed protection of a buyer introduced by the Agency.',
  }
  if (type === 'dual') {
    const otherAgency = first(mandate.otherAgencyName, mandate.coAgencyName, mandate.co_agency_name)
    if (!otherAgency) throw new Error('Name the second agency before preparing a dual mandate.')
    return {
      heading: 'Dual mandate to sell',
      appointment: `The Seller appoints ${agencyName} and ${otherAgency} as the two agencies authorised to market the Property during the mandate period. Each agency acts under its own appointment; neither may bind the Seller without separate written authority.`,
      commissionTerms: 'Only the agency that is the effective cause of a binding sale is entitled to the agreed commission. The Seller and agencies must disclose competing introductions before a sale is signed so that duplicate commission claims can be resolved.',
      cancellation: 'The mandate ends on the recorded end date unless extended by agreement. An earlier cancellation must be recorded and does not affect commission already earned or the agreed protection of introduced buyers.',
      otherAgency,
    }
  }
  throw new Error('Confirm the meaning and approved wording of a prime mandate before preparing its signing copy.')
}

export function buildSellerMandateDocumentModel({ signingPack = {}, approval = {}, generatedAt = new Date().toISOString() } = {}) {
  const pack = record(signingPack)
  const mandate = record(pack.mandate)
  const seller = record(pack.seller)
  const branding = record(pack.branding)
  const commission = record(approval.commission)
  const type = requireSellerMandateWording(mandate.mandateType)
  const protectionDays = text(mandate.protectionPeriodDays) ? Number(mandate.protectionPeriodDays) : 0
  if (!Number.isInteger(protectionDays) || protectionDays < 0) throw new Error('The introduced-buyer protection period must be a whole number of calendar days.')
  const agencyName = first(branding.organisationName, branding.organizationName, branding.agencyName)
  if (!agencyName) throw new Error('Add the agency name before preparing its mandate.')
  const signers = (Array.isArray(pack.signers) ? pack.signers : []).map((signer) => ({ name: text(signer?.name), role: first(signer?.role, 'Seller') })).filter((signer) => signer.name)
  if (!signers.length) throw new Error('Add a required seller signer before preparing the mandate.')
  const primaryOwnerName = ownerName(seller)
  const coOwners = (Array.isArray(seller.parties) ? seller.parties : [])
    .filter((person) => ['seller', 'owner'].includes(text(person?.role).toLowerCase()))
    .filter((person) => text(person?.name) && (text(person.name) !== primaryOwnerName || text(person.idNumber) !== ownerIdentity(seller)))
    .map((person) => ({ name: text(person.name), idNumber: text(person.idNumber), address: text(person.residentialAddress) }))
  return {
    contract: SELLER_MANDATE_DOCUMENT_CONTRACT,
    type,
    ...variantTerms(type, mandate, agencyName),
    agencyName,
    logoUrl: first(branding.logoDarkUrl, branding.logo_dark_url, branding.logoUrl, branding.logo_url, branding.logoLightUrl, branding.logo_light_url),
    generatedAt: text(generatedAt),
    reference: first(pack.reference, pack.listingReference, pack.property?.reference),
    sellerName: primaryOwnerName,
    coOwners,
    sellerIdentity: ownerIdentity(seller),
    sellerAddress: first(seller.companyRegisteredAddress, seller.trustRegisteredAddress, seller.residentialAddress),
    maritalStatus: text(seller.maritalStatus),
    spouseName: text(seller.spouseName),
    spouseIdNumber: text(seller.spouseIdNumber),
    sellerEmail: text(seller.email),
    sellerPhone: text(seller.phone),
    propertyAddress: first(mandate.propertyAddress, pack.property?.address),
    propertyReference: [
      pack.property?.titleDeedNumber ? `Deed ${pack.property.titleDeedNumber}` : '',
      pack.property?.erfNumber ? `Erf ${pack.property.erfNumber}` : '',
      pack.property?.unitNumber ? `Unit ${pack.property.unitNumber}` : '',
      pack.property?.sectionNumber ? `Section ${pack.property.sectionNumber}` : '',
      pack.property?.schemeName ? `Scheme ${pack.property.schemeName}` : '',
    ].filter(Boolean).join(' · '),
    startDate: text(mandate.startDate),
    endDate: text(mandate.endDate),
    askingPrice: text(mandate.askingPrice),
    commission: commissionLabel(commission),
    protectionPeriodDays: protectionDays,
    specialConditions: first(mandate.specialConditions, mandate.mandateTerms),
    signers,
  }
}

function fact(label, value, { blank = '________________________' } = {}) {
  return `<div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || blank)}</dd></div>`
}

function section(title, body) {
  return `<section class="clause"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></section>`
}

export function buildSellerMandateWordingMarkup(input = {}) {
  const model = input?.contract === SELLER_MANDATE_DOCUMENT_CONTRACT ? input : buildSellerMandateDocumentModel(input)
  const logo = model.logoUrl ? `<img src="${escapeHtml(model.logoUrl)}" alt="${escapeHtml(model.agencyName)} logo" />` : escapeHtml(model.agencyName)
  const signatureLines = model.signers.map((signer) => `<div class="signature"><strong>${escapeHtml(signer.name)}</strong><span>${escapeHtml(signer.role)}</span><div class="line">Signature</div><div class="line">Date and place</div></div>`).join('')
  const coOwnerFacts = (model.coOwners || []).map((person, index) => `${fact(`Additional seller ${index + 1}`, person.name)}${fact('Additional seller ID', person.idNumber)}${person.address ? fact('Additional seller address', person.address) : ''}`).join('')
  const clauses = [
    section('1. Appointment', model.appointment),
    section('2. Agency services', 'The Agency may market the Property through agreed channels, arrange reasonable access and viewings, introduce prospective purchasers, present written offers promptly, and assist with negotiations. The Seller retains the decision to accept, reject or counter any offer.'),
    section('3. Seller authority and disclosure', 'The signatories confirm that they own the Property or hold authority to sign for the legal owner, and that all required co-owner, spouse, company, trust or representative consents will be supplied. The Seller will disclose known material facts and changes affecting the Property. The prescribed Mandatory Disclosure Form must be completed and signed before the Agency acts on this mandate.'),
    section('4. Commission', `The agreed commission is ${model.commission}. It is earned when a binding sale is concluded and any suspensive conditions are fulfilled or waived, in the circumstances stated in this mandate. Commission is payable on registration of transfer from the proceeds against a valid invoice, unless the parties agree otherwise in writing. ${model.commissionTerms}`),
    section('5. Introduced buyers', model.protectionPeriodDays
      ? `For ${model.protectionPeriodDays} calendar days after expiry or cancellation, a buyer introduced by the Agency during this mandate remains protected if the Agency identifies that buyer to the Seller in writing and was the effective cause of the sale. No longer period is implied.`
      : 'No post-mandate introduced-buyer protection period applies unless separately agreed by the parties in writing.'),
    section('6. Cancellation and changes', model.cancellation),
    section('7. Information and records', 'The Agency may collect and verify information reasonably needed for identity, ownership, authority, FICA compliance, marketing and the resulting transaction. The Agency must handle personal information in accordance with applicable law. Changes to the asking price, period or other material terms must be recorded and accepted by the parties.'),
  ].join('')
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(model.heading)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#1d2935;font:10.5pt/1.45 Georgia,'Times New Roman',serif}.document{width:210mm;margin:0 auto;padding:15mm 17mm 18mm}.header{display:flex;justify-content:space-between;align-items:center;gap:10mm;padding-bottom:5mm;border-bottom:1px solid #cbd9d0}.brand{font-size:17pt;font-weight:700}.brand img{max-width:55mm;max-height:18mm;object-fit:contain}.meta{color:#607387;font-size:8.5pt;text-align:right}.eyebrow{margin:8mm 0 1mm;color:#176842;font:700 8pt/1.2 Georgia,'Times New Roman',serif;letter-spacing:.14em;text-transform:uppercase}h1{margin:0 0 5mm;color:#193d2e;font-size:21pt;line-height:1.1}.intro{color:#475569}.facts{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:6mm 0}.fact{min-height:16mm;padding:3mm 4mm;border:1px solid #dbe7df;border-radius:2mm;break-inside:avoid}.fact dt{color:#5b6d7f;font:700 8pt/1.2 Georgia,'Times New Roman',serif;text-transform:uppercase;letter-spacing:.05em}.fact dd{margin:2mm 0 0;font-weight:700;overflow-wrap:anywhere}.terms{margin-top:8mm}.clause{margin:0 0 5mm;break-inside:avoid}.clause h2{margin:0 0 1.5mm;padding-bottom:1mm;border-bottom:1px solid #dbe7df;color:#193d2e;font-size:11pt}.clause p{margin:0}.conditions{margin:7mm 0;padding:4mm;border:1px solid #dbe7df;border-radius:2mm;white-space:pre-wrap;break-inside:avoid}.conditions h2{margin:0 0 2mm;font-size:11pt}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:7mm;margin-top:11mm;break-inside:avoid}.signature{min-height:34mm}.signature strong,.signature span{display:block}.signature span{color:#64748b;font-size:8.5pt}.line{margin-top:9mm;padding-top:1mm;border-top:1px solid #324253;color:#5b6d7f;font-size:8pt}.footer{margin-top:9mm;padding-top:3mm;border-top:1px solid #cbd9d0;color:#607387;font-size:8pt}@media print{.document{width:auto;margin:0;padding:12mm 15mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="document"><header class="header"><div class="brand">${logo}</div><div class="meta">${escapeHtml(model.agencyName)}<br/>Prepared ${escapeHtml(model.generatedAt)}</div></header><p class="eyebrow">Property sale mandate</p><h1>${escapeHtml(model.heading)}</h1><p class="intro">This mandate records the appointment, property, agreed financial terms and signatures.</p><dl class="facts">${fact('Seller / legal owner', model.sellerName)}${fact('ID / registration', model.sellerIdentity)}${coOwnerFacts}${fact('Seller address', model.sellerAddress)}${fact('Seller email', model.sellerEmail)}${fact('Seller phone', model.sellerPhone)}${model.maritalStatus ? fact('Marital status', model.maritalStatus) : ''}${model.spouseName ? fact('Spouse', [model.spouseName, model.spouseIdNumber].filter(Boolean).join(' · ')) : ''}${fact('Property', model.propertyAddress)}${fact('Title deed / erf reference', model.propertyReference)}${fact('Mandate starts', model.startDate)}${fact('Mandate ends', model.endDate, { blank: model.type === 'open' ? 'Until cancelled in writing' : '________________________' })}${fact('Asking price', model.askingPrice)}${fact('Commission', model.commission)}${fact('Buyer protection period', model.protectionPeriodDays ? `${model.protectionPeriodDays} calendar days` : 'None')}${model.otherAgency ? fact('Second agency', model.otherAgency) : ''}</dl><div class="terms">${clauses}</div>${model.specialConditions ? `<section class="conditions"><h2>Special conditions</h2>${escapeHtml(model.specialConditions)}</section>` : ''}<section class="signatures">${signatureLines}<div class="signature"><strong>${escapeHtml(model.agencyName)}</strong><span>Agency acceptance</span><div class="line">Practitioner name and FFC number</div><div class="line">Business FFC number</div><div class="line">Authorised signature</div><div class="line">Date and place</div></div></section><footer class="footer">${escapeHtml(model.agencyName)} · ${escapeHtml(model.heading)} · This copy requires all applicable signatures and separate review of the signed evidence.</footer></main></body></html>`
}
