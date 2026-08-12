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

console.log('Kingstons valuation presentation background email scheduling tests passed.')
