import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

for (const marker of [
  'BuyerOverview',
  'BuyerProfilePanel',
  'BuyerRequirementPanel',
  'BuyerFundingPanel',
  'BuyerMatchingPanel',
  'BuyerViewingsPanel',
  'BuyerOffersPanel',
  'BuyerDocumentsPanel',
  'BuyerConversionPanel',
]) {
  assert.match(detailSource, new RegExp(marker), `buyer detail should include ${marker}`)
}

for (const journeyStage of [
  'Lead Captured',
  'Contacted',
  'Buyer Onboarding Sent',
  'Requirement Captured',
  'Funding Confirmed',
  'Listings Matched',
  'Viewing Scheduled',
  'Offer Submitted',
  'Deal Created',
]) {
  assert.match(detailSource, new RegExp(journeyStage), `buyer journey should include ${journeyStage}`)
}

for (const readinessMarker of [
  'Buyer Readiness Score',
  'Buyer Ready',
  'Contact Details',
  'Requirement Captured',
  'Budget Confirmed',
  'Funding Confirmed',
  'Occupation Timeline',
  'Decision Maker Identified',
  'Area Preferences Captured',
  'Ready',
  'Needs Attention',
  'Incomplete',
]) {
  assert.match(detailSource, new RegExp(readinessMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `buyer readiness should include ${readinessMarker}`)
}

for (const requirementField of [
  'Buyer / Company Name',
  'Trading Name',
  'Industry',
  'Relationship Type',
  'Asset Class',
  'Area Preferences',
  'Minimum Size',
  'Maximum Size',
  'Target Size',
  'Purchase Budget',
  'Maximum Purchase Price',
  'Deposit Available',
  'Funding Type',
  'Occupation Date',
  'Purchase Timeline',
  'Special Requirements',
]) {
  assert.match(detailSource, new RegExp(requirementField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `buyer workspace should render ${requirementField}`)
}

for (const fundingMarker of [
  'Funding Status',
  'Unknown',
  'Discussed',
  'Confirmed',
  'Proof Received',
  'Approved',
  'Declined',
  'Pre-Approval Status',
  'Request Proof Of Funds',
  'Upload Proof Of Funds',
  'Request Pre-Approval',
  'Refer To Bond Originator',
]) {
  assert.match(detailSource, new RegExp(fundingMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `buyer funding should include ${fundingMarker}`)
}

for (const matchingOrOfferMarker of [
  'Match Centre',
  'Matched Listings',
  'Match Listings',
  'Send Matches',
  'Schedule Viewing',
  'Offers Submitted',
  'Offers Accepted',
  'Offers Declined',
  'Offers Withdrawn',
  'Prepare Offer',
  'Submit Offer',
  'View Offer',
]) {
  assert.match(detailSource, new RegExp(matchingOrOfferMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `buyer matching/offers should include ${matchingOrOfferMarker}`)
}

for (const documentName of [
  'Company Registration',
  'Director IDs',
  'Proof Of Funds',
  'Financial Statements',
  'Bank Confirmation',
  'Board Resolution',
  'Trust Documents',
  'VAT Registration',
]) {
  assert.match(detailSource, new RegExp(documentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `buyer document checklist should include ${documentName}`)
}

for (const actionOrTab of [
  'Send Buyer Onboarding',
  'Capture Requirement',
  'Match Listings',
  'Funding',
  'Matching',
  'Viewings',
  'Offers',
  'Convert to Deal',
]) {
  assert.match(detailSource, new RegExp(actionOrTab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `buyer workspace should expose ${actionOrTab}`)
}

console.log('commercial sales buyer lead detail tests passed')
