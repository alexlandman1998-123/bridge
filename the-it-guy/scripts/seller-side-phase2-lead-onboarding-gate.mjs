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
    label: 'Seller lead list/detail workspace contract',
    script: 'test:agent-leads-workspace',
    coverage: 'Agency lead workspace exposes seller tabs, actions, journey anchors, onboarding editor, and conversion handoff controls.',
  },
  {
    key: 'seller_journey',
    label: 'Seller journey stage contract',
    script: 'test:seller-journey',
    coverage: 'Seller lead progress moves through onboarding, mandate, listing, documents, and offer stages without cross-stage pollution.',
  },
  {
    key: 'seller_readiness',
    label: 'Seller readiness contract',
    script: 'test:seller-readiness',
    coverage: 'Seller onboarding, listing readiness, mandate readiness, and next-action rules expose correct blockers.',
  },
  {
    key: 'seller_onboarding_flow',
    label: 'Seller onboarding flow contract',
    script: 'test:seller-onboarding-flow-contract',
    coverage: 'Seller onboarding v2 fields, branch logic, required fields, visible fields, and document triggers are stable.',
  },
  {
    key: 'seller_onboarding_facts',
    label: 'Seller onboarding fact transformer contract',
    script: 'test:seller-onboarding-facts',
    coverage: 'Seller identity, legal, ownership, FICA, bond, occupancy, property, disclosure, and resolver facts are normalized.',
  },
  {
    key: 'seller_onboarding_south_african_scenarios',
    label: 'South African seller scenario matrix',
    script: 'test:seller-onboarding-sa-scenarios',
    coverage: 'Local seller, foreign seller, company, trust, estate, sectional title, land, and compliance branches are covered.',
  },
  {
    key: 'seller_portal_alignment',
    label: 'Seller portal alignment contract',
    script: 'test:seller-portal-alignment',
    coverage: 'Seller portal routes and data loaders keep seller onboarding tokens and selling context aligned.',
  },
]

