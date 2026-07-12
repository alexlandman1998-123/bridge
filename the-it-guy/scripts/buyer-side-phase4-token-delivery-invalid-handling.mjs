#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const prerequisiteSteps = [
  {
    key: 'buyer_phase3_offer_token_browser_contract',
    label: 'Buyer Phase 3 public offer-token browser contract',
    script: 'verify:buyer-side-phase3-offer-token-browser',
    coverage: 'Public offer token routes, invalid/expired offer handling, duplicate live offer warning, and revised offer browser contracts remain green.',
  },
]

const phase4EnvKeys = [
  'BUYER_SIDE_STAGING_ONBOARDING_DELIVERY_ID',
  'BUYER_SIDE_STAGING_PORTAL_DELIVERY_ID',
  'BUYER_SIDE_STAGING_OFFER_DELIVERY_ID',
  'BUYER_SIDE_STAGING_TOKEN_SMS_DELIVERY_ID',
  'BUYER_SIDE_STAGING_REUSED_ONBOARDING_TOKEN',
  'BUYER_SIDE_STAGING_REUSED_PORTAL_TOKEN',
  'BUYER_SIDE_STAGING_ALREADY_SUBMITTED_ONBOARDING_TOKEN',
  'BUYER_SIDE_STAGING_INACTIVE_PORTAL_TOKEN',
  'BUYER_SIDE_STAGING_MALFORMED_TOKEN',
]

const requiredLiveConfigKeys = [
  'baseUrl',
  'supabaseUrl',
  'serviceRoleKey',
  'projectRef',
  'transactionId',
  'buyerLeadId',
  'offerId',
  'onboardingToken',
  'portalToken',
  'offerToken',
  'offerSessionToken',
  'onboardingDeliveryId',
  'portalDeliveryId',
  'offerDeliveryId',
  'tokenSmsDeliveryId',
  'alreadySubmittedOnboardingToken',
  'inactivePortalToken',
]

const deliveryContracts = [
  {
    key: 'onboarding_email_delivery',
    configKey: 'onboardingDeliveryId',
    label: 'Buyer onboarding email delivery',
    expectedTypes: ['client_onboarding'],
    expectedChannels: ['email'],
    expectedStatuses: ['sent', 'delivered'],
    expectedTransactionLink: true,
  },
  {
    key: 'portal_email_delivery',
    configKey: 'portalDeliveryId',
    label: 'Buyer portal email delivery',
    expectedTypes: ['client_portal_link'],
    expectedChannels: ['email'],
    expectedStatuses: ['sent', 'delivered'],
    expectedTransactionLink: true,
  },
  {
    key: 'offer_email_delivery',
    configKey: 'offerDeliveryId',
    label: 'Buyer offer email delivery',
    expectedTypes: ['buyer_offer_link', 'offer_link', 'post_viewing_offer_link'],
    expectedChannels: ['email'],
    expectedStatuses: ['sent', 'delivered'],
    expectedOfferOrPortalLink: true,
  },
  {
    key: 'token_sms_delivery',
    configKey: 'tokenSmsDeliveryId',
    label: 'Buyer token SMS/WhatsApp delivery',
    expectedTypes: ['client_onboarding', 'client_portal_link', 'buyer_offer_link', 'offer_link', 'post_viewing_offer_link'],
    expectedChannels: ['sms', 'whatsapp'],
    expectedStatuses: ['sent', 'delivered'],
    expectedAnyTokenSurface: true,
  },
]

