import { SELLER_MANDATE_WORDING_RELEASE, SELLER_MANDATE_WORDING_ARCHIVE, SELLER_MANDATE_AGENCY_APPROVALS } from './sellerMandateWordingRelease.js'
import { getSellerMandateTermsMissing, readSellerMandateTerms, isMandateCalendarDate } from '../../lib/sellerMandateCapture.js'

export const SELLER_MANDATE_SIGNING_CONTRACT = 'arch9-full-mandate-signing-v1'
export function isFullMandateSigningCopy(document, html = '') {
  return Boolean(document?.mandateContract || document?.mandateTerms?.mandateCapture !== undefined ||
    /^seller-mandate-(exclusive|open|dual)-/.test(String(document?.templateVersion || document?.template_version || '')) ||
    html.includes('data-review-layout="seller-mandate-review"'))
}
const text = value => String(value ?? '').trim()
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
export const mandateCanonicalJson = value => JSON.stringify(canonical(value))
export async function mandateDigest(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(typeof value === 'string' ? value : mandateCanonicalJson(value)))
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

export function getMandateWordingRelease(mandate = {}) {
  return SELLER_MANDATE_WORDING_RELEASE[readSellerMandateTerms(mandate).mandateType]
}

function assertApprovedRelease(release) {
  if (!release || release.approval.status !== 'approved' || !text(release.approval.businessApprover) ||
      !text(release.approval.counselApprover) || !text(release.approval.reference) || !text(release.approval.approvedAt) ||
      release.approval.wordingDigest !== release.wordingDigest) {
    throw new Error('The exact revised mandate wording requires recorded business and legal approval before preparing a signing copy.')
  }
  return release
}

export function assertMandateWordingApproved(mandate = {}) {
  return assertApprovedRelease(getMandateWordingRelease(mandate))
}

/** Only server-owned, exact historical approvals can verify a frozen copy. */
export function getFrozenMandateWordingRelease(contract) {
  const candidates = [...Object.entries(SELLER_MANDATE_WORDING_RELEASE).map(([variant, release]) => ({ ...release, variant })), ...SELLER_MANDATE_WORDING_ARCHIVE]
  const release = candidates.find(entry => entry.variant === contract?.variant && entry.version === contract?.version &&
    entry.wordingDigest === contract?.wordingDigest && entry.markdown === contract?.markdown &&
    mandateCanonicalJson(entry.approval) === mandateCanonicalJson(contract?.wordingApproval))
  return assertApprovedRelease(release)
}

/** Deliberately exclude the complete FICA file from the mandate signing copy. */
export function mandateSigningInputs(pack = {}) {
  const project = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
  const seller = project(pack.seller, ['legalOwnerName', 'legalOwnerIdentity', 'legalType', 'ownershipType', 'name', 'idNumber', 'residentialAddress', 'email', 'phone', 'companyName', 'companyRegistrationNumber', 'companyRegisteredAddress', 'trustName', 'trustRegistrationNumber', 'trustRegisteredAddress'])
  seller.parties = (Array.isArray(pack.seller?.parties) ? pack.seller.parties : []).map(person => project(person, ['name', 'role', 'idNumber', 'residentialAddress']))
  return structuredClone({ documentReference: pack.documentReference || '', disclosureReference: pack.disclosureReference || '',
    renderedAt: pack.renderedAt || pack.frozenAt || '', seller,
    property: project(pack.property, ['address', 'titleDeedNumber', 'erfNumber', 'sectionNumber', 'unitNumber', 'schemeName']), signers: pack.signers || [],
    branding: pack.branding || {}, mandate: pack.mandate || {}, acceptanceReview: pack.acceptanceReview || pack.mandateAcceptanceReview || pack.mandate?.mandateAcceptanceReview || {} })
}

export async function mandateAgencySchedulesDigest(mandate) {
  const terms = readSellerMandateTerms(mandate)
  return mandateDigest(Object.fromEntries((terms.mandateType === 'dual' ? ['agencyA', 'agencyB'] : ['agencyA']).map(key => [key, terms.mandateCapture[key]])))
}

export function mandateCertificatesCurrent(contract, at = new Date().toISOString().slice(0, 10)) {
  if (!isMandateCalendarDate(at)) return false
  const terms = readSellerMandateTerms(contract?.inputs?.mandate)
  return (terms.mandateType === 'dual' ? ['agencyA', 'agencyB'] : ['agencyA']).every(key => {
    const agency = terms.mandateCapture?.[key]
    return agency && isMandateCalendarDate(agency.businessFfcExpiry) && isMandateCalendarDate(agency.practitionerFfcExpiry) && agency.businessFfcExpiry >= at && agency.practitionerFfcExpiry >= at
  })
}

