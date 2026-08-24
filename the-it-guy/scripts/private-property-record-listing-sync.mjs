import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  appRoot,
  buildPrivatePropertyCliConfig,
  loadPrivatePropertyEnv,
  parsePrivatePropertyArgs,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'
import {
  recordPrivatePropertyListingSync,
  resolvePrivatePropertyExternalStatus,
} from '../server/services/privatePropertyListingSyncService.js'

function readReport(input) {
  const filePath = normalizePrivatePropertyText(input)
  if (!filePath || !fs.existsSync(filePath)) return {}
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizePrivatePropertyText(value)
    if (text) return text
  }
  return ''
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value
  }
  return []
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  }
  return {}
}

function buildRecordInput(options, reports, config) {
  const publish = reports.publish || {}
  const status = reports.status || {}
  const eventFeed = reports.eventFeed || {}
  const event = firstObject(eventFeed.events?.[0])
  const publishSummary = firstObject(publish.summary)
  const statusSummary = firstObject(status.summary)
  const privatePropertyStatus = firstText(options.privatePropertyStatus, statusSummary.privatePropertyStatus, status.privatePropertyStatus)
  const eventType = firstText(options.eventType, event.listingFeedEventType, event.eventType)
  const eventStatus = firstText(options.eventStatus, event.eventStatus)
  const externalStatus = firstText(options.externalStatus) || resolvePrivatePropertyExternalStatus({
    privatePropertyStatus,
    eventType,
    eventStatus,
    fallback: publish.status === 'SUBMITTED' ? 'submitted' : 'unknown',
  })

  return {
    listingId: firstText(options.listingId, publish.syncCandidate?.listingId),
    propertyId: firstText(options.propertyId, statusSummary.propertyId, status.propertyId, event.propertyId, publishSummary.propertyId, publish.syncCandidate?.propertyId),
    branchGuid: firstText(options.branchGuid, config.branchGuid, status.branchGuid, eventFeed.branchGuid, publish.branchGuid, publish.syncCandidate?.branchGuid, publishSummary.branchId),
    environment: firstText(options.environment, config.environment, status.environment, eventFeed.environment, publish.environment, publish.syncCandidate?.environment, 'sandbox'),
    listingType: firstText(options.listingType, statusSummary.listingType, status.listingType, publishSummary.listingType, 'Sale'),
    privatePropertyRef: firstText(options.privatePropertyRef, statusSummary.privatePropertyRef, status.privatePropertyRef, event.privatePropertyRef, publish.syncCandidate?.privatePropertyReference),
    privatePropertyStatus,
    externalStatus,
    isOnPortal: options.isOnPortal ? options.isOnPortal === 'true' : Boolean(statusSummary.active || status.activeListing || externalStatus === 'active'),
    eventType,
    eventStatus,
    eventDescription: firstText(options.eventDescription, event.eventDescription),
    eventAt: firstText(options.eventAt, event.eventDate),
    continuationKey: firstText(options.continuationKey, eventFeed.continuationKey),
    suburbId: firstText(options.suburbId, publishSummary.suburbId),
    agentIds: firstArray(
      String(options.agentIds || '').split(',').map(normalizePrivatePropertyText).filter(Boolean),
      publishSummary.agentIds,
      publish.syncCandidate?.agentIds,
    ),
    responseSummary: firstObject(publish.apiResponse?.summary, statusSummary),
    payloadSummary: publishSummary,
    eventSummary: event,
    submittedAt: firstText(options.submittedAt, publish.syncCandidate?.lastSubmittedAt, publish.generatedAt),
    activatedAt: firstText(options.activatedAt, event.eventDate),
    privatePropertyListingUrl: firstText(options.privatePropertyListingUrl),
    lastError: firstText(options.lastError, publish.apiResponse?.error?.message),
  }
}

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    publishInput: path.join(appRoot, 'outputs', 'private-property-publish-listing.json'),
    statusInput: path.join(appRoot, 'outputs', 'private-property-listing-status.json'),
    eventInput: path.join(appRoot, 'outputs', 'private-property-event-feed.json'),
    listingId: '',
    propertyId: '',
    branchGuid: '',
    environment: '',
    listingType: '',
    privatePropertyRef: '',
    privatePropertyStatus: '',
    externalStatus: '',
    isOnPortal: '',
    eventType: '',
    eventStatus: '',
    eventDescription: '',
    eventAt: '',
    continuationKey: '',
    suburbId: '',
    agentIds: '',
    submittedAt: '',
    activatedAt: '',
    privatePropertyListingUrl: '',
    lastError: '',
    output: '',
  })
  const env = loadPrivatePropertyEnv()
  const config = buildPrivatePropertyCliConfig(options, { requireCredentials: false })
  const reports = {
    publish: readReport(options.publishInput),
    status: readReport(options.statusInput),
    eventFeed: readReport(options.eventInput),
  }
  const recordInput = buildRecordInput(options, reports, config)
  const supabaseUrl = firstText(env.SUPABASE_URL, env.VITE_SUPABASE_URL)
  const serviceRoleKey = firstText(env.SUPABASE_SERVICE_ROLE_KEY)

  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!recordInput.listingId) missing.push('--listing-id')
  if (!recordInput.propertyId) missing.push('--property-id or status/event/publish report propertyId')
  if (!recordInput.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')

  if (missing.length) {
    const report = {
      phase: 'private-property-phase6-record-listing-sync',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED',
      safety: {
        privatePropertyApiCalled: false,
        databaseWritten: false,
      },
      missingConfiguration: missing,
      resolvedInput: {
        listingId: recordInput.listingId || null,
        propertyId: recordInput.propertyId || null,
        branchGuid: recordInput.branchGuid || null,
      },
    }
    const output = writePrivatePropertyReport(report, options.output, 'private-property-record-listing-sync.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing, resolvedInput: report.resolvedInput }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await recordPrivatePropertyListingSync({
    client,
    ...recordInput,
  })

  const report = {
    phase: 'private-property-phase6-record-listing-sync',
    generatedAt: new Date().toISOString(),
    status: result.listingUpdateWarning || result.externalLinkWarning ? 'RECORDED_WITH_WARNINGS' : 'RECORDED',
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: true,
    },
    databaseWrite: {
      table: 'private_property_listing_syncs',
      privateListingId: result.sync.private_listing_id,
      propertyId: result.sync.property_id,
      privatePropertyRef: result.sync.private_property_ref,
      privatePropertyStatus: result.listing?.private_property_status || result.arch9Status,
      externalStatus: result.sync.external_status,
      lastEventType: result.sync.last_event_type,
      continuationKey: result.sync.continuation_key,
      ...(result.listingUpdateWarning ? { listingUpdateWarning: result.listingUpdateWarning } : {}),
      ...(result.externalLinkWarning ? { externalLinkWarning: result.externalLinkWarning } : {}),
    },
  }
  const output = writePrivatePropertyReport(report, options.output, 'private-property-record-listing-sync.json')
  console.log(JSON.stringify({ status: report.status, output, databaseWrite: report.databaseWrite }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  }, null, 2))
  process.exitCode = 1
})
