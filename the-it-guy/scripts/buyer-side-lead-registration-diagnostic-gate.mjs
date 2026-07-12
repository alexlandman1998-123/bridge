#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const commandSteps = [
  {
    key: 'agent_leads_workspace',
    label: 'Buyer lead workspace',
    script: 'test:agent-leads-workspace',
    coverage: 'Lead list/detail workspace exposes buyer lead actions, offers, qualification, handoff, and transaction links.',
  },
  {
    key: 'lead_ingestion',
    label: 'Lead ingestion',
    script: 'test:lead-ingestion',
    coverage: 'Lead capture normalizes source records before buyer matching and assignment.',
  },
  {
    key: 'lead_assignment',
    label: 'Lead assignment',
    script: 'test:lead-assignment',
    coverage: 'Buyer lead ownership, queueing, SLA, and assignment rules remain stable.',
  },
  {
    key: 'lead_matching',
    label: 'Buyer lead matching',
    script: 'test:lead-matching',
    coverage: 'Buyer requirements match against listing inventory without dropping lead context.',
  },
  {
    key: 'lead_requirements',
    label: 'Buyer requirements',
    script: 'test:lead-requirements',
    coverage: 'Buyer property requirements and readiness signals remain available to lead workspaces.',
  },
  {
    key: 'buyer_onboarding_flow',
    label: 'Buyer onboarding flow contract',
    script: 'test:buyer-onboarding-flow-contract',
    coverage: 'Buyer type, finance branch, required fields, document triggers, aliases, and branch summary are stable.',
  },
  {
    key: 'buyer_onboarding_sa_scenarios',
    label: 'South African buyer scenarios',
    script: 'test:buyer-onboarding-sa-scenarios',
    coverage: 'Individual, co-purchaser, foreign, company, trust, cash, bond, and hybrid buyer scenarios are covered.',
  },
  {
    key: 'offer_to_transaction_matrix',
    label: 'Offer-to-transaction matrix',
    script: 'test:offer-to-transaction-scenario-matrix',
    coverage: 'Buyer offer states, counter-offers, expiry, rejection, withdrawal, and accepted-offer conversion remain safe.',
  },
  {
    key: 'transaction_spine_propagation',
    label: 'Transaction spine propagation',
    script: 'test:listing-to-transaction-routing-propagation',
    coverage: 'Accepted-offer conversion preserves buyer lead/contact, listing, seller, branch, agent, routing, and participant context.',
  },
  {
    key: 'transaction_routing_profile',
    label: 'Transaction routing profile',
    script: 'test:transaction-routing-profile',
    coverage: 'Cash, bond, and hybrid buyer finance routes resolve workflow, document, and roleplayer requirements.',
  },
  {
    key: 'finance_tab_launch_readiness',
    label: 'Finance tab launch readiness',
    script: 'test:finance-tab-launch-readiness',
    coverage: 'Buyer finance and bond readiness render expected transaction workspace state.',
  },
  {
    key: 'document_request_scenario_matrix',
    label: 'Document request matrix',
    script: 'test:document-request-scenario-matrix',
    coverage: 'Buyer document requests remain linked to transaction requirements and visibility contexts.',
  },
  {
    key: 'transaction_documents_command_centre',
    label: 'Transaction documents command centre',
    script: 'test:transaction-documents-command-centre',
    coverage: 'Buyer documents, missing priorities, uploads, requests, and library state render in the command centre.',
  },
  {
    key: 'transaction_canonical_document_engine',
    label: 'Transaction canonical document engine',
    script: 'test:transaction-canonical-document-engine',
    coverage: 'Canonical buyer document requirements, instances, review state, and transaction rows stay aligned.',
  },
  {
    key: 'canonical_workflow_gates',
    label: 'Canonical workflow gates',
    script: 'test:canonical-workflow-gates',
    coverage: 'Buyer onboarding, OTP, finance, transfer, registration, and closeout gates resolve consistently.',
  },
  {
    key: 'workflow_rollup_rules',
    label: 'Workflow rollup rules',
    script: 'test:workflow-rollup-rules',
    coverage: 'Buyer-facing OTP, finance, transfer, and registration rollups expose blockers and readiness.',
  },
  {
    key: 'workflow_actions',
    label: 'Workflow actions',
    script: 'test:workflow-actions',
    coverage: 'Registration actions require evidence and write auditable workflow events.',
  },
  {
    key: 'transaction_workflow_rollup',
    label: 'Transaction workflow rollup',
    script: 'test:transaction-workflow-rollup',
    coverage: 'Transaction rollups advance through buyer onboarding, OTP, finance, transfer, registration, and closeout.',
  },
  {
    key: 'transaction_overview_conversation',
    label: 'Transaction overview conversation',
    script: 'test:transaction-overview-conversation',
    coverage: 'Buyer activity, role workspace, and structured conversation history render in the transaction workspace.',
  },
  {
    key: 'browser_entry_blockers',
    label: 'Browser entry blockers',
    script: 'test:browser-entry-blockers',
    coverage: 'Buyer public, token, auth, and route-entry blockers remain guarded.',
  },
]

