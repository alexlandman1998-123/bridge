#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const DEFAULT_PORT = 5198
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`
const MOCK_SUPABASE_URL = 'https://buyer-phase3-offer-smoke.supabase.co'
const MOCK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.phase3'
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const prerequisiteSteps = [
  {
    key: 'buyer_phase2_rls_access_contract',
    label: 'Buyer Phase 2 RLS access probe contract',
    script: 'verify:buyer-side-phase2-rls-access',
    coverage: 'Buyer Phase 2 static RLS policy and local prerequisite contracts remain green before public-token browser evidence is trusted.',
  },
]

const phase3EnvKeys = [
  'BUYER_SIDE_STAGING_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN',
  'BUYER_SIDE_STAGING_INVALID_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_DUPLICATE_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_DUPLICATE_OFFER_SESSION_TOKEN',
  'BUYER_SIDE_STAGING_REVISED_OFFER_TOKEN',
]

const liveRequiredTokenKeys = [
  'offerToken',
  'offerSessionToken',
  'expiredOfferToken',
  'duplicateOfferToken',
  'duplicateOfferSessionToken',
  'revisedOfferToken',
]

const mockIds = {
  organisation: '11111111-1111-4111-8111-111111111111',
  buyerLead: '22222222-2222-4222-8222-222222222222',
  buyerContact: '33333333-3333-4333-8333-333333333333',
  listing: '44444444-4444-4444-8444-444444444444',
  appointment: '55555555-5555-4555-8555-555555555555',
  agent: '66666666-6666-4666-8666-666666666666',
  viewedListing: '77777777-7777-4777-8777-777777777777',
  validOffer: '88888888-8888-4888-8888-888888888881',
  expiredOffer: '88888888-8888-4888-8888-888888888882',
  duplicateOffer: '88888888-8888-4888-8888-888888888883',
  duplicateSecondOffer: '88888888-8888-4888-8888-888888888884',
  revisedOffer: '88888888-8888-4888-8888-888888888885',
  session: '99999999-9999-4999-8999-999999999991',
  duplicateSession: '99999999-9999-4999-8999-999999999992',
}

const mockTokens = {
  validOffer: 'phase3-valid-direct-offer',
  expiredOffer: 'phase3-expired-direct-offer',
  duplicateOffer: 'phase3-duplicate-direct-offer',
  revisedOffer: 'phase3-revised-direct-offer',
  invalidOffer: 'phase3-invalid-direct-offer',
  session: 'phase3-valid-offer-session',
  duplicateSession: 'phase3-duplicate-offer-session',
}

const staticChecks = [
  {
    key: 'phase3_audit_doc',
    label: 'Buyer Phase 3 audit doc defines public offer-token browser smoke coverage.',
    file: 'docs/audits/buyer-side-launch-hardening-phase3.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 3/,
      /## Goal/,
      /## Commands/,
      /## Browser Matrix/,
      /## Staging Token Contract/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 3 HARNESS IMPLEMENTED; LIVE TOKEN EVIDENCE REQUIRED/,
    ],
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 3 offer-token browser smoke command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase3-offer-token-browser":\s*"node scripts\/buyer-side-phase3-offer-token-browser-smoke\.mjs"/,
      /"verify:buyer-side-phase2-rls-access":\s*"node scripts\/buyer-side-phase2-rls-access-probes\.mjs"/,
    ],
  },
  {
    key: 'phase0_index_updated',
    label: 'Buyer Phase 0 scope lock lists the Phase 3 browser command and strict live command.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /Phase 3 \| Public offer token browser smoke/,
      /npm run verify:buyer-side-phase3-offer-token-browser/,
      /node scripts\/buyer-side-phase3-offer-token-browser-smoke\.mjs --browser --confirm-staging --require-browser/,
    ],
  },
  {
    key: 'phase8_index_updated',
    label: 'Phase 8 launch readiness links Buyer Phase 3 and its browser evidence commands.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 3 public offer-token browser smoke: `docs\/audits\/buyer-side-launch-hardening-phase3\.md`/,
      /npm run verify:buyer-side-phase3-offer-token-browser/,
      /node scripts\/buyer-side-phase3-offer-token-browser-smoke\.mjs --browser/,
      /node scripts\/buyer-side-phase3-offer-token-browser-smoke\.mjs --live --confirm-staging --require-browser/,
    ],
  },
  {
    key: 'env_token_contract',
    label: '.env.example declares Phase 3 public offer-token state placeholders.',
    file: '.env.example',
    patterns: phase3EnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'direct_offer_routes_registered',
    label: 'Direct offer and offer detail alias routes remain registered.',
    file: 'src/App.jsx',
    patterns: [
      /path="\/client\/offer\/:token"/,
      /path="\/offers\/:token"/,
      /BuyerOfferSubmission/,
    ],
  },
  {
    key: 'post_viewing_offer_route_registered',
    label: 'Post-viewing offer session route remains registered.',
    file: 'src/App.jsx',
    patterns: [
      /path="\/offers\/session\/:token"/,
      /PostViewingOfferPortal/,
    ],
  },
  {
    key: 'direct_offer_lifecycle_guards',
    label: 'Direct buyer offer page exposes invalid, expired, live-review, and revised-offer states.',
    file: 'src/pages/BuyerOfferSubmission.jsx',
    patterns: [
      /Offer link unavailable/,
      /This offer link has expired/,
      /This offer link is invalid or no longer active/,
      /This offer is already under review/,
      /Submit Revised Offer/,
      /getCanonicalOfferInviteContext/,
      /submitCanonicalBuyerOffer/,
    ],
  },
  {
    key: 'post_viewing_lifecycle_guards',
    label: 'Post-viewing offer portal exposes invalid, expired, duplicate-live, and revised-offer states.',
    file: 'src/pages/PostViewingOfferPortal.jsx',
    patterns: [
      /Offer portal unavailable/,
      /This post-viewing offer link has expired/,
      /This post-viewing offer link is invalid or no longer active/,
      /There are \{selectedPropertyOpenOfferCount\} open offer records/,
      /Submit revised offer/,
      /getOfferPortalSessionContext/,
      /submitOfferPortalOffer/,
    ],
  },
  {
    key: 'canonical_offer_service_token_guards',
    label: 'Canonical buyer offer service gates token lookup by status, expiry, resubmission, and duplicate/live state.',
    file: 'src/lib/buyerLifecycleService.js',
    patterns: [
      /export function getOfferLifecycleSummary/,
      /OFFER_ACTIVE_NEGOTIATION_STATUSES/,
      /OFFER_BUYER_RESUBMISSION_STATUSES/,
      /export async function getCanonicalOfferInviteContext/,
      /offer_token/,
      /return \{ ok: false, reason: 'expired'/,
      /export async function getOfferPortalSessionContext/,
      /bridge_get_offer_portal_session/,
    ],
  },
  {
    key: 'legacy_offer_service_token_guards',
    label: 'Legacy buyer offer service still handles invalid and expired offer invite tokens.',
    file: 'src/lib/listingOffersService.js',
    patterns: [
      /export function getOfferInviteContext/,
      /reason: 'not_found'/,
      /reason: 'expired'/,
      /export async function submitBuyerOffer/,
    ],
  },
  {
    key: 'script_browser_matrix_locked',
    label: 'Phase 3 script includes the required browser matrix cases.',
    file: 'scripts/buyer-side-phase3-offer-token-browser-smoke.mjs',
    patterns: [
      /direct_valid_offer/,
      /offer_detail_alias/,
      /post_viewing_offer_session/,
      /invalid_direct_offer/,
      /expired_direct_offer/,
      /duplicate_live_offer/,
      /revised_direct_offer/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeUrl(value = '') {
  return normalizeText(value).replace(/\/$/, '')
}

function cleanEnvValue(value = '') {
  return normalizeText(value).replace(/^["']|["']$/g, '').replace(/\\n$/g, '')
}

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipPrerequisites: false,
    browser: false,
    live: false,
    confirmStaging: false,
    requireBrowser: false,
    baseUrl: normalizeUrl(process.env.BUYER_SIDE_PHASE3_BASE_URL || ''),
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-prerequisites') options.skipPrerequisites = true
    else if (arg === '--browser') options.browser = true
    else if (arg === '--live') {
      options.live = true
      options.browser = true
    } else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--require-browser') {
      options.requireBrowser = true
      options.browser = true
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = normalizeUrl(arg.slice('--base-url='.length))
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
  return { ...files.base, ...files.staging, ...processOverrides }
}

function buildConfig(env, options) {
  return {
    baseUrl: normalizeUrl(options.baseUrl || env.BUYER_SIDE_LAUNCH_BASE_URL),
    projectRef: normalizeText(env.BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF),
    offerToken: normalizeText(env.BUYER_SIDE_STAGING_OFFER_TOKEN),
    offerSessionToken: normalizeText(env.BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN),
    invalidOfferToken: normalizeText(env.BUYER_SIDE_STAGING_INVALID_OFFER_TOKEN),
    expiredOfferToken: normalizeText(env.BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN),
    duplicateOfferToken: normalizeText(env.BUYER_SIDE_STAGING_DUPLICATE_OFFER_TOKEN),
    duplicateOfferSessionToken: normalizeText(env.BUYER_SIDE_STAGING_DUPLICATE_OFFER_SESSION_TOKEN),
    revisedOfferToken: normalizeText(env.BUYER_SIDE_STAGING_REVISED_OFFER_TOKEN),
  }
}

function createReport(options) {
  return {
    phase: '3',
    scope: 'buyer-side-launch-hardening',
    gate: 'public-offer-token-browser-smoke',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 3 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      commandSkippedCount: 0,
      browserPassCount: 0,
      browserBlockedCount: 0,
      browserWarningCount: 0,
      browserSkippedCount: 0,
      browserCriticalCount: 0,
    },
    staticChecks: [],
    commands: [],
    browser: {
      mode: options.live ? 'staging-public-token-browser' : options.browser ? 'local-mocked-public-token-browser' : 'skipped',
      baseUrl: null,
      projectRef: null,
      tokenKeysConfigured: {},
      cases: [],
      checks: [],
      warnings: [],
    },
    liveCommand: 'node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --live --confirm-staging --require-browser',
    acceptance: [
      'Direct buyer offer links render valid, invalid, expired, live-review, and revised/counter states.',
      'The /offers/:token alias renders the direct buyer offer flow.',
      'Post-viewing offer session links render selected-property offer submission.',
      'Duplicate live offer sessions surface the duplicate/open-negotiation warning without allowing another submission.',
      'Browser smoke can run locally with mocked public-token data and against staging with explicit confirmation.',
      'Live staging browser evidence requires seeded valid, expired, duplicate, and revised token states.',
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

function addBrowserCheck(report, key, status, label, detail = '') {
  const check = { key, status, label, detail }
  report.browser.checks.push(check)
  if (status === 'PASS') report.summary.browserPassCount += 1
  if (status === 'WARN') {
    report.summary.browserWarningCount += 1
    report.browser.warnings.push(check)
  }
  if (status === 'SKIPPED') report.summary.browserSkippedCount += 1
  if (status === 'BLOCKED') report.summary.browserBlockedCount += 1
  if (status === 'CRITICAL') report.summary.browserCriticalCount += 1
}

function validateBrowserConfig(report, options, config) {
  report.browser.projectRef = config.projectRef || null
  report.browser.tokenKeysConfigured = {
    BUYER_SIDE_STAGING_OFFER_TOKEN: Boolean(config.offerToken),
    BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN: Boolean(config.offerSessionToken),
    BUYER_SIDE_STAGING_INVALID_OFFER_TOKEN: Boolean(config.invalidOfferToken),
    BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN: Boolean(config.expiredOfferToken),
    BUYER_SIDE_STAGING_DUPLICATE_OFFER_TOKEN: Boolean(config.duplicateOfferToken),
    BUYER_SIDE_STAGING_DUPLICATE_OFFER_SESSION_TOKEN: Boolean(config.duplicateOfferSessionToken),
    BUYER_SIDE_STAGING_REVISED_OFFER_TOKEN: Boolean(config.revisedOfferToken),
  }

  if (!options.browser && !options.live) {
    if (options.requireBrowser) {
      addBrowserCheck(report, 'phase3_browser_required', 'BLOCKED', 'Phase 3 browser evidence was required but browser mode was not enabled.')
    } else {
      addBrowserCheck(report, 'phase3_browser_not_requested', 'SKIPPED', 'Browser smoke not requested for this local contract run.')
    }
    return
  }

  if (!options.live) {
    addBrowserCheck(report, 'phase3_local_mock_configuration', 'PASS', 'Local mocked offer-token browser configuration is ready.')
    return
  }

  if (!config.baseUrl) {
    addBrowserCheck(report, 'phase3_live_base_url', 'BLOCKED', 'Live Phase 3 browser smoke requires BUYER_SIDE_LAUNCH_BASE_URL or --base-url.')
  } else {
    addBrowserCheck(report, 'phase3_live_base_url', 'PASS', 'Live Phase 3 base URL is configured.')
  }

  if (!config.projectRef) {
    addBrowserCheck(report, 'phase3_staging_ref', 'BLOCKED', 'Live Phase 3 requires BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addBrowserCheck(
      report,
      'phase3_staging_ref',
      'CRITICAL',
      'Refusing to run Buyer Phase 3 against a non-approved Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addBrowserCheck(report, 'phase3_staging_ref', 'PASS', 'Supabase project ref matches approved staging.')
  }

  if (!options.confirmStaging) {
    addBrowserCheck(report, 'phase3_confirm_staging', 'CRITICAL', 'Live Buyer Phase 3 requires --confirm-staging.')
  } else {
    addBrowserCheck(report, 'phase3_confirm_staging', 'PASS', 'Live staging public-token run was explicitly confirmed.')
  }

  const missing = liveRequiredTokenKeys.filter((key) => !config[key])
  if (missing.length) {
    addBrowserCheck(
      report,
      'phase3_live_token_matrix',
      'BLOCKED',
      'Live Phase 3 token-state matrix is incomplete.',
      missing.map((key) => envKeyForConfigKey(key)).join(', '),
    )
  } else {
    addBrowserCheck(report, 'phase3_live_token_matrix', 'PASS', 'Live Phase 3 token-state matrix is configured.')
  }

  if (!config.invalidOfferToken) {
    addBrowserCheck(
      report,
      'phase3_invalid_token_fixture',
      'WARN',
      'No explicit invalid offer token configured; live smoke will use a generated non-existent token.',
    )
  }
}

function envKeyForConfigKey(key) {
  return {
    offerToken: 'BUYER_SIDE_STAGING_OFFER_TOKEN',
    offerSessionToken: 'BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN',
    invalidOfferToken: 'BUYER_SIDE_STAGING_INVALID_OFFER_TOKEN',
    expiredOfferToken: 'BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN',
    duplicateOfferToken: 'BUYER_SIDE_STAGING_DUPLICATE_OFFER_TOKEN',
    duplicateOfferSessionToken: 'BUYER_SIDE_STAGING_DUPLICATE_OFFER_SESSION_TOKEN',
    revisedOfferToken: 'BUYER_SIDE_STAGING_REVISED_OFFER_TOKEN',
  }[key] || key
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(baseUrl, outputRef) {
  const deadline = Date.now() + 45_000
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }

  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError?.message || 'no response'}\nVite output:\n${outputRef.value}`)
}

