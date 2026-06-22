import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

for (const marker of [
  'TenantOverview',
  'TenantRequirementSummaryCard',
  'TenantMatchedVacanciesCard',
  'TenantNotesCard',
  'TenantStageWorkspace',
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
  'Requirements Captured',
  'Vacancies Matched',
  'Viewing Scheduled',
  'HOT Signed',
  'Handover',
]) {
  assert.match(detailSource, new RegExp(journeyStage), `tenant journey should include ${journeyStage}`)
}

const tenantJourneyBlock = detailSource.match(/function buildTenantJourney[\s\S]*?\n}\n\nfunction getSellerProfile/)?.[0] || ''
for (const removedStage of ['Tenant Onboarding Sent', 'Proposal Submitted', 'Deal Created']) {
  assert.doesNotMatch(tenantJourneyBlock, new RegExp(removedStage), `tenant journey should not include ${removedStage}`)
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

const tenantTabsBlock = detailSource.match(/if \(leadType === 'tenant'[\s\S]*?return \[\n      \{ key: 'overview'[\s\S]*?\n    \]\n  }/)?.[0] || ''
for (const tab of ['Overview', 'Documents', 'Activity', 'History']) {
  assert.match(tenantTabsBlock, new RegExp(tab), `tenant tabs should include ${tab}`)
}
for (const removedTab of ['Requirement', 'Matching', 'Viewings', 'Proposal / HOT']) {
  assert.doesNotMatch(tenantTabsBlock, new RegExp(removedTab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant tabs should not include ${removedTab}`)
}

for (const workflowAction of ['Capture Requirements', 'Schedule Viewing', 'Convert To Deal', 'Find Matching Vacancies']) {
  assert.match(detailSource, new RegExp(workflowAction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant workspace should expose ${workflowAction}`)
}

for (const overviewMarker of [
  'Requirement Summary',
  'Matched Vacancies',
  'Internal Notes',
  'Broker Notes',
  'Requirement Notes',
  'No requirements captured yet.',
  'No vacancies matched yet.',
]) {
  assert.match(detailSource, new RegExp(overviewMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant overview should include ${overviewMarker}`)
}

for (const journeyControlMarker of ['journeyStage', 'selectedTenantJourneyStage', 'setTenantJourneyStage', 'overflow-x-auto']) {
  assert.match(detailSource, new RegExp(journeyControlMarker), `tenant journey should include ${journeyControlMarker}`)
}

for (const readinessMarker of [
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
