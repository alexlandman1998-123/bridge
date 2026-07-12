import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  aggregateLaunchReports,
  buildLaunchMonitorArgs,
  buildRolloutDecision,
  parseArgs,
  resolveConfig,
} from './lead-pilot-rollout-decision.mjs'

function phase5Report(overrides = {}) {
  return {
    phase: '5',
    scope: 'lead-pilot-launch-monitor',
    generatedAt: overrides.generatedAt || '2026-07-12T12:00:00.000Z',
    pilotScope: {
      explicitCohortConfigured: true,
      organisationIds: ['org-1'],
      agentUserIds: ['agent-1'],
      sources: ['Website', 'Property24'],
      ...(overrides.pilotScope || {}),
    },
    summary: {
      status: 'READY_WITH_WARNINGS',
      criticalCount: 0,
      blockedCount: 0,
      warningCount: 1,
      ...(overrides.summary || {}),
    },
    aliases: {
      activeCohortAliases: 2,
      organisations: 1,
      organisationIds: ['org-1'],
      agents: 1,
      agentUserIds: ['agent-1'],
      bySource: { Website: 1, Property24: 1 },
      ...(overrides.aliases || {}),
    },
    inbound: {
      total: 8,
      captured: 8,
      processed: 8,
      duplicate: 0,
      failed: 0,
      unmatched: 0,
      pending: 0,
      stalePending: 0,
      reviewQueue: 0,
      parserMissing: 0,
      signatureInvalid: 0,
      missingLeadLinks: 0,
      missingContactLinks: 0,
      processedRate: 1,
      ...(overrides.inbound || {}),
    },
    ingestion: {
      total: 8,
      failed: 0,
      duplicates: 0,
      needsReview: 3,
      missingLeadLinks: 0,
      assignedAgentIds: ['agent-1'],
      ...(overrides.ingestion || {}),
    },
    parseFailures: {
      open: 0,
      recent: 0,
      openOlderThanWindow: 0,
      ...(overrides.parseFailures || {}),
    },
    outbound: {
      outboundEmail: 0,
      leadPropertyShare: 0,
      failedEmail: 0,
      ...(overrides.outbound || {}),
    },
    linkedLeads: {
      total: 8,
      missingLinkedLeadRows: 0,
      wrongOrganisation: 0,
      misassignedFromAlias: 0,
      ...(overrides.linkedLeads || {}),
    },
  }
}

const parsed = parseArgs([
  '--input=phase5.json',
  '--organisation-id=org-1',
  '--agent-id=agent-1,agent-2',
  '--sources=Website,Property24',
  '--lookback-days=5',
  '--min-reports=2',
  '--min-captured=4',
  '--min-processed-rate=0.95',
  '--max-review-backlog=4',
  '--max-open-failures=1',
  '--max-agents=2',
  '--next-wave-max-agents=5',
  '--outbound-smoke-passed',
])
assert.deepEqual(parsed.inputPaths, ['phase5.json'])
assert.deepEqual(parsed.organisationIds, ['org-1'])
assert.deepEqual(parsed.agentUserIds, ['agent-1', 'agent-2'])
assert.deepEqual(parsed.sources, ['Website', 'Property24'])
assert.equal(parsed.lookbackDays, 5)
assert.equal(parsed.minReports, 2)
assert.equal(parsed.minCaptured, 4)
assert.equal(parsed.minProcessedRate, 0.95)
assert.equal(parsed.maxReviewBacklog, 4)
assert.equal(parsed.maxOpenFailures, 1)
assert.equal(parsed.maxAgents, 2)
assert.equal(parsed.nextWaveMaxAgents, 5)
assert.equal(parsed.outboundSmokePassed, true)
assert.throws(() => parseArgs(['--stdin', '--input=phase5.json']), /either --stdin or --input/)
assert.throws(() => parseArgs(['--lookback-days=8']), /--lookback-days/)

const config = resolveConfig(
  {
    LEAD_PILOT_ORGANISATION_ID: 'org-1',
    LEAD_PILOT_AGENT_EMAILS: 'pilot@arch9.co.za',
    LEAD_PILOT_SOURCES: 'Website,PrivateProperty',
    LEAD_PILOT_ROLLOUT_MIN_CAPTURED: '6',
    LEAD_PILOT_ROLLOUT_REQUIRE_OUTBOUND: 'false',
    LEAD_PILOT_ROLLOUT_OUTBOUND_SMOKE_PASSED: 'true',
  },
  parseArgs([]),
)
assert.equal(config.liveMonitor, true)
assert.deepEqual(config.organisationIds, ['org-1'])
assert.deepEqual(config.agentEmails, ['pilot@arch9.co.za'])
assert.deepEqual(config.sources, ['Website', 'Private Property'])
assert.equal(config.minCaptured, 6)
assert.equal(config.requireOutboundEvidence, false)
assert.equal(config.outboundSmokePassed, true)

