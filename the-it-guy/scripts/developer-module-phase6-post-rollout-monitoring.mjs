import { readFile } from 'node:fs/promises'

const RLS_POLICY_EXPECTATIONS = Object.freeze([
  {
    id: 'rls.required_documents.insert',
    file: 'requiredDocumentsMigration',
    pattern: /create policy transaction_required_documents_insert_transaction_spine_scope[\s\S]*?for insert[\s\S]*?to authenticated[\s\S]*?with check \([\s\S]*?bridge_can_access_transaction_spine\(transaction_id\)/i,
    description: 'Required document creation is allowed through transaction-spine scoped RLS.',
  },
  {
    id: 'rls.required_documents.update',
    file: 'requiredDocumentsMigration',
    pattern: /create policy transaction_required_documents_update_transaction_spine_scope[\s\S]*?for update[\s\S]*?using \([\s\S]*?bridge_can_access_transaction_spine\(transaction_id\)[\s\S]*?with check \([\s\S]*?bridge_can_access_transaction_spine\(transaction_id\)/i,
    description: 'Required document updates keep both SELECT and WITH CHECK transaction-spine predicates.',
  },
  {
    id: 'rls.subprocesses.insert',
    file: 'subprocessMigration',
    pattern: /create policy transaction_subprocesses_insert_transaction_spine_scope[\s\S]*?for insert[\s\S]*?process_type in \('finance', 'transfer', 'bond', 'attorney', 'cancellation'\)[\s\S]*?bridge_can_access_transaction_spine\(transaction_id\)/i,
    description: 'Workflow subprocess lane creation is scoped to valid process types and the transaction spine.',
  },
  {
    id: 'rls.subprocess_steps.insert',
    file: 'subprocessMigration',
    pattern: /create policy transaction_subprocess_steps_insert_transaction_spine_scope[\s\S]*?for insert[\s\S]*?exists \([\s\S]*?from public\.transaction_subprocesses lane[\s\S]*?bridge_can_access_transaction_spine\(lane\.transaction_id\)/i,
    description: 'Workflow subprocess step creation inherits access from its parent transaction lane.',
  },
  {
    id: 'rls.status_links.insert',
    file: 'statusLinksMigration',
    pattern: /create policy transaction_status_links_insert_transaction_spine_scope[\s\S]*?for insert[\s\S]*?is_active = true[\s\S]*?bridge_can_access_transaction_spine\(transaction_id\)/i,
    description: 'Transaction status link creation is scoped to active links on the transaction spine.',
  },
  {
    id: 'rls.onboarding.insert',
    file: 'statusLinksMigration',
    pattern: /create policy transaction_onboarding_insert_transaction_spine_scope[\s\S]*?for insert[\s\S]*?is_active = true[\s\S]*?bridge_can_access_transaction_spine\(transaction_id\)/i,
    description: 'Buyer onboarding token creation is scoped to active transaction onboarding records.',
  },
])

const RECOVERABLE_SETUP_AREAS = Object.freeze([
  'role_players',
  'workflow_subprocesses',
  'buyer_onboarding',
  'required_documents',
  'client_portal_link',
  'finance_details',
  'document_automation',
])

const DOC_EXPECTATIONS = Object.freeze([
  /Developer Module Phase 6/i,
  /post-rollout monitoring/i,
  /24-hour/i,
  /buyer onboarding link/i,
  /reservation deposit/i,
  /seller onboarding/i,
  /RLS/i,
  /rollback/i,
  /no live email/i,
  /does not mutate\s+production data/i,
])

const SENSITIVE_PATTERN = /client_portal_token|seller_portal_token|signing_token|access_token|service_role|recipientEmail|buyerEmail|sellerEmail|onboardingToken/i

function check(id, description, passed, evidence = '') {
  return {
    id,
    description,
    status: passed ? 'pass' : 'fail',
    evidence,
  }
}

function containsAll(source = '', tokens = []) {
  return tokens.every((token) => source.includes(token))
}

function hasPackageScripts(packageJson = {}) {
  const scripts = packageJson.scripts || {}
  return (
    scripts['test:developer-module-phase6'] === 'node scripts/developer-module-phase6-post-rollout-monitoring.test.mjs' &&
    scripts['test:developer-module-phase7'] === 'node scripts/developer-financial-reconciliation-export-phase7.test.mjs' &&
    scripts['test:developer-module-phase8'] === 'node scripts/developer-financial-handoff-readiness-phase8.test.mjs' &&
    scripts['test:developer-module-phase9'] === 'node scripts/developer-module-phase9-live-acceptance-smoke.test.mjs' &&
    scripts['test:developer-module-phase10'] === 'node scripts/developer-leads-phase10-foundation.test.mjs && node src/core/developerLeads/__tests__/developerLeadContract.test.js' &&
    scripts['test:developer-module-phase11'] === 'node scripts/developer-leads-phase11-developer-fed.test.mjs' &&
    scripts['test:developer-module-phase12'] === 'node scripts/developer-leads-phase12-agency-fed.test.mjs' &&
    scripts['test:developer-module-phase16'] === 'node scripts/developer-leads-phase16-launch-readiness.test.mjs' &&
    scripts['test:developer-module-phase17'] === 'node scripts/developer-leads-phase17-transaction-handoff.test.mjs' &&
    scripts['test:developer-module-phase18'] === 'node scripts/developer-leads-phase18-convert-and-send.test.mjs' &&
    scripts['test:developer-module-phase19'] === 'node scripts/developer-leads-phase19-agent-developer-alignment.test.mjs' &&
    scripts['test:developer-module-phase20'] === 'node scripts/developer-leads-phase20-agent-capture.test.mjs' &&
    scripts['test:developer-module-phase21'] === 'node scripts/developer-leads-phase21-protected-intake-queue.test.mjs' &&
    scripts['test:developer-module-phase22'] === 'node scripts/developer-leads-phase22-agency-handover-release.test.mjs' &&
    scripts['test:developer-module-phase23'] === 'node scripts/developer-leads-phase23-released-conversion-queue.test.mjs' &&
    scripts['test:developer-module-phase24'] === 'node scripts/developer-leads-phase24-agency-conversion-receipts.test.mjs' &&
    scripts['test:developer-module-phase25'] === 'node scripts/developer-leads-phase25-attribution-ledger.test.mjs' &&
    scripts['test:developer-module-phase26'] === 'node scripts/developer-leads-phase26-operations-health.test.mjs' &&
    scripts['verify:developer-module:monitoring'] === 'node scripts/developer-module-phase6-post-rollout-monitoring.mjs' &&
    scripts['verify:developer-module:acceptance'] === 'node scripts/developer-module-phase9-live-acceptance-smoke.test.mjs --require-observation' &&
    /test:developer-module-phase6/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase7/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase8/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase9/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase10/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase11/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase12/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase16/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase17/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase18/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase19/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase20/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase21/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase22/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase23/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase24/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase25/.test(scripts['verify:developer-module'] || '') &&
    /test:developer-module-phase26/.test(scripts['verify:developer-module'] || '')
  )
}

export async function buildDeveloperModulePhase6PostRolloutMonitoringReport() {
  const files = {
    packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
    phase5Test: await readFile(new URL('./developer-module-phase5-release-readiness.test.mjs', import.meta.url), 'utf8'),
    phase6Script: await readFile(new URL('./developer-module-phase6-post-rollout-monitoring.mjs', import.meta.url), 'utf8'),
    phase6Doc: await readFile(new URL('../docs/developer-module-phase6-post-rollout-monitoring.md', import.meta.url), 'utf8'),
    requiredDocumentsMigration: await readFile(
      new URL('../../supabase/migrations/20260815202615_transaction_required_documents_internal_rls_repair.sql', import.meta.url),
      'utf8',
    ),
    subprocessMigration: await readFile(
      new URL('../../supabase/migrations/202608130007_transaction_subprocess_creation_rls_repair.sql', import.meta.url),
      'utf8',
    ),
    statusLinksMigration: await readFile(
      new URL('../../supabase/migrations/202608130012_transaction_link_creation_rls_repair.sql', import.meta.url),
      'utf8',
    ),
    wizard: await readFile(new URL('../src/components/NewTransactionWizard.jsx', import.meta.url), 'utf8'),
    unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
    api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
    workflowActions: await readFile(new URL('../server/services/workflowActionAvailabilityService.js', import.meta.url), 'utf8'),
    lifecycle: await readFile(new URL('../src/core/transactions/transactionLifecycle.js', import.meta.url), 'utf8'),
    button: await readFile(new URL('../src/components/ui/Button.jsx', import.meta.url), 'utf8'),
  }

  const migrationSource = [
    files.requiredDocumentsMigration,
    files.subprocessMigration,
    files.statusLinksMigration,
  ].join('\n')

  const checks = [
    check(
      'phase5.release_gate.present',
      'Phase 6 starts from the Phase 5 release-readiness gate.',
      /developer_module_phase5_release_readiness_v1/.test(files.phase5Test),
      'scripts/developer-module-phase5-release-readiness.test.mjs',
    ),
    check(
      'phase6.package.scripts',
      'Package scripts expose Phase 6 and include it in the full developer-module verification chain.',
      hasPackageScripts(files.packageJson),
      'package.json scripts',
    ),
  ]

  for (const expectation of RLS_POLICY_EXPECTATIONS) {
    checks.push(check(
      expectation.id,
      expectation.description,
      expectation.pattern.test(files[expectation.file]),
      expectation.file,
    ))
  }

  checks.push(check(
    'rls.grants.data_api_ready',
    'RLS repairs keep authenticated write grants and Data API schema reload signals in place.',
    containsAll(migrationSource, [
      'grant insert, update on public.transaction_required_documents to authenticated',
      'grant select, insert, update on public.transaction_subprocesses to authenticated',
      'grant select, insert, update on public.transaction_subprocess_steps to authenticated',
      'grant insert, update on public.transaction_status_links to authenticated',
      'grant insert, update on public.transaction_onboarding to authenticated',
      "notify pgrst, 'reload schema'",
    ]),
    'RLS repair migrations',
  ))

  checks.push(check(
    'rls.no_deprecated_or_bypass_patterns',
    'Developer RLS repairs avoid deprecated auth.role checks and SECURITY DEFINER bypasses.',
    !/\bauth\.role\s*\(/i.test(migrationSource) && !/security\s+definer/i.test(migrationSource),
    'RLS repair migrations',
  ))

  checks.push(check(
    'transaction.creation.recoverable_setup_warnings',
    'Transaction creation records recoverable setup failures as visible warnings instead of blocking the shell.',
    /function isRecoverableTransactionSetupError/.test(files.api) &&
      /const setupWarnings = \[\]/.test(files.api) &&
      /recordSetupWarning/.test(files.api) &&
      /setupWarnings,/.test(files.api) &&
      RECOVERABLE_SETUP_AREAS.every((area) => files.api.includes(`recordSetupWarning('${area}'`)),
    'src/lib/api.js',
  ))

  checks.push(check(
    'wizard.developer_partner_defaults_visible',
    'New transaction setup loads developer partner options and surfaces setup warnings after creation.',
    containsAll(files.wizard, [
      'fetchDeveloperPartnersWorkspace',
      'getDeveloperWorkspacePartnerOptions',
      'Development defaults applied:',
      'Setup Needs Attention',
      'createdTransaction.setupWarnings',
    ]),
    'src/components/NewTransactionWizard.jsx',
  ))

  checks.push(check(
    'buyer_onboarding.send_and_handoff_visible',
    'Developer unit workspace can send buyer onboarding and record the bond-originator handoff without seller-side selection.',
    containsAll(files.unitDetail, [
      'async function handleSendOnboardingEmail',
      "type: 'client_onboarding'",
      'recordBuyerOnboardingSent',
      'resolveDeveloperBuyerOnboardingHandoffRoleplayers',
      "actorRole: actingRole || 'developer'",
      "window.dispatchEvent(new Event('itg:transaction-updated'))",
      'await loadDetail()',
    ]),
    'src/pages/UnitDetail.jsx',
  ))

  checks.push(check(
    'workspace.clicks.no_full_page_refresh_regression',
    'Critical developer workspace clicks use client handlers and button defaults that do not submit or reload the page.',
    /type:\s*type \|\| 'button'/.test(files.button) &&
      /onClick:\s*\(\) => void handleSendOnboardingEmail/.test(files.unitDetail) &&
      /let onClick = \(\) => void handleOverviewWorkflowAction/.test(files.unitDetail) &&
      /type="button"[\s\S]*?onClick=\{item\.onClick\}/.test(files.unitDetail) &&
      !/window\.location\.reload|location\.reload|history\.go\(0\)/.test(`${files.unitDetail}\n${files.wizard}`),
    'UnitDetail workspace actions and shared Button default',
  ))

  checks.push(check(
    'workflow.development_sale_gates',
    'Development workflow excludes seller onboarding while still gating finance on buyer onboarding and signed OTP.',
    /isDevelopmentSale\(state\)\s*\?\s*\['buyer_onboarding_complete'\]/.test(files.workflowActions) &&
      /Seller onboarding is not required for new development transactions\./.test(files.workflowActions) &&
      /const requiredSteps = \['buyer_onboarding_complete', 'signed_otp_received'\]/.test(files.workflowActions) &&
      /hasActiveSupportingDocumentRequirements/.test(files.workflowActions),
    'server/services/workflowActionAvailabilityService.js',
  ))

  checks.push(check(
    'lifecycle.reservation_deposit_before_otp',
    'Reservation deposit remains an optional stage before OTP when relevant to the development transaction.',
    /reservation_deposit_paid:\s*'Reservation Deposit Paid'/.test(files.lifecycle) &&
      /\?\s*'reservation_deposit_paid'\s*:\s*mappedCurrentStage/.test(files.lifecycle) &&
      /Reservation deposit is not paid\./.test(files.lifecycle),
    'src/core/transactions/transactionLifecycle.js',
  ))

  checks.push(check(
    'phase6.static_monitor.no_live_delivery_or_logs_dependency',
    'Phase 6 monitoring report is static and does not send email, mutate live data, or depend on deprecated Supabase log endpoints.',
    !/\bfetch\s*\(/.test(files.phase6Script) &&
      !/\bserve\s*\(/.test(files.phase6Script) &&
      !/insert\s*\(|update\s*\(|upsert\s*\(|delete\s*\(/i.test(files.phase6Script) &&
      !files.phase6Script.includes('logs' + '.all'),
    'scripts/developer-module-phase6-post-rollout-monitoring.mjs',
  ))

  checks.push(check(
    'phase6.docs.runbook',
    'Phase 6 post-rollout monitoring runbook is documented without credential material.',
    DOC_EXPECTATIONS.every((pattern) => pattern.test(files.phase6Doc)) && !SENSITIVE_PATTERN.test(files.phase6Doc),
    'docs/developer-module-phase6-post-rollout-monitoring.md',
  ))

  const blockers = checks.filter((item) => item.status !== 'pass')
  return {
    phase: 'developer-module-phase6',
    ready: blockers.length === 0,
    summary: blockers.length
      ? `${blockers.length} developer module post-rollout monitoring check(s) failed`
      : 'Developer module post-rollout monitoring checks passed',
    checks,
    blockers,
  }
}

function printHumanReport(report) {
  console.log(`Developer module Phase 6 post-rollout monitoring: ${report.ready ? 'ready' : 'blocked'}`)
  console.log(report.summary)
  for (const item of report.checks) {
    const marker = item.status === 'pass' ? 'ok' : 'not ok'
    console.log(`${marker} - ${item.id}: ${item.description}`)
    if (item.evidence) console.log(`  evidence: ${item.evidence}`)
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = new Set(process.argv.slice(2))
  if (args.has('--live')) {
    console.error('Phase 6 post-rollout monitoring report is static only and does not perform live email delivery or production mutations.')
    process.exit(2)
  }

  const report = await buildDeveloperModulePhase6PostRolloutMonitoringReport()
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printHumanReport(report)
  }
  process.exit(report.ready ? 0 : 1)
}
