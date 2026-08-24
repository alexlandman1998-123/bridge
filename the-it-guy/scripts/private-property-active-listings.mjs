import process from 'node:process'
import {
  buildPrivatePropertyCliConfig,
  createPrivatePropertyCliClient,
  createPrivatePropertyPhase5BaseReport,
  parsePrivatePropertyActiveListings,
  parsePrivatePropertyArgs,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    propertyId: '',
    ref: '',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-phase5-active-listings', config, options)
  report.filters = {
    propertyId: options.propertyId || null,
    privatePropertyRef: options.ref || null,
  }

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-active-listings.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true
  const response = await client.getActiveListings({ branchGuid: config.branchGuid })
  const activeListings = parsePrivatePropertyActiveListings(response.data)
  const filtered = activeListings.filter((item) => {
    if (options.propertyId && item.uniqueId !== options.propertyId) return false
    if (options.ref && item.privatePropertyRef !== options.ref) return false
    return true
  })
  report.status = 'FOUND'
  report.count = activeListings.length
  report.matchCount = filtered.length
  report.activeListings = filtered.length || options.propertyId || options.ref ? filtered : activeListings

  const output = writePrivatePropertyReport(report, options.output, 'private-property-active-listings.json')
  console.log(JSON.stringify({
    status: report.status,
    output,
    count: report.count,
    matchCount: report.matchCount,
    activeListings: report.activeListings,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