const staticChecks = [
  {
    key: 'phase4_audit_doc',
    label: 'Buyer Phase 4 audit doc defines token delivery and invalid-token evidence.',
    file: 'docs/audits/buyer-side-launch-hardening-phase4.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 4/,
      /## Goal/,
      /## Commands/,
      /## Delivery Evidence Matrix/,
      /## Token-State Matrix/,
      /## Live Evidence Contract/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 4 HARNESS IMPLEMENTED; LIVE DELIVERY EVIDENCE REQUIRED/,
    ],
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 4 token delivery command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase4-token-delivery":\s*"node scripts\/buyer-side-phase4-token-delivery-invalid-handling\.mjs"/,
      /"verify:buyer-side-phase3-offer-token-browser":\s*"node scripts\/buyer-side-phase3-offer-token-browser-smoke\.mjs"/,
    ],
  },
  {
    key: 'phase0_index_updated',
    label: 'Buyer Phase 0 scope lock lists the Phase 4 token-delivery command and strict live command.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /Phase 4 \| Token delivery and invalid-token handling/,
      /npm run verify:buyer-side-phase4-token-delivery/,
      /node scripts\/buyer-side-phase4-token-delivery-invalid-handling\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'phase8_index_updated',
    label: 'Phase 8 launch readiness links Buyer Phase 4 and its strict delivery evidence command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 4 token delivery and invalid-token handling: `docs\/audits\/buyer-side-launch-hardening-phase4\.md`/,
      /npm run verify:buyer-side-phase4-token-delivery/,
      /node scripts\/buyer-side-phase4-token-delivery-invalid-handling\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'env_delivery_contract',
    label: '.env.example declares Phase 4 delivery and token-state evidence placeholders.',
    file: '.env.example',
    patterns: phase4EnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'send_email_router_delivery_types',
    label: 'send-email router supports onboarding, portal, and buyer offer token delivery types.',
    file: '../supabase/functions/send-email/index.ts',
    patterns: [
      /\["client_onboarding", "onboarding", "onboarding_email"\]\.includes\(type\)/,
      /"client_portal_link" === type \|\| "client_portal" === type \|\|/,
      /\["buyer_offer_link", "offer_link", "post_viewing_offer_link"\]\.includes/,
    ],
  },
  {
    key: 'client_onboarding_delivery_logging',
    label: 'Client onboarding email prepares, marks, and returns a delivery id.',
    file: '../supabase/functions/send-email/handlers/clientOnboarding.ts',
    patterns: [
      /prepareEmailDelivery/,
      /communicationType: "client_onboarding"/,
      /metadata: \{[\s\S]*onboardingToken/,
      /markEmailDeliverySent/,
      /markEmailDeliveryFailed/,
      /deliveryId: delivery\?\.id \|\| null/,
    ],
  },
  {
    key: 'client_portal_delivery_logging',
    label: 'Client portal link email prepares, marks, and returns a delivery id.',
    file: '../supabase/functions/send-email/handlers/onboardingSubmitted.ts',
    patterns: [
      /isClientPortalLinkEmail/,
      /"client_portal_link"/,
      /prepareEmailDelivery/,
      /clientPortalToken/,
      /markEmailDeliverySent/,
      /markEmailDeliveryFailed/,
      /deliveryId: delivery\?\.id \|\| null/,
    ],
  },
  {
    key: 'buyer_offer_delivery_logging',
    label: 'Buyer offer email prepares, marks, and returns a delivery id.',
    file: '../supabase/functions/send-email/handlers/buyerOfferLink.ts',
    patterns: [
      /prepareEmailDelivery/,
      /communicationType: "buyer_offer_link"/,
      /offerLink/,
      /markEmailDeliverySent/,
      /markEmailDeliveryFailed/,
      /deliveryId: delivery\?\.id \|\| null/,
    ],
  },
  {
    key: 'communication_deliveries_schema',
    label: 'Communication deliveries support transaction, offer, portal session, retry, sms, whatsapp, metadata, and opened evidence.',
    file: '../supabase/migrations/202606110008_communication_delivery_offer_transaction_phase7.sql',
    patterns: [
      /alter column lead_id drop not null/,
      /transaction_id uuid references public\.transactions/,
      /offer_id uuid references public\.offers/,
      /portal_session_id uuid references public\.offer_portal_sessions/,
      /retry_of_id uuid references public\.communication_deliveries/,
      /channel in \('email', 'whatsapp', 'sms'\)/,
      /metadata_json jsonb not null default/,
      /bridge_sync_offer_portal_delivery_opened_phase7/,
    ],
  },
  {
    key: 'agent_workspace_delivery_visibility',
    label: 'Agent lead workspace surfaces offer and onboarding delivery failures to operations.',
    file: 'src/pages/AgentLeadsPage.jsx',
    patterns: [
      /function getLatestDeliveryByType/,
      /communicationDeliveries/,
      /getLatestDeliveryByType\(row, \['buyer_offer_link'\]\)/,
      /getLatestDeliveryByType\(row, \['client_onboarding'\]\)/,
      /Offer link failed/,
      /onboarding email failed/i,
    ],
  },
  {
    key: 'public_token_invalid_states',
    label: 'Public onboarding, portal, offer, and post-viewing routes fail closed on missing or invalid tokens.',
    file: 'src/pages/ClientOnboarding.jsx',
    patterns: [
      /Missing onboarding token/,
      /fetchClientOnboardingByToken\(token\)/,
      /Unable to load onboarding form/,
      /data\?\.onboarding\?\.status === 'Submitted'/,
      /Complete Your Onboarding/,
    ],
  },
  {
    key: 'client_portal_invalid_state',
    label: 'Buyer client portal renders a safe invalid-token state.',
    file: 'src/pages/ClientPortal.jsx',
    patterns: [
      /We could not load your client portal/,
      /Your portal link may be invalid, expired, or temporarily unavailable/,
      /contact your property representative for a new secure link/,
    ],
  },
  {
    key: 'api_token_resolution_guards',
    label: 'API token resolvers reject inactive onboarding and client portal tokens.',
    file: 'src/lib/api.js',
    patterns: [
      /resolveOnboardingTokenContext/,
      /\.from\('transaction_onboarding'\)[\s\S]*\.eq\('token', normalizedToken\)[\s\S]*\.eq\('is_active', true\)/,
      /Onboarding link is invalid or inactive/,
      /resolveClientPortalLinkByToken/,
      /\.from\('client_portal_links'\)[\s\S]*\.eq\('token', token\)[\s\S]*\.eq\('is_active', true\)/,
      /Client portal link is invalid or inactive/,
    ],
  },
  {
    key: 'script_live_matrix_locked',
    label: 'Phase 4 script includes delivery and token-state live matrices.',
    file: 'scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs',
    patterns: [
      /onboarding_email_delivery/,
      /portal_email_delivery/,
      /offer_email_delivery/,
      /token_sms_delivery/,
      /already_submitted_onboarding_token/,
      /inactive_portal_token/,
      /malformed_token_absence/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function cleanEnvValue(value = '') {
  return normalizeText(value).replace(/^["']|["']$/g, '').replace(/\\n$/g, '')
}

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipPrerequisites: false,
    live: false,
    confirmStaging: false,
    requireLive: false,
    sampleLimit: 10,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-prerequisites') options.skipPrerequisites = true
    else if (arg === '--live') options.live = true
    else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--require-live') {
      options.live = true
      options.requireLive = true
    } else if (arg.startsWith('--sample-limit=')) {
      const sampleLimit = Number.parseInt(arg.slice('--sample-limit='.length), 10)
      if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 50) {
        throw new Error('--sample-limit must be an integer from 1 to 50')
      }
      options.sampleLimit = sampleLimit
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function parseEnvFile(fileName) {
  const filePath = new URL(fileName, PROJECT_ROOT)
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
        return [line.slice(0, separator), cleanEnvValue(line.slice(separator + 1))]
      }),
  )
}

function loadEnv() {
  const files = {
    base: parseEnvFile('.env'),
    staging: parseEnvFile('.env.staging.local'),
  }
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizeText(value)),
  )
  const merged = { ...files.base, ...files.staging, ...processOverrides }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function buildConfig(env) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const malformedToken = normalizeText(env.BUYER_SIDE_STAGING_MALFORMED_TOKEN) || 'phase4_malformed_token_%2F%2E%2E'
  return {
    baseUrl: normalizeText(env.BUYER_SIDE_LAUNCH_BASE_URL),
    supabaseUrl,
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    projectRef: normalizeText(env.BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF) || projectRefFromUrl(supabaseUrl),
    transactionId: normalizeText(env.BUYER_SIDE_STAGING_TRANSACTION_ID),
    buyerLeadId: normalizeText(env.BUYER_SIDE_STAGING_BUYER_LEAD_ID),
    offerId: normalizeText(env.BUYER_SIDE_STAGING_OFFER_ID),
    onboardingToken: normalizeText(env.BUYER_SIDE_STAGING_ONBOARDING_TOKEN),
    portalToken: normalizeText(env.BUYER_SIDE_STAGING_PORTAL_TOKEN),
    offerToken: normalizeText(env.BUYER_SIDE_STAGING_OFFER_TOKEN),
    offerSessionToken: normalizeText(env.BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN),
    expiredOfferToken: normalizeText(env.BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN),
    onboardingDeliveryId: normalizeText(env.BUYER_SIDE_STAGING_ONBOARDING_DELIVERY_ID),
    portalDeliveryId: normalizeText(env.BUYER_SIDE_STAGING_PORTAL_DELIVERY_ID),
    offerDeliveryId: normalizeText(env.BUYER_SIDE_STAGING_OFFER_DELIVERY_ID),
    tokenSmsDeliveryId: normalizeText(env.BUYER_SIDE_STAGING_TOKEN_SMS_DELIVERY_ID),
    reusedOnboardingToken: normalizeText(env.BUYER_SIDE_STAGING_REUSED_ONBOARDING_TOKEN),
    reusedPortalToken: normalizeText(env.BUYER_SIDE_STAGING_REUSED_PORTAL_TOKEN),
    alreadySubmittedOnboardingToken: normalizeText(env.BUYER_SIDE_STAGING_ALREADY_SUBMITTED_ONBOARDING_TOKEN),
    inactivePortalToken: normalizeText(env.BUYER_SIDE_STAGING_INACTIVE_PORTAL_TOKEN),
    malformedToken,
  }
}

