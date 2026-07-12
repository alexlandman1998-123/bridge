import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  buildLaunchDecision,
  countBy,
  makeAliasContext,
  normalizeSource,
  parseArgs,
  resolveConfig,
  rowMatchesCohort,
  sourceOrgRowMatchesCohort,
  summarizeInboundRows,
  summarizeIngestionLogs,
  summarizeOutboundEvents,
  summarizeParseFailures,
} from './lead-pilot-launch-monitor.mjs'

assert.equal(normalizeSource('Website'), 'Website')
assert.equal(normalizeSource('property 24'), 'Property24')
assert.equal(normalizeSource('PrivateProperty'), 'Private Property')
assert.equal(normalizeSource('fb'), 'Facebook')

const parsed = parseArgs([
  '--organisation-id=org-1,org-2',
  '--agent-id=agent-1',
  '--agent-email=pilot@arch9.co.za',
  '--sources=Website,Property24',
  '--window-hours=12',
  '--max-agents=2',
  '--min-processed-rate=0.75',
  '--max-open-failures=1',
  '--pending-max-age-minutes=15',
  '--allow-empty',
])
assert.deepEqual(parsed.organisationIds, ['org-1', 'org-2'])
assert.deepEqual(parsed.sources, ['Website', 'Property24'])
assert.equal(parsed.windowHours, 12)
assert.equal(parsed.maxAgents, 2)
assert.equal(parsed.minProcessedRate, 0.75)
assert.equal(parsed.maxOpenFailures, 1)
assert.equal(parsed.pendingMaxAgeMinutes, 15)
assert.equal(parsed.allowEmpty, true)
assert.throws(() => parseArgs(['--window-hours=0']), /--window-hours/)
assert.throws(() => parseArgs(['--min-processed-rate=1.5']), /--min-processed-rate/)

const envConfig = resolveConfig(
  {
    SUPABASE_URL: 'https://isdowlnollckzvltkasn.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    LEAD_PILOT_ORGANISATION_ID: 'org-1',
    LEAD_PILOT_AGENT_USER_IDS: 'agent-1,agent-2',
    LEAD_PILOT_SOURCES: 'Website,PrivateProperty',
    LEAD_PILOT_WINDOW_HOURS: '48',
    LEAD_PILOT_MAX_AGENTS: '3',
    LEAD_PILOT_MIN_PROCESSED_RATE: '0.9',
  },
  parseArgs([]),
)
assert.equal(envConfig.projectRef, 'isdowlnollckzvltkasn')
assert.deepEqual(envConfig.organisationIds, ['org-1'])
assert.deepEqual(envConfig.agentUserIds, ['agent-1', 'agent-2'])
assert.deepEqual(envConfig.sources, ['Website', 'Private Property'])
assert.equal(envConfig.windowHours, 48)
assert.equal(envConfig.minProcessedRate, 0.9)
assert.equal(envConfig.explicitCohortConfigured, true)

const aliasContext = makeAliasContext([
  {
    alias_id: 'alias-website',
    organisation_id: 'org-1',
    agent_user_id: 'agent-1',
    source: 'Website',
    email_address: 'website@leads.arch9.co.za',
    status: 'active',
  },
  {
    alias_id: 'alias-paused',
    organisation_id: 'org-1',
    agent_user_id: 'agent-1',
    source: 'Property24',
    email_address: 'paused@leads.arch9.co.za',
    status: 'paused',
  },
])
assert.equal(rowMatchesCohort({ capture_alias_id: 'alias-website' }, envConfig, aliasContext), true)
assert.equal(rowMatchesCohort({ to_addresses: ['website@leads.arch9.co.za'] }, envConfig, aliasContext), true)
assert.equal(rowMatchesCohort({ organisation_id: 'org-1', source: 'Website' }, envConfig, aliasContext), true)
assert.equal(rowMatchesCohort({ organisation_id: 'org-2', source: 'Website' }, envConfig, aliasContext), false)
assert.equal(sourceOrgRowMatchesCohort({ organisation_id: 'org-1', source: 'Private Property' }, envConfig, aliasContext), true)
assert.equal(sourceOrgRowMatchesCohort({ organisation_id: 'org-1', source: 'Facebook' }, envConfig, aliasContext), false)

const agentOnlyConfig = resolveConfig(
  {
    SUPABASE_URL: 'https://isdowlnollckzvltkasn.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    LEAD_PILOT_AGENT_USER_IDS: 'agent-1',
    LEAD_PILOT_SOURCES: 'Website',
  },
  parseArgs([]),
)
assert.equal(rowMatchesCohort({ organisation_id: 'org-1', source: 'Website' }, agentOnlyConfig, aliasContext), true)
assert.equal(rowMatchesCohort({ organisation_id: 'org-2', source: 'Website' }, agentOnlyConfig, aliasContext), false)