async function startViteServer(baseUrl = '') {
  const providedUrl = normalizeUrl(baseUrl)
  if (providedUrl) {
    await waitForServer(providedUrl, { value: 'Provided base URL did not respond.' })
    return { baseUrl: providedUrl, stop: async () => {} }
  }

  const outputRef = { value: '' }
  const child = spawn(NPM_BIN, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(DEFAULT_PORT), '--strictPort'], {
    cwd: PROJECT_ROOT_PATH,
    env: {
      ...process.env,
      VITE_APP_ENV: 'development',
      VITE_SUPABASE_URL: MOCK_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: MOCK_ANON_KEY,
      VITE_SUPABASE_KEY: '',
      VITE_ENABLE_DEV_AUTH_BYPASS: 'true',
      VITE_ENABLE_LOCAL_FALLBACKS: 'true',
      VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS: 'true',
      VITE_ENABLE_MOCK_DATA: 'true',
      VITE_DOCUMENT_TITLE: process.env.VITE_DOCUMENT_TITLE || 'Arch9 Buyer Offer Phase 3',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })

  try {
    await waitForServer(DEFAULT_BASE_URL, outputRef)
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }

  return {
    baseUrl: DEFAULT_BASE_URL,
    stop: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(3000),
      ])
      if (child.exitCode === null) child.kill('SIGKILL')
    },
  }
}

