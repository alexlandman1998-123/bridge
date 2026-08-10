import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(
  pipelineSource,
  /function isPrivateListingFallbackLead\(row = \{\}\)[\s\S]*?privateListingId[\s\S]*?originatingCrmLeadId[\s\S]*?sellerLeadId/,
  'Kingstons lead reload should identify private-listing fallback rows.',
)

assert.match(
  pipelineSource,
  /const preserveCrmLifecycle = Boolean\(localRow\?\.leadId\) && isPrivateListingFallbackLead\(remoteRow\)/,
  'private-listing fallback rows must not regress a persisted CRM lead lifecycle.',
)

assert.match(
  pipelineSource,
  /stage: preserveCrmLifecycle[\s\S]*?localRow\.stage[\s\S]*?status: preserveCrmLifecycle[\s\S]*?localRow\.status/,
  'CRM stage/status should win when merging with listing fallback rows.',
)

assert.match(
  pipelineSource,
  /firstContactedAt: firstWorkspaceText\(baseRow\.firstContactedAt, baseRow\.first_contacted_at, localRow\.firstContactedAt, localRow\.first_contacted_at\)/,
  'first-contact evidence should survive reload merges.',
)

assert.match(
  pipelineSource,
  /const localLeadPatch = \{[\s\S]*?first_contacted_at: leadPatch\.firstContactedAt[\s\S]*?ownership_status: leadPatch\.ownershipStatus/,
  'seller contact confirmation should patch both camelCase and snake_case evidence locally.',
)

assert.match(
  pipelineSource,
  /const savedActivity = await createAgencyCrmLeadActivity[\s\S]*?patchSelectedLeadRecord\(localLeadPatch, leadId\)[\s\S]*?leadActivities: \[savedActivity, \.\.\.currentActivities\]/,
  'seller contact confirmation should keep the selected lead and activity timeline in sync before the scheduled reload.',
)

console.log('Kingstons first-contact reload stability guard passed.')
