import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const ENV_FILE = `${appRoot}/.env.staging.local`
const LEAD_CAPTURE_DOMAIN = 'leads.arch9.co.za'
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const DEFAULT_TIMEOUT_MS = 30000

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

const EXPECTED_PARSERS = {
  General: 'generic_email',
  Website: 'website_email',
  Property24: 'property24_email',
  'Private Property': 'private_property_email',
  Facebook: 'generic_email',
}

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
  return SOURCE_ALIASES.get(normalized) || SOURCE_ALIASES.get(compact) || ''
}

function parseArgs(argv) {
  const options = {
    source: '',
    outboundEmail: false,
    live: false,
    skipNetwork: false,
    delivery: 'webhook',
    reviewCase: 'low-confidence',
    aliasEmail: '',
    recipient: '',
    allowExternalRecipient: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = (prefix) => {
      if (arg.includes('=')) return arg.slice(prefix.length)
      index += 1
      return argv[index] || ''
    }

    if (arg === '--live') {
      options.live = true
    } else if (arg === '--skip-network') {
      options.skipNetwork = true
    } else if (arg === '--outbound-email') {
      options.outboundEmail = true
    } else if (arg === '--via-email') {
      options.delivery = 'email'
    } else if (arg === '--delivery' || arg.startsWith('--delivery=')) {
      const value = normalizeLower(readValue('--delivery=')).replace(/[_\s]+/g, '-')
      if (!['webhook', 'email'].includes(value)) throw new Error('--delivery must be webhook or email')
      options.delivery = value
    } else if (arg === '--allow-external-recipient') {
      options.allowExternalRecipient = true
    } else if (arg === '--no-review-case') {
      options.reviewCase = 'none'
    } else if (arg === '--source' || arg.startsWith('--source=')) {
      const sourceValue = readValue('--source=')
      options.source = normalizeSource(sourceValue)
      if (!options.source) throw new Error('Unsupported source. Use Website, Property24, PrivateProperty, Facebook, or General.')
    } else if (arg === '--alias' || arg.startsWith('--alias=')) {
      options.aliasEmail = normalizeEmail(readValue('--alias='))
    } else if (arg === '--to' || arg.startsWith('--to=') || arg === '--recipient' || arg.startsWith('--recipient=')) {
      options.recipient = normalizeEmail(readValue(arg.startsWith('--recipient') ? '--recipient=' : '--to='))
    } else if (arg === '--review-case' || arg.startsWith('--review-case=')) {
      const value = normalizeLower(readValue('--review-case=')).replace(/[_\s]+/g, '-')
      if (!['low-confidence', 'unmatched', 'none'].includes(value)) throw new Error('--review-case must be low-confidence, unmatched, or none')
      options.reviewCase = value
    } else if (arg === '--timeout-ms' || arg.startsWith('--timeout-ms=')) {
      const value = Number.parseInt(readValue('--timeout-ms='), 10)
      if (!Number.isInteger(value) || value < 1000 || value > 120000) throw new Error('--timeout-ms must be an integer from 1000 to 120000')
      options.timeoutMs = value
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (options.delivery === 'email' && !options.live) {
    throw new Error('--delivery=email requires --live because it sends a real email to the capture alias.')
  }
  if (!options.source && !options.outboundEmail) {
    throw new Error('Choose at least one smoke path: --source <Website|Property24|PrivateProperty|Facebook|General> or --outbound-email.')
  }
  if (options.source && !EXPECTED_PARSERS[options.source]) {
    throw new Error('Unsupported source. Use Website, Property24, PrivateProperty, Facebook, or General.')
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
  if (!merged.INBOUND_LEAD_EMAIL_WEBHOOK_SECRET && merged.LEAD_PILOT_INBOUND_WEBHOOK_SECRET) {
    merged.INBOUND_LEAD_EMAIL_WEBHOOK_SECRET = merged.LEAD_PILOT_INBOUND_WEBHOOK_SECRET
  }

  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function createReport(options) {
  return {
    phase: '3',
    scope: 'lead-pilot-smoke',
    generatedAt: new Date().toISOString(),
    mode: options.live ? 'live' : options.skipNetwork ? 'static' : 'preflight',
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until smoke blockers are resolved',
      passCount: 0,
      warningCount: 0,
      blockedCount: 0,
      criticalCount: 0,
    },
    findings: [],
    inbound: null,
    reviewCase: null,
    outbound: null,
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
    report.summary.recommendation = 'NO-GO'
  } else if (report.summary.blockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until smoke blockers are resolved'
  } else if (report.summary.warningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = 'Smoke checks passed with warnings'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = report.mode === 'live'
      ? 'Live pilot smoke checks passed'
      : 'Pilot smoke preflight passed'
  }
  return report
}

function requireConfig(env, report, options) {
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY),
    actorEmail: normalizeEmail(env.AGENCY_RUNTIME_AGENT_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
    inboundSecret: normalizeText(env.INBOUND_LEAD_EMAIL_WEBHOOK_SECRET),
    outboundRecipient: normalizeEmail(options.recipient || env.LEAD_PILOT_SMOKE_TO_EMAIL),
    allowedRecipientDomains: normalizeText(env.LEAD_PILOT_SMOKE_ALLOWED_EMAIL_DOMAINS || 'arch9.co.za,bridgenine.co.za')
      .split(',')
      .map((item) => normalizeLower(item))
      .filter(Boolean),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  if (options.skipNetwork) {
    addFinding(report, 'Environment', 'PASS', 'Static smoke mode does not require staging credentials.')
    return { config, missing: [] }
  }

  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.anonKey) missing.push('VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY/SUPABASE_ANON_KEY')
  if (options.outboundEmail && options.live && !config.actorEmail) missing.push('AGENCY_RUNTIME_AGENT_EMAIL/STAGING_INTERNAL_EMAIL')
  if (options.outboundEmail && options.live && !config.actorPassword) missing.push('AGENCY_RUNTIME_AGENT_PASSWORD/STAGING_INTERNAL_PASSWORD')
  if (options.source && options.live && options.delivery === 'webhook' && !config.inboundSecret) missing.push('INBOUND_LEAD_EMAIL_WEBHOOK_SECRET/LEAD_PILOT_INBOUND_WEBHOOK_SECRET')
  if (options.source && options.live && options.delivery === 'email' && !config.actorEmail) missing.push('AGENCY_RUNTIME_AGENT_EMAIL/STAGING_INTERNAL_EMAIL')
  if (options.source && options.live && options.delivery === 'email' && !config.actorPassword) missing.push('AGENCY_RUNTIME_AGENT_PASSWORD/STAGING_INTERNAL_PASSWORD')
  if (options.outboundEmail && !config.outboundRecipient) missing.push('LEAD_PILOT_SMOKE_TO_EMAIL/--to')

  if (missing.length) {
    addFinding(report, 'Environment', 'BLOCKED', 'Missing smoke-test configuration.', missing.join(', '))
  } else {
    addFinding(report, 'Environment', 'PASS', 'Required smoke-test configuration is available.')
  }

  if (!config.projectRef) {
    addFinding(report, 'Environment', 'BLOCKED', 'Could not resolve Supabase project ref from URL.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addFinding(report, 'Environment', 'CRITICAL', 'Smoke test is pointed at the wrong Supabase project.', `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`)
  } else {
    addFinding(report, 'Environment', 'PASS', 'Smoke test is pointed at the approved staging Supabase project.')
  }

  return { config, missing }
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

function createAnonClient(config) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function createSmokeToken(prefix = 'pilot') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function buildBodyForSource(source, { token, lowConfidence = false } = {}) {
  if (lowConfidence) {
    return [
      'Name: Pilot Review',
      `Email: pilot.review.${token}@example.test`,
    ].join('\n')
  }

  if (source === 'Property24') {
    return [
      'Enquiry By: Pilot Property24',
      `Email: pilot.property24.${token}@example.test`,
      'Telephone: +27 82 111 2222',
      'Suburb: Parkview',
      'Property Type: Apartment',
      'Message: Please call me about this Property24 enquiry.',
    ].join('\n')
  }

  if (source === 'Private Property') {
    return [
      'Contact Name: Pilot Private',
      `Email Address: pilot.private.${token}@example.test`,
      'Cellphone: 083 222 3333',
      'Suburb: Bedfordview',
      'Property Type: Townhouse',
      'Enquiry: I would like to arrange a viewing.',
    ].join('\n')
  }

  if (source === 'Website') {
    return [
      'First Name: Pilot',
      'Last Name: Website',
      `Email: pilot.website.${token}@example.test`,
      'Phone: 084 333 4444',
      'Area: Sandton',
      'Property Type: House',
      'Budget: R 1850000',
      'Message: Please send me more information from the website.',
    ].join('\n')
  }

  if (source === 'Facebook') {
    return [
      'Name: Pilot Facebook',
      `Email: pilot.facebook.${token}@example.test`,
      'Phone: 082 444 5555',
      'Message: Facebook lead form enquiry for a buyer consultation.',
    ].join('\n')
  }

  return [
    'Name: Pilot General',
    `Email: pilot.general.${token}@example.test`,
    'Phone: 082 555 6666',
    'Message: General pilot lead capture enquiry.',
  ].join('\n')
}

function senderForSource(source) {
  if (source === 'Property24') return 'Property24 <noreply@property24.com>'
  if (source === 'Private Property') return 'Private Property <leads@privateproperty.co.za>'
  if (source === 'Website') return 'Website <forms@arch9.co.za>'
  if (source === 'Facebook') return 'Facebook Lead Ads <leadads@facebookmail.com>'
  return 'Pilot Lead <pilot@example.test>'
}

function buildInboundSmokePayload({ source, aliasEmail, token = createSmokeToken('inbound'), lowConfidence = false, unmatched = false } = {}) {
  const selectedSource = normalizeSource(source) || 'Website'
  const recipient = unmatched ? `unmatched-${token}@${LEAD_CAPTURE_DOMAIN}` : normalizeEmail(aliasEmail)
  const providerMessageId = `<${token}.${selectedSource.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@pilot.arch9.test>`
  const body = buildBodyForSource(selectedSource, { token, lowConfidence })

  return {
    token,
    expectedParser: unmatched ? null : EXPECTED_PARSERS[selectedSource],
    expectedSource: selectedSource,
    providerMessageId,
    payload: {
      provider: 'mailgun',
      recipient,
      sender: senderForSource(selectedSource),
      subject: `${selectedSource} pilot smoke ${token}`,
      'body-plain': body,
      'stripped-text': body,
      'Message-Id': providerMessageId,
      timestamp: Math.floor(Date.now() / 1000),
    },
  }
}

function buildOutboundSmokePayload({ recipient, token = createSmokeToken('outbound') } = {}) {
  return {
    token,
    payload: {
      type: 'lead_property_share',
      to: normalizeEmail(recipient),
      subject: `Lead module email smoke ${token}`,
      message: 'This is an internal Arch9 pilot smoke test for the Lead module property-share email path.',
      text: 'This is an internal Arch9 pilot smoke test for the Lead module property-share email path.',
      html: '<p>This is an internal Arch9 pilot smoke test for the Lead module property-share email path.</p>',
    },
  }
}

function buildInboundEmailDeliveryPayload({ recipient, smoke }) {
  const subject = smoke.payload.subject
  const message = normalizeText(smoke.payload['body-plain'] || smoke.payload['stripped-text'])
  return {
    type: 'lead_property_share',
    to: normalizeEmail(recipient),
    subject,
    message,
    text: message,
    html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${message
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')}</pre>`,
  }
}

function isAllowedSmokeRecipient(email, allowedDomains = []) {
  const domain = normalizeLower(email).split('@')[1] || ''
  if (!domain) return false
  return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))
}

async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const payload = await response.json().catch(() => null)
    return { response, payload }
  } finally {
    clearTimeout(timeout)
  }
}

async function findPilotAlias(client, { source, aliasEmail }) {
  let query = client
    .from('lead_capture_aliases')
    .select('alias_id,organisation_id,branch_id,agent_user_id,listing_id,source,routing_level,email_address,status')
    .eq('status', 'active')
    .eq('alias_domain', LEAD_CAPTURE_DOMAIN)
    .limit(100)

  if (aliasEmail) {
    query = query.ilike('email_address', aliasEmail)
  } else {
    query = query.ilike('source', source)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  return rows.find((row) => normalizeText(row.agent_user_id)) || rows[0] || null
}

async function querySingleById(client, table, select, column, value) {
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq(column, value)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function verifyProcessedInbound(client, report, { source, smoke, result }) {
  const inbound = await querySingleById(
    client,
    'inbound_lead_emails',
    'email_id,status,source,lead_id,contact_id,parser_name,parse_confidence,webhook_signature_status,matched_fields,error',
    'email_id',
    result.inboundEmailId,
  )
  if (!inbound) {
    addFinding(report, 'Inbound Smoke', 'CRITICAL', 'Inbound email row was not created.')
    return
  }

  const expectedParser = EXPECTED_PARSERS[source]
  const confidence = Number(inbound.parse_confidence || 0)
  const parserOk = normalizeText(inbound.parser_name) === expectedParser
  const processed = ['processed', 'duplicate'].includes(normalizeLower(inbound.status))
  const hasLead = normalizeText(inbound.lead_id || result.leadId)
  const hasContact = normalizeText(inbound.contact_id || result.contactId)

  report.inbound = {
    source,
    inboundEmailId: inbound.email_id,
    status: inbound.status,
    parserName: inbound.parser_name,
    parseConfidence: confidence,
    leadId: inbound.lead_id || result.leadId || null,
    contactId: inbound.contact_id || result.contactId || null,
  }

  if (!processed || !parserOk || !hasLead || !hasContact || confidence < 0.65) {
    addFinding(
      report,
      'Inbound Smoke',
      'CRITICAL',
      'Inbound lead did not process with the expected parser and records.',
      `status=${inbound.status}; parser=${inbound.parser_name}; confidence=${confidence}`,
    )
    return
  }

  if (normalizeText(inbound.webhook_signature_status) !== 'shared_secret_valid') {
    addFinding(report, 'Inbound Smoke', 'CRITICAL', 'Inbound webhook signature was not validated.', normalizeText(inbound.webhook_signature_status))
    return
  }

  const lead = await querySingleById(client, 'leads', 'lead_id,contact_id,lead_source,status,stage', 'lead_id', hasLead)
  const contact = await querySingleById(client, 'contacts', 'contact_id,email,phone', 'contact_id', hasContact)
  const { data: logs, error: logError } = await client
    .from('lead_ingestion_logs')
    .select('log_id,status,lead_id,contact_id,source,external_reference,review_status,error')
    .eq('lead_id', hasLead)
    .order('created_at', { ascending: false })
    .limit(1)
  if (logError) throw logError
  const log = Array.isArray(logs) ? logs[0] : null

  if (!lead || !contact || !log) {
    addFinding(report, 'Inbound Smoke', 'CRITICAL', 'Lead/contact/ingestion log side effects are incomplete.')
    return
  }

  addFinding(report, 'Inbound Smoke', 'PASS', 'Inbound lead processed through parser, lead, contact, and ingestion log.', `parser=${expectedParser}; confidence=${confidence}`)
}

async function verifyLowConfidenceReview(client, report, { result, smoke }) {
  const inbound = await querySingleById(
    client,
    'inbound_lead_emails',
    'email_id,status,parser_name,parse_confidence,lead_id,contact_id',
    'email_id',
    result.inboundEmailId,
  )
  let log = null
  const leadId = normalizeText(inbound?.lead_id || result.leadId)
  if (leadId) {
    const { data, error } = await client
      .from('lead_ingestion_logs')
      .select('log_id,status,review_status,error,external_reference,lead_id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    log = data || null
  }
  if (!log && smoke.providerMessageId) {
    log = await querySingleById(
      client,
      'lead_ingestion_logs',
      'log_id,status,review_status,error,external_reference,lead_id',
      'external_reference',
      smoke.providerMessageId,
    )
  }
  const confidence = Number(inbound?.parse_confidence || 0)
  report.reviewCase = {
    type: 'low-confidence',
    inboundEmailId: inbound?.email_id || result.inboundEmailId || null,
    parseConfidence: confidence,
    reviewStatus: log?.review_status || null,
  }

  if (inbound && log?.review_status === 'needs_review' && confidence < 0.65) {
    addFinding(report, 'Review Smoke', 'PASS', 'Low-confidence inbound lead is marked for review.', `confidence=${confidence}`)
  } else {
    addFinding(report, 'Review Smoke', 'CRITICAL', 'Low-confidence inbound lead did not land in the review path.', `confidence=${confidence}; review_status=${log?.review_status || ''}`)
  }
}

async function verifyUnmatchedReview(client, report, { result }) {
  const inbound = await querySingleById(
    client,
    'inbound_lead_emails',
    'email_id,status,error',
    'email_id',
    result.inboundEmailId,
  )
  const { data, error } = await client
    .from('lead_parse_failures')
    .select('failure_id,status,reason,inbound_email_id')
    .eq('inbound_email_id', result.inboundEmailId)
    .limit(1)
    .maybeSingle()
  if (error) throw error

  report.reviewCase = {
    type: 'unmatched',
    inboundEmailId: inbound?.email_id || result.inboundEmailId || null,
    inboundStatus: inbound?.status || null,
    failureId: data?.failure_id || null,
  }

  if (normalizeLower(inbound?.status) === 'unmatched' && data?.failure_id && normalizeLower(data?.status) === 'open') {
    addFinding(report, 'Review Smoke', 'PASS', 'Unmatched inbound email created an open review failure.')
  } else {
    addFinding(report, 'Review Smoke', 'CRITICAL', 'Unmatched inbound email did not create an open review failure.')
  }
}

async function postInbound(config, smoke, options) {
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/inbound-lead-email`
  const { response, payload } = await fetchJson(url, {
    method: 'POST',
    timeoutMs: options.timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      'x-arch9-inbound-secret': config.inboundSecret,
      'x-arch9-inbound-provider': 'mailgun',
      'user-agent': 'arch9-lead-pilot-smoke/1.0',
    },
    body: JSON.stringify(smoke.payload),
  })
  return {
    httpStatus: response.status,
    ok: response.ok,
    payload,
  }
}

async function signInActor(config) {
  const client = createAnonClient(config)
  const { data, error } = await client.auth.signInWithPassword({
    email: config.actorEmail,
    password: config.actorPassword,
  })
  if (error) throw error
  const token = data?.session?.access_token
  if (!token) throw new Error('Actor sign-in returned no access token.')
  return token
}

async function invokeSendEmail(config, accessToken, payload, options) {
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/send-email`
  const { response, payload: responsePayload } = await fetchJson(url, {
    method: 'POST',
    timeoutMs: options.timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'user-agent': 'arch9-lead-pilot-smoke/1.0',
    },
    body: JSON.stringify(payload),
  })
  return { response, payload: responsePayload }
}

async function waitForInboundBySubject(client, { subject, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const startedAt = Date.now()
  let lastError = null
  let latestRow = null
  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await client
      .from('inbound_lead_emails')
      .select('email_id,status,source,lead_id,contact_id,parser_name,parse_confidence,webhook_signature_status,matched_fields,error,subject')
      .eq('subject', subject)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      lastError = error
    } else if (data?.email_id) {
      latestRow = data
      if (!['received', 'parsed'].includes(normalizeLower(data.status))) {
        return data
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
  if (lastError) throw lastError
  return latestRow
}

async function deliverInboundViaEmail(client, config, aliasEmail, smoke, options) {
  const accessToken = await signInActor(config)
  const emailPayload = buildInboundEmailDeliveryPayload({ recipient: aliasEmail, smoke })
  const sendResult = await invokeSendEmail(config, accessToken, emailPayload, options)
  if (!sendResult.response.ok || !sendResult.payload?.ok) {
    return {
      ok: false,
      httpStatus: sendResult.response.status,
      payload: sendResult.payload,
      inbound: null,
    }
  }

  const inbound = await waitForInboundBySubject(client, {
    subject: emailPayload.subject,
    timeoutMs: options.timeoutMs,
  })
  return {
    ok: Boolean(inbound?.email_id),
    httpStatus: sendResult.response.status,
    payload: sendResult.payload,
    inbound,
  }
}

async function runInboundSmoke(report, config, options) {
  const source = options.source

  if (options.skipNetwork) {
    const staticSmoke = buildInboundSmokePayload({ source, aliasEmail: `pilot-${normalizeLower(source).replace(/[^a-z0-9]+/g, '-')}@${LEAD_CAPTURE_DOMAIN}` })
    report.inbound = {
      source,
      mode: 'static',
      expectedParser: staticSmoke.expectedParser,
      provider: staticSmoke.payload.provider,
    }
    addFinding(report, 'Inbound Smoke', 'PASS', 'Static inbound smoke payload is buildable.', `source=${source}; parser=${staticSmoke.expectedParser}`)
    return
  }

  const client = createServiceClient(config)
  const alias = await findPilotAlias(client, { source, aliasEmail: options.aliasEmail })
  if (!alias) {
    addFinding(report, 'Inbound Smoke', 'BLOCKED', 'No active capture alias found for smoke source.', source)
    return
  }

  const smoke = buildInboundSmokePayload({ source, aliasEmail: alias.email_address })
  report.inbound = {
    source,
    mode: options.live ? `live-${options.delivery}` : 'preflight',
    aliasId: alias.alias_id,
    aliasEmail: alias.email_address,
    expectedParser: smoke.expectedParser,
  }

  addFinding(report, 'Inbound Smoke', 'PASS', 'Active capture alias selected for source smoke.', `${source}; ${alias.routing_level}`)

  if (!options.live) {
    addFinding(report, 'Inbound Smoke', 'PASS', 'Inbound smoke preflight payload is ready. Add --live to submit it.')
    return
  }

  if (options.delivery === 'email') {
    const emailResult = await deliverInboundViaEmail(client, config, alias.email_address, smoke, options)
    if (!emailResult.ok || !emailResult.inbound?.email_id) {
      addFinding(report, 'Inbound Smoke', 'CRITICAL', 'Inbound email delivery smoke did not produce an inbound row.', `HTTP ${emailResult.httpStatus}; error=${emailResult.payload?.error || ''}`)
      return
    }
    await verifyProcessedInbound(client, report, {
      source,
      smoke,
      result: {
        inboundEmailId: emailResult.inbound.email_id,
        leadId: emailResult.inbound.lead_id,
        contactId: emailResult.inbound.contact_id,
      },
    })

    if (options.reviewCase === 'none') return

    if (options.reviewCase === 'unmatched') {
      const unmatchedSmoke = buildInboundSmokePayload({ source, token: createSmokeToken('unmatched'), unmatched: true })
      const unmatchedResult = await deliverInboundViaEmail(client, config, unmatchedSmoke.payload.recipient, unmatchedSmoke, options)
      if (!unmatchedResult.ok || !unmatchedResult.inbound?.email_id) {
        addFinding(report, 'Review Smoke', 'CRITICAL', 'Unmatched review email smoke did not produce an inbound row.', `HTTP ${unmatchedResult.httpStatus}; error=${unmatchedResult.payload?.error || ''}`)
        return
      }
      await verifyUnmatchedReview(client, report, {
        result: { inboundEmailId: unmatchedResult.inbound.email_id },
      })
      return
    }

    const reviewSmoke = buildInboundSmokePayload({ source, aliasEmail: alias.email_address, token: createSmokeToken('review'), lowConfidence: true })
    const reviewResult = await deliverInboundViaEmail(client, config, alias.email_address, reviewSmoke, options)
    if (!reviewResult.ok || !reviewResult.inbound?.email_id) {
      addFinding(report, 'Review Smoke', 'CRITICAL', 'Low-confidence review email smoke did not produce an inbound row.', `HTTP ${reviewResult.httpStatus}; error=${reviewResult.payload?.error || ''}`)
      return
    }
    await verifyLowConfidenceReview(client, report, {
      result: {
        inboundEmailId: reviewResult.inbound.email_id,
        leadId: reviewResult.inbound.lead_id,
        contactId: reviewResult.inbound.contact_id,
      },
      smoke: reviewSmoke,
    })
    return
  }

  const result = await postInbound(config, smoke, options)
  if (!result.ok || !result.payload?.success || !result.payload?.inboundEmailId) {
    addFinding(report, 'Inbound Smoke', 'CRITICAL', 'Inbound edge function did not accept the smoke payload.', `HTTP ${result.httpStatus}; status=${result.payload?.status || ''}; error=${result.payload?.error || ''}`)
    return
  }

  await verifyProcessedInbound(client, report, { source, smoke, result: result.payload })

  if (options.reviewCase === 'none') return

  if (options.reviewCase === 'unmatched') {
    const unmatchedSmoke = buildInboundSmokePayload({ source, token: createSmokeToken('unmatched'), unmatched: true })
    const unmatchedResult = await postInbound(config, unmatchedSmoke, options)
    if (unmatchedResult.httpStatus !== 202 || unmatchedResult.payload?.status !== 'unmatched' || !unmatchedResult.payload?.inboundEmailId) {
      addFinding(report, 'Review Smoke', 'CRITICAL', 'Unmatched review smoke was not accepted as unmatched.', `HTTP ${unmatchedResult.httpStatus}; error=${unmatchedResult.payload?.error || ''}`)
      return
    }
    await verifyUnmatchedReview(client, report, { result: unmatchedResult.payload })
    return
  }

  const reviewSmoke = buildInboundSmokePayload({ source, aliasEmail: alias.email_address, token: createSmokeToken('review'), lowConfidence: true })
  const reviewResult = await postInbound(config, reviewSmoke, options)
  if (!reviewResult.ok || !reviewResult.payload?.inboundEmailId) {
    addFinding(report, 'Review Smoke', 'CRITICAL', 'Low-confidence review smoke was not accepted.', `HTTP ${reviewResult.httpStatus}; error=${reviewResult.payload?.error || ''}`)
    return
  }
  await verifyLowConfidenceReview(client, report, { result: reviewResult.payload, smoke: reviewSmoke })
}

async function runOutboundSmoke(report, config, options) {
  const outbound = buildOutboundSmokePayload({ recipient: config.outboundRecipient })
  report.outbound = {
    mode: options.live ? 'live' : options.skipNetwork ? 'static' : 'preflight',
    recipient: config.outboundRecipient || null,
    type: outbound.payload.type,
    subject: outbound.payload.subject,
  }

  if (!config.outboundRecipient) {
    addFinding(report, 'Outbound Smoke', 'BLOCKED', 'Outbound smoke recipient is not configured.', 'Set LEAD_PILOT_SMOKE_TO_EMAIL or pass --to.')
    return
  }

  if (!isAllowedSmokeRecipient(config.outboundRecipient, config.allowedRecipientDomains) && !options.allowExternalRecipient) {
    addFinding(report, 'Outbound Smoke', 'BLOCKED', 'Outbound smoke recipient is outside the allowed internal/test domains.', 'Set LEAD_PILOT_SMOKE_ALLOWED_EMAIL_DOMAINS or pass --allow-external-recipient intentionally.')
    return
  }

  if (!outbound.payload.subject || !outbound.payload.message || !outbound.payload.html) {
    addFinding(report, 'Outbound Smoke', 'CRITICAL', 'Outbound smoke email payload is missing rendered content.')
    return
  }

  if (options.skipNetwork) {
    addFinding(report, 'Outbound Smoke', 'PASS', 'Static outbound email payload is buildable.')
    return
  }

  if (!options.live) {
    addFinding(report, 'Outbound Smoke', 'PASS', 'Outbound email smoke preflight payload is ready. Add --live to send it.')
    return
  }

  const accessToken = await signInActor(config)
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/send-email`
  const { response, payload } = await fetchJson(url, {
    method: 'POST',
    timeoutMs: options.timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'user-agent': 'arch9-lead-pilot-smoke/1.0',
    },
    body: JSON.stringify(outbound.payload),
  })

  report.outbound = {
    ...report.outbound,
    httpStatus: response.status,
    ok: Boolean(payload?.ok),
    emailId: payload?.emailId || payload?.providerMessageId || null,
  }

  if (!response.ok || !payload?.ok || !report.outbound.emailId) {
    addFinding(report, 'Outbound Smoke', 'CRITICAL', 'Outbound send-email smoke failed.', `HTTP ${response.status}; error=${payload?.error || ''}`)
    return
  }

  addFinding(report, 'Outbound Smoke', 'PASS', 'Outbound Lead email generator sent a test email.', `type=${payload.type || outbound.payload.type}`)
}

async function run(options = parseArgs(process.argv.slice(2))) {
  const report = createReport(options)
  const env = loadEnv()
  const { config, missing } = requireConfig(env, report, options)

  if (missing.length || report.summary.criticalCount > 0) return finalizeReport(report)

  if (options.source) {
    try {
      await runInboundSmoke(report, config, options)
    } catch (error) {
      addFinding(report, 'Inbound Smoke', 'BLOCKED', 'Inbound smoke could not complete.', error instanceof Error ? error.message : String(error))
    }
  }
  if (options.outboundEmail) {
    try {
      await runOutboundSmoke(report, config, options)
    } catch (error) {
      addFinding(report, 'Outbound Smoke', 'BLOCKED', 'Outbound smoke could not complete.', error instanceof Error ? error.message : String(error))
    }
  }

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
  buildInboundSmokePayload,
  buildOutboundSmokePayload,
  isAllowedSmokeRecipient,
  normalizeSource,
  parseArgs,
}
