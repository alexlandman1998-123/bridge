import process from 'node:process'
import {
  buildPrivatePropertyCliConfig,
  createPrivatePropertyCliClient,
  createPrivatePropertyPhase5BaseReport,
  parsePrivatePropertyArgs,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'
import { extractPrivatePropertyXmlTag, summarizePrivatePropertySoapResponse } from '../server/services/privatePropertyClient.js'

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    apply: false,
    propertyId: '',
    listingType: 'Sale',
    youtubeVideoId: '',
    matterportId: '',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-listing-video', config, options)
  report.request = {
    propertyId: options.propertyId || null,
    listingType: options.listingType || 'Sale',
    youtubeVideoIdConfigured: Boolean(options.youtubeVideoId),
    matterportIdConfigured: Boolean(options.matterportId),
  }

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (!options.propertyId) missing.push('--property-id')
  if (!options.youtubeVideoId && !options.matterportId) missing.push('--youtube-video-id or --matterport-id')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-listing-video.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    report.status = 'DRY_RUN'
    report.nextStep = 'No Private Property video/Matterport change was made. Re-run with --apply to call UpdateListingVideoOrMatterport.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-listing-video.json')
    console.log(JSON.stringify({ status: report.status, output, request: report.request, nextStep: report.nextStep }, null, 2))
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true
  try {
    const response = await client.updateListingVideoOrMatterport({
      branchGuid: config.branchGuid,
      uniqueListingId: options.propertyId,
      listingType: options.listingType,
      youtubeVideoId: options.youtubeVideoId,
      matterportId: options.matterportId,
    })
    report.status = 'PASS'
    report.safety.listingStatusChanged = true
    report.apiResponse = {
      status: response.status,
      durationMs: response.durationMs,
      resultText: extractPrivatePropertyXmlTag(response.data, 'UpdateListingVideoOrMatterportResult'),
      summary: response.summary,
    }
    report.nextStep = 'Run private-property:post-submit-monitor or portal checks to confirm the listing remains active.'
  } catch (error) {
    report.status = 'BLOCKED'
    report.apiResponse = {
      error: {
        name: error.name || 'Error',
        message: error.message,
        status: error.status || null,
        statusText: error.statusText || '',
        faultCode: error.faultCode || '',
        faultString: error.faultString || '',
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse('UpdateListingVideoOrMatterport', error.responseBody) : null,
      },
    }
    report.nextStep = 'Fix the Private Property video/Matterport error, then re-run with --apply.'
    process.exitCode = 1
  }

  const output = writePrivatePropertyReport(report, options.output, 'private-property-listing-video.json')
  console.log(JSON.stringify({
    status: report.status,
    output,
    apiResponse: report.apiResponse,
    nextStep: report.nextStep,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