function futureDate(days = 14) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function pastDate(days = 2) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function nowIso() {
  return new Date().toISOString()
}

function buildOfferRow({ id, token, status, offerAmount = 1850000, conditions = {}, updatedOffset = 0 }) {
  const updated = new Date(Date.now() + updatedOffset).toISOString()
  return {
    id,
    organisation_id: mockIds.organisation,
    buyer_lead_id: mockIds.buyerLead,
    buyer_contact_id: mockIds.buyerContact,
    listing_id: mockIds.listing,
    agent_id: mockIds.agent,
    viewing_appointment_id: mockIds.appointment,
    offer_token: token,
    status,
    offer_amount: offerAmount,
    deposit_amount: 150000,
    finance_type: 'bond',
    cash_component: 0,
    bond_component: offerAmount - 150000,
    expiry_date: status === 'expired' ? pastDate() : futureDate(),
    conditions_json: {
      buyerName: 'Phase Three Buyer',
      buyerEmail: 'phase3.buyer@example.test',
      buyerPhone: '+27820000000',
      agentName: 'Phase Three Agent',
      agentEmail: 'agent@example.test',
      financeType: 'bond',
      occupationDate: futureDate(45),
      depositDueDate: futureDate(7),
      bondApprovalDeadline: futureDate(21),
      includedFixtures: 'Standard fixtures and fittings',
      specialConditions: 'Subject to bond approval.',
      ...conditions,
    },
    sent_to_buyer_at: nowIso(),
    buyer_viewed_at: status === 'buyer_viewed' ? nowIso() : null,
    buyer_submitted_at: ['submitted', 'agent_review', 'countered'].includes(status) ? nowIso() : null,
    submitted_at: ['submitted', 'agent_review', 'countered'].includes(status) ? nowIso() : null,
    agent_reviewed_at: status === 'agent_review' ? nowIso() : null,
    countered_at: status === 'countered' ? nowIso() : null,
    expired_at: status === 'expired' ? nowIso() : null,
    created_at: nowIso(),
    updated_at: updated,
  }
}

