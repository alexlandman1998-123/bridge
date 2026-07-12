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
    key: 'buyer_phase4_token_delivery_contract',
    label: 'Buyer Phase 4 token delivery and invalid-token contract',
    script: 'verify:buyer-side-phase4-token-delivery',
    coverage: 'Buyer onboarding, portal, offer-token delivery, invalid-token, reused-token, and delivery-audit contracts remain green.',
  },
]

const phase5EnvKeys = [
  'BUYER_SIDE_STAGING_BUYER_FICA_DOCUMENT_REQUEST_ID',
  'BUYER_SIDE_STAGING_BUYER_FINANCE_DOCUMENT_REQUEST_ID',
  'BUYER_SIDE_STAGING_BUYER_UPLOADED_DOCUMENT_ID',
  'BUYER_SIDE_STAGING_BUYER_REVIEW_DOCUMENT_ID',
  'BUYER_SIDE_STAGING_BUYER_DOWNLOAD_DOCUMENT_ID',
  'BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH',
]

const personaMatrix = [
  {
    key: 'buyer',
    label: 'Buyer',
    emailKey: 'BUYER_SIDE_STAGING_BUYER_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_BUYER_PASSWORD',
    expectations: {
      document_request_metadata: false,
      document_row_metadata: false,
      document_path_lookup: false,
    },
  },
  {
    key: 'assigned_agent',
    label: 'Assigned agent',
    emailKey: 'BUYER_SIDE_STAGING_AGENT_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_AGENT_PASSWORD',
    expectations: {
      document_request_metadata: true,
      document_row_metadata: true,
      document_path_lookup: true,
    },
  },
  {
    key: 'attorney',
    label: 'Transfer attorney',
    emailKey: 'BUYER_SIDE_STAGING_ATTORNEY_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_ATTORNEY_PASSWORD',
    expectations: {
      document_request_metadata: true,
      document_row_metadata: true,
      document_path_lookup: true,
    },
  },
  {
    key: 'bond',
    label: 'Bond user',
    emailKey: 'BUYER_SIDE_STAGING_BOND_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_BOND_PASSWORD',
    expectations: {
      document_request_metadata: true,
      document_row_metadata: true,
      document_path_lookup: true,
    },
  },
  {
    key: 'unrelated',
    label: 'Unrelated user',
    emailKey: 'BUYER_SIDE_STAGING_UNRELATED_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_UNRELATED_PASSWORD',
    expectations: {
      document_request_metadata: false,
      document_row_metadata: false,
      document_path_lookup: false,
    },
  },
]

const documentRequestEvidence = [
  {
    key: 'primary_document_request',
    label: 'Primary buyer document request',
    configKey: 'documentRequestId',
    envKey: 'BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID',
    classification: null,
  },
  {
    key: 'buyer_fica_request',
    label: 'Buyer FICA document request',
    configKey: 'buyerFicaDocumentRequestId',
    envKey: 'BUYER_SIDE_STAGING_BUYER_FICA_DOCUMENT_REQUEST_ID',
    classification: 'fica',
  },
  {
    key: 'buyer_finance_request',
    label: 'Buyer finance document request',
    configKey: 'buyerFinanceDocumentRequestId',
    envKey: 'BUYER_SIDE_STAGING_BUYER_FINANCE_DOCUMENT_REQUEST_ID',
    classification: 'finance',
  },
]

const documentEvidence = [
  {
    key: 'buyer_uploaded_document',
    label: 'Buyer uploaded document row',
    configKey: 'buyerUploadedDocumentId',
    envKey: 'BUYER_SIDE_STAGING_BUYER_UPLOADED_DOCUMENT_ID',
    expectedStatuses: ['uploaded', 'under_review', 'reviewed', 'approved', 'verified', 'accepted', 'complete', 'completed'],
  },
  {
    key: 'buyer_review_document',
    label: 'Buyer review-state document row',
    configKey: 'buyerReviewDocumentId',
    envKey: 'BUYER_SIDE_STAGING_BUYER_REVIEW_DOCUMENT_ID',
    expectedStatuses: ['under_review', 'reviewed', 'approved', 'verified', 'accepted', 'rejected', 'reupload_required'],
  },
  {
    key: 'buyer_download_document',
    label: 'Buyer download document row',
    configKey: 'buyerDownloadDocumentId',
    envKey: 'BUYER_SIDE_STAGING_BUYER_DOWNLOAD_DOCUMENT_ID',
    expectedStatuses: ['uploaded', 'under_review', 'reviewed', 'approved', 'verified', 'accepted', 'complete', 'completed', 'signed'],
    requireConfiguredStoragePath: true,
  },
]

