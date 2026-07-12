#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const commandSteps = [
  {
    key: 'seller_listing_conversion_idempotency',
    label: 'Seller listing conversion idempotency',
    script: 'test:seller-listing-conversion-idempotency',
    coverage: 'One active listing per seller lead/originating CRM lead, duplicate recovery, branch attribution, and operational-field ownership.',
  },
  {
    key: 'seller_listing_publication_mapper',
    label: 'Seller listing publication mapper',
    script: 'test:seller-listing-publication-mapper',
    coverage: 'Seller onboarding facts fill publication drafts without overwriting agent-edited listing publication data.',
  },
  {
    key: 'seller_listing_relationship_integrity',
    label: 'Seller listing relationship integrity',
    script: 'test:seller-listing-relationship-integrity',
    coverage: 'Lead/listing/transaction backlinks, duplicate listing diagnostics, and compatibility lead links are guarded.',
  },
  {
    key: 'seller_listing_relationship_graph_integrity',
    label: 'Seller listing relationship graph integrity',
    script: 'test:seller-listing-relationship-graph-integrity',
    coverage: 'Organisation graph mismatches, mandate packet mismatches, and duplicate transaction/listing links are diagnosable.',
  },
  {
    key: 'seller_listing_document_continuity',
    label: 'Seller listing mandate document continuity',
    script: 'test:seller-listing-document-continuity',
    coverage: 'Listing mandate packet links and seller document continuity diagnostics remain intact.',
  },
  {
    key: 'seller_listing_timeline_continuity',
    label: 'Seller listing timeline continuity',
    script: 'test:seller-listing-timeline-continuity',
    coverage: 'Lead, listing, seller document, and mandate packet history stays linked without destructive backfills.',
  },
  {
    key: 'seller_listing_conversion_timeline',
    label: 'Seller listing conversion timeline',
    script: 'test:seller-listing-conversion-timeline',
    coverage: 'End-to-end seller conversion audit timeline resolves by listing or lead and preserves source boundaries.',
  },
  {
    key: 'seller_mandate_save_preserves_data',
    label: 'Seller mandate save preserves onboarding data',
    script: 'test:seller-mandate-save-preserves-data',
    coverage: 'Mandate commission saves patch only changed fields and preserve inactive seller onboarding values.',
  },
  {
    key: 'canonical_document_workspace',
    label: 'Canonical signed mandate workspace projection',
    script: 'test:canonical-document-workspace',
    coverage: 'Signed mandate packet versions satisfy seller-visible canonical requirements.',
  },
  {
    key: 'canonical_document_lifecycle',
    label: 'Canonical document packet lifecycle',
    script: 'test:canonical-document-lifecycle',
    coverage: 'Mandate packets link to canonical requirements and projected transaction document rows correctly.',
  },
]

