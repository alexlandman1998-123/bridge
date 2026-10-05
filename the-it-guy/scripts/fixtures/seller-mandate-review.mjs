import { createMandateTermsFixture } from './seller-mandate-capture.mjs'

// All names, contacts, identities and evidence references are synthetic.
export function createMandateReviewFixture(type = 'sole') {
  const mandate = createMandateTermsFixture()
  mandate.mandateType = type
  mandate.protectionPeriod = '60'
  mandate.specialConditions = 'None recorded for this synthetic review example.'
  if (type === 'open') { mandate.mandateDuration = 'until_cancelled'; mandate.endDate = '' }
  const capture = mandate.mandateCapture
  capture.authority.details = 'Authority schedule AUTH-001: both registered owners sign in their own capacity.'
  capture.priceExclusions = { status: 'none', details: '' }
  capture.buyerExclusions = { status: 'none', details: '' }
  capture.existingIntroductions = { status: 'none', details: '' }
  capture.expenses = { status: 'none', details: '' }
  capture.annexures.details = `Authority schedule AUTH-001; disclosure MDF-001${type === 'dual' ? '; allocation ALLOCATION-1' : ''}.`
  capture.marketing.details = type === 'dual'
    ? 'Agency A: photographs and listing preparation by 8 October; portal advertising from 9 October. Agency B: social advertising from 9 October. Agencies coordinate buyer introductions and written offers through their listed representatives.'
    : 'Photographs and listing preparation by 8 October; approved portal and social advertising from 9 October. The responsible practitioner coordinates all introductions and written offers.'
  capture.marketing.reporting = 'Agency A emails both sellers every Friday, with enquiries, viewings, feedback and offers.'
  const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="130"><path d="M20 68L55 32l35 36v43H65V83H46v28H20Z" fill="#24544c"/><text x="108" y="78" font-family="Arial" font-size="44" font-weight="700" fill="#24544c">ALPHA PROPERTY</text><text x="110" y="108" font-family="Arial" font-size="18" letter-spacing="4" fill="#536b65">SYNTHETIC REVIEW</text></svg>'
  return {
    documentReference: `SAMPLE-${type === 'sole' ? 'EXCLUSIVE' : type.toUpperCase()}-001`,
    disclosureReference: 'MDF-001 - completed disclosure example reference',
    branding: { organisationName: 'Alpha Property', primaryColour: '#24544c', accentColour: '#98723b', logoDarkUrl: `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}` },
    seller: { legalOwnerName: 'Sam Example and Jordan Example', legalOwnerIdentity: 'SAMPLE-ID-001 / SAMPLE-ID-002', residentialAddress: '2 Example Lane, Cape Town', email: 'sam@example.test', phone: '0820000001',
      parties: [{ name: 'Sam Example', role: 'Owner', idNumber: 'SAMPLE-ID-001', residentialAddress: '2 Example Lane, Cape Town' }, { name: 'Jordan Example', role: 'Owner', idNumber: 'SAMPLE-ID-002', residentialAddress: '2 Example Lane, Cape Town' }] },
    property: { address: '10 Example Street, Cape Town, 8001', titleDeedNumber: 'T-SAMPLE/2026', erfNumber: 'SAMPLE-123' },
    mandate,
    signers: [{ name: 'Sam Example', role: 'Registered owner', authorityReference: 'AUTH-001', email: 'sam@example.test' }, { name: 'Jordan Example', role: 'Registered owner', authorityReference: 'AUTH-001', email: 'jordan@example.test' }],
  }
}
