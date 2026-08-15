import { readFile } from 'node:fs/promises'
import { buildPhase5OperationalSmokeReport } from './client-access-policy-phase5-operational-smoke.mjs'

const LOG_EXPECTATIONS = Object.freeze([
  {
    id: 'monitor.buyer.portal.blocked',
    file: 'onboardingSubmitted',
    pattern: /\[client-access-policy\] buyer portal send blocked[\s\S]*reason[\s\S]*transactionId[\s\S]*developmentName/,
    description: 'Buyer portal blocked sends emit a stable non-PII monitoring signal.',
  },
  {
    id: 'monitor.seller.portal.blocked',
    file: 'sellerOnboarding',
    pattern: /\[client-access-policy\] seller portal invite blocked[\s\S]*code[\s\S]*listingId[\s\S]*listingFound/,
    description: 'Seller Portal blocked sends emit a stable non-PII monitoring signal.',
  },
  {
    id: 'monitor.sender.retired.blocked',
    file: 'signingEmailSender',
    pattern: /\[client-access-policy\] retired seller mandate signing request blocked[\s\S]*functionName: "send-mandate-signing-email"[\s\S]*type/,
    description: 'Packet signing sender emits a retired seller mandate monitoring signal.',
  },
  {
    id: 'monitor.router.retired.blocked',
    file: 'sendEmailRouter',
    pattern: /\[client-access-policy\] retired seller mandate signing request blocked[\s\S]*functionName: "send-email"[\s\S]*type/,
    description: 'Generic email router emits a retired seller mandate monitoring signal.',
  },
  {
    id: 'monitor.job.runner.retired.blocked',
    file: 'legalDocumentJobRunner',
    pattern: /\[client-access-policy\] retired seller mandate signing job blocked[\s\S]*functionName: "legal-document-job-runner"[\s\S]*emailType[\s\S]*requestId/,
    description: 'Legal document job runner emits a retired seller mandate monitoring signal.',
  },
  {
    id: 'monitor.public.signer.retired.blocked',
    file: 'signerAction',
    pattern: /\[client-access-policy\] public seller mandate signing invite blocked[\s\S]*packetId[\s\S]*packetVersionId[\s\S]*reason: "seller_mandate_signing_links_retired"/,
    description: 'Public signer completion emits a retired seller mandate monitoring signal.',
  },
])

