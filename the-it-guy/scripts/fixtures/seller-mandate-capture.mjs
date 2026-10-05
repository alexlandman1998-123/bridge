// Synthetic schedules for local capture and preservation checks only.
export function createMandateCaptureFixture() {
  const agency = name => ({
    legalName: `${name} Property (Pty) Ltd`, tradingName: `${name} Property`, registrationStatus: 'captured', registrationNumber: `2026/${name}/07`,
    address: `${name} Business Address`, businessFfcNumber: `${name}-BUSINESS-FFC`, businessFfcExpiry: '2027-12-31', businessFfcReference: `evidence/${name}-business.pdf`,
    practitionerName: `${name} Practitioner`, practitionerFfcNumber: `${name}-PRACTITIONER-FFC`, practitionerFfcExpiry: '2027-12-31', practitionerFfcReference: `evidence/${name}-practitioner.pdf`,
    representativeName: `${name} Representative`, representativeCapacity: 'Director', representativeEmail: `${name.toLowerCase()}@example.test`,
    noticeEmail: `notices-${name.toLowerCase()}@example.test`, noticeAddress: `${name} Notice Address`, vatStatus: 'registered', vatNumber: `${name}-VAT`,
    privacyNoticeUrl: `https://${name.toLowerCase()}.example.test/privacy`, informationOfficerContact: `privacy-${name.toLowerCase()}@example.test`, paiaManualUrl: `https://${name.toLowerCase()}.example.test/paia`,
  })
  return {
    version: 1, agencyA: agency('Alpha'), agencyB: agency('Bravo'),
    authority: { status: 'captured', capacity: 'Registered owner', details: 'Title reference OWNER-AUTHORITY-1' },
    priceExclusions: { status: 'none', details: '' },
    buyerExclusions: { status: 'captured', details: 'Named Buyer One: no fee for the identified prior transaction.' },
    existingIntroductions: { status: 'captured', details: 'Buyer Two introduced by Bravo on 2026-10-01.' },
    marketing: { status: 'captured', details: 'Alpha: approved portal listing. Bravo: agreed photography.', startDate: '2026-10-08', accessDetails: 'Recorded appointments with the seller.', reporting: 'Weekly email to the seller.' },
    expenses: { status: 'captured', details: 'Photography approval EXPENSE-1', maximumAmount: '1000', vatHandling: 'inclusive', paymentTrigger: 'After delivery against invoice.' },
    annexures: { status: 'captured', details: 'Allocation Schedule v1 — attachment ALLOCATION-1' },
    allocation: { rule: 'agreed_split', agencyAPercentage: '30', agencyBPercentage: '70', agencyAVatHandling: 'inclusive', agencyBVatHandling: 'inclusive', details: 'One combined fee, shared 30/70.', annexureReference: 'ALLOCATION-1' },
    notices: { sellerEmail: 'seller@example.test', sellerAddress: 'Seller Notice Address' },
  }
}

export function createMandateTermsFixture() {
  return { mandateType: 'dual', askingPrice: '2450000', startDate: '2026-10-04', endDate: '2027-01-04', mandateDuration: 'fixed', protectionPeriod: '0',
    otherAgencyName: 'Bravo Property (Pty) Ltd', commissionBasis: 'percentage', commissionPercentage: '5', commissionAmount: '', vatHandling: 'inclusive',
    specialConditions: 'Recorded special conditions.', mandateCapture: createMandateCaptureFixture() }
}
