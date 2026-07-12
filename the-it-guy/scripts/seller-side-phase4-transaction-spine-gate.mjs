#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const commandSteps = [
  {
    key: 'offer_to_transaction_matrix',
    label: 'Offer-to-transaction scenario matrix',
    script: 'test:offer-to-transaction-scenario-matrix',
    coverage: 'Accepted, countered, expired, rejected, withdrawn, offline, and deal-fell-through offer states remain transaction-safe.',
  },
  {
    key: 'listing_transaction_spine',
    label: 'Listing-to-transaction spine propagation',
    script: 'test:listing-to-transaction-routing-propagation',
    coverage: 'Accepted offer conversion preserves listing, seller, buyer, branch, agent, routing, and participant boundary context.',
  },
  {
    key: 'seller_document_propagation',
    label: 'Seller document transaction propagation',
    script: 'test:seller-document-propagation',
    coverage: 'Seller-uploaded listing documents promote idempotently into transaction documents, requirements, requests, and notifications.',
  },
  {
    key: 'transaction_routing_profile',
    label: 'Transaction routing profile',
    script: 'test:transaction-routing-profile',
    coverage: 'Cash, bond, and hybrid route profiles resolve required workflow, document, and roleplayer signals.',
  },
  {
    key: 'transaction_routing_workflow_adaptation',
    label: 'Routing workflow adaptation',
    script: 'test:transaction-routing-workflow-adaptation',
    coverage: 'Routing profiles adapt workflow lanes and requirements without dropping seller transaction state.',
  },
  {
    key: 'transaction_routing_diagnostics',
    label: 'Routing diagnostics',
    script: 'test:transaction-routing-diagnostics',
    coverage: 'Routing gaps and fallback risks are diagnosable before transaction launch.',
  },
  {
    key: 'finance_tab_launch_readiness',
    label: 'Finance tab launch readiness',
    script: 'test:finance-tab-launch-readiness',
    coverage: 'Finance readiness renders expected state for transaction workspace users.',
  },
  {
    key: 'transaction_documents_command_centre',
    label: 'Transaction documents command centre',
    script: 'test:transaction-documents-command-centre',
    coverage: 'Documents command centre renders readiness, missing priorities, requests, uploads, and the document library.',
  },
  {
    key: 'transaction_canonical_document_engine',
    label: 'Transaction canonical document engine',
    script: 'test:transaction-canonical-document-engine',
    coverage: 'Canonical document requirements, instances, review state, and transaction document rows remain aligned.',
  },
  {
    key: 'transaction_overview_conversation',
    label: 'Transaction overview conversation',
    script: 'test:transaction-overview-conversation',
    coverage: 'Overview, attorney role workspace, activity, and structured conversation history render in the transaction workspace.',
  },
  {
    key: 'document_request_scenario_matrix',
    label: 'Document request scenario matrix',
    script: 'test:document-request-scenario-matrix',
    coverage: 'Additional document requests stay linked to transaction requirements and visibility contexts.',
  },
]

