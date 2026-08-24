import process from 'node:process'
import {
  buildPrivatePropertyCliConfig,
  createPrivatePropertyCliClient,
  createPrivatePropertyPhase5BaseReport,
  parsePrivatePropertyActiveListings,
  parsePrivatePropertyArgs,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'
import { extractPrivatePropertyXmlTag } from '../server/services/privatePropertyClient.js'

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    propertyId: '',
    listingType: 'Sale',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-phase5-listing-status', config, options)
  report.propertyId = options.propertyId || null
  report.listingType = options.listingType || 'Sale'

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (!options.propertyId) missing.push('--property-id')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-listing-status.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true
  const [statusResponse, verboseResponse, referenceResponse, activeResponse] = await Promise.all([
    client.getListingStatus({ branchGuid: config.branchGuid, propertyId: options.propertyId }),
    client.getListingStatusVerbose({ branchGuid: config.branchGuid, propertyId: options.propertyId }),
    client.getReferenceNumberByListing({ branchGuid: config.branchGuid, uniqueListingId: options.propertyId, listingType: options.listingType }),
    client.getActiveListings({ branchGuid: config.branchGuid }),
  ])
  const activeListings = parsePrivatePropertyActiveListings(activeResponse.data)
  const activeMatch = activeListings.find((item) => item.uniqueId === options.propertyId)
  report.status = 'FOUND'
  report.privatePropertyStatus = extractPrivatePropertyXmlTag(statusResponse.data, 'GetListingStatusResult')
  report.privatePropertyStatusVerbose = extractPrivatePropertyXmlTag(verboseResponse.data, 'GetListingStatusVerboseResult')
  report.privatePropertyRef = extractPrivatePropertyXmlTag(referenceResponse.data, 'GetReferenceNumberByListingResult')
  report.activeListing = activeMatch || null
  report.summary = {
    propertyId: options.propertyId,
    listingType: options.listingType,
    privatePropertyStatus: report.privatePropertyStatus,
    privatePropertyStatusVerbose: report.privatePropertyStatusVerbose,
    privatePropertyRef: report.privatePropertyRef,
    active: Boolean(activeMatch),
  }
  report.nextStep = activeMatch
    ? 'Listing is present in Private Property active listings.'
    : 'If the status is inactive, run private-property:status-update with --apply when you intentionally want to activate it.'

  const output = writePrivatePropertyReport(report, options.output, 'private-property-listing-status.json')
  console.log(JSON.stringify({ status: report.status, output, summary: report.summary, nextStep: report.nextStep }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