const liveProbeSurfaces = [
  {
    key: 'document_request_metadata',
    label: 'Buyer document-request metadata',
    table: 'document_requests',
    field: 'id',
    idConfigKey: 'buyerFicaDocumentRequestId',
    select: 'id, transaction_id, category, document_type, title, visibility_scope, requested_from, assigned_to_role',
    requiredForAllowed: true,
  },
  {
    key: 'document_row_metadata',
    label: 'Buyer uploaded document metadata',
    table: 'documents',
    field: 'id',
    idConfigKey: 'buyerDownloadDocumentId',
    select: 'id, transaction_id, name, file_path, category, document_type, visibility_scope, status, review_status',
    requiredForAllowed: true,
  },
  {
    key: 'document_path_lookup',
    label: 'Buyer document path lookup',
    table: 'documents',
    field: 'file_path',
    idConfigKey: 'buyerDocumentStoragePath',
    select: 'id, transaction_id, file_path, name, category, document_type, visibility_scope',
    requiredForAllowed: true,
  },
]

const staticChecks = [
  {
    key: 'phase5_audit_doc',
    label: 'Buyer Phase 5 audit doc defines document privacy evidence and live access matrix.',
    file: 'docs/audits/buyer-side-launch-hardening-phase5.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 5/,
      /## Goal/,
      /## Commands/,
      /## Document Evidence Matrix/,
      /## Privacy Access Matrix/,
      /## Live Evidence Contract/,
      /## Static Contracts/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 5 HARNESS IMPLEMENTED; LIVE DOCUMENT PRIVACY EVIDENCE REQUIRED/,
    ],
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 5 document privacy command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase5-document-privacy":\s*"node scripts\/buyer-side-phase5-document-privacy-verification\.mjs"/,
      /"verify:buyer-side-phase4-token-delivery":\s*"node scripts\/buyer-side-phase4-token-delivery-invalid-handling\.mjs"/,
    ],
  },
  {
    key: 'phase0_index_updated',
    label: 'Buyer Phase 0 scope lock lists the Phase 5 document privacy command and strict live command.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /Phase 5 \| Buyer document and privacy verification/,
      /npm run verify:buyer-side-phase5-document-privacy/,
      /node scripts\/buyer-side-phase5-document-privacy-verification\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'phase8_index_updated',
    label: 'Phase 8 launch readiness links Buyer Phase 5 and its strict document privacy command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 5 document and privacy verification: `docs\/audits\/buyer-side-launch-hardening-phase5\.md`/,
      /npm run verify:buyer-side-phase5-document-privacy/,
      /node scripts\/buyer-side-phase5-document-privacy-verification\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'env_document_privacy_contract',
    label: '.env.example declares Phase 5 document request, upload, review, download, and storage-path placeholders.',
    file: '.env.example',
    patterns: phase5EnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'buyer_document_requirement_matrix',
    label: 'Document request scenario matrix covers buyer FICA, finance, cash, bond, hybrid, trust, company, and foreign purchaser branches.',
    file: 'scripts/document-request-scenario-matrix.test.mjs',
    patterns: [
      /buyer_identity_fica/,
      /purchase_finance_type:\s*'bond'/,
      /purchase_finance_type:\s*'cash'/,
      /proof_of_funds/,
      /bond_approval/,
      /purchase_finance_type:\s*'hybrid'/,
      /purchaser_type:\s*'company'/,
      /purchaser_type:\s*'trust'/,
      /purchaser_type:\s*'foreign_purchaser'/,
      /Canonical buyer adapter/,
    ],
  },
  {
    key: 'buyer_portal_document_centre',
    label: 'Buyer client portal exposes FICA, finance, sales, property, additional request, upload, and open-document document centre surfaces.',
    file: 'src/components/client-portal/documents/ClientDocumentCentre.jsx',
    patterns: [
      /buyerFicaDocuments/,
      /buyerFinanceDocuments/,
      /buyerSalesDocuments/,
      /buyerAdditionalDocuments/,
      /title: 'FICA Documents'/,
      /title: 'Finance Documents'/,
      /onUpload=\{onUpload\}/,
      /onOpenDocument=\{onOpenDocument\}/,
    ],
  },
  {
    key: 'client_portal_upload_linkage',
    label: 'Buyer portal uploads preserve document request ids and canonical requirement metadata.',
    file: 'src/pages/ClientPortal.jsx',
    patterns: [
      /handleDocumentCentreUpload/,
      /uploadSpec\.type === 'additional_request'/,
      /documentRequestId: requestId/,
      /uploadSpec\.type === 'canonical_requirement'/,
      /requirementInstanceId/,
      /documentRequestId: options\.documentRequestId \|\| null/,
      /createClientPortalDocumentSignedUrl/,
    ],
  },
  {
    key: 'api_upload_inherits_access_and_scopes_downloads',
    label: 'API uploads inherit document request grants and portal download signing validates transaction ownership.',
    file: 'src/lib/api.js',
    patterns: [
      /syncDocumentAccessGrantsFromRequest/,
      /documentRequestId,/,
      /clientPortalDocumentPathBelongsToTransaction/,
      /clientPortalDocumentPathLooksTransactionScoped/,
      /clientPortalDocumentPathHasDocumentRow/,
      /clientPortalDocumentPathHasPacketVersion/,
      /Unable to open this document right now/,
    ],
  },
  {
    key: 'document_access_grant_service',
    label: 'Document access grant service resolves view, upload, review, download, manage, request, requirement, and document inheritance.',
    file: 'src/services/documents/documentAccessGrantService.js',
    patterns: [
      /transaction_document_access_grants/,
      /can_view/,
      /can_download/,
      /can_upload/,
      /can_review/,
      /fetchTransactionDocumentAccessGrants/,
      /syncDocumentAccessGrantsFromRequest/,
      /resolveAccessForResources/,
      /document_request_upload/,
    ],
  },
  {
    key: 'document_access_grant_migration',
    label: 'Document access grants migration defines scoped resource grants and RLS policies.',
    file: '../supabase/migrations/202607090009_document_request_permission_foundation.sql',
    patterns: [
      /create table if not exists public\.transaction_document_access_grants/,
      /resource_type in \('document', 'document_request', 'requirement_instance'\)/,
      /can_view boolean not null default false/,
      /can_download boolean not null default false/,
      /can_upload boolean not null default false/,
      /can_review boolean not null default false/,
      /bridge_has_transaction_document_grant/,
      /transaction_document_access_grants_select_scoped/,
      /grant select, insert, update, delete on public\.transaction_document_access_grants to authenticated/,
      /grant all on public\.transaction_document_access_grants to service_role/,
    ],
  },
  {
    key: 'canonical_document_anon_hardening',
    label: 'Canonical document metadata tables have anon grants revoked and operational writes constrained.',
    file: '../supabase/migrations/202607090014_canonical_document_anon_grant_hardening.sql',
    patterns: [
      /revoke all privileges on table public\.%I from anon/,
      /drop policy if exists document_requirement_instances_client_portal_select/,
      /anon still has direct canonical document table grants after hardening migration/,
      /authenticated still has broad canonical operational writes after hardening migration/,
    ],
  },
  {
    key: 'raw_document_tables_inherit_spine',
    label: 'Raw document request and document tables inherit transaction-spine RLS for internal users only.',
    file: '../supabase/migrations/202606090009_support_role_asset_rls.sql',
    patterns: [
      /create policy document_requests_support_role_select[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /create policy documents_support_role_select[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
    ],
  },
  {
    key: 'phase2_document_rls_handoff',
    label: 'Phase 2 RLS matrix already probes raw document request and document rows across personas.',
    file: 'scripts/buyer-side-phase2-rls-access-probes.mjs',
    patterns: [
      /key: 'document_request'/,
      /table: 'document_requests'/,
      /key: 'documents'/,
      /table: 'documents'/,
      /key: 'unrelated'/,
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
    sampleLimit: 5,
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
      if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 25) {
        throw new Error('--sample-limit must be an integer from 1 to 25')
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
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_ANON_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_ANON_KEY
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function buildConfig(env) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  return {
    supabaseUrl,
    anonKey: normalizeText(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    projectRef: normalizeText(env.BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF) || projectRefFromUrl(supabaseUrl),
    transactionId: normalizeText(env.BUYER_SIDE_STAGING_TRANSACTION_ID),
    documentRequestId: normalizeText(env.BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID),
    buyerFicaDocumentRequestId: normalizeText(env.BUYER_SIDE_STAGING_BUYER_FICA_DOCUMENT_REQUEST_ID),
    buyerFinanceDocumentRequestId: normalizeText(env.BUYER_SIDE_STAGING_BUYER_FINANCE_DOCUMENT_REQUEST_ID),
    buyerUploadedDocumentId: normalizeText(env.BUYER_SIDE_STAGING_BUYER_UPLOADED_DOCUMENT_ID),
    buyerReviewDocumentId: normalizeText(env.BUYER_SIDE_STAGING_BUYER_REVIEW_DOCUMENT_ID),
    buyerDownloadDocumentId: normalizeText(env.BUYER_SIDE_STAGING_BUYER_DOWNLOAD_DOCUMENT_ID),
    buyerDocumentStoragePath: normalizeText(env.BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH),
    personas: personaMatrix.map((persona) => ({
      ...persona,
      email: normalizeText(env[persona.emailKey]),
      password: normalizeText(env[persona.passwordKey]),
    })),
  }
}

function createReport(options) {
  return {
    phase: '5',
    scope: 'buyer-side-launch-hardening',
    gate: 'document-privacy-access-verification',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 5 document privacy blockers are cleared',
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
      documentRequestIdsConfigured: {},
      documentIdsConfigured: {},
      personasConfigured: {},
      serviceRoleEvidence: [],
      accessGrantEvidence: [],
      matrix: [],
      checks: [],
      warnings: [],
    },
    liveCommand: 'node scripts/buyer-side-phase5-document-privacy-verification.mjs --live --confirm-staging --require-live',
    acceptance: [
      'Static document contracts cover buyer FICA, finance, upload, review, download, access-grant, and anon-hardening surfaces.',
      'Buyer portal document signing verifies that a requested file path belongs to the current portal transaction.',
      'Live mode verifies configured buyer document request and uploaded document rows belong to the configured transaction.',
      'Live mode verifies document access grants exist for buyer upload, professional review, and download access decisions.',
      'Live mode proves buyer and unrelated users cannot read raw document metadata or file paths outside token-scoped portal flows.',
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

function createSupabaseClient(supabaseUrl, key, headers = {}) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers,
    },
  })
}

async function signIn(config, persona) {
  const client = createSupabaseClient(config.supabaseUrl, config.anonKey)
  const { data, error } = await client.auth.signInWithPassword({
    email: persona.email,
    password: persona.password,
  })
  if (error) throw error
  return { client, userId: data?.user?.id || null }
}

function isMissingTableError(error = {}) {
  const code = normalizeText(error.code)
  const message = normalizeLower(error.message || error.details || error.hint)
  return code === '42P01' || message.includes('does not exist') || message.includes('could not find the table')
}

function summarizeRequestRow(row = {}) {
  return {
    id: row.id || null,
    transaction_id: row.transaction_id || null,
    category: row.category || null,
    document_type: row.document_type || null,
    title: row.title || null,
    status: row.status || null,
    visibility_scope: row.visibility_scope || null,
    requested_from: row.requested_from || null,
    assigned_to_role: row.assigned_to_role || null,
  }
}

function summarizeDocumentRow(row = {}, configuredStoragePath = '') {
  const filePath = normalizeText(row.file_path || row.storage_path)
  return {
    id: row.id || null,
    transaction_id: row.transaction_id || null,
    category: row.category || null,
    document_type: row.document_type || null,
    status: row.status || null,
    review_status: row.review_status || null,
    visibility_scope: row.visibility_scope || null,
    has_file_path: Boolean(filePath),
    file_path_matches_configured: Boolean(configuredStoragePath && filePath === configuredStoragePath),
  }
}

function rowBelongsToTransaction(row = {}, transactionId = '') {
  return normalizeText(row.transaction_id) === normalizeText(transactionId)
}

function requestMatchesClassification(row = {}, classification = '') {
  if (!classification) return true
  const source = normalizeLower([
    row.category,
    row.document_type,
    row.title,
    row.description,
    row.request_type,
    row.notes,
    row.visibility_scope,
  ].join(' '))

  if (classification === 'fica') {
    return /fica|identity|identification|id document|proof of address|purchaser/.test(source)
  }
  if (classification === 'finance') {
    return /finance|financial|bond|bank|proof of funds|income|affordability|payslip|statement/.test(source)
  }
  return true
}

function documentStatusMatches(row = {}, expectedStatuses = []) {
  if (!expectedStatuses.length) return true
  const status = normalizeLower(row.status || row.review_status)
  const reviewStatus = normalizeLower(row.review_status || row.status)
  return expectedStatuses.some((expected) => status === expected || reviewStatus === expected)
}

async function fetchRowById(client, table, id) {
  const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle()
  return { data, error }
}

async function fetchDocumentsByPath(client, transactionId, filePath, sampleLimit) {
  const { data, error } = await client
    .from('documents')
    .select('id, transaction_id, file_path, name, category, document_type, visibility_scope, status, review_status')
    .eq('transaction_id', transactionId)
    .eq('file_path', filePath)
    .limit(sampleLimit)

  return { data, error }
}

function grantHasAnyPermission(grant = {}, permissionKeys = []) {
  return permissionKeys.some((key) => grant[key] === true || (key !== 'can_manage' && grant.can_manage === true))
}

function grantPrincipalLooksLikeBuyer(grant = {}) {
  const source = normalizeLower([grant.principal_type, grant.role_type, grant.client_group, grant.source_detail].join(' '))
  return /buyer|client|all_clients|buyer_and_seller|request_target|canonical_uploadable/.test(source)
}

function grantPrincipalLooksLikeProfessional(grant = {}) {
  const source = normalizeLower([grant.principal_type, grant.role_type, grant.legal_role, grant.client_group, grant.source_detail].join(' '))
  return /attorney|bond|professional|role|requester|selected_access|canonical_visible/.test(source)
}

async function fetchAccessGrants(client, resourceColumn, resourceId) {
  const { data, error } = await client
    .from('transaction_document_access_grants')
    .select(
      'id, transaction_id, resource_type, document_id, document_request_id, requirement_instance_id, principal_type, user_id, email, role_type, legal_role, client_group, can_view, can_download, can_upload, can_review, can_manage, grant_source, source_detail, expires_at, revoked_at',
    )
    .eq(resourceColumn, resourceId)
    .is('revoked_at', null)

  return { data, error }
}

function summarizeGrantEvidence(row = {}) {
  return {
    id: row.id || null,
    transaction_id: row.transaction_id || null,
    resource_type: row.resource_type || null,
    principal_type: row.principal_type || null,
    role_type: row.role_type || null,
    legal_role: row.legal_role || null,
    client_group: row.client_group || null,
    can_view: Boolean(row.can_view),
    can_download: Boolean(row.can_download),
    can_upload: Boolean(row.can_upload),
    can_review: Boolean(row.can_review),
    can_manage: Boolean(row.can_manage),
    grant_source: row.grant_source || null,
    source_detail: row.source_detail || null,
  }
}

function validateLiveConfig(report, config, options) {
  report.live.projectRef = config.projectRef || null
  report.live.transactionId = config.transactionId || null
  report.live.documentRequestIdsConfigured = Object.fromEntries(
    documentRequestEvidence.map((item) => [item.envKey, Boolean(config[item.configKey])]),
  )
  report.live.documentIdsConfigured = Object.fromEntries(
    [
      ...documentEvidence.map((item) => [item.envKey, Boolean(config[item.configKey])]),
      ['BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH', Boolean(config.buyerDocumentStoragePath)],
    ],
  )
  report.live.personasConfigured = Object.fromEntries(
    config.personas.map((persona) => [persona.key, Boolean(persona.email && persona.password)]),
  )

  const missing = new Set()
  if (!config.supabaseUrl) missing.add('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.anonKey) missing.add('SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY')
  if (!config.serviceRoleKey) missing.add('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.projectRef) missing.add('BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF or Supabase URL project ref')
  if (!config.transactionId) missing.add('BUYER_SIDE_STAGING_TRANSACTION_ID')
  for (const item of documentRequestEvidence) {
    if (!config[item.configKey]) missing.add(item.envKey)
  }
  for (const item of documentEvidence) {
    if (!config[item.configKey]) missing.add(item.envKey)
  }
  if (!config.buyerDocumentStoragePath) missing.add('BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH')
  for (const persona of config.personas) {
    if (!persona.email) missing.add(persona.emailKey)
    if (!persona.password) missing.add(persona.passwordKey)
  }

  if (missing.size) {
    addLiveCheck(
      report,
      'phase5_live_configuration',
      options.live ? 'BLOCKED' : 'WARN',
      'Phase 5 live document/privacy configuration is incomplete.',
      [...missing].join(', '),
    )
  } else {
    addLiveCheck(report, 'phase5_live_configuration', 'PASS', 'Phase 5 live document/privacy configuration is complete.')
  }

  if (!config.projectRef) {
    addLiveCheck(report, 'phase5_staging_ref', options.live ? 'BLOCKED' : 'WARN', 'Could not resolve staging project ref.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addLiveCheck(
      report,
      'phase5_staging_ref',
      'CRITICAL',
      'Refusing to run Buyer Phase 5 against a non-approved Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addLiveCheck(report, 'phase5_staging_ref', 'PASS', 'Supabase project ref matches approved staging.')
  }

  if (options.live && !options.confirmStaging) {
    addLiveCheck(report, 'phase5_confirm_staging', 'CRITICAL', 'Live Buyer Phase 5 requires --confirm-staging.')
  } else if (options.live) {
    addLiveCheck(report, 'phase5_confirm_staging', 'PASS', 'Live staging document/privacy run was explicitly confirmed.')
  }
}

async function runServiceRoleEvidence(report, options, config, serviceClient) {
  for (const item of documentRequestEvidence) {
    const id = config[item.configKey]
    const { data, error } = await fetchRowById(serviceClient, 'document_requests', id)
    const evidence = {
      key: item.key,
      label: item.label,
      table: 'document_requests',
      id,
      status: 'PASS',
      row: data ? summarizeRequestRow(data) : null,
    }

    if (error) {
      evidence.status = 'BLOCKED'
      evidence.error = { code: error.code || null, message: error.message || String(error) }
      addLiveCheck(report, item.key, 'BLOCKED', item.label, error.message)
    } else if (!data) {
      evidence.status = 'BLOCKED'
      addLiveCheck(report, item.key, 'BLOCKED', item.label, `No document_requests row found for ${item.envKey}.`)
    } else if (!rowBelongsToTransaction(data, config.transactionId)) {
      evidence.status = 'CRITICAL'
      addLiveCheck(report, item.key, 'CRITICAL', item.label, 'Document request belongs to a different transaction.')
    } else if (!requestMatchesClassification(data, item.classification)) {
      evidence.status = 'WARN'
      addLiveCheck(report, item.key, 'WARN', item.label, `Row exists but does not clearly classify as ${item.classification}.`)
    } else {
      addLiveCheck(report, item.key, 'PASS', item.label, 'Document request row exists and belongs to the configured transaction.')
    }

    report.live.serviceRoleEvidence.push(evidence)
  }

  for (const item of documentEvidence) {
    const id = config[item.configKey]
    const { data, error } = await fetchRowById(serviceClient, 'documents', id)
    const evidence = {
      key: item.key,
      label: item.label,
      table: 'documents',
      id,
      status: 'PASS',
      row: data ? summarizeDocumentRow(data, config.buyerDocumentStoragePath) : null,
    }

    if (error) {
      evidence.status = 'BLOCKED'
      evidence.error = { code: error.code || null, message: error.message || String(error) }
      addLiveCheck(report, item.key, 'BLOCKED', item.label, error.message)
    } else if (!data) {
      evidence.status = 'BLOCKED'
      addLiveCheck(report, item.key, 'BLOCKED', item.label, `No documents row found for ${item.envKey}.`)
    } else if (!rowBelongsToTransaction(data, config.transactionId)) {
      evidence.status = 'CRITICAL'
      addLiveCheck(report, item.key, 'CRITICAL', item.label, 'Document belongs to a different transaction.')
    } else if (!normalizeText(data.file_path || data.storage_path)) {
      evidence.status = 'BLOCKED'
      addLiveCheck(report, item.key, 'BLOCKED', item.label, 'Document row has no file path/storage path.')
    } else if (item.requireConfiguredStoragePath && normalizeText(data.file_path || data.storage_path) !== config.buyerDocumentStoragePath) {
      evidence.status = 'BLOCKED'
      addLiveCheck(report, item.key, 'BLOCKED', item.label, 'Configured storage path does not match the download document row.')
    } else if (!documentStatusMatches(data, item.expectedStatuses)) {
      evidence.status = 'WARN'
      addLiveCheck(report, item.key, 'WARN', item.label, 'Document status exists but is outside the expected review/upload statuses.')
    } else {
      addLiveCheck(report, item.key, 'PASS', item.label, 'Document row exists, is path-backed, and belongs to the configured transaction.')
    }

    report.live.serviceRoleEvidence.push(evidence)
  }

  const pathQuery = await fetchDocumentsByPath(serviceClient, config.transactionId, config.buyerDocumentStoragePath, options.sampleLimit)
  if (pathQuery.error) {
    addLiveCheck(report, 'buyer_storage_path_row', 'BLOCKED', 'Configured buyer document storage path is not queryable.', pathQuery.error.message)
  } else if (!Array.isArray(pathQuery.data) || pathQuery.data.length === 0) {
    addLiveCheck(report, 'buyer_storage_path_row', 'BLOCKED', 'Configured buyer document storage path has no matching document row.')
  } else {
    report.live.serviceRoleEvidence.push({
      key: 'buyer_storage_path_row',
      label: 'Configured buyer document storage path',
      table: 'documents',
      id: config.buyerDocumentStoragePath,
      status: 'PASS',
      rows: pathQuery.data.map((row) => summarizeDocumentRow(row, config.buyerDocumentStoragePath)),
    })
    addLiveCheck(report, 'buyer_storage_path_row', 'PASS', 'Configured buyer document storage path resolves to the configured transaction.')
  }
}

async function runAccessGrantEvidence(report, config, serviceClient) {
  const grantChecks = [
    {
      key: 'buyer_fica_request_upload_grant',
      label: 'Buyer FICA request has buyer upload grant evidence.',
      resourceColumn: 'document_request_id',
      resourceId: config.buyerFicaDocumentRequestId,
      predicate: (rows) => rows.some((row) => grantHasAnyPermission(row, ['can_upload']) && grantPrincipalLooksLikeBuyer(row)),
    },
    {
      key: 'buyer_finance_request_upload_or_review_grant',
      label: 'Buyer finance request has buyer upload or professional review grant evidence.',
      resourceColumn: 'document_request_id',
      resourceId: config.buyerFinanceDocumentRequestId,
      predicate: (rows) =>
        rows.some((row) => grantHasAnyPermission(row, ['can_upload']) && grantPrincipalLooksLikeBuyer(row)) ||
        rows.some((row) => grantHasAnyPermission(row, ['can_review', 'can_download']) && grantPrincipalLooksLikeProfessional(row)),
    },
    {
      key: 'buyer_download_document_grant',
      label: 'Buyer download document has active view/download grant evidence.',
      resourceColumn: 'document_id',
      resourceId: config.buyerDownloadDocumentId,
      predicate: (rows) => rows.some((row) => grantHasAnyPermission(row, ['can_download', 'can_view'])),
    },
    {
      key: 'buyer_review_document_grant',
      label: 'Buyer review document has active professional review grant evidence.',
      resourceColumn: 'document_id',
      resourceId: config.buyerReviewDocumentId,
      predicate: (rows) => rows.some((row) => grantHasAnyPermission(row, ['can_review', 'can_manage']) && grantPrincipalLooksLikeProfessional(row)),
    },
  ]

  for (const check of grantChecks) {
    const { data, error } = await fetchAccessGrants(serviceClient, check.resourceColumn, check.resourceId)
    const rows = Array.isArray(data) ? data : []
    const evidence = {
      key: check.key,
      label: check.label,
      resourceColumn: check.resourceColumn,
      resourceId: check.resourceId,
      status: 'PASS',
      matchingRowCount: rows.length,
      rows: rows.map(summarizeGrantEvidence),
    }

    if (error) {
      evidence.status = 'BLOCKED'
      evidence.error = { code: error.code || null, message: error.message || String(error) }
      addLiveCheck(report, check.key, 'BLOCKED', check.label, error.message)
    } else if (!rows.length) {
      evidence.status = 'BLOCKED'
      addLiveCheck(report, check.key, 'BLOCKED', check.label, 'No active access grants found.')
    } else if (!rows.every((row) => rowBelongsToTransaction(row, config.transactionId))) {
      evidence.status = 'CRITICAL'
      addLiveCheck(report, check.key, 'CRITICAL', check.label, 'Access grant belongs to a different transaction.')
    } else if (!check.predicate(rows)) {
      evidence.status = 'BLOCKED'
      addLiveCheck(report, check.key, 'BLOCKED', check.label, 'Access grants exist but do not prove the required permission.')
    } else {
      addLiveCheck(report, check.key, 'PASS', check.label, `${rows.length} active grant row(s) found.`)
    }

    report.live.accessGrantEvidence.push(evidence)
  }
}

async function runSurfaceProbe(client, surface, config, sampleLimit) {
  const idValue = normalizeText(config[surface.idConfigKey])
  const query = client
    .from(surface.table)
    .select(surface.select)
    .eq(surface.field, idValue)
    .limit(sampleLimit)

  const { data, error } = await query
  if (error) return { rowsVisible: 0, error }
  return { rowsVisible: Array.isArray(data) ? data.length : 0, error: null }
}

function classifyProbe({ persona, surface, result }) {
  const expectedAllowed = Boolean(persona.expectations[surface.key])
  const rowsVisible = result.rowsVisible || 0
  const deniedByDatabase = Boolean(result.error)

  if (expectedAllowed) {
    if (deniedByDatabase) {
      return {
        status: 'BLOCKED',
        outcome: 'unexpected_database_denial',
        detail: result.error.message,
      }
    }
    if (rowsVisible > 0) {
      return {
        status: 'PASS',
        outcome: 'expected_rows_visible',
        detail: `${rowsVisible} row(s) visible.`,
      }
    }
    return {
      status: surface.requiredForAllowed ? 'BLOCKED' : 'WARN',
      outcome: surface.requiredForAllowed ? 'expected_rows_missing' : 'optional_rows_missing',
      detail: surface.requiredForAllowed
        ? 'Expected at least one visible row for this required surface.'
        : 'No rows visible; this may be valid if the staging fixture has no rows on this optional surface.',
    }
  }

  if (deniedByDatabase || rowsVisible === 0) {
    return {
      status: 'PASS',
      outcome: deniedByDatabase ? 'denied_by_database' : 'no_rows_visible',
      detail: deniedByDatabase ? result.error.message : 'No rows visible.',
    }
  }

  return {
    status: 'CRITICAL',
    outcome: 'unexpected_rows_visible',
    detail: `${rowsVisible} row(s) visible to a denied persona.`,
  }
}

async function runPersonaMatrix(report, options, config) {
  for (const persona of config.personas) {
    const personaReport = {
      key: persona.key,
      label: persona.label,
      expected: persona.expectations,
      signedIn: false,
      userId: null,
      probes: [],
    }
    report.live.matrix.push(personaReport)

    let session
    try {
      session = await signIn(config, persona)
      personaReport.signedIn = true
      personaReport.userId = session.userId
      addLiveCheck(report, `${persona.key}_signin`, 'PASS', `${persona.label} signed in for document privacy probing.`)
    } catch (error) {
      addLiveCheck(report, `${persona.key}_signin`, 'BLOCKED', `${persona.label} sign-in failed.`, error.message)
      continue
    }

    for (const surface of liveProbeSurfaces) {
      const result = await runSurfaceProbe(session.client, surface, config, options.sampleLimit)
      const classified = classifyProbe({ persona, surface, result })
      const probe = {
        surface: surface.key,
        table: surface.table,
        expectedAllowed: Boolean(persona.expectations[surface.key]),
        rowsVisible: result.rowsVisible || 0,
        status: classified.status,
        outcome: classified.outcome,
        detail: classified.detail,
      }
      if (result.error) {
        probe.error = {
          code: result.error.code || null,
          message: result.error.message || String(result.error),
        }
      }
      personaReport.probes.push(probe)
      addLiveCheck(
        report,
        `${persona.key}_${surface.key}`,
        classified.status,
        `${persona.label}: ${surface.label}`,
        classified.detail,
      )
    }
  }
}

async function runLiveEvidence(report, options, config) {
  validateLiveConfig(report, config, options)

  if (!options.live) {
    report.live.mode = 'skipped'
    return
  }

  if (report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0) return

  const serviceClient = createSupabaseClient(config.supabaseUrl, config.serviceRoleKey)
  await runServiceRoleEvidence(report, options, config, serviceClient)
  if (report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0) return

  await runAccessGrantEvidence(report, config, serviceClient)
  if (report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0) return

  await runPersonaMatrix(report, options, config)
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.liveBlockedCount > 0 ||
    report.summary.liveCriticalCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Buyer Phase 5 document privacy blockers are cleared'
    return report
  }

  if (options.live) {
    report.summary.status = report.summary.liveWarningCount > 0 ? 'READY_LIVE_WITH_WARNINGS' : 'READY_LIVE'
    report.summary.recommendation = 'Buyer Phase 5 live document privacy evidence passed'
    return report
  }

  if (report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Buyer Phase 5 static document privacy contracts passed; run without skip flags before local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_CONTRACT'
  report.summary.recommendation = 'Buyer Phase 5 harness is implemented; run live document privacy evidence when staging document IDs are available'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  const config = buildConfig(loadEnv())

  runStaticChecks(report)
  await runPrerequisites(report, options)

  if (options.staticOnly) {
    report.live.mode = 'skipped'
  } else {
    await runLiveEvidence(report, options, config)
  }

  finalizeReport(report, options)
  console.log(JSON.stringify(report, null, 2))

  if (
    !['READY_LOCAL_CONTRACT', 'READY_STATIC_ONLY', 'READY_LIVE', 'READY_LIVE_WITH_WARNINGS'].includes(report.summary.status)
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