const staticChecks = [
  {
    key: 'seller_lead_list_route',
    label: 'Seller lead list route is registered.',
    file: 'src/App.jsx',
    pattern: /path="\/pipeline\/leads"/,
  },
  {
    key: 'seller_lead_detail_route',
    label: 'Seller lead detail route is registered.',
    file: 'src/App.jsx',
    pattern: /path="\/pipeline\/leads\/:leadId"/,
  },
  {
    key: 'seller_onboarding_route',
    label: 'Seller onboarding token route is registered.',
    file: 'src/App.jsx',
    pattern: /path="\/seller\/onboarding\/:token"/,
  },
  {
    key: 'mobile_seller_onboarding_route',
    label: 'Mobile seller onboarding token route is registered.',
    file: 'src/App.jsx',
    pattern: /path="\/mobile\/seller-onboarding\/:token"/,
  },
  {
    key: 'seller_portal_route',
    label: 'Seller portal route is registered.',
    file: 'src/App.jsx',
    pattern: /path="\/client\/:token\/selling"/,
  },
  {
    key: 'seller_portal_section_route',
    label: 'Seller portal section route is registered.',
    file: 'src/App.jsx',
    pattern: /path="\/client\/:token\/selling\/:section"/,
  },
  {
    key: 'demo_seller_onboarding_token',
    label: 'Demo seller onboarding token is stable.',
    file: 'src/lib/onboardingDemoLinks.js',
    pattern: /SELLER_ONBOARDING_DEMO_TOKEN = 'demo-seller-onboarding'/,
  },
  {
    key: 'demo_seller_portal_token',
    label: 'Demo seller portal token is stable.',
    file: 'src/lib/onboardingDemoLinks.js',
    pattern: /SELLER_PORTAL_DEMO_TOKEN = 'demo-seller-portal'/,
  },
  {
    key: 'seller_onboarding_link_builder',
    label: 'Seller onboarding links target the token route.',
    file: 'src/lib/agentListingStorage.js',
    pattern: /return `\$\{origin\}\/seller\/onboarding\/\$\{token\}`/,
  },
  {
    key: 'seller_token_loaders',
    label: 'Seller onboarding token can resolve listings and leads.',
    file: 'src/lib/agentListingStorage.js',
    patterns: [
      /findListingBySellerOnboardingToken/,
      /findSellerLeadByOnboardingToken/,
    ],
  },
  {
    key: 'seller_lead_workspace_editor',
    label: 'Seller lead workspace exposes the onboarding editor anchor.',
    file: 'src/pages/AgentLeadsPage.jsx',
    patterns: [
      /id="seller-onboarding-editor"/,
      /Seller Onboarding/,
      /updatePrivateListingOnboardingFormData/,
    ],
  },
  {
    key: 'seller_onboarding_submit_to_listing',
    label: 'Seller onboarding completion creates or updates the linked listing draft.',
    file: 'src/pages/SellerOnboarding.jsx',
    patterns: [
      /createListingDraftFromSellerLead\(updated, \{ stage: LISTING_STATUS\.SELLER_ONBOARDING_COMPLETED \}\)/,
      /sellerOnboardingStatus: String\(updated\?\.sellerOnboarding\?\.status \|\| 'completed'\)\.trim\(\)/,
      /leadId: String\(updated\?\.sellerLeadId \|\| updated\?\.id \|\| ''\)\.trim\(\)/,
      /privateListingId: String\(updated\?\.id \|\| ''\)\.trim\(\)/,
    ],
  },
  {
    key: 'seller_onboarding_completion_idempotency',
    label: 'Repeated seller onboarding completion updates an existing listing draft instead of inserting a duplicate.',
    file: 'src/lib/agentListingStorage.js',
    patterns: [
      /const existingIndex = existingDrafts\.findIndex\(\(draft\) => String\(draft\?\.sellerLeadId \|\| ''\) === String\(lead\?\.sellerLeadId \|\| lead\?\.id \|\| ''\)\)/,
      /if \(existingIndex >= 0\) \{/,
      /rows\[existingIndex\] = finalized/,
      /writeAgentListingDrafts\(rows\)/,
      /return finalized/,
    ],
  },
  {
    key: 'seller_portal_token_context',
    label: 'Seller portal uses seller-token-aware loading before generic client portal loading.',
    file: 'src/services/clientPortalWorkspaceService.js',
    patterns: [
      /isSellerOnboardingToken\(token\)/,
      /fetchSellerClientPortalDataByToken\(token/,
      /buildSellerPortalJourneyView/,
    ],
  },
  {
    key: 'phase2_package_contracts',
    label: 'Package exposes the seller lead-to-onboarding contract scripts used by this gate.',
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
    phase: '2',
    scope: 'seller-side-transaction-launch',
    gate: 'lead-to-onboarding-contracts',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 2 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
    },
    staticChecks: [],
    commands: [],
    acceptance: [
      'Seller lead list and detail routes are registered.',
      'Seller onboarding token and mobile token routes are registered.',
      'Seller portal selling routes are registered.',
      'Seller onboarding links and demo tokens remain stable.',
      'Seller lead workspace exposes the seller onboarding editor and route actions.',
      'Submitted seller onboarding facts cover identity, legal, ownership, FICA, bond, occupancy, property, and disclosure branches.',
      'Seller onboarding completion is repeat-safe for the linked lead/listing shell.',
      'Seller portal loading keeps seller onboarding tokens bound to seller context.',
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
      const patterns = check.patterns || [check.pattern]
      for (const pattern of patterns) {
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
    report.summary.recommendation = 'NO-GO until Phase 2 blockers are cleared'
    return report
  }

  if (report.summary.skippedCommandCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 2 contract passed; run without --static-only before launch sign-off'
    return report
  }

  report.summary.status = 'READY'
  report.summary.recommendation = 'Phase 2 seller lead-to-onboarding contracts passed'
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
