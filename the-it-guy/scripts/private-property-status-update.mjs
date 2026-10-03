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
    propertyStatus: 'ForSale',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-phase5-status-update', config, options)
  report.request = {
    propertyId: options.propertyId || null,
    listingType: options.listingType || 'Sale',
    propertyStatus: options.propertyStatus || 'ForSale',
  }

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (!options.propertyId) missing.push('--property-id')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-status-update.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    report.status = 'DRY_RUN'
    report.nextStep = 'No Private Property status change was made. Re-run with --apply to call ListingStatusUpdate.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-status-update.json')
    console.log(JSON.stringify({ status: report.status, output, request: report.request, nextStep: report.nextStep }, null, 2))
    return
  }

  const productionTarget = config.environment.toLowerCase() === 'production' || new URL(config.baseUrl).hostname === 'services.privateproperty.co.za'
  if (productionTarget && ['forsale', 'tolet'].includes(String(options.propertyStatus).toLowerCase().replace(/\s+/g, ''))) {
    report.technicalBlockers = ['private_property_production_requires_verified_reactivation']
    report.nextStep = 'Use Reactivate in the Arch9 listing review. It verifies the retained PP address and confirms the resulting status.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-status-update.json')
    console.log(JSON.stringify({ status: report.status, output, technicalBlockers: report.technicalBlockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true
  try {
    const response = await client.listingStatusUpdate({
      branchGuid: config.branchGuid,
      propertyId: options.propertyId,
      listingType: options.listingType,
      propertyStatus: options.propertyStatus,
    })
    report.status = 'PASS'
    report.safety.listingStatusChanged = true
    report.apiResponse = {
      status: response.status,
      durationMs: response.durationMs,
      resultText: extractPrivatePropertyXmlTag(response.data, 'ListingStatusUpdateResult'),
      summary: response.summary,
    }
    report.nextStep = 'Run private-property:listing-status to confirm the current Private Property status/reference.'
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
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse('ListingStatusUpdate', error.responseBody) : null,
      },
    }
    report.nextStep = 'Fix the Private Property status update error, then re-run with --apply.'
    process.exitCode = 1
  }

  const output = writePrivatePropertyReport(report, options.output, 'private-property-status-update.json')
  console.log(JSON.stringify({
    status: report.status,
    output,
    listingStatusChanged: report.safety.listingStatusChanged,
    apiResponse: report.apiResponse,
    nextStep: report.nextStep,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