function createReport(options) {
  return {
    phase: '4',
    scope: 'buyer-side-launch-hardening',
    gate: 'token-delivery-invalid-token-handling',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 4 token delivery blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      commandSkippedCount: 0,
      livePassCount: 0,
      liveWarningCount: 0,
      liveBlockedCount: 0,
      liveCriticalCount: 0,
    },
    staticChecks: [],
    commands: [],
    live: {
      mode: options.live ? 'staging-read-only' : 'skipped',
      projectRef: null,
      transactionId: null,
      buyerLeadId: null,
      offerId: null,
      tokenKeysConfigured: {},
      deliveryIdsConfigured: {},
      deliveryChecks: [],
      tokenChecks: [],
      checks: [],
      warnings: [],
    },
    liveCommand: 'node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --live --confirm-staging --require-live',
    acceptance: [
      'send-email returns deliveryId evidence for buyer onboarding, buyer portal link, and buyer offer link sends.',
      'communication_deliveries supports email, SMS, WhatsApp, transaction, offer, portal-session, retry, metadata, and open/delivered timestamps.',
      'Agent operations can see failed buyer offer and onboarding delivery states.',
      'Live mode validates configured delivery ids and fails if required email/SMS token delivery evidence is missing.',
      'Live mode validates active, inactive/reused, already-submitted, expired, and malformed token states without mutating data.',
      'Live mode is read-only and requires explicit --live --confirm-staging flags.',
    ],
  }
}

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function runStaticChecks(report) {
  for (const check of staticChecks) {
    const result = {
      key: check.key,
      label: check.label,
      file: check.file,
      status: 'PASS',
      missingPatterns: [],
    }

    try {
      const source = readProjectFile(check.file)
      for (const pattern of check.patterns) {
        if (!pattern.test(source)) {
          result.status = 'BLOCKED'
          result.missingPatterns.push(String(pattern))
        }
      }
    } catch (error) {
      result.status = 'BLOCKED'
      result.error = error?.message || String(error)
    }

    report.staticChecks.push(result)
    if (result.status === 'PASS') report.summary.staticPassCount += 1
    else report.summary.staticBlockedCount += 1
  }
}