function buildListingRow() {
  return {
    id: mockIds.listing,
    organisation_id: mockIds.organisation,
    branch_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    assigned_agent_id: mockIds.agent,
    seller_lead_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    listing_title: 'Phase 3 Buyer Smoke Listing',
    property_address: '9 Launch Lane',
    suburb: 'Token Park',
    city: 'Cape Town',
    asking_price: 1950000,
    property_type: 'Apartment',
    property_tenure: 'freehold',
    vat_treatment: 'none',
    property_details: {},
    marketing: {},
  }
}

function localOfferRows() {
  const counterTerms = {
    amount: 1900000,
    offerAmount: 1900000,
    depositAmount: 180000,
    bondAmount: 1720000,
    occupationDate: futureDate(50),
    expiryDate: futureDate(5),
    specialConditions: 'Seller countered with revised occupation timing.',
  }
  return [
    buildOfferRow({ id: mockIds.validOffer, token: mockTokens.validOffer, status: 'sent_to_buyer' }),
    buildOfferRow({ id: mockIds.expiredOffer, token: mockTokens.expiredOffer, status: 'expired' }),
    buildOfferRow({ id: mockIds.duplicateOffer, token: mockTokens.duplicateOffer, status: 'submitted', updatedOffset: -1000 }),
    buildOfferRow({ id: mockIds.duplicateSecondOffer, token: 'phase3-second-live-offer', status: 'agent_review', offerAmount: 1875000, updatedOffset: 1000 }),
    buildOfferRow({
      id: mockIds.revisedOffer,
      token: mockTokens.revisedOffer,
      status: 'countered',
      offerAmount: 1800000,
      conditions: {
        counterTerms,
        sellerCounterTerms: counterTerms,
      },
    }),
  ]
}

