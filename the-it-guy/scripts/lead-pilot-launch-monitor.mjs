import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const ENV_FILE = `${appRoot}/.env.staging.local`
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const LEAD_CAPTURE_DOMAIN = 'leads.arch9.co.za'
const DEFAULT_WINDOW_HOURS = 24
const DEFAULT_MAX_AGENTS = 3
const DEFAULT_MIN_PROCESSED_RATE = 0.8
const DEFAULT_MAX_OPEN_FAILURES = 5
const DEFAULT_PENDING_MAX_AGE_MINUTES = 10
const DEFAULT_QUERY_LIMIT = 5000

const SOURCE_ALIASES = new Map([
  ['general', 'General'],
  ['website', 'Website'],
  ['web', 'Website'],
  ['property24', 'Property24'],
  ['property 24', 'Property24'],
  ['p24', 'Property24'],
  ['privateproperty', 'Private Property'],
  ['private property', 'Private Property'],
  ['private-property', 'Private Property'],
  ['facebook', 'Facebook'],
  ['fb', 'Facebook'],
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeEmail(value = '') {
  return normalizeLower(value)
}

function normalizeSource(value = '') {
  const normalized = normalizeLower(value).replace(/[_]+/g, ' ')
  const compact = normalized.replace(/[^a-z0-9]+/g, '')
  return SOURCE_ALIASES.get(normalized) || SOURCE_ALIASES.get(compact) || normalizeText(value)
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
    allowEmpty: false,
    skipNetwork: false,
    organisationIds: [],
    agentUserIds: [],
    agentEmails: [],
    sources: [],
    windowHours: null,
    maxAgents: null,
    minProcessedRate: null,
    maxOpenFailures: null,
    pendingMaxAgeMinutes: null,
    queryLimit: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = (prefix) => {
      if (arg.includes('=')) return arg.slice(prefix.length)
      index += 1
      return argv[index] || ''
    }

    if (arg === '--allow-empty') {
      options.allowEmpty = true
    } else if (arg === '--skip-network') {
      options.skipNetwork = true
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
    } else if (arg === '--window-hours' || arg.startsWith('--window-hours=')) {
      options.windowHours = parseIntegerOption('--window-hours', readValue('--window-hours='), { min: 1, max: 168 })
    } else if (arg === '--max-agents' || arg.startsWith('--max-agents=')) {
      options.maxAgents = parseIntegerOption('--max-agents', readValue('--max-agents='), { min: 1, max: 25 })
    } else if (arg === '--min-processed-rate' || arg.startsWith('--min-processed-rate=')) {
      options.minProcessedRate = parseNumberOption('--min-processed-rate', readValue('--min-processed-rate='), { min: 0, max: 1 })
    } else if (arg === '--max-open-failures' || arg.startsWith('--max-open-failures=')) {
      options.maxOpenFailures = parseIntegerOption('--max-open-failures', readValue('--max-open-failures='), { min: 0, max: 100 })
    } else if (arg === '--pending-max-age-minutes' || arg.startsWith('--pending-max-age-minutes=')) {
      options.pendingMaxAgeMinutes = parseIntegerOption('--pending-max-age-minutes', readValue('--pending-max-age-minutes='), { min: 1, max: 1440 })
    } else if (arg === '--query-limit' || arg.startsWith('--query-limit=')) {
      options.queryLimit = parseIntegerOption('--query-limit', readValue('--query-limit='), { min: 100, max: 50000 })
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
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
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }

  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.SUPABASE_ANON_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.SUPABASE_ANON_KEY

  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function resolveNumber(envValue, optionValue, fallback, parser) {
  if (optionValue !== null && optionValue !== undefined) return optionValue
  if (normalizeText(envValue)) return parser(envValue)
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

  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    organisationIds: unique(organisationIds),
    agentUserIds: unique(agentUserIds),
    agentEmails,
    sources: unique(sources),
    windowHours: resolveNumber(env.LEAD_PILOT_WINDOW_HOURS, options.windowHours, DEFAULT_WINDOW_HOURS, (value) =>
      parseIntegerOption('LEAD_PILOT_WINDOW_HOURS', value, { min: 1, max: 168 }),
    ),
    maxAgents: resolveNumber(env.LEAD_PILOT_MAX_AGENTS, options.maxAgents, DEFAULT_MAX_AGENTS, (value) =>
      parseIntegerOption('LEAD_PILOT_MAX_AGENTS', value, { min: 1, max: 25 }),
    ),
    minProcessedRate: resolveNumber(env.LEAD_PILOT_MIN_PROCESSED_RATE, options.minProcessedRate, DEFAULT_MIN_PROCESSED_RATE, (value) =>
      parseNumberOption('LEAD_PILOT_MIN_PROCESSED_RATE', value, { min: 0, max: 1 }),
    ),
    maxOpenFailures: resolveNumber(env.LEAD_PILOT_MAX_OPEN_FAILURES, options.maxOpenFailures, DEFAULT_MAX_OPEN_FAILURES, (value) =>
      parseIntegerOption('LEAD_PILOT_MAX_OPEN_FAILURES', value, { min: 0, max: 100 }),
    ),
    pendingMaxAgeMinutes: resolveNumber(env.LEAD_PILOT_PENDING_MAX_AGE_MINUTES, options.pendingMaxAgeMinutes, DEFAULT_PENDING_MAX_AGE_MINUTES, (value) =>
      parseIntegerOption('LEAD_PILOT_PENDING_MAX_AGE_MINUTES', value, { min: 1, max: 1440 }),
    ),
    queryLimit: resolveNumber(env.LEAD_PILOT_QUERY_LIMIT, options.queryLimit, DEFAULT_QUERY_LIMIT, (value) =>
      parseIntegerOption('LEAD_PILOT_QUERY_LIMIT', value, { min: 100, max: 50000 }),
    ),
    allowEmpty: options.allowEmpty || parseBoolean(env.LEAD_PILOT_ALLOW_EMPTY),
    skipNetwork: options.skipNetwork,
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)
  config.explicitCohortConfigured = Boolean(
    config.organisationIds.length || config.agentUserIds.length || config.agentEmails.length || config.sources.length,
  )
  return config
}

function createReport(config, now = new Date()) {
  const until = now.toISOString()
  const since = new Date(now.getTime() - config.windowHours * 60 * 60 * 1000).toISOString()
  return {
    phase: '5',
    scope: 'lead-pilot-launch-monitor',
    generatedAt: until,
    targetProjectRef: STAGING_PROJECT_REF,
    window: {
      since,
      until,
      hours: config.windowHours,
    },
    pilotScope: {
      domain: LEAD_CAPTURE_DOMAIN,
      organisationIds: config.organisationIds,
      agentUserIds: config.agentUserIds,
      agentEmails: config.agentEmails,
      sources: config.sources,
      maxAgents: config.maxAgents,
      explicitCohortConfigured: config.explicitCohortConfigured,
      resolvedAgentEmails: {},
      unresolvedAgentEmails: [],
    },
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until launch-monitor blockers are resolved',
      passCount: 0,
      warningCount: 0,
      blockedCount: 0,
      criticalCount: 0,
    },
    findings: [],
    aliases: null,
    inbound: null,
    ingestion: null,
    parseFailures: null,
    outbound: null,
    linkedLeads: null,
  }
}

function addFinding(report, phase, status, title, detail = '') {
  report.findings.push({ phase, status, title, detail })
  if (status === 'PASS') report.summary.passCount += 1
  if (status === 'WARN') report.summary.warningCount += 1
  if (status === 'BLOCKED') report.summary.blockedCount += 1
  if (status === 'CRITICAL') report.summary.criticalCount += 1
}

function finalizeReport(report) {
  if (report.summary.criticalCount > 0) {
    report.summary.status = 'FAILED'
    report.summary.recommendation = 'PAUSE pilot forwarding until critical launch-monitor findings are cleared'
  } else if (report.summary.blockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until launch-monitor blockers are resolved'
  } else if (report.summary.warningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = 'Continue the pilot with daily monitoring and review-queue follow-up'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'Pilot launch monitor is green for the configured cohort'
  }
  return report
}

function requireConfig(config, report) {
  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')

  if (missing.length) {
    addFinding(report, 'Environment', 'BLOCKED', 'Missing launch-monitor staging credentials.', missing.join(', '))
  } else {
    addFinding(report, 'Environment', 'PASS', 'Required launch-monitor staging credentials are configured.')
  }

  if (!config.projectRef) {
    addFinding(report, 'Environment', 'BLOCKED', 'Could not resolve Supabase project ref from URL.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addFinding(
      report,
      'Environment',
      'CRITICAL',
      'Launch monitor is pointed at the wrong Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addFinding(report, 'Environment', 'PASS', 'Launch monitor is pointed at the approved staging Supabase project.')
  }

  return missing
}

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const key = normalizeText(row?.[field]) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function countBySource(rows) {
  return rows.reduce((counts, row) => {
    const key = normalizeSource(row?.source) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function rowTime(row, field) {
  const value = row?.[field]
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function hasLeadDomainAddress(row) {
  const addresses = Array.isArray(row?.to_addresses) ? row.to_addresses : []
  return addresses.some((address) => normalizeLower(address).endsWith(`@${LEAD_CAPTURE_DOMAIN}`))
}

function makeAliasContext(aliasRows = []) {
  const activeRows = aliasRows.filter((row) => normalizeLower(row.status) === 'active')
  return {
    rows: aliasRows,
    activeRows,
    activeAliasIds: new Set(activeRows.map((row) => normalizeText(row.alias_id)).filter(Boolean)),
    activeEmails: new Set(activeRows.map((row) => normalizeEmail(row.email_address)).filter(Boolean)),
    aliasesById: Object.fromEntries(aliasRows.map((row) => [normalizeText(row.alias_id), row]).filter(([id]) => id)),
  }
}

function aliasMatchesConfig(row, config) {
  const organisationId = normalizeText(row?.organisation_id)
  const agentUserId = normalizeText(row?.agent_user_id)
  const source = normalizeSource(row?.source)
  if (config.organisationIds.length && !config.organisationIds.includes(organisationId)) return false
  if (config.agentUserIds.length && !config.agentUserIds.includes(agentUserId)) return false
  if (config.sources.length && !config.sources.includes(source)) return false
  return true
}

function rowMatchesCohort(row, config, aliasContext) {
  const captureAliasId = normalizeText(row?.capture_alias_id)
  if (captureAliasId && aliasContext.activeAliasIds.has(captureAliasId)) return true

  const addresses = Array.isArray(row?.to_addresses) ? row.to_addresses.map((address) => normalizeEmail(address)) : []
  if (addresses.some((address) => aliasContext.activeEmails.has(address))) return true

  if (!config.explicitCohortConfigured) return hasLeadDomainAddress(row)

  const organisationId = normalizeText(row?.organisation_id)
  const source = normalizeSource(row?.source)
  const orgIds = config.organisationIds.length
    ? config.organisationIds
    : unique(aliasContext.activeRows.map((alias) => alias.organisation_id))
  const sources = config.sources.length
    ? config.sources
    : unique(aliasContext.activeRows.map((alias) => normalizeSource(alias.source)))
  if (orgIds.length && !orgIds.includes(organisationId)) return false
  if (sources.length && !sources.includes(source)) return false
  return Boolean(orgIds.length || sources.length)
}

function sourceOrgRowMatchesCohort(row, config, aliasContext) {
  const captureAliasId = normalizeText(row?.capture_alias_id)
  if (captureAliasId && aliasContext.activeAliasIds.has(captureAliasId)) return true

  const organisationId = normalizeText(row?.organisation_id)
  const source = normalizeSource(row?.source)
  const orgIds = config.organisationIds.length
    ? config.organisationIds
    : unique(aliasContext.activeRows.map((alias) => alias.organisation_id))
  const sources = config.sources.length
    ? config.sources
    : unique(aliasContext.activeRows.map((alias) => normalizeSource(alias.source)))

  if (orgIds.length && !orgIds.includes(organisationId)) return false
  if (sources.length && !sources.includes(source)) return false
  return Boolean(orgIds.length || sources.length)
}

async function resolveAgentEmails(client, config, report) {
  if (!config.agentEmails.length) return config

  const { data, error } = await client
    .from('profiles')
    .select('id,email')
    .in('email', config.agentEmails)

  if (error) {
    addFinding(report, 'Pilot Cohort', 'BLOCKED', 'Could not resolve pilot agent emails.', error.message)
    return config
  }

  const rows = Array.isArray(data) ? data : []
  const resolvedByEmail = Object.fromEntries(rows.map((row) => [normalizeEmail(row.email), normalizeText(row.id)]).filter(([email, id]) => email && id))
  const resolvedIds = Object.values(resolvedByEmail)
  const unresolved = config.agentEmails.filter((email) => !resolvedByEmail[email])

  config.agentUserIds = unique([...config.agentUserIds, ...resolvedIds])
  report.pilotScope.agentUserIds = config.agentUserIds
  report.pilotScope.resolvedAgentEmails = resolvedByEmail
  report.pilotScope.unresolvedAgentEmails = unresolved

  if (unresolved.length) {
    addFinding(report, 'Pilot Cohort', 'BLOCKED', 'Some pilot agent emails could not be resolved to profiles.', unresolved.join(', '))
  } else {
    addFinding(report, 'Pilot Cohort', 'PASS', 'Pilot agent emails resolved to profile IDs.')
  }
  return config
}

async function fetchRows(report, phase, query, title) {
  const { data, error } = await query
  if (error) {
    addFinding(report, phase, 'BLOCKED', title, error.message)
    return null
  }
  return Array.isArray(data) ? data : []
}

async function fetchLeadCaptureAliases(client, config, report) {
  const rows = await fetchRows(
    report,
    'Lead Capture Aliases',
    client
      .from('lead_capture_aliases')
      .select('alias_id,organisation_id,branch_id,agent_user_id,listing_id,source,routing_level,alias_domain,email_address,status,created_at,updated_at')
      .eq('alias_domain', LEAD_CAPTURE_DOMAIN)
      .limit(config.queryLimit),
    'Could not read lead capture aliases.',
  )
  if (!rows) return null
  if (rows.length >= config.queryLimit) {
    addFinding(report, 'Lead Capture Aliases', 'WARN', 'Lead capture alias query reached the configured limit.', `limit=${config.queryLimit}`)
  }
  return rows
}

function evaluateAliasScope(report, config, aliasRows) {
  const cohortRows = aliasRows.filter((row) => aliasMatchesConfig(row, config))
  const activeRows = cohortRows.filter((row) => normalizeLower(row.status) === 'active')
  const organisations = unique(activeRows.map((row) => row.organisation_id))
  const agents = unique(activeRows.map((row) => row.agent_user_id))
  const bySource = countBySource(activeRows)
  const inactiveConfiguredRows = cohortRows.filter((row) => normalizeLower(row.status) !== 'active')
  const missingConfiguredSources = config.sources.filter((source) => !activeRows.some((row) => normalizeSource(row.source) === source))

  report.aliases = {
    totalDomainAliases: aliasRows.length,
    cohortAliases: cohortRows.length,
    activeCohortAliases: activeRows.length,
    inactiveConfiguredAliases: inactiveConfiguredRows.length,
    organisations: organisations.length,
    organisationIds: organisations,
    agents: agents.length,
    agentUserIds: agents,
    bySource,
    configuredSourcesMissingActiveAlias: missingConfiguredSources,
  }

  if (!config.explicitCohortConfigured) {
    addFinding(
      report,
      'Pilot Cohort',
      'WARN',
      'No explicit Phase 5 pilot cohort is configured.',
      'Set LEAD_PILOT_ORGANISATION_ID, LEAD_PILOT_AGENT_USER_IDS/EMAILS, and LEAD_PILOT_SOURCES to avoid monitoring every active lead alias.',
    )
  } else {
    addFinding(report, 'Pilot Cohort', 'PASS', 'Explicit Phase 5 pilot cohort configuration is present.')
  }

  if (organisations.length > 1) {
    addFinding(report, 'Pilot Cohort', 'CRITICAL', 'Pilot scope includes more than one organisation.', organisations.join(', '))
  } else if (organisations.length === 1) {
    addFinding(report, 'Pilot Cohort', 'PASS', 'Pilot scope is limited to one organisation.')
  }

  if (agents.length > config.maxAgents) {
    addFinding(report, 'Pilot Cohort', 'CRITICAL', 'Pilot scope includes too many agents.', `${agents.length} agent(s); max ${config.maxAgents}.`)
  } else if (agents.length > 0) {
    addFinding(report, 'Pilot Cohort', 'PASS', 'Pilot scope is within the agent-count limit.', `${agents.length}/${config.maxAgents} agent(s).`)
  }

  if (!activeRows.length) {
    addFinding(report, 'Lead Capture Aliases', 'CRITICAL', 'No active lead capture aliases match the Phase 5 cohort.')
  } else {
    addFinding(report, 'Lead Capture Aliases', 'PASS', 'Active lead capture aliases exist for the Phase 5 cohort.', `${activeRows.length} active alias(es).`)
  }

  if (config.sources.length && missingConfiguredSources.length) {
    addFinding(report, 'Lead Capture Aliases', 'CRITICAL', 'Configured pilot sources are missing active aliases.', missingConfiguredSources.join(', '))
  } else if (config.sources.length) {
    addFinding(report, 'Lead Capture Aliases', 'PASS', 'Every configured pilot source has an active alias.')
  } else {
    addFinding(report, 'Pilot Cohort', 'WARN', 'Pilot sources are not explicitly configured.', 'Set LEAD_PILOT_SOURCES to the confirmed forwarding sources only.')
  }

  if (inactiveConfiguredRows.length) {
    addFinding(report, 'Lead Capture Aliases', 'WARN', 'Some matching pilot aliases are not active.', `${inactiveConfiguredRows.length} paused/disabled alias(es).`)
  }

  return activeRows
}

async function fetchInboundRows(client, config, report) {
  const rows = await fetchRows(
    report,
    'Inbound Lead Emails',
    client
      .from('inbound_lead_emails')
      .select('email_id,organisation_id,capture_alias_id,provider,provider_message_id,from_email,to_addresses,subject,source,external_reference,status,lead_id,contact_id,error,received_at,parsed_at,processed_at,parser_name,parse_confidence,matched_fields,review_status,webhook_signature_status,lead_ingestion_log_id')
      .gte('received_at', report.window.since)
      .lte('received_at', report.window.until)
      .order('received_at', { ascending: false })
      .limit(config.queryLimit),
    'Could not read recent inbound lead emails.',
  )
  if (!rows) return null
  if (rows.length >= config.queryLimit) {
    addFinding(report, 'Inbound Lead Emails', 'WARN', 'Inbound lead email query reached the configured limit.', `limit=${config.queryLimit}`)
  }
  return rows
}

function summarizeInboundRows(rows, nowMs, config) {
  const byStatus = countBy(rows, 'status')
  const pendingRows = rows.filter((row) => ['received', 'parsed'].includes(normalizeLower(row.status)))
  const staleBeforeMs = nowMs - config.pendingMaxAgeMinutes * 60 * 1000
  const stalePendingRows = pendingRows.filter((row) => rowTime(row, 'received_at') && rowTime(row, 'received_at') < staleBeforeMs)
  const processedRows = rows.filter((row) => normalizeLower(row.status) === 'processed')
  const duplicateRows = rows.filter((row) => normalizeLower(row.status) === 'duplicate')
  const capturedRows = [...processedRows, ...duplicateRows]
  const failedRows = rows.filter((row) => normalizeLower(row.status) === 'failed')
  const unmatchedRows = rows.filter((row) => normalizeLower(row.status) === 'unmatched')
  const reviewRows = rows.filter((row) => normalizeText(row.review_status))
  const missingLeadRows = processedRows.filter((row) => !normalizeText(row.lead_id))
  const missingContactRows = processedRows.filter((row) => !normalizeText(row.contact_id))
  const processedRate = rows.length ? capturedRows.length / rows.length : null
  const parserMissingRows = rows.filter((row) => ['processed', 'duplicate'].includes(normalizeLower(row.status)) && !normalizeText(row.parser_name))
  const signatureMissingRows = rows.filter((row) => normalizeLower(row.provider) === 'mailgun' && !normalizeText(row.webhook_signature_status))
  const signatureInvalidRows = rows.filter((row) => normalizeLower(row.webhook_signature_status) === 'shared_secret_missing')

  return {
    total: rows.length,
    byStatus,
    bySource: countBySource(rows),
    processed: processedRows.length,
    duplicate: duplicateRows.length,
    captured: capturedRows.length,
    failed: failedRows.length,
    unmatched: unmatchedRows.length,
    pending: pendingRows.length,
    stalePending: stalePendingRows.length,
    reviewQueue: reviewRows.length,
    missingLeadLinks: missingLeadRows.length,
    missingContactLinks: missingContactRows.length,
    processedRate,
    parserMissing: parserMissingRows.length,
    signatureMissing: signatureMissingRows.length,
    signatureInvalid: signatureInvalidRows.length,
    leadIds: unique(rows.map((row) => row.lead_id)),
    contactIds: unique(rows.map((row) => row.contact_id)),
  }
}

function evaluateInbound(report, config, inboundRows, nowMs) {
  const metrics = summarizeInboundRows(inboundRows, nowMs, config)
  report.inbound = metrics

  if (!metrics.total) {
    if (config.allowEmpty) {
      addFinding(report, 'Inbound Lead Emails', 'PASS', 'No inbound leads were received in the monitoring window, and empty windows are allowed.')
    } else {
      addFinding(report, 'Inbound Lead Emails', 'WARN', 'No inbound leads were received in the monitoring window.', `window=${config.windowHours}h`)
    }
    return metrics
  }

  if (metrics.captured > 0) {
    addFinding(report, 'Inbound Lead Emails', 'PASS', 'Inbound leads are being captured into lead/contact records.', `${metrics.captured}/${metrics.total} captured.`)
  } else {
    addFinding(report, 'Inbound Lead Emails', 'CRITICAL', 'Inbound messages arrived but none were captured into leads.')
  }

  if (metrics.processedRate !== null && metrics.processedRate < config.minProcessedRate) {
    addFinding(
      report,
      'Inbound Lead Emails',
      metrics.failed || metrics.stalePending ? 'CRITICAL' : 'WARN',
      'Inbound processed rate is below the pilot threshold.',
      `${Math.round(metrics.processedRate * 100)}% captured; threshold ${Math.round(config.minProcessedRate * 100)}%.`,
    )
  } else {
    addFinding(report, 'Inbound Lead Emails', 'PASS', 'Inbound processed rate meets the pilot threshold.')
  }

  if (metrics.stalePending > 0) {
    addFinding(report, 'Inbound Lead Emails', 'CRITICAL', 'Inbound emails are stuck in a pending state.', `${metrics.stalePending} older than ${config.pendingMaxAgeMinutes} minute(s).`)
  } else if (metrics.pending > 0) {
    addFinding(report, 'Inbound Lead Emails', 'WARN', 'Inbound emails are still pending processing.', `${metrics.pending} pending within ${config.pendingMaxAgeMinutes} minute(s).`)
  } else {
    addFinding(report, 'Inbound Lead Emails', 'PASS', 'No stale pending inbound emails in the monitoring window.')
  }

  if (metrics.failed > 0 || metrics.unmatched > 0 || metrics.reviewQueue > 0) {
    addFinding(report, 'Review Queue', 'WARN', 'Lead-capture review queue needs attention.', `failed=${metrics.failed}; unmatched=${metrics.unmatched}; review=${metrics.reviewQueue}.`)
  } else {
    addFinding(report, 'Review Queue', 'PASS', 'No inbound review-queue items in the monitoring window.')
  }

  if (metrics.missingLeadLinks > 0 || metrics.missingContactLinks > 0) {
    addFinding(report, 'Lead Assignment', 'CRITICAL', 'Processed inbound rows are missing lead/contact links.', `missingLead=${metrics.missingLeadLinks}; missingContact=${metrics.missingContactLinks}.`)
  } else {
    addFinding(report, 'Lead Assignment', 'PASS', 'Processed inbound rows are linked to contacts and leads.')
  }

  if (metrics.parserMissing > 0) {
    addFinding(report, 'Parser Coverage', 'CRITICAL', 'Captured inbound rows are missing parser metadata.', `${metrics.parserMissing} row(s).`)
  } else {
    addFinding(report, 'Parser Coverage', 'PASS', 'Captured inbound rows include parser metadata.')
  }

  if (metrics.signatureInvalid > 0) {
    addFinding(report, 'Mail Routing', 'CRITICAL', 'Mailgun webhook rows were accepted without the shared secret.', `${metrics.signatureInvalid} row(s).`)
  } else if (metrics.signatureMissing > 0) {
    addFinding(report, 'Mail Routing', 'WARN', 'Some Mailgun inbound rows do not have webhook signature metadata.', `${metrics.signatureMissing} row(s).`)
  } else {
    addFinding(report, 'Mail Routing', 'PASS', 'Mailgun inbound rows include webhook signature metadata.')
  }

  return metrics
}

async function fetchParseFailures(client, config, report) {
  const recentRows = await fetchRows(
    report,
    'Parse Failures',
    client
      .from('lead_parse_failures')
      .select('failure_id,inbound_email_id,organisation_id,capture_alias_id,source,reason,status,created_at,resolved_at,ignored_at,parser_name,parse_confidence,lead_ingestion_log_id')
      .gte('created_at', report.window.since)
      .lte('created_at', report.window.until)
      .order('created_at', { ascending: false })
      .limit(config.queryLimit),
    'Could not read recent lead parse failures.',
  )
  const openRows = await fetchRows(
    report,
    'Parse Failures',
    client
      .from('lead_parse_failures')
      .select('failure_id,inbound_email_id,organisation_id,capture_alias_id,source,reason,status,created_at,resolved_at,ignored_at,parser_name,parse_confidence,lead_ingestion_log_id')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(config.queryLimit),
    'Could not read open lead parse failures.',
  )

  if (!recentRows || !openRows) return null
  const rowsById = new Map()
  for (const row of [...recentRows, ...openRows]) {
    const id = normalizeText(row.failure_id)
    if (id) rowsById.set(id, row)
  }
  return [...rowsById.values()]
}

function summarizeParseFailures(rows, report) {
  const byStatus = countBy(rows, 'status')
  const openRows = rows.filter((row) => normalizeLower(row.status) === 'open')
  const oldOpenRows = openRows.filter((row) => rowTime(row, 'created_at') && rowTime(row, 'created_at') < Date.parse(report.window.since))
  return {
    total: rows.length,
    byStatus,
    bySource: countBySource(rows),
    open: openRows.length,
    openOlderThanWindow: oldOpenRows.length,
    recent: rows.filter((row) => rowTime(row, 'created_at') >= Date.parse(report.window.since)).length,
    byReason: countBy(rows, 'reason'),
  }
}

function evaluateParseFailures(report, config, rows) {
  const metrics = summarizeParseFailures(rows, report)
  report.parseFailures = metrics

  if (metrics.open > config.maxOpenFailures) {
    addFinding(report, 'Parse Failures', 'CRITICAL', 'Open parse failures exceed the pilot threshold.', `${metrics.open} open; threshold ${config.maxOpenFailures}.`)
  } else if (metrics.open > 0) {
    addFinding(report, 'Parse Failures', 'WARN', 'Open parse failures need daily review.', `${metrics.open} open; threshold ${config.maxOpenFailures}.`)
  } else {
    addFinding(report, 'Parse Failures', 'PASS', 'No open parse failures for the pilot cohort.')
  }

  if (metrics.openOlderThanWindow > 0) {
    addFinding(report, 'Parse Failures', 'WARN', 'Some parse failures were open before the current monitoring window.', `${metrics.openOlderThanWindow} older open failure(s).`)
  }

  return metrics
}

async function fetchIngestionLogs(client, config, report) {
  const rows = await fetchRows(
    report,
    'Lead Ingestion Logs',
    client
      .from('lead_ingestion_logs')
      .select('log_id,organisation_id,source,external_reference,status,lead_id,contact_id,error,created_at,review_status,duplicate_of_log_id,retry_count,last_retry_at,listing_id,assigned_agent_id,processed_at')
      .gte('created_at', report.window.since)
      .lte('created_at', report.window.until)
      .order('created_at', { ascending: false })
      .limit(config.queryLimit),
    'Could not read lead ingestion logs.',
  )
  if (!rows) return null
  if (rows.length >= config.queryLimit) {
    addFinding(report, 'Lead Ingestion Logs', 'WARN', 'Lead ingestion log query reached the configured limit.', `limit=${config.queryLimit}`)
  }
  return rows
}

function summarizeIngestionLogs(rows) {
  const failedRows = rows.filter((row) => normalizeLower(row.status) === 'failed')
  const duplicateRows = rows.filter((row) => normalizeLower(row.status) === 'duplicate' || normalizeText(row.duplicate_of_log_id))
  const needsReviewRows = rows.filter((row) => normalizeLower(row.review_status) === 'needs_review')
  return {
    total: rows.length,
    byStatus: countBy(rows, 'status'),
    bySource: countBySource(rows),
    failed: failedRows.length,
    duplicates: duplicateRows.length,
    needsReview: needsReviewRows.length,
    createdLeadIds: unique(rows.map((row) => row.lead_id)),
    assignedAgentIds: unique(rows.map((row) => row.assigned_agent_id)),
    missingLeadLinks: rows.filter((row) => ['processed', 'assigned'].includes(normalizeLower(row.status)) && !normalizeText(row.lead_id)).length,
  }
}

function evaluateIngestionLogs(report, rows, inboundMetrics) {
  const metrics = summarizeIngestionLogs(rows)
  report.ingestion = metrics

  if (metrics.total > 0) {
    addFinding(report, 'Lead Ingestion Logs', 'PASS', 'Lead ingestion logs are being written.', `${metrics.total} log row(s).`)
  } else if (inboundMetrics.captured > 0) {
    addFinding(report, 'Lead Ingestion Logs', 'WARN', 'Inbound leads were captured but no ingestion logs were found in the same window.')
  } else {
    addFinding(report, 'Lead Ingestion Logs', 'WARN', 'No lead ingestion logs found in the monitoring window.')
  }

  if (metrics.failed > 0) {
    addFinding(report, 'Lead Ingestion Logs', 'CRITICAL', 'Lead ingestion logs include failed records.', `${metrics.failed} failed log(s).`)
  } else {
    addFinding(report, 'Lead Ingestion Logs', 'PASS', 'No failed lead ingestion logs in the monitoring window.')
  }

  if (metrics.needsReview > 0) {
    addFinding(report, 'Review Queue', 'WARN', 'Lead ingestion logs include review-needed records.', `${metrics.needsReview} log row(s).`)
  }

  if (metrics.missingLeadLinks > 0) {
    addFinding(report, 'Lead Assignment', 'CRITICAL', 'Processed ingestion logs are missing lead links.', `${metrics.missingLeadLinks} log row(s).`)
  }

  return metrics
}

async function fetchLinkedLeads(client, report, leadIds) {
  if (!leadIds.length) return []
  const rows = await fetchRows(
    report,
    'Linked Leads',
    client
      .from('leads')
      .select('lead_id,organisation_id,assigned_agent_id,contact_id,lead_source,stage,status,created_at')
      .in('lead_id', leadIds)
      .limit(Math.max(100, leadIds.length)),
    'Could not read linked leads for assignment verification.',
  )
  return rows
}

function evaluateLinkedLeads(report, config, inboundRows, aliasContext, leadRows) {
  const leadsById = Object.fromEntries(leadRows.map((lead) => [normalizeText(lead.lead_id), lead]).filter(([id]) => id))
  const linkedLeadIds = unique(inboundRows.map((row) => row.lead_id))
  const missingLeadIds = linkedLeadIds.filter((leadId) => !leadsById[leadId])
  const wrongOrgRows = leadRows.filter((lead) => config.organisationIds.length && !config.organisationIds.includes(normalizeText(lead.organisation_id)))
  const misassignedRows = inboundRows.filter((row) => {
    const lead = leadsById[normalizeText(row.lead_id)]
    const alias = aliasContext.aliasesById[normalizeText(row.capture_alias_id)]
    const aliasAgentId = normalizeText(alias?.agent_user_id)
    if (!lead || !aliasAgentId) return false
    return normalizeText(lead.assigned_agent_id) !== aliasAgentId
  })

  report.linkedLeads = {
    total: leadRows.length,
    linkedFromInbound: linkedLeadIds.length,
    missingLinkedLeadRows: missingLeadIds.length,
    wrongOrganisation: wrongOrgRows.length,
    misassignedFromAlias: misassignedRows.length,
    assignedAgentIds: unique(leadRows.map((lead) => lead.assigned_agent_id)),
  }

  if (missingLeadIds.length) {
    addFinding(report, 'Lead Assignment', 'CRITICAL', 'Inbound rows reference leads that could not be read.', `${missingLeadIds.length} lead id(s).`)
  }

  if (wrongOrgRows.length) {
    addFinding(report, 'Lead Assignment', 'CRITICAL', 'Linked leads are outside the configured pilot organisation.', `${wrongOrgRows.length} lead row(s).`)
  }

  if (misassignedRows.length) {
    addFinding(report, 'Lead Assignment', 'CRITICAL', 'Linked leads are assigned to a different agent than the capture alias.', `${misassignedRows.length} row(s).`)
  }

  if (!missingLeadIds.length && !wrongOrgRows.length && !misassignedRows.length && linkedLeadIds.length) {
    addFinding(report, 'Lead Assignment', 'PASS', 'Linked leads are readable and assigned within the pilot cohort.')
  }
}

async function fetchOutboundEvents(client, config, report, organisationIds) {
  if (!organisationIds.length) return []
  const rows = await fetchRows(
    report,
    'Outbound Email',
    client
      .from('lead_communication_events')
      .select('communication_id,organisation_id,lead_id,contact_id,agent_id,communication_type,direction,subject,external_reference,source,status,occurred_at,created_at,metadata')
      .in('organisation_id', organisationIds)
      .eq('direction', 'outbound')
      .gte('occurred_at', report.window.since)
      .lte('occurred_at', report.window.until)
      .order('occurred_at', { ascending: false })
      .limit(config.queryLimit),
    'Could not read outbound lead communication events.',
  )
  if (!rows) return null
  if (rows.length >= config.queryLimit) {
    addFinding(report, 'Outbound Email', 'WARN', 'Outbound communication query reached the configured limit.', `limit=${config.queryLimit}`)
  }
  return rows
}

function summarizeOutboundEvents(rows) {
  const emailRows = rows.filter((row) => normalizeLower(row.communication_type) === 'email')
  const failedRows = emailRows.filter((row) => normalizeLower(row.status).includes('fail'))
  const propertyShareRows = emailRows.filter((row) => normalizeLower(row.source) === 'lead_property_share' || normalizeLower(row.external_reference).includes('lead_property_share'))
  return {
    totalOutbound: rows.length,
    outboundEmail: emailRows.length,
    leadPropertyShare: propertyShareRows.length,
    failedEmail: failedRows.length,
    byStatus: countBy(emailRows, 'status'),
    bySource: countBySource(emailRows),
  }
}

function evaluateOutboundEvents(report, rows) {
  const metrics = summarizeOutboundEvents(rows)
  report.outbound = metrics

  if (metrics.outboundEmail > 0) {
    addFinding(report, 'Outbound Email', 'PASS', 'Outbound lead email activity is visible in communication events.', `${metrics.outboundEmail} outbound email event(s).`)
  } else {
    addFinding(
      report,
      'Outbound Email',
      'WARN',
      'No outbound lead email communication events were found in the monitoring window.',
      'Run the outbound lead email smoke or confirm whether send-email provider IDs are logged outside lead_communication_events.',
    )
  }

  if (metrics.failedEmail > 0) {
    addFinding(report, 'Outbound Email', 'CRITICAL', 'Outbound lead email events include failed sends.', `${metrics.failedEmail} failed email event(s).`)
  }

  return metrics
}

function filterRowsForCohort(rows, config, aliasContext, matcher) {
  return rows.filter((row) => matcher(row, config, aliasContext))
}

function buildLaunchDecision(metrics, thresholds = {}) {
  const maxAgents = thresholds.maxAgents ?? DEFAULT_MAX_AGENTS
  const minProcessedRate = thresholds.minProcessedRate ?? DEFAULT_MIN_PROCESSED_RATE
  const maxOpenFailures = thresholds.maxOpenFailures ?? DEFAULT_MAX_OPEN_FAILURES
  const allowEmpty = Boolean(thresholds.allowEmpty)

  const findings = []
  const add = (status, title) => findings.push({ status, title })

  if ((metrics.organisations || 0) > 1) add('CRITICAL', 'Pilot scope includes more than one organisation')
  if ((metrics.agents || 0) > maxAgents) add('CRITICAL', 'Pilot scope includes too many agents')
  if ((metrics.activeAliases || 0) === 0) add('CRITICAL', 'No active aliases match the pilot cohort')
  if ((metrics.inboundTotal || 0) === 0 && !allowEmpty) add('WARN', 'No inbound leads in the monitoring window')
  if ((metrics.stalePending || 0) > 0) add('CRITICAL', 'Inbound emails are stuck pending')
  if ((metrics.inboundTotal || 0) > 0 && (metrics.captured || 0) === 0) add('CRITICAL', 'Inbound messages arrived but none were captured')
  if (metrics.processedRate !== null && metrics.processedRate !== undefined && metrics.processedRate < minProcessedRate) add('WARN', 'Processed rate below threshold')
  if ((metrics.openFailures || 0) > maxOpenFailures) add('CRITICAL', 'Open parse failures exceed threshold')
  if ((metrics.misassigned || 0) > 0) add('CRITICAL', 'Linked leads are misassigned')
  if ((metrics.failedOutbound || 0) > 0) add('CRITICAL', 'Outbound email failures detected')

  const criticalCount = findings.filter((finding) => finding.status === 'CRITICAL').length
  const warningCount = findings.filter((finding) => finding.status === 'WARN').length
  return {
    status: criticalCount > 0 ? 'FAILED' : warningCount > 0 ? 'READY_WITH_WARNINGS' : 'READY',
    criticalCount,
    warningCount,
    findings,
  }
}

async function run(options = parseArgs(process.argv.slice(2))) {
  const env = loadEnv()
  const config = resolveConfig(env, options)
  const report = createReport(config)
  const missing = requireConfig(config, report)

  if (config.skipNetwork) {
    addFinding(report, 'Network', 'BLOCKED', 'Network probes skipped by --skip-network.')
    return finalizeReport(report)
  }

  if (missing.length || !config.projectRef || config.projectRef !== STAGING_PROJECT_REF) {
    return finalizeReport(report)
  }

  const client = createServiceClient(config)
  await resolveAgentEmails(client, config, report)
  if (report.summary.blockedCount > 0 || report.summary.criticalCount > 0) return finalizeReport(report)

  const aliasRows = await fetchLeadCaptureAliases(client, config, report)
  if (!aliasRows) return finalizeReport(report)
  const activeAliasRows = evaluateAliasScope(report, config, aliasRows)
  const aliasContext = makeAliasContext(activeAliasRows)

  const inboundRowsRaw = await fetchInboundRows(client, config, report)
  if (!inboundRowsRaw) return finalizeReport(report)
  const inboundRows = filterRowsForCohort(inboundRowsRaw, config, aliasContext, rowMatchesCohort)
  const inboundMetrics = evaluateInbound(report, config, inboundRows, Date.parse(report.generatedAt))

  const parseFailureRowsRaw = await fetchParseFailures(client, config, report)
  if (!parseFailureRowsRaw) return finalizeReport(report)
  const parseFailureRows = filterRowsForCohort(parseFailureRowsRaw, config, aliasContext, sourceOrgRowMatchesCohort)
  evaluateParseFailures(report, config, parseFailureRows)

  const ingestionRowsRaw = await fetchIngestionLogs(client, config, report)
  if (!ingestionRowsRaw) return finalizeReport(report)
  const ingestionRows = filterRowsForCohort(ingestionRowsRaw, config, aliasContext, sourceOrgRowMatchesCohort)
  evaluateIngestionLogs(report, ingestionRows, inboundMetrics)

  const leadIds = unique([...inboundMetrics.leadIds, ...(report.ingestion?.createdLeadIds || [])])
  const leadRows = await fetchLinkedLeads(client, report, leadIds)
  if (!leadRows) return finalizeReport(report)
  evaluateLinkedLeads(report, config, inboundRows, aliasContext, leadRows)

  const outboundOrganisationIds = config.organisationIds.length
    ? config.organisationIds
    : unique(activeAliasRows.map((row) => row.organisation_id))
  const outboundRows = await fetchOutboundEvents(client, config, report, outboundOrganisationIds)
  if (!outboundRows) return finalizeReport(report)
  evaluateOutboundEvents(report, outboundRows)

  return finalizeReport(report)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await run()
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (report.summary.criticalCount > 0 || report.summary.blockedCount > 0) {
      process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

export {
  buildLaunchDecision,
  countBy,
  evaluateAliasScope,
  finalizeReport,
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
}
