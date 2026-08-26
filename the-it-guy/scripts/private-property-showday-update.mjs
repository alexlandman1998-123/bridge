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
    startDate: '',
    endDate: '',
    description: 'Arch9 sandbox show day',
    active: 'true',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-showday-update', config, options)
  report.request = {
    propertyId: options.propertyId || null,
    startDate: options.startDate || null,
    endDate: options.endDate || null,
    description: options.description || null,
    active: options.active !== 'false',
  }

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (!options.propertyId) missing.push('--property-id')
  if (!options.startDate) missing.push('--start-date')
  if (!options.endDate) missing.push('--end-date')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-showday-update.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    report.status = 'DRY_RUN'
    report.nextStep = 'No Private Property show day change was made. Re-run with --apply to call ListingShowdayUpdate.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-showday-update.json')
    console.log(JSON.stringify({ status: report.status, output, request: report.request, nextStep: report.nextStep }, null, 2))
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true
  try {
    const response = await client.listingShowdayUpdate({
      branchGuid: config.branchGuid,
      propertyId: options.propertyId,
      startDate: options.startDate,
      endDate: options.endDate,
      description: options.description,
      active: options.active !== 'false',
    })
    report.status = 'PASS'
    report.safety.listingStatusChanged = true
    report.apiResponse = {
      status: response.status,
      durationMs: response.durationMs,
      resultText: extractPrivatePropertyXmlTag(response.data, 'ListingShowdayAddResult'),
      summary: response.summary,
    }
    report.nextStep = 'Run private-property:post-submit-monitor or Private Property portal checks to confirm the listing remains active.'
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
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse('ListingShowdayUpdate', error.responseBody) : null,
      },
    }
    report.nextStep = 'Fix the Private Property show day error, then re-run with --apply.'
    process.exitCode = 1
  }

  const output = writePrivatePropertyReport(report, options.output, 'private-property-showday-update.json')
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
