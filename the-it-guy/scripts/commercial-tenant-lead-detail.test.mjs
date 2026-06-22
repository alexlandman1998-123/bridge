import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

for (const marker of [
  'TenantOverview',
  'TenantProfilePanel',
  'TenantRequirementPanel',
  'TenantMatchingPanel',
  'TenantViewingsPanel',
  'TenantProposalHotPanel',
  'TenantDocumentsPanel',
  'TenantConversionPanel',
]) {
  assert.match(detailSource, new RegExp(marker), `tenant detail should include ${marker}`)
}

for (const journeyStage of [
  'Lead Captured',
  'Contacted',
  'Tenant Onboarding Sent',
  'Requirement Captured',
  'Vacancies Matched',
  'Viewing Scheduled',
  'Proposal Submitted',
  'HOT Signed',
  'Deal Created',
]) {
  assert.match(detailSource, new RegExp(journeyStage), `tenant journey should include ${journeyStage}`)
}

for (const requirementField of [
  'Asset Class',
  'Area Preferences',
  'Minimum Size',
  'Maximum Size',
  'Target Size',
  'Budget R/sqm',
  'Monthly Budget',
  'Annual Budget',
  'Occupation Date',
  'Lease Term',
  'Parking Requirement',
  'Power Requirement',
  'Special Requirements',
]) {
  assert.match(detailSource, new RegExp(requirementField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant requirement should render ${requirementField}`)
}

for (const tabOrAction of ['Matching', 'Viewings', 'Proposal / HOT', 'Match Vacancies', 'Schedule Viewing', 'Generate Proposal', 'Create HOT']) {
  assert.match(detailSource, new RegExp(tabOrAction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant workspace should expose ${tabOrAction}`)
}

for (const readinessMarker of [
  'Requirement Readiness Score',
  'Requirement Ready',
  'Needs Attention',
  'Incomplete',
  'Contact Details',
  'Business Information',
  'Area Preferences',
  'Budget Captured',
  'Decision Maker Identified',
]) {
  assert.match(detailSource, new RegExp(readinessMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant readiness should include ${readinessMarker}`)
}

for (const documentName of [
  'Company Registration',
  'Director IDs',
  'Financial Statements',
  'Proof Of Address',
  'VAT Registration',
  'Lease Application',
  'Board Resolution',
]) {
  assert.match(detailSource, new RegExp(documentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant document checklist should include ${documentName}`)
}

console.log('commercial tenant lead detail tests passed')