function localPortalContexts(offersByToken) {
  const listing = {
    id: mockIds.listing,
    listingTitle: 'Phase 3 Buyer Smoke Listing',
    propertyAddress: '9 Launch Lane',
    suburb: 'Token Park',
    city: 'Cape Town',
    askingPrice: 1950000,
  }
  const viewedListing = {
    id: mockIds.viewedListing,
    organisationId: mockIds.organisation,
    appointmentId: mockIds.appointment,
    leadId: mockIds.buyerLead,
    listingId: mockIds.listing,
    agentId: mockIds.agent,
    viewedAt: nowIso(),
    outcome: 'interested',
    metadata: {},
  }
  const session = {
    id: mockIds.session,
    organisationId: mockIds.organisation,
    buyerLeadId: mockIds.buyerLead,
    buyerContactId: mockIds.buyerContact,
    appointmentId: mockIds.appointment,
    agentId: mockIds.agent,
    token: mockTokens.session,
    status: 'sent',
    expiresAt: futureDate(10),
    metadata: {
      buyerName: 'Phase Three Buyer',
      buyerEmail: 'phase3.buyer@example.test',
      buyerPhone: '+27820000000',
    },
  }
  return {
    [mockTokens.session]: {
      ok: true,
      session,
      buyer: { fullName: 'Phase Three Buyer' },
      agent: { fullName: 'Phase Three Agent' },
      properties: [{ viewedListing, listing, offers: [] }],
    },
    [mockTokens.duplicateSession]: {
      ok: true,
      session: {
        ...session,
        id: mockIds.duplicateSession,
        token: mockTokens.duplicateSession,
      },
      buyer: { fullName: 'Phase Three Buyer' },
      agent: { fullName: 'Phase Three Agent' },
      properties: [{
        viewedListing,
        listing,
        offers: [
          offersByToken.get(mockTokens.duplicateOffer),
          offersByToken.get('phase3-second-live-offer'),
        ].filter(Boolean),
      }],
    },
  }
}

function responseHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS,HEAD',
    'content-type': 'application/json',
    'content-range': '0-0/1',
    ...extra,
  }
}

async function fulfillJson(route, body, status = 200, extraHeaders = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: responseHeaders(extraHeaders),
    body: JSON.stringify(body),
  })
}

async function requestJson(request) {
  try {
    return request.postDataJSON()
  } catch {
    return {}
  }
}

function tokenFromOfferRequest(url) {
  const direct = url.searchParams.get('offer_token') || ''
  if (direct.startsWith('eq.')) return direct.slice(3)
  const orFilter = url.searchParams.get('or') || ''
  const tokenMatch = orFilter.match(/offer_token\.eq\.([^)]+)/)
  return tokenMatch?.[1] || ''
}

function idFromOfferUpdate(url) {
  const id = url.searchParams.get('id') || ''
  return id.startsWith('eq.') ? id.slice(3) : ''
}

async function stubSupabaseTraffic(context) {
  const offerRows = localOfferRows()
  const offersByToken = new Map(offerRows.map((row) => [row.offer_token, row]))
  const offersById = new Map(offerRows.map((row) => [row.id, row]))
  const listingRow = buildListingRow()
  const portalContexts = localPortalContexts(offersByToken)

  await context.route(`${MOCK_SUPABASE_URL}/**`, async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const url = new URL(request.url())
    const pathname = url.pathname.toLowerCase()

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: responseHeaders(), body: '' })
      return
    }

    if (pathname.includes('/auth/v1')) {
      await fulfillJson(route, { user: null, session: null })
      return
    }

    if (method === 'HEAD') {
      await route.fulfill({ status: 200, headers: responseHeaders(), body: '' })
      return
    }

    if (pathname === '/rest/v1/offers' && method === 'GET') {
      const token = tokenFromOfferRequest(url)
      await fulfillJson(route, offersByToken.get(token) || null)
      return
    }

    if (pathname === '/rest/v1/offers' && method === 'PATCH') {
      const id = idFromOfferUpdate(url)
      const current = offersById.get(id) || null
      const patch = await requestJson(request)
      if (!current) {
        await fulfillJson(route, null)
        return
      }
      const next = {
        ...current,
        ...patch,
        status: patch.status || current.status,
        updated_at: nowIso(),
      }
      offersById.set(id, next)
      offersByToken.set(next.offer_token, next)
      await fulfillJson(route, next)
      return
    }

    if (pathname === '/rest/v1/private_listings' && method === 'GET') {
      await fulfillJson(route, listingRow)
      return
    }

    if (pathname === '/rest/v1/rpc/bridge_get_offer_portal_session' && method === 'POST') {
      const body = await requestJson(request)
      const token = normalizeText(body?.p_token)
      await fulfillJson(route, portalContexts[token] || { ok: false, reason: 'not_found', session: null, properties: [] })
      return
    }

    if (pathname === '/rest/v1/rpc/bridge_submit_offer_portal_offer' && method === 'POST') {
      await fulfillJson(route, { ok: true, offer: offersByToken.get(mockTokens.validOffer) })
      return
    }

    if (pathname.includes('/functions/v1/')) {
      await fulfillJson(route, { ok: true })
      return
    }

    await fulfillJson(route, [])
  })
}

function localBrowserCases() {
  return [
    {
      key: 'direct_valid_offer',
      path: `/client/offer/${mockTokens.validOffer}`,
      expected: [/Secure Buyer Offer/i, /Submit Your Offer/i, /Submit Offer Securely/i],
      forbidden: [/Offer link unavailable/i],
    },
    {
      key: 'offer_detail_alias',
      path: `/offers/${mockTokens.validOffer}`,
      expected: [/Secure Buyer Offer/i, /Submit Your Offer/i, /Submit Offer Securely/i],
      forbidden: [/Offer link unavailable/i],
    },
    {
      key: 'post_viewing_offer_session',
      path: `/offers/session/${mockTokens.session}`,
      expected: [/Arch9 offer portal/i, /Make an offer on a viewed property/i, /Viewed properties/i, /Submit offer/i],
      forbidden: [/Offer portal unavailable/i],
    },
    {
      key: 'invalid_direct_offer',
      path: `/client/offer/${mockTokens.invalidOffer}`,
      expected: [/Offer link unavailable/i, /invalid or no longer active/i],
      forbidden: [/Submit Offer Securely/i],
    },
    {
      key: 'expired_direct_offer',
      path: `/client/offer/${mockTokens.expiredOffer}`,
      expected: [/Offer link unavailable/i, /offer link has expired/i],
      forbidden: [/Submit Offer Securely/i],
    },
    {
      key: 'duplicate_live_offer',
      path: `/offers/session/${mockTokens.duplicateSession}`,
      expected: [/There are 2 open offer records/i, /already in review/i],
      forbidden: [/Offer portal unavailable/i],
    },
    {
      key: 'revised_direct_offer',
      path: `/client/offer/${mockTokens.revisedOffer}`,
      expected: [/Seller sent a counter offer/i, /Submit Revised Offer/i],
      forbidden: [/Offer link unavailable/i],
    },
  ]
}