export function mandateRequiredSigners(pack = {}) {
  const terms = readSellerMandateTerms(pack.mandate)
  const missing = getSellerMandateTermsMissing(terms, { requireCapture: true, ownershipType: pack.seller?.ownershipType || pack.seller?.legalType })
  if (terms.mandateType === 'dual') {
    const a = terms.mandateCapture?.agencyA || {}, b = terms.mandateCapture?.agencyB || {}
    if (text(a.legalName).toLowerCase() === text(b.legalName).toLowerCase() ||
        a.registrationStatus === 'captured' && b.registrationStatus === 'captured' && text(a.registrationNumber).toLowerCase() === text(b.registrationNumber).toLowerCase()) missing.push('Dual requires two distinct contracting agencies')
    if (![b.legalName, b.tradingName].some(name => text(name).toLowerCase() === terms.otherAgencyName.toLowerCase())) missing.push('Second agency name must match Agency B legal or trading name')
  }
  if (!text(terms.specialConditions)) missing.push('Special conditions (enter None if none agreed)')
  if (!text(pack.documentReference) || !text(pack.property?.address) || !text(pack.seller?.legalOwnerName || pack.seller?.companyName || pack.seller?.trustName || pack.seller?.name)) missing.push('Document reference, legal owner and property address')
  if (missing.length) throw new Error(`Complete the mandate schedules: ${missing.join('; ')}.`)
  const sellers = Array.isArray(pack.signers) ? pack.signers.map(signer => ({ name: text(signer.name), role: text(signer.role), email: text(signer.email).toLowerCase() })) : []
  if (!sellers.length || sellers.some(signer => !signer.name || !signer.role)) throw new Error('Identify every required seller signer.')
  const owners = (Array.isArray(pack.seller?.parties) ? pack.seller.parties : []).filter(person => /^(owner|seller|registered owner)$/i.test(text(person.role)))
  if (owners.length > sellers.length || owners.some(owner => !sellers.some(signer => signer.name.toLowerCase() === text(owner.name).toLowerCase()))) throw new Error('Every captured owner must be included in the mandate signer matrix.')
  const agencies = (terms.mandateType === 'dual' ? ['agencyA', 'agencyB'] : ['agencyA']).map(key => ({
    name: text(terms.mandateCapture[key].representativeName),
    role: `${key === 'agencyA' ? 'Agency A' : 'Agency B'} acceptance`,
    email: text(terms.mandateCapture[key].representativeEmail).toLowerCase(),
  }))
  const signers = [...sellers, ...agencies]
  if (signers.some(signer => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signer.email)) ||
      new Set(signers.map(signer => signer.email)).size !== signers.length) {
    throw new Error('Each seller and contracting agency needs its own distinct valid signer email.')
  }
  return signers
}

/** Validate server-owned approvals, then bind every rendered input by value. */
async function buildContract(pack, release, frozenAgencyApproval) {
  if (await mandateDigest(release.markdown) !== release.wordingDigest) throw new Error('The approved mandate wording changed; refresh legal approval.')
  const requiredSigners = mandateRequiredSigners(pack)
  const terms = readSellerMandateTerms(pack.mandate)
  const agencySchedules = Object.fromEntries((terms.mandateType === 'dual' ? ['agencyA', 'agencyB'] : ['agencyA']).map(key => [key, terms.mandateCapture[key]]))
  const agencySchedulesDigest = await mandateDigest(agencySchedules)
  const approval = SELLER_MANDATE_AGENCY_APPROVALS.find(entry => entry.status === 'approved' && entry.wordingDigest === release.wordingDigest &&
    entry.agencySchedulesDigest === agencySchedulesDigest && text(entry.counselApprover) && text(entry.businessApprover) && text(entry.approvedAt) && text(entry.reference) &&
    (!frozenAgencyApproval || mandateCanonicalJson(entry) === mandateCanonicalJson(frozenAgencyApproval)))
  if (!approval) throw new Error('Legal and business approval of these exact contracting-agency schedules is required.')
  const review = pack.acceptanceReview || pack.mandateAcceptanceReview || pack.mandate?.mandateAcceptanceReview || {}
  if (review.authorityVerified !== true || review.disclosureVerified !== true || review.ffcVerified !== true ||
      !text(review.reviewedBy) || !Number.isFinite(Date.parse(review.reviewedAt)) || !text(review.authorityReference) || !text(pack.disclosureReference) ||
      review.disclosureReference !== pack.disclosureReference || review.agencySchedulesDigest !== agencySchedulesDigest) {
    throw new Error('Record the checked authority, completed signed disclosure and both relevant FFC records before mandate acceptance.')
  }
  const inputs = mandateSigningInputs(pack)
  if (!mandateCertificatesCurrent({ inputs }, review.reviewedAt.slice(0, 10))) throw new Error('The FFC records must be current when their evidence is checked.')
  return { contract: SELLER_MANDATE_SIGNING_CONTRACT, version: release.version, variant: terms.mandateType,
    wordingDigest: release.wordingDigest, markdown: release.markdown, wordingApproval: structuredClone(release.approval),
    agencyApproval: structuredClone(approval), agencySchedulesDigest, inputs, inputsDigest: await mandateDigest(inputs), requiredSigners }
}

export async function createMandateSigningContract(pack = {}) {
  return buildContract(pack, assertMandateWordingApproved(pack.mandate))
}

/** Preparation time may change when FICA alone is replaced; the mandate may not. */
export function mandateSigningInputsUnchanged(contract, pack) {
  const frozen = mandateSigningInputs(contract?.inputs), current = mandateSigningInputs(pack)
  delete frozen.renderedAt
  delete current.renderedAt
  return mandateCanonicalJson(frozen) === mandateCanonicalJson(current)
}

export async function isCurrentMandateSigningContract(contract) {
  try { return mandateCanonicalJson(await createMandateSigningContract(contract.inputs)) === mandateCanonicalJson(contract) }
  catch { return false }
}

export async function verifyMandateSigningContract(contract) {
  try {
    if (contract?.contract !== SELLER_MANDATE_SIGNING_CONTRACT) return false
    const expected = await buildContract(contract.inputs, getFrozenMandateWordingRelease(contract), contract.agencyApproval)
    return mandateCanonicalJson(expected) === mandateCanonicalJson(contract)
  } catch { return false }
}
