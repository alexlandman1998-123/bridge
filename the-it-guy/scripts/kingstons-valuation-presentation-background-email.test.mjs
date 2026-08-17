import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const agencyPipelineSource = fs.readFileSync(
  path.join(projectRoot, 'src/pages/agency/AgencyPipelinePage.jsx'),
  'utf8',
)

assert.match(
  agencyPipelineSource,
  /void sendKingstonsValuationDownloadEmailForPresentation\(/,
  'Valuation presentation download email should be dispatched in the background.',
)

assert.doesNotMatch(
  agencyPipelineSource,
  /await sendKingstonsValuationDownloadEmailForPresentation\(/,
  'Valuation presentation scheduling must not wait for the valuation download email before closing the modal.',
)

assert.match(
  agencyPipelineSource,
  /Valuation download email is sending in the background\./,
  'Appointment save feedback should tell users the valuation download email continues in the background.',
)

assert.doesNotMatch(
  agencyPipelineSource,
  /await reloadRecords\(organisationId\)[\s\S]{0,400}\} catch \(postSaveError\) \{/,
  'Appointment save should not wait for the full pipeline reload after optimistic appointment insertion.',
)

assert.match(
  agencyPipelineSource,
  /scheduleRecordsReload\(organisationId, appointmentCreateRunsInBackground \? 850 : 250\)/,
  'Appointment save should schedule the full pipeline refresh after returning control to the UI.',
)

assert.doesNotMatch(
  agencyPipelineSource,
  /appointmentSchedulerLocation/,
  'Appointment modals should not render a duplicate location summary above the address field.',
)

assert.doesNotMatch(
  agencyPipelineSource,
  /15 Ocean View Drive, Camps Bay, Cape Town/,
  'Appointment address fields should not use a real-looking hard-coded address placeholder.',
)

assert.match(
  agencyPipelineSource,
  /selectedLead\?\.seller_property_address/,
  'Valuation presentation address seeding should read snake_case seller property addresses from lead records.',
)

console.log('Kingstons valuation presentation background email scheduling tests passed.')
