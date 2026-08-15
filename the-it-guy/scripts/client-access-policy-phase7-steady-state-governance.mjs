import { readFile } from 'node:fs/promises'
import { buildPhase6PostRolloutMonitoringReport } from './client-access-policy-phase6-post-rollout-monitoring.mjs'

const POLICY_MARKERS = Object.freeze([
  {
    id: 'policy.buyer.before.otp',
    pattern: /buyerOnboardingReady[\s\S]*buyerManualCaptureReady[\s\S]*buyerPortalWaitingForOnboardingOrOtp/,
    description: 'Canonical policy still models buyer onboarding before OTP.',
  },
  {
    id: 'policy.buyer.kingstons.signed.otp',
    pattern: /kingstonsManualOtpRequired[\s\S]*kingstonsSignedOtpUploaded/,
    description: 'Canonical policy still models the Kingstons signed OTP exception.',
  },
  {
    id: 'policy.seller.signed.mandate',
    pattern: /signedMandateUploadReady[\s\S]*sellerSignedMandateRequired[\s\S]*sellerPortalReady/,
    description: 'Canonical policy still models signed mandate evidence for Seller Portal activation.',
  },
  {
    id: 'policy.seller.signing.retired',
    pattern: /sellerMandateSigningLinksRetired/,
    description: 'Canonical policy still models retired seller mandate signing links.',
  },
])

const CHANGE_CONTROL_SURFACES = Object.freeze([
  'src/core/clientAccess/clientAccessPolicy.js',
  'src/pages/UnitDetail.jsx',
  'src/services/sellerPortalActivationService.js',
  'src/services/privateListingService.js',
  'src/pages/AgentListingDetail.jsx',
  'src/pages/agency/AgencyPipelinePage.jsx',
  'src/pages/LegalDocumentWorkspacePage.jsx',
  'supabase/functions/send-email/handlers/onboardingSubmitted.ts',
  'supabase/functions/send-email/handlers/sellerOnboarding.ts',
  'supabase/functions/send-email/index.ts',
  'supabase/functions/send-mandate-signing-email/index.ts',
  'supabase/functions/legal-document-job-runner/index.ts',
  'supabase/functions/signer-signing-action/index.ts',
])

const SUPPORT_CODES = Object.freeze([
  'buyer_portal_waiting_for_onboarding_or_otp',
  'buyer_portal_waiting_for_signed_otp',
  'seller_portal_invite_requires_signed_mandate',
  'seller_mandate_signing_links_retired',
])

const REQUIRED_DOC_PATTERNS = Object.freeze([
  /Phase 7/,
  /steady-state governance/i,
  /Buyer Portal/i,
  /buyer onboarding before OTP globally remains supported/i,
  /Agent manual capture remains available/i,
  /Kingstons signed OTP/i,
  /Seller Portal/i,
  /manual signed mandate/i,
  /Seller mandate signing links remain retired/i,
  /support handover/i,
  /change control/i,
  /no live email delivery/i,
  /deprecated Management API\s+log endpoints/i,
])

const SENSITIVE_PATTERN = /client_portal_token|seller_portal_token|signing_token|access_token|service_role/i

function check(id, description, passed, evidence = '') {
  return {
    id,
    description,
    status: passed ? 'pass' : 'fail',
    evidence,
  }
}

function scriptIncludesInOrder(script, names) {
  let cursor = -1
  for (const name of names) {
    const index = script.indexOf(name, cursor + 1)
    if (index <= cursor) return false
    cursor = index
  }
  return true
}