function tailLines(value, count = 10) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function runNpmScript(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(NPM_BIN, ['run', step.script], {
      cwd: PROJECT_ROOT_PATH,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      resolve({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: code === 0 ? 'PASS' : 'BLOCKED',
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout: tailLines(stdout),
        stderr: tailLines(stderr),
      })
    })
    child.on('error', (error) => {
      resolve({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: 'BLOCKED',
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      })
    })
  })
}

async function runPrerequisites(report, options) {
  if (options.staticOnly || options.skipPrerequisites) {
    for (const step of prerequisiteSteps) {
      report.commands.push({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: 'SKIPPED',
      })
      report.summary.commandSkippedCount += 1
    }
    return
  }

  for (const step of prerequisiteSteps) {
    const result = await runNpmScript(step)
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function addLiveCheck(report, key, status, label, detail = '') {
  const check = { key, status, label, detail }
  report.live.checks.push(check)
  if (status === 'PASS') report.summary.livePassCount += 1
  if (status === 'WARN') {
    report.summary.liveWarningCount += 1
    report.live.warnings.push(check)
  }
  if (status === 'BLOCKED') report.summary.liveBlockedCount += 1
  if (status === 'CRITICAL') report.summary.liveCriticalCount += 1
}

function addDeliveryCheck(report, key, status, label, detail = '', row = null) {
  report.live.deliveryChecks.push({ key, status, label, detail, row })
  addLiveCheck(report, key, status, label, detail)
}

function addTokenCheck(report, key, status, label, detail = '', row = null) {
  report.live.tokenChecks.push({ key, status, label, detail, row })
  addLiveCheck(report, key, status, label, detail)
}

function validateLiveConfig(report, options, config) {
  report.live.projectRef = config.projectRef || null
  report.live.transactionId = config.transactionId || null
  report.live.buyerLeadId = config.buyerLeadId || null
  report.live.offerId = config.offerId || null
  report.live.tokenKeysConfigured = {
    BUYER_SIDE_STAGING_ONBOARDING_TOKEN: Boolean(config.onboardingToken),
    BUYER_SIDE_STAGING_PORTAL_TOKEN: Boolean(config.portalToken),
    BUYER_SIDE_STAGING_OFFER_TOKEN: Boolean(config.offerToken),
    BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN: Boolean(config.offerSessionToken),
    BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN: Boolean(config.expiredOfferToken),
    BUYER_SIDE_STAGING_REUSED_ONBOARDING_TOKEN: Boolean(config.reusedOnboardingToken),
    BUYER_SIDE_STAGING_REUSED_PORTAL_TOKEN: Boolean(config.reusedPortalToken),
    BUYER_SIDE_STAGING_ALREADY_SUBMITTED_ONBOARDING_TOKEN: Boolean(config.alreadySubmittedOnboardingToken),
    BUYER_SIDE_STAGING_INACTIVE_PORTAL_TOKEN: Boolean(config.inactivePortalToken),
    BUYER_SIDE_STAGING_MALFORMED_TOKEN: Boolean(config.malformedToken),
  }
  report.live.deliveryIdsConfigured = {
    BUYER_SIDE_STAGING_ONBOARDING_DELIVERY_ID: Boolean(config.onboardingDeliveryId),
    BUYER_SIDE_STAGING_PORTAL_DELIVERY_ID: Boolean(config.portalDeliveryId),
    BUYER_SIDE_STAGING_OFFER_DELIVERY_ID: Boolean(config.offerDeliveryId),
    BUYER_SIDE_STAGING_TOKEN_SMS_DELIVERY_ID: Boolean(config.tokenSmsDeliveryId),
  }

  const missing = requiredLiveConfigKeys
    .filter((key) => !config[key])
    .map(envKeyForConfigKey)
  if (missing.length) {
    addLiveCheck(
      report,
      'phase4_live_configuration',
      options.live ? 'BLOCKED' : 'WARN',
      'Phase 4 live delivery configuration is incomplete.',
      missing.join(', '),
    )
  } else {
    addLiveCheck(report, 'phase4_live_configuration', 'PASS', 'Phase 4 live delivery configuration is complete.')
  }

  if (!config.projectRef) {
    addLiveCheck(report, 'phase4_staging_ref', options.live ? 'BLOCKED' : 'WARN', 'Could not resolve staging project ref.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addLiveCheck(
      report,
      'phase4_staging_ref',
      'CRITICAL',
      'Refusing to run Buyer Phase 4 against a non-approved Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addLiveCheck(report, 'phase4_staging_ref', 'PASS', 'Supabase project ref matches approved staging.')
  }

  if (options.live && !options.confirmStaging) {
    addLiveCheck(report, 'phase4_confirm_staging', 'CRITICAL', 'Live Buyer Phase 4 requires --confirm-staging.')
  } else if (options.live) {
    addLiveCheck(report, 'phase4_confirm_staging', 'PASS', 'Live staging delivery run was explicitly confirmed.')
  }
}

function envKeyForConfigKey(key) {
  return {
    baseUrl: 'BUYER_SIDE_LAUNCH_BASE_URL',
    supabaseUrl: 'SUPABASE_URL/VITE_SUPABASE_URL',
    serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
    projectRef: 'BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF or Supabase URL project ref',
    transactionId: 'BUYER_SIDE_STAGING_TRANSACTION_ID',
    buyerLeadId: 'BUYER_SIDE_STAGING_BUYER_LEAD_ID',
    offerId: 'BUYER_SIDE_STAGING_OFFER_ID',
    onboardingToken: 'BUYER_SIDE_STAGING_ONBOARDING_TOKEN',
    portalToken: 'BUYER_SIDE_STAGING_PORTAL_TOKEN',
    offerToken: 'BUYER_SIDE_STAGING_OFFER_TOKEN',
    offerSessionToken: 'BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN',
    expiredOfferToken: 'BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN',
    onboardingDeliveryId: 'BUYER_SIDE_STAGING_ONBOARDING_DELIVERY_ID',
    portalDeliveryId: 'BUYER_SIDE_STAGING_PORTAL_DELIVERY_ID',
    offerDeliveryId: 'BUYER_SIDE_STAGING_OFFER_DELIVERY_ID',
    tokenSmsDeliveryId: 'BUYER_SIDE_STAGING_TOKEN_SMS_DELIVERY_ID',
    reusedOnboardingToken: 'BUYER_SIDE_STAGING_REUSED_ONBOARDING_TOKEN',
    reusedPortalToken: 'BUYER_SIDE_STAGING_REUSED_PORTAL_TOKEN',
    alreadySubmittedOnboardingToken: 'BUYER_SIDE_STAGING_ALREADY_SUBMITTED_ONBOARDING_TOKEN',
    inactivePortalToken: 'BUYER_SIDE_STAGING_INACTIVE_PORTAL_TOKEN',
    malformedToken: 'BUYER_SIDE_STAGING_MALFORMED_TOKEN',
  }[key] || key
}

function createSupabaseServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function sameId(left, right) {
  const normalizedLeft = normalizeLower(left)
  const normalizedRight = normalizeLower(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function asStatus(row = {}) {
  return normalizeLower(row.status)
}

function isPastDate(value = '') {
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()
}

async function maybeSingleBy(client, table, column, value, select = '*') {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq(column, normalized)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`${table}.${column}: ${error.message}`)
  return data || null
}

async function fetchDeliveryById(client, deliveryId = '') {
  return maybeSingleBy(client, 'communication_deliveries', 'id', deliveryId)
}

function classifyDelivery(contract, row, config) {
  if (!row) {
    return { status: 'BLOCKED', detail: 'Configured delivery id did not resolve.' }
  }
  const communicationType = normalizeLower(row.communication_type || row.communicationType)
  const channel = normalizeLower(row.channel)
  const status = asStatus(row)
  if (!contract.expectedTypes.includes(communicationType)) {
    return {
      status: 'BLOCKED',
      detail: `Expected communication_type ${contract.expectedTypes.join(' or ')}; found ${communicationType || 'blank'}.`,
    }
  }
  if (!contract.expectedChannels.includes(channel)) {
    return {
      status: 'BLOCKED',
      detail: `Expected channel ${contract.expectedChannels.join(' or ')}; found ${channel || 'blank'}.`,
    }
  }
  if (!contract.expectedStatuses.includes(status)) {
    return {
      status: 'BLOCKED',
      detail: `Expected delivery status ${contract.expectedStatuses.join(' or ')}; found ${status || 'blank'}.`,
    }
  }
  if (contract.expectedTransactionLink && !sameId(row.transaction_id, config.transactionId)) {
    return {
      status: 'BLOCKED',
      detail: `Delivery is not linked to configured transaction ${config.transactionId}.`,
    }
  }
  if (contract.expectedOfferOrPortalLink) {
    const linked =
      sameId(row.offer_id, config.offerId) ||
      normalizeText(row.portal_session_id) ||
      normalizeText(row.metadata_json?.offerPortalToken || row.metadata_json?.offerToken)
    if (!linked) {
      return {
        status: 'WARN',
        detail: 'Offer delivery is sent, but it is not linked by offer_id, portal_session_id, or token metadata.',
      }
    }
  }
  if (contract.expectedAnyTokenSurface) {
    const linked =
      sameId(row.transaction_id, config.transactionId) ||
      sameId(row.offer_id, config.offerId) ||
      sameId(row.lead_id, config.buyerLeadId) ||
      normalizeText(row.portal_session_id) ||
      normalizeText(row.metadata_json?.onboardingToken || row.metadata_json?.clientPortalToken || row.metadata_json?.offerPortalToken)
    if (!linked) {
      return {
        status: 'BLOCKED',
        detail: 'SMS/WhatsApp delivery is not linked to the configured buyer lead, transaction, offer, or token metadata.',
      }
    }
  }
  return {
    status: 'PASS',
    detail: `${communicationType} ${channel} delivery is ${status}.`,
  }
}

async function runDeliveryEvidence(report, client, config) {
  for (const contract of deliveryContracts) {
    const deliveryId = config[contract.configKey]
    if (!deliveryId) {
      addDeliveryCheck(
        report,
        contract.key,
        'BLOCKED',
        `${contract.label} evidence id is missing.`,
        envKeyForConfigKey(contract.configKey),
      )
      continue
    }
    let row = null
    try {
      row = await fetchDeliveryById(client, deliveryId)
    } catch (error) {
      addDeliveryCheck(report, contract.key, 'BLOCKED', `${contract.label} query failed.`, error.message)
      continue
    }
    const classified = classifyDelivery(contract, row, config)
    addDeliveryCheck(
      report,
      contract.key,
      classified.status,
      contract.label,
      classified.detail,
      row ? {
        id: row.id,
        communication_type: row.communication_type,
        channel: row.channel,
        status: row.status,
        transaction_id: row.transaction_id || null,
        offer_id: row.offer_id || null,
        portal_session_id: row.portal_session_id || null,
      } : null,
    )
  }
}

async function runTokenEvidence(report, client, config) {
  const activeOnboarding = await maybeSingleBy(client, 'transaction_onboarding', 'token', config.onboardingToken)
  addTokenCheck(
    report,
    'active_onboarding_token',
    activeOnboarding?.is_active === true && sameId(activeOnboarding.transaction_id, config.transactionId) ? 'PASS' : 'BLOCKED',
    'Configured buyer onboarding token resolves to the configured transaction and is active.',
    activeOnboarding ? `status=${activeOnboarding.status || ''}` : 'No onboarding row found.',
    activeOnboarding,
  )

  const submittedOnboarding = await maybeSingleBy(client, 'transaction_onboarding', 'token', config.alreadySubmittedOnboardingToken)
  const submittedOk = Boolean(
    submittedOnboarding &&
      submittedOnboarding.is_active === true &&
      (normalizeLower(submittedOnboarding.status) === 'submitted' || normalizeText(submittedOnboarding.submitted_at)),
  )
  addTokenCheck(
    report,
    'already_submitted_onboarding_token',
    submittedOk ? 'PASS' : 'BLOCKED',
    'Already-submitted onboarding token resolves only to a submitted/completion state.',
    submittedOnboarding ? `status=${submittedOnboarding.status || ''}` : 'No submitted onboarding row found.',
    submittedOnboarding,
  )

  if (config.reusedOnboardingToken) {
    const reusedOnboarding = await maybeSingleBy(client, 'transaction_onboarding', 'token', config.reusedOnboardingToken)
    const reusedOk = Boolean(reusedOnboarding && reusedOnboarding.is_active === false)
    addTokenCheck(
      report,
      'reused_onboarding_token',
      reusedOk ? 'PASS' : 'BLOCKED',
      'Reused onboarding token is inactive and should fail public token resolution.',
      reusedOnboarding ? `is_active=${String(reusedOnboarding.is_active)}` : 'No reused onboarding row found.',
      reusedOnboarding,
    )
  } else {
    addTokenCheck(report, 'reused_onboarding_token', 'WARN', 'Reused onboarding token evidence was not configured.')
  }

  const activePortal = await maybeSingleBy(client, 'client_portal_links', 'token', config.portalToken)
  addTokenCheck(
    report,
    'active_portal_token',
    activePortal?.is_active === true && sameId(activePortal.transaction_id, config.transactionId) ? 'PASS' : 'BLOCKED',
    'Configured buyer portal token resolves to the configured transaction and is active.',
    activePortal ? `is_active=${String(activePortal.is_active)}` : 'No portal link row found.',
    activePortal,
  )

  const inactivePortal = await maybeSingleBy(client, 'client_portal_links', 'token', config.inactivePortalToken)
  addTokenCheck(
    report,
    'inactive_portal_token',
    inactivePortal?.is_active === false ? 'PASS' : 'BLOCKED',
    'Inactive/reused portal token is inactive and should fail public portal resolution.',
    inactivePortal ? `is_active=${String(inactivePortal.is_active)}` : 'No inactive portal row found.',
    inactivePortal,
  )

  if (config.reusedPortalToken && config.reusedPortalToken !== config.inactivePortalToken) {
    const reusedPortal = await maybeSingleBy(client, 'client_portal_links', 'token', config.reusedPortalToken)
    addTokenCheck(
      report,
      'reused_portal_token',
      reusedPortal?.is_active === false ? 'PASS' : 'BLOCKED',
      'Reused portal token is inactive and should fail public portal resolution.',
      reusedPortal ? `is_active=${String(reusedPortal.is_active)}` : 'No reused portal row found.',
      reusedPortal,
    )
  } else {
    addTokenCheck(report, 'reused_portal_token', 'WARN', 'Separate reused portal token evidence was not configured.')
  }

  const expiredOffer = await maybeSingleBy(client, 'offers', 'offer_token', config.expiredOfferToken)
  const expiredOk = Boolean(expiredOffer && (normalizeLower(expiredOffer.status) === 'expired' || isPastDate(expiredOffer.expiry_date)))
  addTokenCheck(
    report,
    'expired_offer_token',
    expiredOk ? 'PASS' : 'BLOCKED',
    'Expired offer token is expired by status or expiry date.',
    expiredOffer ? `status=${expiredOffer.status || ''}, expiry_date=${expiredOffer.expiry_date || ''}` : 'No expired offer row found.',
    expiredOffer,
  )

  const malformedToken = config.malformedToken
  const [malformedOnboarding, malformedPortal, malformedOffer, malformedSession] = await Promise.all([
    maybeSingleBy(client, 'transaction_onboarding', 'token', malformedToken).catch(() => null),
    maybeSingleBy(client, 'client_portal_links', 'token', malformedToken).catch(() => null),
    maybeSingleBy(client, 'offers', 'offer_token', malformedToken).catch(() => null),
    maybeSingleBy(client, 'offer_portal_sessions', 'token', malformedToken).catch(() => null),
  ])
  const malformedClear = !malformedOnboarding && !malformedPortal && !malformedOffer && !malformedSession
  addTokenCheck(
    report,
    'malformed_token_absence',
    malformedClear ? 'PASS' : 'CRITICAL',
    'Configured malformed token does not resolve on any buyer public token table.',
    malformedClear ? malformedToken : 'Malformed token unexpectedly resolved.',
  )
}

async function runLiveChecks(report, options, config) {
  validateLiveConfig(report, options, config)
  if (!options.live) {
    report.live.mode = 'skipped'
    return
  }
  if (report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0) return

  const client = createSupabaseServiceClient(config)
  await runDeliveryEvidence(report, client, config)
  await runTokenEvidence(report, client, config)
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.liveBlockedCount > 0 ||
    report.summary.liveCriticalCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Buyer Phase 4 token delivery blockers are cleared'
    return report
  }

  if (options.live) {
    report.summary.status = report.summary.liveWarningCount > 0 ? 'READY_LIVE_WITH_WARNINGS' : 'READY_LIVE'
    report.summary.recommendation = 'Buyer Phase 4 live token delivery and invalid-token evidence passed'
    return report
  }

  if (options.staticOnly || report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Buyer Phase 4 static token-delivery contracts passed; run without skip flags before local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_CONTRACT'
  report.summary.recommendation = 'Buyer Phase 4 harness is implemented; run live delivery command when token delivery evidence rows are available'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  const config = buildConfig(loadEnv())

  runStaticChecks(report)
  await runPrerequisites(report, options)
  await runLiveChecks(report, options, config)
  finalizeReport(report, options)

  console.log(JSON.stringify(report, null, 2))

  if (!['READY_LOCAL_CONTRACT', 'READY_STATIC_ONLY', 'READY_LIVE', 'READY_LIVE_WITH_WARNINGS'].includes(report.summary.status)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
