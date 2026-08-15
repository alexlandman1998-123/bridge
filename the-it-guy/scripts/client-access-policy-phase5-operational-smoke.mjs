import { readFile } from 'node:fs/promises'

const TEXT_EXPECTATIONS = Object.freeze([
  {
    id: 'buyer.normal.gate',
    file: 'onboardingSubmitted',
    pattern: /buyer_portal_waiting_for_onboarding_or_otp/,
    description: 'Normal buyer portal delivery waits for onboarding completion or signed OTP evidence.',
  },
  {
    id: 'buyer.kingstons.gate',
    file: 'onboardingSubmitted',
    pattern: /buyer_portal_waiting_for_signed_otp/,
    description: 'Kingstons buyer portal delivery waits for signed OTP evidence.',
  },
  {
    id: 'seller.portal.gate',
    file: 'sellerOnboarding',
    pattern: /seller_portal_invite_requires_signed_mandate/,
    description: 'Seller Portal delivery requires signed mandate evidence.',
  },
  {
    id: 'seller.signing.sender.retired',
    file: 'signingEmailSender',
    pattern: /SELLER_MANDATE_SIGNING_LINKS_RETIRED[\s\S]*seller_mandate_signing_links_retired/,
    description: 'Packet signing sender refuses retired seller mandate signing requests.',
  },
  {
    id: 'seller.signing.router.retired',
    file: 'sendEmailRouter',
    pattern: /SELLER_MANDATE_SIGNING_LINKS_RETIRED[\s\S]*seller_mandate_signing_links_retired/,
    description: 'Generic email router refuses retired seller mandate signing requests.',
  },
  {
    id: 'seller.signing.job.runner.retired',
    file: 'legalDocumentJobRunner',
    pattern: /SELLER_MANDATE_SIGNING_LINKS_RETIRED[\s\S]*seller_mandate_signing_links_retired/,
    description: 'Legal document job runner refuses retired seller mandate signing requests.',
  },
  {
    id: 'seller.signer.action.retired.event',
    file: 'signerAction',
    pattern: /seller_mandate_signing_link_retired[\s\S]*seller_mandate_signing_links_retired/,
    description: 'Public signer completion records the retired seller mandate signing path.',
  },
])

const FUNCTION_EXPECTATIONS = Object.freeze([
  {
    name: 'send-email',
    enabled: true,
    verifyJwt: true,
    description: 'Email dispatch function is deployed behind JWT verification.',
  },
  {
    name: 'send-mandate-signing-email',
    enabled: true,
    verifyJwt: true,
    description: 'Packet signing dispatch function is deployed behind JWT verification.',
  },
  {
    name: 'legal-document-job-runner',
    enabled: false,
    verifyJwt: true,
    description: 'Legal document job runner remains configured but not broadly deployed, and stays JWT-protected if enabled.',
  },
  {
    name: 'signer-signing-action',
    enabled: true,
    verifyJwt: false,
    description: 'Public signer action remains publicly callable and must enforce the retired seller path in code.',
  },
])

const DOC_EXPECTATIONS = Object.freeze([
  /Phase 5/,
  /no live email/i,
  /does not generate portal links/i,
  /manual signed mandate upload/i,
  /Kingstons signed OTP/i,
  /Agent manual capture remains available/i,
])

function parseFunctionSection(configSource, functionName) {
  const sectionPattern = new RegExp(`^\\[functions\\.${escapeRegExp(functionName)}\\]\\n([\\s\\S]*?)(?=^\\[|\\z)`, 'm')
  const sectionMatch = configSource.match(sectionPattern)
  if (!sectionMatch) return null

  const values = {}
  for (const rawLine of sectionMatch[1].split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const keyValue = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/)
    if (!keyValue) continue
    const [, key, rawValue] = keyValue
    values[key] = rawValue.trim()
  }
  return values
}