const staticChecks = [
  {
    key: 'final_signed_mandate_branch_select',
    label: 'Final signed mandate conversion reads existing listing branch and lead branch attribution.',
    file: '../supabase/functions/generate-final-signed-document/index.ts',
    patterns: [
      /SIGNED_MANDATE_LISTING_SELECT =\s*\n\s*"[^"]*branch_id/,
      /\.select\("lead_id, organisation_id, branch_id, assigned_branch_id, assigned_agent_id/,
      /function resolveSignedMandateBranchId/,
    ],
  },
  {
    key: 'final_signed_mandate_branch_payloads',
    label: 'Final signed mandate conversion writes branch attribution on existing and fallback listing paths.',
    file: '../supabase/functions/generate-final-signed-document/index.ts',
    patterns: [
      /branch_id: branchId,\s*\n\s*seller_lead_id:/,
      /organisation_id: organisationId,\s*\n\s*branch_id: branchId,\s*\n\s*assigned_agent_id:/,
      /\.select\("id, branch_id, listing_status, mandate_status"\)/,
    ],
  },
  {
    key: 'final_signed_mandate_packet_context',
    label: 'Final signed mandate conversion records listing and branch context back onto the packet/activity trail.',
    file: '../supabase/functions/generate-final-signed-document/index.ts',
    patterns: [
      /activity_type:\s*"mandate_signed"/,
      /branchId: branchId \|\| null/,
      /privateListingId: listingId/,
      /branch_id: branchId \|\| sourceContext\.branch_id \|\| null/,
      /leadConvertedToListingAt: new Date\(\)\.toISOString\(\)/,
    ],
  },
  {
    key: 'lead_conversion_backlink',
    label: 'Signed mandate conversion updates the seller lead backlink to listing and mandate packet.',
    file: '../supabase/functions/generate-final-signed-document/index.ts',
    patterns: [
      /function updateLeadConversionLink/,
      /listing_id: listingId/,
      /mandate_packet_id: packetId \|\| null/,
      /\.from\("leads"\)[\s\S]*\.update\(fullPayload\)/,
    ],
  },
  {
    key: 'seller_listing_uniqueness_migration',
    label: 'Private listing uniqueness migration guards duplicate active seller lead conversion.',
    file: '../supabase/migrations/202606090001_private_listing_conversion_idempotency.sql',
    patterns: [
      /private_listings_one_active_originating_lead_idx/i,
      /private_listings_one_active_seller_lead_idx/i,
      /coalesce\(listing_status, ''\) <> 'withdrawn'/i,
      /coalesce\(listing_visibility, ''\) <> 'archived'/i,
    ],
  },
  {
    key: 'seller_listing_relationship_reports',
    label: 'Relationship, graph, document, and timeline integrity reports are present.',
    file: 'docs/seller-lead-listing-source-of-truth.md',
    patterns: [
      /bridge_private_listing_relationship_integrity_report\(\)/,
      /bridge_private_listing_relationship_graph_integrity_report\(\)/,
      /bridge_private_listing_document_continuity_report\(\)/,
      /bridge_private_listing_timeline_continuity_report\(\)/,
      /bridge_private_listing_conversion_timeline\(private_listing_id,\s*lead_id\)/,
    ],
  },
  {
    key: 'seller_lead_workspace_listing_creation',
    label: 'Seller lead workspace creates private listings with canonical lead links.',
    file: 'src/pages/AgentLeadsPage.jsx',
    patterns: [
      /createPrivateListing\(\{[\s\S]*sellerLeadId: normalizeText\(row\.leadId\)[\s\S]*originatingCrmLeadId: normalizeText\(row\.leadId\)/,
      /branchId: getLeadBranchId\(row\) \|\| normalizeText\(actor\?\.branchId \|\| actor\?\.primaryBranchId\)/,
      /mandatePacketId/,
      /DOCUMENT_START_PACKET_TYPES\.mandate/,
    ],
  },
  {
    key: 'phase3_package_contracts',
    label: 'Package exposes the Phase 3 seller listing and mandate contract scripts used by this gate.',
    file: 'package.json',
    patterns: commandSteps.map((step) => new RegExp(`"${step.script}":\\s*"[^"]+"`)),
  },
]

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipTests: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-tests') options.skipTests = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '3',
    scope: 'seller-side-transaction-launch',
    gate: 'listing-mandate-conversion-contracts',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 3 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
    },
    staticChecks: [],
    commands: [],
    acceptance: [
      'Private listing conversion is idempotent by seller lead and originating CRM lead.',
      'Signed mandate fallback listing creation preserves branch and agent attribution.',
      'Seller lead backlinks point at the listing and mandate packet after signing.',
      'Seller onboarding data can fill publication drafts without overwriting listing-owned fields.',
      'Relationship, graph, document, and timeline integrity diagnostics remain present and service-scoped.',
      'Mandate packet versions satisfy seller-visible canonical signed mandate requirements.',
      'Seller conversion timeline can be assembled without copying or mutating source history.',
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
      for (const pattern of check.patterns || [check.pattern]) {
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
        stdout: stdout.trim().split('\n').slice(-8).join('\n'),
        stderr: stderr.trim().split('\n').slice(-8).join('\n'),
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
        exitCode: null,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      })
    })
  })
}

async function runCommandChecks(report, options) {
  if (options.staticOnly || options.skipTests) {
    for (const step of commandSteps) {
      report.commands.push({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: 'SKIPPED',
      })
      report.summary.skippedCommandCount += 1
    }
    return
  }

  for (const step of commandSteps) {
    const result = await runNpmScript(step)
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function finalizeReport(report) {
  if (report.summary.staticBlockedCount > 0 || report.summary.commandBlockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Phase 3 blockers are cleared'
    return report
  }

  if (report.summary.skippedCommandCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 3 contract passed; run without --static-only before launch sign-off'
    return report
  }

  report.summary.status = 'READY'
  report.summary.recommendation = 'Phase 3 seller listing and mandate conversion contracts passed'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  runStaticChecks(report)
  await runCommandChecks(report, options)
  finalizeReport(report)

  console.log(JSON.stringify(report, null, 2))

  if (report.summary.status !== 'READY' && report.summary.status !== 'READY_STATIC_ONLY') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