const now = Date.parse('2026-07-12T12:00:00.000Z')
const inboundMetrics = summarizeInboundRows(
  [
    {
      status: 'processed',
      source: 'Website',
      lead_id: 'lead-1',
      contact_id: 'contact-1',
      parser_name: 'website_email',
      provider: 'mailgun',
      webhook_signature_status: 'shared_secret_valid',
      received_at: '2026-07-12T11:59:00.000Z',
    },
    {
      status: 'duplicate',
      source: 'Website',
      lead_id: 'lead-1',
      contact_id: 'contact-1',
      parser_name: 'website_email',
      provider: 'mailgun',
      webhook_signature_status: 'shared_secret_valid',
      received_at: '2026-07-12T11:58:00.000Z',
    },
    {
      status: 'parsed',
      source: 'Property24',
      provider: 'mailgun',
      received_at: '2026-07-12T11:40:00.000Z',
    },
  ],
  now,
  { pendingMaxAgeMinutes: 10 },
)
assert.equal(inboundMetrics.total, 3)
assert.equal(inboundMetrics.captured, 2)
assert.equal(Math.round(inboundMetrics.processedRate * 100), 67)
assert.equal(inboundMetrics.stalePending, 1)
assert.deepEqual(inboundMetrics.leadIds, ['lead-1'])

const parseFailureMetrics = summarizeParseFailures(
  [
    { failure_id: 'failure-1', status: 'open', reason: 'unmatched_alias', created_at: '2026-07-12T09:00:00.000Z', source: 'Website' },
    { failure_id: 'failure-2', status: 'resolved', reason: 'low_confidence', created_at: '2026-07-12T10:00:00.000Z', source: 'Website' },
  ],
  { window: { since: '2026-07-12T00:00:00.000Z' } },
)
assert.equal(parseFailureMetrics.open, 1)
assert.equal(parseFailureMetrics.recent, 2)
assert.equal(parseFailureMetrics.byReason.unmatched_alias, 1)

const ingestionMetrics = summarizeIngestionLogs([
  { status: 'processed', source: 'Website', lead_id: 'lead-1', assigned_agent_id: 'agent-1' },
  { status: 'duplicate', source: 'Website', lead_id: 'lead-1', duplicate_of_log_id: 'log-1' },
  { status: 'processed', review_status: 'needs_review', source: 'Property24', lead_id: 'lead-2' },
])
assert.equal(ingestionMetrics.total, 3)
assert.equal(ingestionMetrics.duplicates, 1)
assert.equal(ingestionMetrics.needsReview, 1)
assert.deepEqual(ingestionMetrics.createdLeadIds, ['lead-1', 'lead-2'])

const outboundMetrics = summarizeOutboundEvents([
  { communication_type: 'email', direction: 'outbound', status: 'sent', source: 'lead_property_share' },
  { communication_type: 'call', direction: 'outbound', status: 'logged', source: 'manual' },
  { communication_type: 'email', direction: 'outbound', status: 'failed', source: 'communication_delivery' },
])
assert.equal(outboundMetrics.totalOutbound, 3)
assert.equal(outboundMetrics.outboundEmail, 2)
assert.equal(outboundMetrics.leadPropertyShare, 1)
assert.equal(outboundMetrics.failedEmail, 1)

assert.deepEqual(countBy([{ status: 'processed' }, { status: 'processed' }, { status: 'failed' }], 'status'), {
  processed: 2,
  failed: 1,
})

assert.equal(
  buildLaunchDecision({
    organisations: 1,
    agents: 2,
    activeAliases: 4,
    inboundTotal: 2,
    captured: 2,
    processedRate: 1,
    openFailures: 0,
    misassigned: 0,
    failedOutbound: 0,
  }).status,
  'READY',
)

assert.equal(
  buildLaunchDecision(
    {
      organisations: 1,
      agents: 2,
      activeAliases: 4,
      inboundTotal: 0,
      captured: 0,
      processedRate: null,
      openFailures: 0,
      misassigned: 0,
      failedOutbound: 0,
    },
    { allowEmpty: false },
  ).status,
  'READY_WITH_WARNINGS',
)

const failedDecision = buildLaunchDecision(
  {
    organisations: 2,
    agents: 4,
    activeAliases: 0,
    inboundTotal: 3,
    captured: 0,
    processedRate: 0,
    stalePending: 1,
    openFailures: 6,
    misassigned: 1,
    failedOutbound: 1,
  },
  { maxAgents: 3, maxOpenFailures: 5 },
)
assert.equal(failedDecision.status, 'FAILED')
assert.ok(failedDecision.criticalCount >= 6)

const packageJson = await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageJson, /test:lead-pilot-launch-monitor/)
assert.match(packageJson, /report:lead-pilot-launch/)

const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8')
assert.match(readme, /Lead Pilot Launch Monitor/)
assert.match(readme, /report:lead-pilot-launch/)

const envExample = await fs.readFile(new URL('../.env.example', import.meta.url), 'utf8')
assert.match(envExample, /LEAD_PILOT_ORGANISATION_ID=/)
assert.match(envExample, /LEAD_PILOT_AGENT_EMAILS=/)
assert.match(envExample, /LEAD_PILOT_SOURCES=/)

console.log('lead pilot launch monitor contract tests passed')