const OUTCOME_EXPECTATIONS = Object.freeze([
  {
    id: 'outcome.buyer.normal.code',
    file: 'onboardingSubmitted',
    pattern: /buyer_portal_waiting_for_onboarding_or_otp/,
    description: 'Normal buyer portal blocked outcome remains queryable by reason code.',
  },
  {
    id: 'outcome.buyer.kingstons.code',
    file: 'onboardingSubmitted',
    pattern: /buyer_portal_waiting_for_signed_otp/,
    description: 'Kingstons buyer portal blocked outcome remains queryable by reason code.',
  },
  {
    id: 'outcome.seller.portal.code',
    file: 'sellerOnboarding',
    pattern: /appendSellerPortalInviteGuardBlockedEvent[\s\S]*seller_portal_invite_requires_signed_mandate/,
    description: 'Seller Portal blocked outcome remains recorded through the portal guard event.',
  },
  {
    id: 'outcome.seller.signing.410',
    file: 'signingEmailSender',
    pattern: /jsonResponse\(410[\s\S]*SELLER_MANDATE_SIGNING_LINKS_RETIRED[\s\S]*seller_mandate_signing_links_retired/,
    description: 'Retired seller mandate signing requests keep returning the canonical 410 outcome.',
  },
  {
    id: 'outcome.job.runner.failed.status',
    file: 'legalDocumentJobRunner',
    pattern: /status: "failed"[\s\S]*SELLER_MANDATE_SIGNING_LINKS_RETIRED[\s\S]*phase3SellerMandateSigningRetired: true/,
    description: 'Retired seller mandate signing jobs remain persisted as failed job outcomes.',
  },
  {
    id: 'outcome.public.signer.audit.event',
    file: 'signerAction',
    pattern: /eventType: "seller_mandate_signing_link_retired"[\s\S]*blockedAt: nowIso/,
    description: 'Public signer completion retains packet audit evidence for retired seller mandate links.',
  },
])

const DOC_EXPECTATIONS = Object.freeze([
  /Phase 6/,
  /post-rollout monitoring/i,
  /24-hour/i,
  /rollback/i,
  /no live email/i,
  /manual signed mandate/i,
  /Kingstons signed OTP/i,
  /deprecated Management API log endpoints/i,
])

const SENSITIVE_LOG_PATTERN = /client_portal_token|seller_portal_token|signing_token|access_token|service_role|recipientEmail|buyerEmail|sellerEmail/i

function check(id, description, passed, evidence = '') {
  return {
    id,
    description,
    status: passed ? 'pass' : 'fail',
    evidence,
  }
}

function clientAccessLogLines(source) {
  return source
    .split('\n')
    .filter((line) => line.includes('[client-access-policy]'))
    .join('\n')
}

export async function buildPhase6PostRolloutMonitoringReport() {
  const files = {
    packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
    phase6Script: await readFile(new URL('./client-access-policy-phase6-post-rollout-monitoring.mjs', import.meta.url), 'utf8'),
    phase6Doc: await readFile(new URL('../docs/client-access-policy-phase6-post-rollout-monitoring.md', import.meta.url), 'utf8'),
    onboardingSubmitted: await readFile(new URL('../../supabase/functions/send-email/handlers/onboardingSubmitted.ts', import.meta.url), 'utf8'),
    sellerOnboarding: await readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboarding.ts', import.meta.url), 'utf8'),
    sendEmailRouter: await readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
    signingEmailSender: await readFile(new URL('../../supabase/functions/send-mandate-signing-email/index.ts', import.meta.url), 'utf8'),
    legalDocumentJobRunner: await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8'),
    signerAction: await readFile(new URL('../../supabase/functions/signer-signing-action/index.ts', import.meta.url), 'utf8'),
  }

  const phase5Report = await buildPhase5OperationalSmokeReport()
  const checks = [
    check(
      'phase5.operational.smoke.ready',
      'Phase 6 starts from a clean Phase 5 operational smoke report.',
      phase5Report.ready,
      phase5Report.summary,
    ),
  ]

  for (const expectation of LOG_EXPECTATIONS) {
    checks.push(check(
      expectation.id,
      expectation.description,
      expectation.pattern.test(files[expectation.file]),
      expectation.file,
    ))
  }

  for (const expectation of OUTCOME_EXPECTATIONS) {
    checks.push(check(
      expectation.id,
      expectation.description,
      expectation.pattern.test(files[expectation.file]),
      expectation.file,
    ))
  }

  const combinedLogLines = [
    files.onboardingSubmitted,
    files.sellerOnboarding,
    files.sendEmailRouter,
    files.signingEmailSender,
    files.legalDocumentJobRunner,
    files.signerAction,
  ].map(clientAccessLogLines).join('\n')

  checks.push(check(
    'monitor.logs.no.credential.material',
    'Client access monitoring log lines avoid portal tokens, signing tokens, service credentials, and recipient email fields.',
    combinedLogLines.length > 0 && !SENSITIVE_LOG_PATTERN.test(combinedLogLines),
    'client-access-policy log lines',
  ))

  checks.push(check(
    'phase6.no.live.delivery',
    'Phase 6 monitoring report is static and performs no live delivery calls.',
    !/\bfetch\s*\(/.test(files.phase6Script) && !/serve\s*\(/.test(files.phase6Script),
    'no fetch or server entrypoint in monitoring report',
  ))

  const deprecatedLogsEndpoint = 'logs' + '.all'
  checks.push(check(
    'phase6.no.deprecated.management.logs.endpoint',
    'Phase 6 does not depend on deprecated Supabase Management API log endpoints.',
    !files.phase6Script.includes(deprecatedLogsEndpoint) && !files.phase6Doc.includes(deprecatedLogsEndpoint),
    'local source and docs only',
  ))

  checks.push(check(
    'phase6.docs.policy',
    'Phase 6 post-rollout monitoring policy is documented.',
    DOC_EXPECTATIONS.every((pattern) => pattern.test(files.phase6Doc)),
    'docs/client-access-policy-phase6-post-rollout-monitoring.md',
  ))

  checks.push(check(
    'phase6.docs.no.credential.material',
    'Phase 6 documentation does not expose portal or signing credential material.',
    !/client_portal_token|seller_portal_token|signing_token|access_token|service_role/i.test(files.phase6Doc),
    'credential fields absent from monitoring doc',
  ))

  checks.push(check(
    'phase6.package.scripts',
    'Package scripts expose Phase 6 and include it in the full client-access verification chain.',
    files.packageJson.scripts?.['test:client-access-policy-phase6'] === 'node scripts/client-access-policy-phase6-post-rollout-monitoring.test.mjs'
      && files.packageJson.scripts?.['verify:client-access-policy:monitoring'] === 'node scripts/client-access-policy-phase6-post-rollout-monitoring.mjs'
      && /test:client-access-policy-phase6/.test(files.packageJson.scripts?.['verify:client-access-policy'] || ''),
    'package.json scripts',
  ))

  const blockers = checks.filter((item) => item.status !== 'pass')
  return {
    phase: 'client-access-policy-phase6',
    ready: blockers.length === 0,
    summary: blockers.length
      ? `${blockers.length} post-rollout monitoring check(s) failed`
      : 'Client access policy post-rollout monitoring checks passed',
    checks,
    blockers,
  }
}

function printHumanReport(report) {
  console.log(`Client access policy Phase 6 post-rollout monitoring: ${report.ready ? 'ready' : 'blocked'}`)
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
    console.error('Phase 6 post-rollout monitoring report is static only and does not perform live email delivery.')
    process.exit(2)
  }

  const report = await buildPhase6PostRolloutMonitoringReport()
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printHumanReport(report)
  }
  process.exit(report.ready ? 0 : 1)
}