assert.deepEqual(
  buildLaunchMonitorArgs({
    ...config,
    organisationIds: ['org-1'],
    agentUserIds: ['agent-1'],
    agentEmails: [],
    sources: ['Website'],
    lookbackDays: 7,
    maxAgents: 3,
    minProcessedRate: 0.9,
    maxOpenFailures: 5,
  }),
  [
    '--window-hours=168',
    '--organisation-id=org-1',
    '--agent-id=agent-1',
    '--sources=Website',
    '--max-agents=3',
    '--min-processed-rate=0.9',
    '--max-open-failures=5',
  ],
)

const approvedAggregate = aggregateLaunchReports([phase5Report({ outbound: { outboundEmail: 1, leadPropertyShare: 1, failedEmail: 0 } })])
assert.equal(approvedAggregate.reportCount, 1)
assert.equal(approvedAggregate.cohort.organisations, 1)
assert.equal(approvedAggregate.inbound.captured, 8)
assert.equal(approvedAggregate.reviewBacklog, 3)
assert.equal(approvedAggregate.outbound.outboundEmail, 1)

const approvedDecision = buildRolloutDecision(approvedAggregate, {
  minReports: 1,
  minCaptured: 5,
  minProcessedRate: 0.9,
  maxReviewBacklog: 5,
  maxOpenFailures: 5,
  maxAgents: 3,
  outboundSmokePassed: false,
  requireOutboundEvidence: true,
})
assert.equal(approvedDecision.status, 'APPROVE_WITH_CONTROLS')
assert.ok(approvedDecision.gates.some((item) => item.key === 'review_and_parse' && item.status === 'WARN'))

const smokeApprovedDecision = buildRolloutDecision(aggregateLaunchReports([phase5Report()]), {
  minReports: 1,
  minCaptured: 5,
  minProcessedRate: 0.9,
  maxReviewBacklog: 5,
  maxOpenFailures: 5,
  maxAgents: 3,
  outboundSmokePassed: true,
  requireOutboundEvidence: true,
})
assert.equal(smokeApprovedDecision.status, 'APPROVE_WITH_CONTROLS')
assert.ok(smokeApprovedDecision.gates.some((item) => item.key === 'outbound_email' && item.status === 'PASS'))

const missingOutboundDecision = buildRolloutDecision(aggregateLaunchReports([phase5Report()]), {
  minReports: 1,
  minCaptured: 5,
  minProcessedRate: 0.9,
  maxReviewBacklog: 5,
  maxOpenFailures: 5,
  maxAgents: 3,
  outboundSmokePassed: false,
  requireOutboundEvidence: true,
})
assert.equal(missingOutboundDecision.status, 'EXTEND_PILOT')
assert.ok(missingOutboundDecision.gates.some((item) => item.key === 'outbound_email' && item.status === 'BLOCKED'))

const pauseDecision = buildRolloutDecision(
  aggregateLaunchReports([
    phase5Report({
      summary: { status: 'FAILED', criticalCount: 2, blockedCount: 0, warningCount: 0 },
      aliases: { organisations: 2, agents: 6, activeCohortAliases: 0 },
      inbound: { total: 3, captured: 0, failed: 1, stalePending: 1 },
      parseFailures: { open: 8 },
      linkedLeads: { total: 0, misassignedFromAlias: 1 },
    }),
  ]),
  {
    minReports: 1,
    minCaptured: 5,
    minProcessedRate: 0.9,
    maxReviewBacklog: 5,
    maxOpenFailures: 5,
    maxAgents: 3,
    outboundSmokePassed: false,
    requireOutboundEvidence: true,
  },
)
assert.equal(pauseDecision.status, 'PAUSE_FORWARDING')
assert.ok(pauseDecision.criticalCount >= 4)

const tempInput = path.join(os.tmpdir(), `lead-pilot-phase6-${Date.now()}.json`)
fs.writeFileSync(tempInput, JSON.stringify(phase5Report(), null, 2))
const cliOutput = execFileSync(
  process.execPath,
  ['scripts/lead-pilot-rollout-decision.mjs', '--input', tempInput, '--outbound-smoke-passed'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
)
const cliReport = JSON.parse(cliOutput)
assert.equal(cliReport.phase, '6')
assert.equal(cliReport.scope, 'lead-pilot-rollout-decision')
assert.equal(cliReport.summary.status, 'APPROVE_WITH_CONTROLS')
assert.equal(cliReport.aggregate.inbound.captured, 8)

const packageJson = await fsPromises.readFile(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageJson, /test:lead-pilot-rollout-decision/)
assert.match(packageJson, /report:lead-pilot-rollout/)

const readme = await fsPromises.readFile(new URL('../README.md', import.meta.url), 'utf8')
assert.match(readme, /Lead Pilot Rollout Decision/)
assert.match(readme, /report:lead-pilot-rollout/)

const envExample = await fsPromises.readFile(new URL('../.env.example', import.meta.url), 'utf8')
assert.match(envExample, /LEAD_PILOT_ROLLOUT_MIN_CAPTURED=/)
assert.match(envExample, /LEAD_PILOT_ROLLOUT_REQUIRE_OUTBOUND=/)
assert.match(envExample, /LEAD_PILOT_ROLLOUT_NEXT_WAVE_MAX_AGENTS=/)

console.log('lead pilot rollout decision contract tests passed')