export async function buildPhase7SteadyStateGovernanceReport() {
  const files = {
    packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
    phase4Doc: await readFile(new URL('../docs/client-access-policy-phase4-release-readiness.md', import.meta.url), 'utf8'),
    phase5Doc: await readFile(new URL('../docs/client-access-policy-phase5-operational-smoke.md', import.meta.url), 'utf8'),
    phase6Doc: await readFile(new URL('../docs/client-access-policy-phase6-post-rollout-monitoring.md', import.meta.url), 'utf8'),
    phase7Doc: await readFile(new URL('../docs/client-access-policy-phase7-steady-state-governance.md', import.meta.url), 'utf8'),
    phase7Script: await readFile(new URL('./client-access-policy-phase7-steady-state-governance.mjs', import.meta.url), 'utf8'),
    policy: await readFile(new URL('../src/core/clientAccess/clientAccessPolicy.js', import.meta.url), 'utf8'),
    unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
    sellerPortalActivation: await readFile(new URL('../src/services/sellerPortalActivationService.js', import.meta.url), 'utf8'),
    privateListingService: await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
    listingDetail: await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
    agencyPipeline: await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
    legalWorkspace: await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8'),
    onboardingSubmitted: await readFile(new URL('../../supabase/functions/send-email/handlers/onboardingSubmitted.ts', import.meta.url), 'utf8'),
    sellerOnboarding: await readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboarding.ts', import.meta.url), 'utf8'),
    sendEmailRouter: await readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
    signingEmailSender: await readFile(new URL('../../supabase/functions/send-mandate-signing-email/index.ts', import.meta.url), 'utf8'),
    legalDocumentJobRunner: await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8'),
    signerAction: await readFile(new URL('../../supabase/functions/signer-signing-action/index.ts', import.meta.url), 'utf8'),
  }

  const phase6Report = await buildPhase6PostRolloutMonitoringReport()
  const checks = [
    check(
      'phase6.monitoring.ready',
      'Phase 7 starts from a clean Phase 6 post-rollout monitoring report.',
      phase6Report.ready,
      phase6Report.summary,
    ),
  ]

  for (const marker of POLICY_MARKERS) {
    checks.push(check(
      marker.id,
      marker.description,
      marker.pattern.test(files.policy),
      'src/core/clientAccess/clientAccessPolicy.js',
    ))
  }

  checks.push(check(
    'governance.frontend.canonical.policy.surfaces',
    'Frontend portal surfaces still use the canonical buyer/seller access policy.',
    /resolveBuyerAccessPolicy/.test(files.unitDetail)
      && /resolveSellerAccessPolicy/.test(files.sellerPortalActivation)
      && /hasSignedMandateEvidence/.test(files.privateListingService)
      && /Upload the signed mandate before activating the Seller Portal\./.test(files.listingDetail)
      && /actions\.sendMandateSigningLink/.test(files.agencyPipeline)
      && /actions\.sendMandateSigningLink/.test(files.legalWorkspace),
    'UnitDetail, seller portal services, listing detail, pipeline, legal workspace',
  ))

  checks.push(check(
    'governance.backend.guard.surfaces',
    'Backend delivery surfaces still expose the canonical guard and retirement outcomes.',
    SUPPORT_CODES.every((code) => [
      files.onboardingSubmitted,
      files.sellerOnboarding,
      files.sendEmailRouter,
      files.signingEmailSender,
      files.legalDocumentJobRunner,
      files.signerAction,
    ].some((source) => source.includes(code)))
      && /SELLER_MANDATE_SIGNING_LINKS_RETIRED/.test(files.signingEmailSender)
      && /seller_mandate_signing_link_retired/.test(files.signerAction),
    'buyer/seller Edge guards and retired seller signing doorways',
  ))

  checks.push(check(
    'governance.support.codes.documented',
    'Support handover documents every canonical blocked outcome code.',
    SUPPORT_CODES.every((code) => files.phase7Doc.includes(code)),
    'docs/client-access-policy-phase7-steady-state-governance.md',
  ))

  checks.push(check(
    'governance.change.control.surfaces.documented',
    'Change control names every surface that must move with future policy changes.',
    CHANGE_CONTROL_SURFACES.every((surface) => files.phase7Doc.includes(surface)),
    'docs/client-access-policy-phase7-steady-state-governance.md',
  ))

  checks.push(check(
    'governance.previous.phase.docs.linked',
    'Steady-state governance references the release, smoke, and monitoring phase docs.',
    /Phase 4/.test(files.phase7Doc) && /Phase 5/.test(files.phase7Doc) && /Phase 6/.test(files.phase7Doc)
      && /Seller mandate signing links are retired/.test(files.phase4Doc)
      && /does not generate portal links/.test(files.phase5Doc)
      && /post-rollout monitoring/.test(files.phase6Doc),
    'Phase 4, Phase 5, and Phase 6 docs',
  ))

  checks.push(check(
    'governance.no.live.delivery',
    'Phase 7 governance report is static and performs no live delivery calls.',
    !/\bfetch\s*\(/.test(files.phase7Script) && !/serve\s*\(/.test(files.phase7Script),
    'no fetch or server entrypoint in governance report',
  ))

  const deprecatedLogsEndpoint = 'logs' + '.all'
  checks.push(check(
    'governance.no.deprecated.management.logs.endpoint',
    'Phase 7 does not depend on deprecated Supabase Management API log endpoints.',
    !files.phase7Script.includes(deprecatedLogsEndpoint) && !files.phase7Doc.includes(deprecatedLogsEndpoint),
    'local source and docs only',
  ))

  checks.push(check(
    'governance.docs.policy',
    'Phase 7 steady-state governance policy is documented.',
    REQUIRED_DOC_PATTERNS.every((pattern) => pattern.test(files.phase7Doc)),
    'docs/client-access-policy-phase7-steady-state-governance.md',
  ))

  checks.push(check(
    'governance.docs.no.credential.material',
    'Phase 7 documentation does not expose portal or signing credential material.',
    !SENSITIVE_PATTERN.test(files.phase7Doc),
    'credential fields absent from governance doc',
  ))

  const verifyScript = files.packageJson.scripts?.['verify:client-access-policy'] || ''
  checks.push(check(
    'governance.package.scripts',
    'Package scripts expose Phase 7 and include it last in the full client-access verification chain.',
    files.packageJson.scripts?.['test:client-access-policy-phase7'] === 'node scripts/client-access-policy-phase7-steady-state-governance.test.mjs'
      && files.packageJson.scripts?.['verify:client-access-policy:governance'] === 'node scripts/client-access-policy-phase7-steady-state-governance.mjs'
      && scriptIncludesInOrder(verifyScript, [
        'test:client-access-policy-phase1',
        'test:client-access-policy-phase2',
        'test:client-access-policy-phase3',
        'test:client-access-policy-phase4',
        'test:client-access-policy-phase5',
        'test:client-access-policy-phase6',
        'test:client-access-policy-phase7',
      ]),
    'package.json scripts',
  ))

  const blockers = checks.filter((item) => item.status !== 'pass')
  return {
    phase: 'client-access-policy-phase7',
    ready: blockers.length === 0,
    summary: blockers.length
      ? `${blockers.length} steady-state governance check(s) failed`
      : 'Client access policy steady-state governance checks passed',
    checks,
    blockers,
  }
}

function printHumanReport(report) {
  console.log(`Client access policy Phase 7 steady-state governance: ${report.ready ? 'ready' : 'blocked'}`)
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
    console.error('Phase 7 steady-state governance report is static only and does not perform live email delivery.')
    process.exit(2)
  }

  const report = await buildPhase7SteadyStateGovernanceReport()
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printHumanReport(report)
  }
  process.exit(report.ready ? 0 : 1)
}