function liveBrowserCases(config) {
  const invalidToken = config.invalidOfferToken || `phase3-invalid-${Date.now()}`
  return [
    {
      key: 'direct_valid_offer',
      path: `/client/offer/${encodeURIComponent(config.offerToken)}`,
      expected: [/Secure Buyer Offer/i, /Submit Your Offer/i],
      forbidden: [/Offer link unavailable/i],
      requiredConfigKey: 'offerToken',
    },
    {
      key: 'offer_detail_alias',
      path: `/offers/${encodeURIComponent(config.offerToken)}`,
      expected: [/Secure Buyer Offer/i, /Submit Your Offer/i],
      forbidden: [/Offer link unavailable/i],
      requiredConfigKey: 'offerToken',
    },
    {
      key: 'post_viewing_offer_session',
      path: `/offers/session/${encodeURIComponent(config.offerSessionToken)}`,
      expected: [/Arch9 offer portal/i, /Make an offer on a viewed property/i, /Viewed properties/i],
      forbidden: [/Offer portal unavailable/i],
      requiredConfigKey: 'offerSessionToken',
    },
    {
      key: 'invalid_direct_offer',
      path: `/client/offer/${encodeURIComponent(invalidToken)}`,
      expected: [/Offer link unavailable/i, /invalid or no longer active/i],
      forbidden: [/Submit Offer Securely/i],
    },
    {
      key: 'expired_direct_offer',
      path: `/client/offer/${encodeURIComponent(config.expiredOfferToken)}`,
      expected: [/Offer link unavailable/i, /offer link has expired/i],
      forbidden: [/Submit Offer Securely/i],
      requiredConfigKey: 'expiredOfferToken',
    },
    {
      key: 'duplicate_live_offer',
      path: `/offers/session/${encodeURIComponent(config.duplicateOfferSessionToken)}`,
      expected: [/open offer records/i, /already (?:in review|under review)|live offer under review/i],
      forbidden: [/Offer portal unavailable/i],
      requiredConfigKey: 'duplicateOfferSessionToken',
    },
    {
      key: 'revised_direct_offer',
      path: `/client/offer/${encodeURIComponent(config.revisedOfferToken)}`,
      expected: [/counter offer|Submit Revised Offer/i],
      forbidden: [/Offer link unavailable/i],
      requiredConfigKey: 'revisedOfferToken',
    },
    {
      key: 'duplicate_direct_offer',
      path: `/client/offer/${encodeURIComponent(config.duplicateOfferToken)}`,
      expected: [/already under review|already in review/i],
      forbidden: [/Offer link unavailable/i],
      requiredConfigKey: 'duplicateOfferToken',
    },
  ]
}

function isIgnorableConsoleMessage(message) {
  const text = `${message.type()} ${message.text()}`.toLowerCase()
  return [
    'download the react devtools',
    'dev auth bypass is enabled',
    'failed to load resource',
    'networkerror',
    'supabase',
  ].some((token) => text.includes(token))
}

async function expectVisibleText(page, pattern, caseKey) {
  const locator = page.getByText(pattern).first()
  const visible = await locator.waitFor({ state: 'visible', timeout: 14_000 }).then(() => true).catch(() => false)
  if (!visible) throw new Error(`${caseKey} did not render expected text ${pattern}`)
}

async function expectHiddenText(page, pattern, caseKey) {
  const visible = await page.getByText(pattern).first().isVisible().catch(() => false)
  if (visible) throw new Error(`${caseKey} rendered forbidden text ${pattern}`)
}