function booleanConfigValue(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function functionScope(source, name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  if (start < 0) return ''
  const end = nextName ? source.indexOf(`async function ${nextName}`, start + 1) : source.indexOf('\nasync function ', start + 1)
  return source.slice(start, end > start ? end : undefined)
}

function check(id, description, passed, evidence = '') {
  return {
    id,
    description,
    status: passed ? 'pass' : 'fail',
    evidence,
  }
}

export async function buildPhase5OperationalSmokeReport() {
  const files = {
    config: await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8'),
    packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
    smokeScript: await readFile(new URL('./client-access-policy-phase5-operational-smoke.mjs', import.meta.url), 'utf8'),
    smokeDoc: await readFile(new URL('../docs/client-access-policy-phase5-operational-smoke.md', import.meta.url), 'utf8'),
    onboardingSubmitted: await readFile(new URL('../../supabase/functions/send-email/handlers/onboardingSubmitted.ts', import.meta.url), 'utf8'),
    sellerOnboarding: await readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboarding.ts', import.meta.url), 'utf8'),
    sendEmailRouter: await readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
    signingEmailSender: await readFile(new URL('../../supabase/functions/send-mandate-signing-email/index.ts', import.meta.url), 'utf8'),
    legalDocumentJobRunner: await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8'),
    signerAction: await readFile(new URL('../../supabase/functions/signer-signing-action/index.ts', import.meta.url), 'utf8'),
  }

  const checks = []

  for (const expectation of FUNCTION_EXPECTATIONS) {
    const section = parseFunctionSection(files.config, expectation.name)
    const enabled = booleanConfigValue(section?.enabled)
    const verifyJwt = booleanConfigValue(section?.verify_jwt)
    checks.push(check(
      `config.${expectation.name}`,
      expectation.description,
      Boolean(section) && enabled === expectation.enabled && verifyJwt === expectation.verifyJwt,
      section
        ? `enabled=${String(enabled)} verify_jwt=${String(verifyJwt)}`
        : 'function section missing',
    ))
  }

  for (const expectation of TEXT_EXPECTATIONS) {
    checks.push(check(
      expectation.id,
      expectation.description,
      expectation.pattern.test(files[expectation.file]),
      `${expectation.file}`,
    ))
  }

  const sellerInviteScope = functionScope(
    files.signerAction,
    'maybeSendSellerMandateInvite',
    'appendSellerPortalInviteAfterMandateSignedTrigger',
  )
  const retiredEventIndex = sellerInviteScope.indexOf('seller_mandate_signing_link_retired')
  const retiredReturnIndex = sellerInviteScope.indexOf('sellerInviteSent: false')
  const legacySendIndex = sellerInviteScope.indexOf('const emailResult = await invokeSendEmail')
  checks.push(check(
    'seller.signer.action.retired.before.legacy.send',
    'Public signer completion returns from the retired seller mandate path before any legacy send operation.',
    retiredEventIndex > 0 && retiredReturnIndex > retiredEventIndex && legacySendIndex > retiredReturnIndex,
    `retiredEvent=${retiredEventIndex} retiredReturn=${retiredReturnIndex} legacySend=${legacySendIndex}`,
  ))

  checks.push(check(
    'phase5.no.live.delivery',
    'Phase 5 smoke is a static preflight and performs no live delivery calls.',
    !/\bfetch\s*\(/.test(files.smokeScript) && !/serve\s*\(/.test(files.smokeScript),
    'no fetch or server entrypoint in smoke script',
  ))

  checks.push(check(
    'phase5.docs.policy',
    'Phase 5 operational policy is documented.',
    DOC_EXPECTATIONS.every((pattern) => pattern.test(files.smokeDoc)),
    'docs/client-access-policy-phase5-operational-smoke.md',
  ))

  checks.push(check(
    'phase5.docs.no.credential.material',
    'Phase 5 documentation does not expose portal or signing credential material.',
    !/client_portal_token|seller_portal_token|signing_token|access_token|service_role/i.test(files.smokeDoc),
    'credential fields absent from operational doc',
  ))

  checks.push(check(
    'phase5.package.scripts',
    'Package scripts expose Phase 5 and include it in the full client-access verification chain.',
    files.packageJson.scripts?.['test:client-access-policy-phase5'] === 'node scripts/client-access-policy-phase5-operational-smoke.test.mjs'
      && files.packageJson.scripts?.['verify:client-access-policy:operational'] === 'node scripts/client-access-policy-phase5-operational-smoke.mjs'
      && /test:client-access-policy-phase5/.test(files.packageJson.scripts?.['verify:client-access-policy'] || ''),
    'package.json scripts',
  ))

  const blockers = checks.filter((item) => item.status !== 'pass')
  return {
    phase: 'client-access-policy-phase5',
    ready: blockers.length === 0,
    summary: blockers.length
      ? `${blockers.length} operational smoke check(s) failed`
      : 'Client access policy operational smoke checks passed',
    checks,
    blockers,
  }
}

function printHumanReport(report) {
  console.log(`Client access policy Phase 5 operational smoke: ${report.ready ? 'ready' : 'blocked'}`)
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
    console.error('Phase 5 operational smoke is static only and does not perform live email delivery.')
    process.exit(2)
  }

  const report = await buildPhase5OperationalSmokeReport()
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printHumanReport(report)
  }
  process.exit(report.ready ? 0 : 1)
}
