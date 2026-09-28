import { buildFicaDeclarationDocumentModel } from './ficaDeclarationDocumentModel.js'

export const SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION = 'seller_fica_due_diligence_reference_layout_v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const first = (...values) => values.map(text).find(Boolean) || ''
const readable = (value) => text(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const escape = (value) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const logo = (value) => /^(https?:\/\/|data:image\/)/i.test(text(value)) ? text(value) : ''
const colour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(text(value)) ? value : fallback

function knownBoolean(value) {
  if (value === true || value === false) return value
  if (['yes', 'true', '1', 'y'].includes(text(value).toLowerCase())) return true
  if (['no', 'false', '0', 'n'].includes(text(value).toLowerCase())) return false
  return null
}

function yesNo(value) {
  const known = knownBoolean(value)
  return known === null ? 'Not supplied' : known ? 'Yes' : 'No'
}

function choice(value) {
  const known = knownBoolean(value)
  return `<span class="choice"><i>${known === true ? 'X' : ''}</i> Yes</span><span class="choice"><i>${known === false ? 'X' : ''}</i> No</span>${known === null ? '<small>Not supplied</small>' : ''}`
}

function modelField(model, ...labels) {
  const needle = labels.map((label) => text(label).toLowerCase())
  for (const section of Array.isArray(model.sections) ? model.sections : []) {
    for (const row of Array.isArray(section.rows) ? section.rows : []) {
      if (needle.includes(text(row.label).toLowerCase())) return text(row.value)
    }
  }
  return ''
}

function dataRow(label, value, { allowBlank = false } = {}) {
  const content = text(value)
  if (!content && !allowBlank) return ''
  return `<div class="data-row"><span>${escape(label)}</span><strong>${content ? escape(content) : '<em>Not supplied</em>'}</strong></div>`
}

function question(label, value) {
  return `<div class="question"><span>${escape(label)}</span><strong>${choice(value)}</strong></div>`
}

function section(title, content) {
  return `<section class="data-section"><h2>${escape(title)}</h2>${content}</section>`
}

function identity({ branding = {}, pack = {} } = {}) {
  const brand = record(branding)
  const practitioner = record(pack.practitioner)
  return {
    name: first(brand.organisationName, brand.agencyName, brand.tradingName, 'Agency name'),
    legalName: first(brand.legalName, brand.registeredName, brand.companyName),
    registration: first(brand.registrationNumber, brand.companyRegistrationNumber),
    ficId: first(brand.ficOrganisationId, brand.ficOrganizationId),
    email: first(brand.email, practitioner.email),
    logo: logo(first(brand.logoLightUrl, brand.logoUrl, brand.logoDarkUrl)),
    primary: colour(first(brand.primaryColour, brand.primaryColor), '#243b50'),
    accent: colour(first(brand.accentColour, brand.accentColor), '#a6242d'),
  }
}

function header(agency, page, total, application) {
  return `<header class="doc-header"><div class="brand ${agency.logo ? 'has-logo' : ''}"><strong>${escape(agency.name)}</strong>${agency.logo ? `<img src="${escape(agency.logo)}" alt="${escape(agency.name)} logo">` : ''}</div><div class="company-line">${escape([agency.legalName, agency.registration && `Registration number: ${agency.registration}`, agency.ficId && `FIC Organisation ID: ${agency.ficId}`].filter(Boolean).join(' · '))}</div><h1>CLIENT DUE DILIGENCE RECORD <small>(FIC ACT)</small></h1><p>SELLER APPLICATION: ${escape(application)}</p></header>`
}

function footer(agency, page, total, reference) {
  return `<footer class="doc-footer"><span>${escape(agency.name)}${reference ? ` · ${escape(reference)}` : ''}</span><span>Page ${page} of ${total}</span></footer>`
}

function captured(input = {}) {
  const form = record(input.formData)
  const fica = record(form.fica || form.ficaDetails || form.fica_details)
  const bank = record(form.bankDetails || form.bank_details || fica.bankDetails || fica.bank_details)
  const pack = record(input.signingPack)
  const seller = record(pack.seller)
  const model = input.model
  const read = (...keys) => {
    for (const key of keys) {
      for (const source of [fica, form, seller]) {
        if (source[key] !== undefined && source[key] !== null && text(source[key])) return source[key]
      }
    }
    return ''
  }
  return {
    name: first(seller.name, model.partyName, modelField(model, 'Seller name')),
    idNumber: first(seller.idNumber, modelField(model, 'ID / passport number')),
    idType: read('idType', 'id_type'),
    resident: read('saResident', 'sa_resident', 'rsaResident', 'rsa_resident'),
    taxNumber: first(seller.incomeTaxNumber, modelField(model, 'Income tax number')),
    maritalStatus: readable(first(seller.maritalStatus, modelField(model, 'Marital status'))),
    address: first(seller.residentialAddress, modelField(model, 'Residential address')),
    email: first(seller.email, modelField(model, 'Email')),
    phone: first(seller.phone, modelField(model, 'Mobile')),
    employer: read('employer', 'employerName', 'employer_name'),
    occupation: read('occupation', 'mainOccupation', 'main_occupation'),
    jobTitle: read('jobTitle', 'job_title', 'position'),
    industry: read('industryOfBusiness', 'industry_of_business', 'industry'),
    countries: read('countriesOfTrade', 'countries_of_trade', 'countryOfTrade'),
    dualUse: read('dualUseGoods', 'dual_use_goods', 'involvedInDualUseGoods'),
    arms: read('armsWeapons', 'arms_weapons', 'involvedInArmsWeapons'),
    actingForOther: read('actingOnBehalfOfAnother', 'acting_on_behalf_of_another'),
    heir: read('heirInEstate', 'heir_in_estate'),
    sourceOfWealth: read('sourceOfWealth', 'source_of_wealth'),
    sourceOfIncome: read('sourceOfIncome', 'source_of_income', 'sourceOfFunds', 'source_of_funds'),
    pep: read('politicallyInfluentialPerson', 'politically_influential_person', 'pep', 'isPep'),
    bankName: first(bank.bankName, bank.bank_name, read('bankName', 'bank_name')),
    bankAccountName: first(bank.accountName, bank.account_name, read('accountName', 'account_name')),
    bankAccountNumber: first(bank.accountNumber, bank.account_number, read('accountNumber', 'account_number')),
    bankAccountType: first(bank.accountType, bank.account_type, read('accountType', 'account_type')),
    privacyConsent: read('popiaConsent', 'popiConsent', 'privacyConsent', 'privacy_consent'),
    marketingConsent: read('marketingConsent', 'marketing_consent'),
    consentAt: read('popiaConsentAcceptedAt', 'popiConsentAcceptedAt', 'consentAcceptedAt'),
    legalType: first(seller.legalType, read('sellerLegalType', 'sellerType', 'ownershipType')),
  }
}

/** Three-page seller report. Missing answers remain visibly unverified. */
export function buildSellerFicaDueDiligenceMarkup({ model = null, formData = {}, signingPack = {}, branding = {}, generatedAt = '' } = {}) {
  const pack = record(signingPack)
  const resolvedModel = model?.contract ? model : buildFicaDeclarationDocumentModel({
    partyType: 'seller',
    party: { name: record(pack.seller).name, idNumber: record(pack.seller).idNumber, email: record(pack.seller).email, phone: record(pack.seller).phone },
    property: { address: record(pack.property).address },
    transaction: { reference: pack.documentReference },
    signing: { signers: pack.signers },
    branding,
    generatedAt,
  })
  const agency = identity({ branding: Object.keys(record(branding)).length ? branding : resolvedModel.branding, pack })
  const data = captured({ formData, signingPack: pack, model: resolvedModel })
  const application = ['company', 'trust', 'close_corporation', 'deceased_estate'].includes(data.legalType.toLowerCase()) ? 'JURISTIC PERSON / ENTITY' : 'NATURAL PERSON'
  const reference = first(resolvedModel.documentReference, pack.documentReference)
  const declaration = first(record(resolvedModel.declaration).wording).replace(/\bArch9\b/g, agency.name)
  const signers = Array.isArray(resolvedModel.signers) && resolvedModel.signers.length ? resolvedModel.signers : Array.isArray(pack.signers) ? pack.signers : []
  const signerMarkup = (signers.length ? signers : [{ name: data.name, roleLabel: 'Seller' }]).map((signer, index) => `<div class="signature-row"><b>${escape(signer.roleLabel || signer.role || `Seller ${index + 1}`)}</b><span>${escape(signer.name || data.name || 'Seller')}</span><span>Signature __________________________</span><span>Date ______________</span></div>`).join('')
  const firstPage = `<section class="page">${header(agency, 1, 3, application)}<main><p class="intro">The information in this record is supplied for identity verification and client due diligence. Agency checks and supporting documents are recorded separately.</p>${section('Request type', dataRow('Purpose', 'Seller FICA / property transaction'))}${section('Personal information', [dataRow('Full names', data.name, { allowBlank: true }), dataRow('ID / passport number', data.idNumber, { allowBlank: true }), dataRow('ID type', data.idType, { allowBlank: true }), dataRow('RSA resident', yesNo(data.resident)), dataRow('Income tax number', data.taxNumber, { allowBlank: true }), dataRow('Marital status', data.maritalStatus, { allowBlank: true }), dataRow('Address (domicilium)', data.address, { allowBlank: true })].join(''))}${section('Contact and employment details', [dataRow('Employer', data.employer, { allowBlank: true }), dataRow('Job title / position', data.jobTitle, { allowBlank: true }), dataRow('Contact number', data.phone, { allowBlank: true }), dataRow('Email address', data.email, { allowBlank: true })].join(''))}${section('FICA questions (compulsory)', [dataRow('Main occupation', data.occupation, { allowBlank: true }), dataRow('Industry of business', data.industry, { allowBlank: true }), dataRow('Countries of trade', data.countries, { allowBlank: true })].join(''))}</main>${footer(agency, 1, 3, reference)}</section>`
  const secondPage = `<section class="page">${header(agency, 2, 3, application)}<main>${section('Risk assessment questions', [question('Involved in dual-use goods?', data.dualUse), question('Involved in arms / weapons?', data.arms), question('Acting on behalf of another person?', data.actingForOther), question('Heir in an estate?', data.heir), dataRow('Source of wealth', data.sourceOfWealth, { allowBlank: true }), dataRow('Source of income / funds', data.sourceOfIncome, { allowBlank: true })].join(''))}${section('Banking details for this transaction', [dataRow('Account name', data.bankAccountName, { allowBlank: true }), dataRow('Bank name', data.bankName, { allowBlank: true }), dataRow('Account number', data.bankAccountNumber, { allowBlank: true }), dataRow('Account type', data.bankAccountType, { allowBlank: true })].join(''))}${section('Politically influential person status', `${question('Are you a politically influential person, family member or close associate?', data.pep)}<p class="definition">This question concerns a person who holds or has recently held a prominent public function, or a close associate or family member of such a person. The agency must assess any positive answer.</p>`)}</main>${footer(agency, 2, 3, reference)}</section>`
  const thirdPage = `<section class="page">${header(agency, 3, 3, application)}<main>${section('Protection of personal information (POPIA)', `<p class="body-copy">Personal information is collected, processed and stored for FICA verification and the property transaction. It may be shared with relevant verification providers or authorities where required by law.</p>${dataRow('Privacy consent recorded', yesNo(data.privacyConsent))}${dataRow('Marketing consent (optional)', yesNo(data.marketingConsent))}${dataRow('Consent recorded at', data.consentAt, { allowBlank: true })}`)}${section('Declarations', `<p class="body-copy">${escape(declaration || 'I declare that the information provided is true and complete to the best of my knowledge and understand that verification checks may be required.')}</p><div class="check-line">□ Information supplied is true and correct &nbsp; □ Any representative capacity has been disclosed &nbsp; □ FICA screening requirements are understood</div>`)}${section('Individual verification documents', `<div class="check-line">□ South African ID / passport and visa, where applicable<br>□ Recent proof of residential address<br>□ Work permit, where applicable</div>`)}${section('Additional documents if required', `<div class="check-line">□ Proof of banking details &nbsp; □ Proof of income or source of funds<br>□ Tax information &nbsp; □ Source of wealth evidence</div>`)}${section('Client signature', signerMarkup)}${section('Agency review and risk assessment', `<div class="review"><b>Not yet verified by the agency</b><p>Information above is as supplied by the seller. Check it against supporting evidence before recording a risk result.</p><div class="review-fields">Reviewed by _______________________ &nbsp; Date ______________<br>Risk level __________________________ &nbsp; Follow-up ______________________________</div></div>`)}</main>${footer(agency, 3, 3, reference)}</section>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Seller client due diligence record</title><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#1c2732;font:8.7pt/1.4 Arial,Helvetica,sans-serif}.document{width:210mm;margin:auto;--primary:${agency.primary};--accent:${agency.accent}}.page{width:210mm;height:297mm;position:relative;overflow:hidden;padding:10mm 14mm 15mm;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.doc-header{text-align:center;min-height:43mm}.brand{display:flex;justify-content:center;align-items:center;gap:4mm;min-height:14mm}.brand strong{font:bold 21pt Georgia,serif;letter-spacing:.04em;text-transform:uppercase}.brand.has-logo strong{font-size:10pt}.brand img{max-height:17mm;max-width:57mm;object-fit:contain}.company-line{margin:1mm 0 5mm;color:#657789;font-size:7.5pt}.doc-header h1{margin:0;font-size:12pt;font-weight:700;letter-spacing:.03em}.doc-header h1 small{font-size:9pt}.doc-header p{margin:1mm 0;color:var(--accent);font-size:9pt;letter-spacing:.08em}main{display:grid;gap:3mm}.intro{margin:0 0 1mm;border:1px solid var(--primary);padding:3mm 3.5mm;font-size:8pt;line-height:1.45}.data-section{border:1px solid #263640;break-inside:avoid;page-break-inside:avoid}.data-section h2{margin:0;border-bottom:1px solid #263640;background:#edf1f4;padding:1.5mm 2.5mm;color:var(--primary);font-size:8.3pt;font-weight:700;text-transform:uppercase}.data-row,.question{display:grid;grid-template-columns:45% 55%;min-height:7mm;border-bottom:1px solid #263640}.data-row:last-child,.question:last-child{border-bottom:0}.data-row span,.question>span{padding:1.4mm 2.5mm;border-right:1px solid #263640;text-transform:uppercase;font-size:7.5pt}.data-row strong,.question>strong{padding:1.4mm 2.5mm;font-size:8pt;font-weight:600;overflow-wrap:anywhere}.data-row em{color:#87929c;font-style:normal;font-weight:400}.choice{display:inline-flex;align-items:center;gap:1mm;margin-right:3mm;font-weight:400}.choice i{display:inline-grid;place-items:center;width:3.4mm;height:3.4mm;border:1px solid #263640;font-style:normal;font-size:7pt}.choice small{color:#7c8791;font-weight:400}.definition,.body-copy{margin:0;padding:2.5mm;font-size:7.7pt;line-height:1.5}.check-line{padding:2.5mm;font-size:7.6pt;line-height:1.6}.signature-row{display:grid;grid-template-columns:18% 29% 34% 19%;gap:1mm;min-height:14mm;align-items:end;border-top:1px solid #cbd2d7;padding:2mm;font-size:7.5pt}.signature-row:first-of-type{border-top:0}.review{padding:2.5mm}.review b{color:var(--accent)}.review p{margin:1mm 0}.review-fields{margin-top:2mm;line-height:1.8}.doc-footer{position:absolute;left:14mm;right:14mm;bottom:5mm;display:flex;justify-content:space-between;border-top:1px solid #cad3dc;padding-top:1.5mm;color:#697b8b;font-size:7pt}@media print{.document{margin:0}.page{margin:0}}
    .brand img{filter:drop-shadow(0 0 .35mm #233540)}
  </style></head><body><div class="document">${firstPage}${secondPage}${thirdPage}</div></body></html>`
}