const staticChecks = [
  {
    key: 'transaction_spine_branch_agent_seller',
    label: 'Transaction lifecycle writes branch, seller, buyer, listing, agent, and accepted-offer spine fields.',
    file: 'src/lib/transactionLifecycleService.js',
    patterns: [
      /const TRANSACTION_IDENTITY_SELECT = '[^']*assigned_agent_id[^']*assigned_branch_id/,
      /function resolveTransactionBranchId/,
      /assigned_branch_id: isUuidLike\(nextBranchId\) \? nextBranchId : null/,
      /listing_id: nextListingId \|\| null/,
      /originating_buyer_lead_id: nextLeadId \|\| null/,
      /accepted_offer_id: acceptedOfferId \|\| null/,
      /seller_contact_id: normalize\(payload\?\.sellerContactId\) \|\| null/,
      /insertAgentParticipant\(\{[\s\S]*assignedAgentId: nextAssignedAgentId/,
    ],
  },
  {
    key: 'transaction_insert_fallback',
    label: 'Transaction insert keeps older-schema fallback while modern schema carries routing and branch context.',
    file: 'src/lib/transactionLifecycleService.js',
    patterns: [
      /function removeRoutingProfileTransactionFields/,
      /delete fallback\.assigned_agent_id/,
      /delete fallback\.assigned_branch_id/,
      /routing_profile_json: routingProfile/,
      /Object\.fromEntries\([\s\S]*'assigned_branch_id'[\s\S]*'seller_contact_id'/,
    ],
  },
  {
    key: 'canonical_offer_conversion_payload',
    label: 'Canonical accepted-offer conversion passes seller, branch, listing, finance, and routing context.',
    file: 'src/lib/buyerLifecycleService.js',
    patterns: [
      /function mapListingDbRow[\s\S]*branchId: row\.branch_id[\s\S]*sellerLeadId: row\.seller_lead_id[\s\S]*mandatePacketId: row\.mandate_packet_id/,
      /sellerContactId: canonicalOffer\.sellerContactId/,
      /originatingSellerLeadId: canonicalOffer\.sellerLeadId/,
      /branchId: listing\?\.branchId/,
      /assignedBranchId: listing\?\.assignedBranchId/,
      /conversionPayload\.routingProfile = resolveTransactionRoutingProfile/,
    ],
  },
  {
    key: 'seller_document_promotion',
    label: 'Seller listing uploads promote into transaction documents idempotently.',
    file: '../supabase/migrations/202606010002_seller_document_transaction_bridge.sql',
    patterns: [
      /documents_transaction_source_document_unique_idx/i,
      /bridge_promote_private_listing_document_row/i,
      /bridge_promote_pending_private_listing_documents/i,
      /on conflict \(transaction_id, source, source_document_id\) do update/i,
      /transaction_required_documents/i,
      /document_requests/i,
    ],
  },
  {
    key: 'seller_document_runtime_bridge',
    label: 'Transaction workspaces attempt pending seller-document promotion at document load time.',
    file: 'src/lib/api.js',
    patterns: [
      /bridge_promote_pending_private_listing_documents/i,
      /function normalizeDocumentViewerRole/i,
      /source_document_id, file_bucket/i,
      /viewerRole:\s*access\.role/i,
    ],
  },
  {
    key: 'transaction_workspace_surfaces',
    label: 'Transaction workspace exposes finance, documents, overview activity, and conversation surfaces.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /\{activeWorkspaceMenu === 'documents' \? \(/,
      /\{activeWorkspaceMenu === 'finance' \? \(/,
      /Document Readiness/,
      /TransactionFinanceCommandCenter/,
      /financeReadinessHandoff/,
      /overviewConversationEntries/,
      /<BondMatterConversationPanel/,
      /<AttorneyRoleWorkspacePanel/,
    ],
  },
  {
    key: 'phase4_package_contracts',
    label: 'Package exposes the Phase 4 seller transaction spine contract scripts used by this gate.',
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
    phase: '4',
    scope: 'seller-side-transaction-launch',
    gate: 'transaction-spine-documents-routing-contracts',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 4 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
    },
    staticChecks: [],
    commands: [],
    acceptance: [
      'Accepted offer conversion preserves transaction spine context for seller, buyer, property, listing, branch, agent, and participant boundary.',
      'Seller listing documents promote into transaction documents idempotently.',
      'Cash, bond, and hybrid routing profiles resolve transaction workflow requirements.',
      'Finance and document command-centre surfaces render expected transaction state.',
      'Seller-visible activity and structured transaction conversation remain wired into the overview workspace.',
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
    report.summary.recommendation = 'NO-GO until Phase 4 blockers are cleared'
    return report
  }

  if (report.summary.skippedCommandCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 4 contract passed; run without --static-only before launch sign-off'
    return report
  }

  report.summary.status = 'READY'
  report.summary.recommendation = 'Phase 4 seller transaction spine, documents, and routing contracts passed'
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
