import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  normalizeSource,
  parseArgs as parseLaunchMonitorArgs,
  run as runLaunchMonitor,
} from './lead-pilot-launch-monitor.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const ENV_FILE = `${appRoot}/.env.staging.local`
const DEFAULT_LOOKBACK_DAYS = 7
const DEFAULT_MIN_REPORTS = 1
const DEFAULT_MIN_CAPTURED = 5
const DEFAULT_MIN_PROCESSED_RATE = 0.9
const DEFAULT_MAX_REVIEW_BACKLOG = 5
const DEFAULT_MAX_OPEN_FAILURES = 5
const DEFAULT_MAX_AGENTS = 3
const DEFAULT_NEXT_WAVE_MAX_AGENTS = 6
const DEFAULT_REQUIRE_OUTBOUND_EVIDENCE = true

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function unique(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
}

function uniqueLower(values) {
  return [...new Set(values.map((value) => normalizeLower(value)).filter(Boolean))]
}

function parseCsv(value = '') {
  return unique(String(value || '').split(','))
}

function parseSourceCsv(value = '') {
  return unique(parseCsv(value).map((source) => normalizeSource(source)).filter(Boolean))
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalizeLower(value))
}

function parseIntegerOption(name, value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
  return parsed
}

function parseNumberOption(name, value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a number from ${min} to ${max}`)
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    inputPaths: [],
    fromStdin: false,
    liveMonitor: false,
    outboundSmokePassed: false,
    requireOutboundEvidence: null,
    organisationIds: [],
    agentUserIds: [],
    agentEmails: [],
    sources: [],
    lookbackDays: null,
    minReports: null,
    minCaptured: null,
    minProcessedRate: null,
    maxReviewBacklog: null,
    maxOpenFailures: null,
    maxAgents: null,
    nextWaveMaxAgents: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = (prefix) => {
      if (arg.includes('=')) return arg.slice(prefix.length)
      index += 1
      return argv[index] || ''
    }

    if (arg === '--stdin') {
      options.fromStdin = true
    } else if (arg === '--live-monitor') {
      options.liveMonitor = true
    } else if (arg === '--outbound-smoke-passed') {
      options.outboundSmokePassed = true
    } else if (arg === '--require-outbound') {
      options.requireOutboundEvidence = true
    } else if (arg === '--allow-missing-outbound') {
      options.requireOutboundEvidence = false
    } else if (arg === '--input' || arg.startsWith('--input=')) {
      options.inputPaths = unique([...options.inputPaths, ...parseCsv(readValue('--input='))])
    } else if (arg === '--organisation-id' || arg === '--organisation' || arg === '--org' || arg.startsWith('--organisation-id=') || arg.startsWith('--organisation=') || arg.startsWith('--org=')) {
      const value = readValue(arg.startsWith('--organisation-id') ? '--organisation-id=' : arg.startsWith('--organisation') ? '--organisation=' : '--org=')
      options.organisationIds = unique([...options.organisationIds, ...parseCsv(value)])
    } else if (arg === '--agent-id' || arg === '--agent' || arg.startsWith('--agent-id=') || arg.startsWith('--agent=')) {
      const value = readValue(arg.startsWith('--agent-id') ? '--agent-id=' : '--agent=')
      options.agentUserIds = unique([...options.agentUserIds, ...parseCsv(value)])
    } else if (arg === '--agent-email' || arg.startsWith('--agent-email=')) {
      options.agentEmails = uniqueLower([...options.agentEmails, ...parseCsv(readValue('--agent-email='))])
    } else if (arg === '--source' || arg === '--sources' || arg.startsWith('--source=') || arg.startsWith('--sources=')) {
      const value = readValue(arg.startsWith('--sources') ? '--sources=' : '--source=')
      options.sources = unique([...options.sources, ...parseSourceCsv(value)])
    } else if (arg === '--lookback-days' || arg.startsWith('--lookback-days=')) {
      options.lookbackDays = parseIntegerOption('--lookback-days', readValue('--lookback-days='), { min: 1, max: 7 })
    } else if (arg === '--min-reports' || arg.startsWith('--min-reports=')) {
      options.minReports = parseIntegerOption('--min-reports', readValue('--min-reports='), { min: 1, max: 14 })
    } else if (arg === '--min-captured' || arg.startsWith('--min-captured=')) {
      options.minCaptured = parseIntegerOption('--min-captured', readValue('--min-captured='), { min: 0, max: 1000 })
    } else if (arg === '--min-processed-rate' || arg.startsWith('--min-processed-rate=')) {
      options.minProcessedRate = parseNumberOption('--min-processed-rate', readValue('--min-processed-rate='), { min: 0, max: 1 })
    } else if (arg === '--max-review-backlog' || arg.startsWith('--max-review-backlog=')) {
      options.maxReviewBacklog = parseIntegerOption('--max-review-backlog', readValue('--max-review-backlog='), { min: 0, max: 500 })
    } else if (arg === '--max-open-failures' || arg.startsWith('--max-open-failures=')) {
      options.maxOpenFailures = parseIntegerOption('--max-open-failures', readValue('--max-open-failures='), { min: 0, max: 500 })
    } else if (arg === '--max-agents' || arg.startsWith('--max-agents=')) {
      options.maxAgents = parseIntegerOption('--max-agents', readValue('--max-agents='), { min: 1, max: 25 })
    } else if (arg === '--next-wave-max-agents' || arg.startsWith('--next-wave-max-agents=')) {
      options.nextWaveMaxAgents = parseIntegerOption('--next-wave-max-agents', readValue('--next-wave-max-agents='), { min: 1, max: 100 })
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (options.fromStdin && options.inputPaths.length) {
    throw new Error('Use either --stdin or --input, not both.')
  }

  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const localEnv = parseEnvFile(`${appRoot}/.env`)
  const stagingEnv = parseEnvFile(ENV_FILE)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  return { ...localEnv, ...stagingEnv, ...processOverrides }
}

function resolveNumber(envValue, optionValue, fallback, parser) {
  if (optionValue !== null && optionValue !== undefined) return optionValue
  if (normalizeText(envValue)) return parser(envValue)
  return fallback
}

function resolveBoolean(envValue, optionValue, fallback) {
  if (optionValue !== null && optionValue !== undefined) return optionValue
  if (normalizeText(envValue)) return parseBoolean(envValue)
  return fallback
}

function resolveConfig(env, options) {
  const organisationIds = options.organisationIds.length
    ? options.organisationIds
    : parseCsv(env.LEAD_PILOT_ORGANISATION_IDS || env.LEAD_PILOT_ORGANISATION_ID)
  const agentUserIds = options.agentUserIds.length
    ? options.agentUserIds
    : parseCsv(env.LEAD_PILOT_AGENT_USER_IDS || env.LEAD_PILOT_AGENT_USER_ID)
  const agentEmails = options.agentEmails.length
    ? options.agentEmails
    : uniqueLower(parseCsv(env.LEAD_PILOT_AGENT_EMAILS || env.LEAD_PILOT_AGENT_EMAIL))
  const sources = options.sources.length
    ? options.sources
    : parseSourceCsv(env.LEAD_PILOT_SOURCES)

  return {
    inputPaths: options.inputPaths,
    fromStdin: options.fromStdin,
    liveMonitor: options.liveMonitor || (!options.inputPaths.length && !options.fromStdin),
    outboundSmokePassed: options.outboundSmokePassed || parseBoolean(env.LEAD_PILOT_ROLLOUT_OUTBOUND_SMOKE_PASSED),
    requireOutboundEvidence: resolveBoolean(
      env.LEAD_PILOT_ROLLOUT_REQUIRE_OUTBOUND,
      options.requireOutboundEvidence,
      DEFAULT_REQUIRE_OUTBOUND_EVIDENCE,
    ),
    organisationIds: unique(organisationIds),
    agentUserIds: unique(agentUserIds),
    agentEmails,
    sources: unique(sources),
    lookbackDays: resolveNumber(env.LEAD_PILOT_ROLLOUT_LOOKBACK_DAYS, options.lookbackDays, DEFAULT_LOOKBACK_DAYS, (value) =>
      parseIntegerOption('LEAD_PILOT_ROLLOUT_LOOKBACK_DAYS', value, { min: 1, max: 7 }),
    ),
    minReports: resolveNumber(env.LEAD_PILOT_ROLLOUT_MIN_REPORTS, options.minReports, DEFAULT_MIN_REPORTS, (value) =>
      parseIntegerOption('LEAD_PILOT_ROLLOUT_MIN_REPORTS', value, { min: 1, max: 14 }),
    ),
    minCaptured: resolveNumber(env.LEAD_PILOT_ROLLOUT_MIN_CAPTURED, options.minCaptured, DEFAULT_MIN_CAPTURED, (value) =>
      parseIntegerOption('LEAD_PILOT_ROLLOUT_MIN_CAPTURED', value, { min: 0, max: 1000 }),
    ),
    minProcessedRate: resolveNumber(env.LEAD_PILOT_ROLLOUT_MIN_PROCESSED_RATE, options.minProcessedRate, DEFAULT_MIN_PROCESSED_RATE, (value) =>
      parseNumberOption('LEAD_PILOT_ROLLOUT_MIN_PROCESSED_RATE', value, { min: 0, max: 1 }),
    ),
    maxReviewBacklog: resolveNumber(env.LEAD_PILOT_ROLLOUT_MAX_REVIEW_BACKLOG, options.maxReviewBacklog, DEFAULT_MAX_REVIEW_BACKLOG, (value) =>
      parseIntegerOption('LEAD_PILOT_ROLLOUT_MAX_REVIEW_BACKLOG', value, { min: 0, max: 500 }),
    ),
    maxOpenFailures: resolveNumber(env.LEAD_PILOT_MAX_OPEN_FAILURES, options.maxOpenFailures, DEFAULT_MAX_OPEN_FAILURES, (value) =>
      parseIntegerOption('LEAD_PILOT_MAX_OPEN_FAILURES', value, { min: 0, max: 500 }),
    ),
    maxAgents: resolveNumber(env.LEAD_PILOT_MAX_AGENTS, options.maxAgents, DEFAULT_MAX_AGENTS, (value) =>
      parseIntegerOption('LEAD_PILOT_MAX_AGENTS', value, { min: 1, max: 25 }),
    ),
    nextWaveMaxAgents: resolveNumber(env.LEAD_PILOT_ROLLOUT_NEXT_WAVE_MAX_AGENTS, options.nextWaveMaxAgents, DEFAULT_NEXT_WAVE_MAX_AGENTS, (value) =>
      parseIntegerOption('LEAD_PILOT_ROLLOUT_NEXT_WAVE_MAX_AGENTS', value, { min: 1, max: 100 }),
    ),
  }
}

function readJsonPayload(text, source) {
  const parsed = JSON.parse(text)
  const reports = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.reports) ? parsed.reports : [parsed]
  return reports.map((report) => ({ ...report, inputSource: report.inputSource || source }))
}

function readInputReports(config) {
  const reports = []
  if (config.fromStdin) {
    reports.push(...readJsonPayload(fs.readFileSync(0, 'utf8'), 'stdin'))
  }
  for (const inputPath of config.inputPaths) {
    reports.push(...readJsonPayload(fs.readFileSync(inputPath, 'utf8'), inputPath))
  }
  return reports
}

function buildLaunchMonitorArgs(config) {
  const args = [`--window-hours=${Math.min(168, config.lookbackDays * 24)}`]
  if (config.organisationIds.length) args.push(`--organisation-id=${config.organisationIds.join(',')}`)
  if (config.agentUserIds.length) args.push(`--agent-id=${config.agentUserIds.join(',')}`)
  if (config.agentEmails.length) args.push(`--agent-email=${config.agentEmails.join(',')}`)
  if (config.sources.length) args.push(`--sources=${config.sources.join(',')}`)
  args.push(`--max-agents=${config.maxAgents}`)
  args.push(`--min-processed-rate=${config.minProcessedRate}`)
  args.push(`--max-open-failures=${config.maxOpenFailures}`)
  return args
}

async function collectReports(config) {
  const reports = readInputReports(config)
  if (config.liveMonitor) {
    const monitorArgs = parseLaunchMonitorArgs(buildLaunchMonitorArgs(config))
    reports.push(await runLaunchMonitor(monitorArgs))
  }
  return reports
}

function getNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function sum(reports, selector) {
  return reports.reduce((total, report) => total + getNumber(selector(report)), 0)
}

function max(reports, selector) {
  return reports.reduce((largest, report) => Math.max(largest, getNumber(selector(report))), 0)
}

function union(reports, selector) {
  return unique(reports.flatMap((report) => selector(report) || []))
}

function countBy(reports, selector) {
  return reports.reduce((counts, report) => {
    const key = normalizeText(selector(report)) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function sortReports(reports) {
  return [...reports].sort((a, b) => Date.parse(a.generatedAt || 0) - Date.parse(b.generatedAt || 0))
}

function aggregateLaunchReports(reports) {
  const sorted = sortReports(reports)
  const latest = sorted.at(-1) || {}
  const inboundTotal = sum(sorted, (report) => report.inbound?.total)
  const captured = sum(sorted, (report) => report.inbound?.captured)
  const reviewBacklog = sum(sorted, (report) => report.inbound?.reviewQueue) + sum(sorted, (report) => report.ingestion?.needsReview)
  const linkedLeadIssues =
    sum(sorted, (report) => report.linkedLeads?.missingLinkedLeadRows) +
    sum(sorted, (report) => report.linkedLeads?.wrongOrganisation) +
    sum(sorted, (report) => report.linkedLeads?.misassignedFromAlias)

  return {
    reportCount: sorted.length,
    firstGeneratedAt: sorted[0]?.generatedAt || null,
    lastGeneratedAt: latest.generatedAt || null,
    inputSources: union(sorted, (report) => [report.inputSource].filter(Boolean)),
    monitorStatuses: countBy(sorted, (report) => report.summary?.status),
    summaryCriticalCount: sum(sorted, (report) => report.summary?.criticalCount),
    summaryBlockedCount: sum(sorted, (report) => report.summary?.blockedCount),
    summaryWarningCount: sum(sorted, (report) => report.summary?.warningCount),
    cohort: {
      explicit: Boolean(latest.pilotScope?.explicitCohortConfigured),
      organisationIds: latest.aliases?.organisationIds || latest.pilotScope?.organisationIds || [],
      agentUserIds: latest.aliases?.agentUserIds || latest.pilotScope?.agentUserIds || [],
      sources: unique([
        ...(latest.pilotScope?.sources || []),
        ...Object.keys(latest.aliases?.bySource || {}),
        ...Object.keys(latest.inbound?.bySource || {}).filter((source) => source !== 'unknown'),
      ]),
      activeAliases: getNumber(latest.aliases?.activeCohortAliases),
      organisations: getNumber(latest.aliases?.organisations),
      agents: getNumber(latest.aliases?.agents),
    },
    inbound: {
      total: inboundTotal,
      captured,
      processed: sum(sorted, (report) => report.inbound?.processed),
      duplicate: sum(sorted, (report) => report.inbound?.duplicate),
      failed: sum(sorted, (report) => report.inbound?.failed),
      unmatched: sum(sorted, (report) => report.inbound?.unmatched),
      pending: max(sorted, (report) => report.inbound?.pending),
      stalePending: max(sorted, (report) => report.inbound?.stalePending),
      reviewQueue: sum(sorted, (report) => report.inbound?.reviewQueue),
      parserMissing: sum(sorted, (report) => report.inbound?.parserMissing),
      signatureInvalid: sum(sorted, (report) => report.inbound?.signatureInvalid),
      missingLeadLinks: sum(sorted, (report) => report.inbound?.missingLeadLinks),
      missingContactLinks: sum(sorted, (report) => report.inbound?.missingContactLinks),
      processedRate: inboundTotal > 0 ? captured / inboundTotal : null,
    },
    ingestion: {
      total: sum(sorted, (report) => report.ingestion?.total),
      failed: sum(sorted, (report) => report.ingestion?.failed),
      duplicates: sum(sorted, (report) => report.ingestion?.duplicates),
      needsReview: sum(sorted, (report) => report.ingestion?.needsReview),
      missingLeadLinks: sum(sorted, (report) => report.ingestion?.missingLeadLinks),
      assignedAgentIds: union(sorted, (report) => report.ingestion?.assignedAgentIds),
    },
    parseFailures: {
      open: max(sorted, (report) => report.parseFailures?.open),
      recent: sum(sorted, (report) => report.parseFailures?.recent),
      openOlderThanWindow: max(sorted, (report) => report.parseFailures?.openOlderThanWindow),
    },
    outbound: {
      outboundEmail: sum(sorted, (report) => report.outbound?.outboundEmail),
      leadPropertyShare: sum(sorted, (report) => report.outbound?.leadPropertyShare),
      failedEmail: sum(sorted, (report) => report.outbound?.failedEmail),
    },
    linkedLeads: {
      total: sum(sorted, (report) => report.linkedLeads?.total),
      missingLinkedLeadRows: sum(sorted, (report) => report.linkedLeads?.missingLinkedLeadRows),
      wrongOrganisation: sum(sorted, (report) => report.linkedLeads?.wrongOrganisation),
      misassignedFromAlias: sum(sorted, (report) => report.linkedLeads?.misassignedFromAlias),
      linkedLeadIssues,
    },
    reviewBacklog,
  }
}

function gate(status, key, title, detail = '', required = true) {
  return { key, status, title, detail, required }
}

function buildRolloutDecision(aggregate, config) {
  const gates = []

  gates.push(
    aggregate.reportCount >= config.minReports
      ? gate('PASS', 'monitor_coverage', 'Pilot monitoring evidence is present.', `${aggregate.reportCount}/${config.minReports} report(s).`)
      : gate('BLOCKED', 'monitor_coverage', 'Not enough pilot monitoring reports for a rollout decision.', `${aggregate.reportCount}/${config.minReports} report(s).`),
  )

  if (aggregate.summaryCriticalCount > 0 || aggregate.summaryBlockedCount > 0) {
    gates.push(
      gate(
        aggregate.summaryCriticalCount > 0 ? 'CRITICAL' : 'BLOCKED',
        'phase5_blockers',
        'Phase 5 launch monitor still has unresolved blockers.',
        `critical=${aggregate.summaryCriticalCount}; blocked=${aggregate.summaryBlockedCount}.`,
      ),
    )
  } else {
    gates.push(gate('PASS', 'phase5_blockers', 'No unresolved Phase 5 critical/blocking findings.'))
  }

  if (!aggregate.cohort.explicit) {
    gates.push(gate('CRITICAL', 'cohort_scope', 'Pilot cohort is not explicitly configured.', 'Set organisation, agent, and source scope before expansion.'))
  } else if (aggregate.cohort.organisations !== 1) {
    gates.push(gate('CRITICAL', 'cohort_scope', 'Pilot cohort must be limited to one organisation.', `${aggregate.cohort.organisations} organisation(s).`))
  } else if (aggregate.cohort.agents > config.maxAgents) {
    gates.push(gate('CRITICAL', 'cohort_scope', 'Pilot cohort exceeds the agent-count limit.', `${aggregate.cohort.agents}/${config.maxAgents} agent(s).`))
  } else if (aggregate.cohort.activeAliases <= 0) {
    gates.push(gate('CRITICAL', 'cohort_scope', 'Pilot cohort has no active lead capture aliases.'))
  } else {
    gates.push(gate('PASS', 'cohort_scope', 'Pilot cohort is scoped tightly enough for expansion review.', `${aggregate.cohort.organisations} org, ${aggregate.cohort.agents} agent(s), ${aggregate.cohort.activeAliases} alias(es).`))
  }

  if (aggregate.inbound.total <= 0) {
    gates.push(gate('BLOCKED', 'capture_volume', 'No inbound pilot leads were observed.', 'Keep the pilot running until real source forwarding creates evidence.'))
  } else if (aggregate.inbound.captured < config.minCaptured) {
    gates.push(gate('WARN', 'capture_volume', 'Captured lead volume is below the rollout threshold.', `${aggregate.inbound.captured}/${config.minCaptured} captured lead(s).`))
  } else {
    gates.push(gate('PASS', 'capture_volume', 'Captured lead volume meets the rollout threshold.', `${aggregate.inbound.captured} captured lead(s).`))
  }

  if (aggregate.inbound.stalePending > 0 || aggregate.inbound.failed > 0 || aggregate.ingestion.failed > 0) {
    gates.push(
      gate(
        'CRITICAL',
        'processing_quality',
        'Pilot lead processing has hard failures.',
        `stalePending=${aggregate.inbound.stalePending}; inboundFailed=${aggregate.inbound.failed}; ingestionFailed=${aggregate.ingestion.failed}.`,
      ),
    )
  } else if (aggregate.inbound.processedRate !== null && aggregate.inbound.processedRate < config.minProcessedRate) {
    gates.push(
      gate(
        'WARN',
        'processing_quality',
        'Pilot processed rate is below the rollout threshold.',
        `${Math.round(aggregate.inbound.processedRate * 100)}%; threshold ${Math.round(config.minProcessedRate * 100)}%.`,
      ),
    )
  } else {
    gates.push(gate('PASS', 'processing_quality', 'Pilot lead processing quality meets the rollout threshold.'))
  }

  if (aggregate.parseFailures.open > config.maxOpenFailures) {
    gates.push(gate('CRITICAL', 'review_and_parse', 'Open parse failures exceed the rollout threshold.', `${aggregate.parseFailures.open}/${config.maxOpenFailures} open failure(s).`))
  } else if (aggregate.reviewBacklog > config.maxReviewBacklog) {
    gates.push(gate('BLOCKED', 'review_and_parse', 'Review backlog is too large for rollout.', `${aggregate.reviewBacklog}/${config.maxReviewBacklog} review item(s).`))
  } else if (aggregate.reviewBacklog > 0 || aggregate.parseFailures.open > 0) {
    gates.push(gate('WARN', 'review_and_parse', 'Review queue needs operator follow-up during rollout.', `review=${aggregate.reviewBacklog}; openParseFailures=${aggregate.parseFailures.open}.`, false))
  } else {
    gates.push(gate('PASS', 'review_and_parse', 'No parse-failure or review backlog blocks rollout.'))
  }

  if (
    aggregate.linkedLeads.linkedLeadIssues > 0 ||
    aggregate.inbound.missingLeadLinks > 0 ||
    aggregate.inbound.missingContactLinks > 0 ||
    aggregate.ingestion.missingLeadLinks > 0
  ) {
    gates.push(
      gate(
        'CRITICAL',
        'assignment_integrity',
        'Linked lead/contact assignment integrity failed.',
        `linkedIssues=${aggregate.linkedLeads.linkedLeadIssues}; missingInboundLead=${aggregate.inbound.missingLeadLinks}; missingInboundContact=${aggregate.inbound.missingContactLinks}; missingLogLead=${aggregate.ingestion.missingLeadLinks}.`,
      ),
    )
  } else if (aggregate.inbound.captured > 0 && aggregate.linkedLeads.total <= 0) {
    gates.push(gate('CRITICAL', 'assignment_integrity', 'Captured leads are not readable through linked lead checks.'))
  } else {
    gates.push(gate('PASS', 'assignment_integrity', 'Captured pilot leads are linked, readable, and assigned.'))
  }

  if (aggregate.outbound.failedEmail > 0) {
    gates.push(gate('CRITICAL', 'outbound_email', 'Outbound lead email failures were observed.', `${aggregate.outbound.failedEmail} failed email event(s).`))
  } else if (aggregate.outbound.outboundEmail > 0) {
    gates.push(gate('PASS', 'outbound_email', 'Outbound lead email activity is visible in pilot telemetry.', `${aggregate.outbound.outboundEmail} email event(s).`))
  } else if (config.outboundSmokePassed) {
    gates.push(gate('PASS', 'outbound_email', 'Outbound lead email generator is covered by a recorded live smoke proof.', 'No communication-event row was required for this decision.'))
  } else if (config.requireOutboundEvidence) {
    gates.push(gate('BLOCKED', 'outbound_email', 'Outbound lead email evidence is missing.', 'Run the live outbound smoke or enable communication-event logging before expansion.'))
  } else {
    gates.push(gate('WARN', 'outbound_email', 'Outbound lead email telemetry is missing.', 'Allowed by rollout config, but keep the smoke proof in the launch packet.', false))
  }

  const criticalCount = gates.filter((item) => item.status === 'CRITICAL').length
  const blockedCount = gates.filter((item) => item.status === 'BLOCKED').length
  const warningCount = gates.filter((item) => item.status === 'WARN').length
  const status = criticalCount > 0
    ? 'PAUSE_FORWARDING'
    : blockedCount > 0
      ? 'EXTEND_PILOT'
      : warningCount > 0
        ? 'APPROVE_WITH_CONTROLS'
        : 'APPROVE_EXPANSION'

  const recommendation = status === 'PAUSE_FORWARDING'
    ? 'Pause or keep source forwarding off until critical rollout gates clear'
    : status === 'EXTEND_PILOT'
      ? 'Keep the pilot contained and collect the missing evidence before expansion'
      : status === 'APPROVE_WITH_CONTROLS'
        ? 'Approve a controlled next wave with the listed follow-up actions'
        : 'Approve the next pilot expansion wave'

  return {
    status,
    recommendation,
    criticalCount,
    blockedCount,
    warningCount,
    gates,
  }
}

function buildExpansionPlan(aggregate, decision, config) {
  const approved = ['APPROVE_EXPANSION', 'APPROVE_WITH_CONTROLS'].includes(decision.status)
  const sources = aggregate.cohort.sources.length ? aggregate.cohort.sources : config.sources
  return {
    approved,
    nextWaveMaxAgents: approved ? config.nextWaveMaxAgents : aggregate.cohort.agents,
    sources,
    prerequisites: [
      'Keep LEAD_PILOT_ORGANISATION_ID pinned to one organisation.',
      'Add no more than the approved next-wave agent count.',
      'Forward only sources that have active aliases and parser coverage.',
      'Run Phase 4 live smoke after every new forwarding-source change.',
      'Run Phase 5 monitor daily through the next wave.',
    ],
    rolloutSteps: [
      'Confirm review backlog owner and daily review time.',
      'Enable forwarding for the approved sources and agents only.',
      'Run npm run report:lead-pilot-launch after the first real lead per source.',
      'Run npm run report:lead-pilot-rollout before adding another wave.',
    ],
    rollbackTriggers: [
      'Any stale pending inbound row older than the configured threshold.',
      'Any processed inbound row missing lead/contact links.',
      'Any linked lead assigned outside the capture alias cohort.',
      'Any open parse-failure count over threshold.',
      'Any outbound lead email failure or missing outbound proof before expansion.',
    ],
  }
}

function createReport(reports, aggregate, decision, expansionPlan, config, now = new Date()) {
  return {
    phase: '6',
    scope: 'lead-pilot-rollout-decision',
    generatedAt: now.toISOString(),
    summary: {
      status: decision.status,
      recommendation: decision.recommendation,
      criticalCount: decision.criticalCount,
      blockedCount: decision.blockedCount,
      warningCount: decision.warningCount,
    },
    thresholds: {
      minReports: config.minReports,
      minCaptured: config.minCaptured,
      minProcessedRate: config.minProcessedRate,
      maxReviewBacklog: config.maxReviewBacklog,
      maxOpenFailures: config.maxOpenFailures,
      maxAgents: config.maxAgents,
      requireOutboundEvidence: config.requireOutboundEvidence,
      outboundSmokePassed: config.outboundSmokePassed,
    },
    aggregate,
    gates: decision.gates,
    expansionPlan,
    operatorCommands: [
      'npm run test:lead-pilot-launch-monitor',
      'npm run report:lead-pilot-launch',
      'npm run report:lead-pilot-rollout',
      'node scripts/lead-pilot-smoke.mjs --outbound-email --to pilot@arch9.co.za --live',
    ],
    inputReportCount: reports.length,
  }
}

async function run(options = parseArgs(process.argv.slice(2))) {
  const env = loadEnv()
  const config = resolveConfig(env, options)
  const reports = await collectReports(config)
  const aggregate = aggregateLaunchReports(reports)
  const decision = buildRolloutDecision(aggregate, config)
  const expansionPlan = buildExpansionPlan(aggregate, decision, config)
  return createReport(reports, aggregate, decision, expansionPlan, config)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await run()
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (!['APPROVE_EXPANSION', 'APPROVE_WITH_CONTROLS'].includes(report.summary.status)) {
      process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

export {
  aggregateLaunchReports,
  buildExpansionPlan,
  buildLaunchMonitorArgs,
  buildRolloutDecision,
  parseArgs,
  resolveConfig,
  run,
}