const browserSmokeStep = {
  key: 'buyer_onboarding_mobile_browser_smoke',
  label: 'Buyer onboarding browser smoke',
  script: 'test:buyer-onboarding-mobile-phase6',
  coverage: 'Buyer onboarding browser flow reaches review for mobile scenarios with mocked Supabase traffic.',
}

const staticChecks = [
  {
    key: 'buyer_public_routes',
    label: 'Buyer public onboarding, portal, offer, and mobile routes are registered.',
    file: 'src/App.jsx',
    patterns: [
      /path="\/pipeline\/leads"/,
      /path="\/pipeline\/leads\/:leadId"/,
      /path="\/client\/onboarding\/:token"/,
      /path="\/mobile\/buyer-onboarding\/:token"/,
      /path="\/client\/:token\/buying"/,
      /path="\/client\/:token\/buying\/:section"/,
      /path="\/client\/offer\/:token"/,
      /path="\/offers\/session\/:token"/,
      /path="\/offers\/:token"/,
      /path="\/transactions\/:transactionId"/,
    ],
  },
  {
    key: 'buyer_demo_tokens',
    label: 'Buyer demo onboarding and portal tokens are stable.',
    file: 'src/lib/onboardingDemoLinks.js',
    patterns: [
      /BUYER_ONBOARDING_DEMO_TOKEN = 'demo-buyer-onboarding'/,
      /BUYER_PORTAL_DEMO_TOKEN = 'demo-buyer-portal'/,
      /buyerOnboardingPath = `\/client\/onboarding\/\$\{BUYER_ONBOARDING_DEMO_TOKEN\}`/,
      /buyerPortalPath = `\/client\/\$\{BUYER_PORTAL_DEMO_TOKEN\}\/buying`/,
      /getDemoBuyerOnboardingPayload/,
      /getDemoClientPortalSeedData/,
    ],
  },
  {
    key: 'buyer_lead_stage_model',
    label: 'Buyer lead lifecycle model reaches registration.',
    file: 'src/lib/buyerLifecycleService.js',
    patterns: [
      /export const BUYER_LEAD_STAGES = \[[\s\S]*'New Lead'[\s\S]*'Offer Accepted'[\s\S]*'Onboarding'[\s\S]*'Finance'[\s\S]*'Transfer'[\s\S]*'Registered'/,
      /REGISTRATION_CONFIRMED: 'registration_confirmed'/,
      /EVENT_STAGE_MAP[\s\S]*REGISTRATION_CONFIRMED[\s\S]*'Registered'/,
      /OFFER_STATUS[\s\S]*CONVERTED_TO_TRANSACTION/,
      /getOfferLifecycleSummary/,
    ],
  },
  {
    key: 'buyer_onboarding_contracts',
    label: 'Buyer onboarding canonical contracts are present.',
    file: 'src/lib/buyerOnboardingFlowContract.js',
    patterns: [
      /BUYER_ONBOARDING_FLOW_VERSION/,
      /resolveBuyerOnboardingFlowContract/,
      /resolveBuyerBranch/,
      /resolveBuyerFinanceBranch/,
      /BUYER_ONBOARDING_FIELD_ALIASES/,
    ],
  },
  {
    key: 'buyer_onboarding_ui_submission',
    label: 'Buyer onboarding UI loads by token, saves drafts, submits, and uses canonical flow resolution.',
    file: 'src/pages/ClientOnboarding.jsx',
    patterns: [
      /useParams/,
      /fetchClientOnboardingByToken/,
      /saveClientOnboardingDraft/,
      /submitClientOnboarding/,
      /resolveBuyerOnboardingFlow/,
      /getDemoBuyerOnboardingPayload/,
      /isBuyerOnboardingDemoToken/,
    ],
  },
  {
    key: 'buyer_offer_public_flows',
    label: 'Buyer offer public routes support direct and post-viewing offer submissions.',
    file: 'src/pages/BuyerOfferSubmission.jsx',
    patterns: [
      /function BuyerOfferSubmission/,
      /Submit Revised Offer/,
      /canonicalBanner/,
      /This offer is already under review/,
    ],
  },
  {
    key: 'buyer_post_viewing_offer_flow',
    label: 'Post-viewing buyer offer portal blocks duplicate live offer paths and supports revised offers.',
    file: 'src/pages/PostViewingOfferPortal.jsx',
    patterns: [
      /function PostViewingOfferPortal/,
      /Submit revised offer/,
      /selectedPropertyBanner/,
      /open offer records/,
      /buyer_offer_submitted_agent/,
    ],
  },
  {
    key: 'accepted_offer_transaction_spine',
    label: 'Accepted-offer conversion writes buyer lead, buyer contact, listing, offer, branch, and onboarding URL context.',
    file: 'src/lib/transactionLifecycleService.js',
    patterns: [
      /\/client\/onboarding\/\$\{onboardingToken\}/,
      /originating_buyer_lead_id: offerRecord\?\.buyerLeadId/,
      /accepted_offer_id: offerRecord\?\.id/,
      /buyer_contact_id: payload\?\.buyerContactId \|\| offerRecord\?\.buyerContactId/,
      /buyer_id: offerRecord\?\.buyerLeadId/,
      /assigned_branch_id: isUuidLike\(nextBranchId\) \? nextBranchId : null/,
      /routing_profile_json: routingProfile/,
    ],
  },
  {
    key: 'buyer_registration_workflow',
    label: 'Workflow rollup carries buyer onboarding, buyer FICA, finance, transfer, and registration gates.',
    file: 'server/services/transactionWorkflowRollup.js',
    patterns: [
      /BUYER_ONBOARDING_COMPLETE/,
      /BUYER_FICA_COMPLETE/,
      /key: 'collect_buyer_details'/,
      /ownerRole: 'buyer'/,
      /key: 'ready_for_transfer'/,
      /function buildAttorneyRegistrationWorkflow/,
      /REGISTRATION_CONFIRMATION_REQUIRED/,
      /registration_confirmed/,
    ],
  },
  {
    key: 'buyer_registration_action_guard',
    label: 'Registration action cannot complete without required registration evidence.',
    file: 'server/services/workflowActionService.js',
    patterns: [
      /function validateRegistrationPayload/,
      /REGISTRATION_DATE_REQUIRED/,
      /TITLE_DEED_NUMBER_REQUIRED/,
      /REGISTRATION_CONFIRMATION_REQUIRED/,
      /workflowKey: 'registration'/,
      /eventType: 'workflow_action_completed'/,
    ],
  },
  {
    key: 'buyer_diagnostic_package_contracts',
    label: 'Package exposes buyer diagnostic and underlying evidence commands.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-lead-registration-diagnostic":\s*"node scripts\/buyer-side-lead-registration-diagnostic-gate\.mjs"/,
      ...commandSteps.map((step) => new RegExp(`"${step.script}":\\s*"[^"]+"`)),
      /"test:buyer-onboarding-mobile-phase6":\s*"node scripts\/buyer-onboarding-mobile-phase6\.test\.mjs"/,
    ],
  },
]

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipTests: false,
    includeBrowserSmoke: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-tests') options.skipTests = true
    else if (arg === '--include-browser-smoke') options.includeBrowserSmoke = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    scope: 'buyer-side-lead-to-registration',
    gate: 'lead-onboarding-offer-transaction-registration-diagnostic',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until buyer-side diagnostic blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
    },
    staticChecks: [],
    commands: [],
    acceptance: [
      'Buyer lead list/detail workspace is in scope from lead capture.',
      'Buyer onboarding token, mobile token, buyer portal, and offer routes are registered.',
      'Buyer onboarding covers natural person, foreign, company, trust, cash, bond, and hybrid branches.',
      'Offer lifecycle handles submitted, countered, expired, rejected, withdrawn, accepted, and converted states.',
      'Accepted offer conversion preserves buyer lead/contact, listing, branch, agent, finance, routing, and participant context.',
      'Finance, document, workflow, transfer, registration, and closeout gates are covered by existing transaction suites.',
      'Registration completion remains evidence-gated and auditable.',
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
        exitCode: null,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      })
    })
  })
}

async function runCommandChecks(report, options) {
  const steps = options.includeBrowserSmoke ? [...commandSteps, browserSmokeStep] : commandSteps
  if (options.staticOnly || options.skipTests) {
    for (const step of steps) {
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

  for (const step of steps) {
    const result = await runNpmScript(step)
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function finalizeReport(report) {
  if (report.summary.staticBlockedCount > 0 || report.summary.commandBlockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until buyer-side diagnostic blockers are cleared'
    return report
  }

  if (report.summary.skippedCommandCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static buyer-side diagnostic passed; run without skip flags before launch sign-off'
    return report
  }

  report.summary.status = 'READY'
  report.summary.recommendation = 'Buyer-side lead-to-registration diagnostic passed locally'
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
