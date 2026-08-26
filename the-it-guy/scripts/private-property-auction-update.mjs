import process from 'node:process'
import {
  buildPrivatePropertyCliConfig,
  createPrivatePropertyCliClient,
  createPrivatePropertyPhase5BaseReport,
  parsePrivatePropertyArgs,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'
import { summarizePrivatePropertySoapResponse } from '../server/services/privatePropertyClient.js'

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    apply: false,
    propertyId: '',
    reservePrice: '',
    startPrice: '',
    startDate: '',
    endDate: '',
    active: 'true',
    showPrice: 'true',
    sameAsAddress: 'true',
    auctionVenueId: '0',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-auction-update', config, options)
  report.request = {
    propertyId: options.propertyId || null,
    reservePrice: options.reservePrice || null,
    startPrice: options.startPrice || null,
    startDate: options.startDate || null,
    endDate: options.endDate || null,
    active: options.active !== 'false',
    showPrice: options.showPrice !== 'false',
    sameAsAddress: options.sameAsAddress !== 'false',
    auctionVenueId: Number(options.auctionVenueId) || 0,
  }

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (!options.propertyId) missing.push('--property-id')
  if (!options.reservePrice) missing.push('--reserve-price')
  if (!options.startPrice) missing.push('--start-price')
  if (!options.startDate) missing.push('--start-date')
  if (!options.endDate) missing.push('--end-date')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-auction-update.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    report.status = 'DRY_RUN'
    report.nextStep = 'No Private Property auction change was made. Re-run with --apply to call ListingAuctionDetailsUpdate.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-auction-update.json')
    console.log(JSON.stringify({ status: report.status, output, request: report.request, nextStep: report.nextStep }, null, 2))
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true
  try {
    const response = await client.listingAuctionDetailsUpdate({
      branchGuid: config.branchGuid,
      uniqueListingId: options.propertyId,
      reservePrice: options.reservePrice,
      startPrice: options.startPrice,
      active: options.active !== 'false',
      startDate: options.startDate,
      endDate: options.endDate,
      showPrice: options.showPrice !== 'false',
      sameAsAddress: options.sameAsAddress !== 'false',
      auctionVenueId: options.auctionVenueId,
    })
    report.status = 'PASS'
    report.safety.listingStatusChanged = true
    report.apiResponse = {
      status: response.status,
      durationMs: response.durationMs,
      summary: response.summary,
    }
    report.nextStep = 'Run private-property:post-submit-monitor or portal checks to confirm the auction listing remains active.'
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
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse('ListingAuctionDetailsUpdate', error.responseBody) : null,
      },
    }
    report.nextStep = 'Fix the Private Property auction error, then re-run with --apply.'
    process.exitCode = 1
  }

  const output = writePrivatePropertyReport(report, options.output, 'private-property-auction-update.json')
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