async function visitCase(page, baseUrl, testCase) {
  await page.goto(`${baseUrl}${testCase.path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  for (const pattern of testCase.expected || []) await expectVisibleText(page, pattern, testCase.key)
  for (const pattern of testCase.forbidden || []) await expectHiddenText(page, pattern, testCase.key)
  return {
    key: testCase.key,
    path: testCase.path,
    finalUrl: page.url(),
    status: 'PASS',
  }
}

async function runBrowserSmoke(report, options, config) {
  validateBrowserConfig(report, options, config)

  if (options.staticOnly || (!options.browser && !options.live)) return
  if (report.summary.browserBlockedCount > 0 || report.summary.browserCriticalCount > 0) return

  const cases = options.live ? liveBrowserCases(config) : localBrowserCases()
  const runnableCases = []
  for (const testCase of cases) {
    if (testCase.requiredConfigKey && !config[testCase.requiredConfigKey]) {
      report.browser.cases.push({
        key: testCase.key,
        path: testCase.path,
        status: options.requireBrowser ? 'BLOCKED' : 'SKIPPED',
        reason: `${envKeyForConfigKey(testCase.requiredConfigKey)} is not configured.`,
      })
      if (options.requireBrowser) report.summary.browserBlockedCount += 1
      else report.summary.browserSkippedCount += 1
      continue
    }
    runnableCases.push(testCase)
  }

  if (report.summary.browserBlockedCount > 0 || report.summary.browserCriticalCount > 0) return

  const server = await startViteServer(options.live ? config.baseUrl : options.baseUrl)
  report.browser.baseUrl = server.baseUrl
  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []
  const pageErrors = []

  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 960 } })
    if (!options.live) await stubSupabaseTraffic(context)
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error' && !isIgnorableConsoleMessage(message)) consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))

    for (const testCase of runnableCases) {
      try {
        const result = await visitCase(page, server.baseUrl, testCase)
        report.browser.cases.push(result)
        report.summary.browserPassCount += 1
      } catch (error) {
        report.browser.cases.push({
          key: testCase.key,
          path: testCase.path,
          status: 'BLOCKED',
          error: error?.message || String(error),
          finalUrl: page.url(),
        })
        report.summary.browserBlockedCount += 1
      }
    }

    await context.close()
  } finally {
    await browser.close()
    await server.stop()
  }

  if (pageErrors.length) {
    addBrowserCheck(report, 'phase3_page_errors', 'BLOCKED', 'Browser page errors were captured.', pageErrors.join('\n'))
  } else {
    addBrowserCheck(report, 'phase3_page_errors', 'PASS', 'No browser page errors were captured.')
  }

  if (consoleErrors.length) {
    addBrowserCheck(report, 'phase3_console_errors', 'BLOCKED', 'Browser console errors were captured.', consoleErrors.join('\n'))
  } else {
    addBrowserCheck(report, 'phase3_console_errors', 'PASS', 'No blocking browser console errors were captured.')
  }
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.browserBlockedCount > 0 ||
    report.summary.browserCriticalCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Buyer Phase 3 public offer-token browser blockers are cleared'
    return report
  }

  if (options.live) {
    report.summary.status = report.summary.browserWarningCount > 0 ? 'READY_LIVE_WITH_WARNINGS' : 'READY_LIVE'
    report.summary.recommendation = 'Buyer Phase 3 live public offer-token browser smoke passed'
    return report
  }

  if (options.browser) {
    report.summary.status = report.summary.browserWarningCount > 0 ? 'READY_BROWSER_SMOKE_WITH_WARNINGS' : 'READY_BROWSER_SMOKE'
    report.summary.recommendation = 'Buyer Phase 3 local mocked public offer-token browser smoke passed'
    return report
  }

  if (options.staticOnly || report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Buyer Phase 3 static public-token contracts passed; run browser mode before launch evidence sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_CONTRACT'
  report.summary.recommendation = 'Buyer Phase 3 harness is implemented; run browser/live commands when public-token fixtures are ready'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(loadEnv(), options)
  const report = createReport(options)

  runStaticChecks(report)
  await runPrerequisites(report, options)
  await runBrowserSmoke(report, options, config)
  finalizeReport(report, options)

  console.log(JSON.stringify(report, null, 2))

  if (![
    'READY_LOCAL_CONTRACT',
    'READY_STATIC_ONLY',
    'READY_BROWSER_SMOKE',
    'READY_BROWSER_SMOKE_WITH_WARNINGS',
    'READY_LIVE',
    'READY_LIVE_WITH_WARNINGS',
  ].includes(report.summary.status)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
