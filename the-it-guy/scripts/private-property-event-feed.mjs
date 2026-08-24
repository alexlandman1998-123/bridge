import process from 'node:process'
import {
  buildPrivatePropertyCliConfig,
  createPrivatePropertyCliClient,
  createPrivatePropertyPhase5BaseReport,
  parsePrivatePropertyArgs,
  parsePrivatePropertyListingEvents,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    propertyId: '',
    continuationKey: '0',
    startDateTime: '',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-phase5-event-feed', config, options)
  report.criteria = {
    propertyId: options.propertyId || null,
    continuationKey: options.continuationKey || '0',
    startDateTime: options.startDateTime || null,
  }

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-event-feed.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true
  const response = await client.getListingEventFeedByBranch({
    branchGuid: config.branchGuid,
    continuationKey: options.continuationKey || '0',
    startDateTime: options.startDateTime,
  })
  const events = parsePrivatePropertyListingEvents(response.data)
  const filteredEvents = options.propertyId
    ? events.filter((event) => event.propertyId === options.propertyId || event.eventDescription.includes(options.propertyId))
    : events
  report.status = 'FOUND'
  report.continuationKey = response.summary?.continuationKey || ''
  report.eventCount = events.length
  report.matchCount = filteredEvents.length
  report.events = filteredEvents
  report.nextStep = report.continuationKey
    ? `Use --continuation-key=${report.continuationKey} on the next poll.`
    : 'No continuation key returned.'

  const output = writePrivatePropertyReport(report, options.output, 'private-property-event-feed.json')
  console.log(JSON.stringify({
    status: report.status,
    output,
    eventCount: report.eventCount,
    matchCount: report.matchCount,
    continuationKey: report.continuationKey,
    events: report.events,
    nextStep: report.nextStep,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
