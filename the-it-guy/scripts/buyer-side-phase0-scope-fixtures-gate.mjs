#!/usr/bin/env node
import fs from 'node:fs'

const PROJECT_ROOT = new URL('../', import.meta.url)

const requiredEnvKeys = [
  'BUYER_SIDE_LAUNCH_BASE_URL',
  'BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF',
  'BUYER_SIDE_STAGING_BUYER_EMAIL',
  'BUYER_SIDE_STAGING_BUYER_PASSWORD',
  'BUYER_SIDE_STAGING_AGENT_EMAIL',
  'BUYER_SIDE_STAGING_AGENT_PASSWORD',
  'BUYER_SIDE_STAGING_BRANCH_MANAGER_EMAIL',
  'BUYER_SIDE_STAGING_BRANCH_MANAGER_PASSWORD',
  'BUYER_SIDE_STAGING_ATTORNEY_EMAIL',
  'BUYER_SIDE_STAGING_ATTORNEY_PASSWORD',
  'BUYER_SIDE_STAGING_BOND_EMAIL',
  'BUYER_SIDE_STAGING_BOND_PASSWORD',
  'BUYER_SIDE_STAGING_UNRELATED_EMAIL',
  'BUYER_SIDE_STAGING_UNRELATED_PASSWORD',
  'BUYER_SIDE_STAGING_BUYER_LEAD_ID',
  'BUYER_SIDE_STAGING_LISTING_ID',
  'BUYER_SIDE_STAGING_OFFER_ID',
  'BUYER_SIDE_STAGING_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN',
  'BUYER_SIDE_STAGING_INVALID_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_DUPLICATE_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_DUPLICATE_OFFER_SESSION_TOKEN',
  'BUYER_SIDE_STAGING_REVISED_OFFER_TOKEN',
  'BUYER_SIDE_STAGING_TRANSACTION_ID',
  'BUYER_SIDE_STAGING_ONBOARDING_TOKEN',
  'BUYER_SIDE_STAGING_PORTAL_TOKEN',
  'BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID',
  'BUYER_SIDE_STAGING_BUYER_FICA_DOCUMENT_REQUEST_ID',
  'BUYER_SIDE_STAGING_BUYER_FINANCE_DOCUMENT_REQUEST_ID',
  'BUYER_SIDE_STAGING_BUYER_UPLOADED_DOCUMENT_ID',
  'BUYER_SIDE_STAGING_BUYER_REVIEW_DOCUMENT_ID',
  'BUYER_SIDE_STAGING_BUYER_DOWNLOAD_DOCUMENT_ID',
  'BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH',
  'BUYER_SIDE_STAGING_ONBOARDING_DELIVERY_ID',
  'BUYER_SIDE_STAGING_PORTAL_DELIVERY_ID',
  'BUYER_SIDE_STAGING_OFFER_DELIVERY_ID',
  'BUYER_SIDE_STAGING_TOKEN_SMS_DELIVERY_ID',
  'BUYER_SIDE_STAGING_REUSED_ONBOARDING_TOKEN',
  'BUYER_SIDE_STAGING_REUSED_PORTAL_TOKEN',
  'BUYER_SIDE_STAGING_ALREADY_SUBMITTED_ONBOARDING_TOKEN',
  'BUYER_SIDE_STAGING_INACTIVE_PORTAL_TOKEN',
  'BUYER_SIDE_STAGING_MALFORMED_TOKEN',
  'BUYER_SIDE_PHASE7_STAGING_RUN_ID',
  'BUYER_SIDE_PHASE7_SIGNOFF_APPROVER',
  'BUYER_SIDE_PHASE7_SIGNOFF_APPROVED_AT',
  'BUYER_SIDE_PHASE7_RELEASE_NOTES_URL',
  'BUYER_SIDE_PHASE7_RESIDUAL_RISK_REGISTER_URL',
  'BUYER_SIDE_PHASE7_RESIDUAL_RISK_OWNER',
  'BUYER_SIDE_PHASE7_ROLLBACK_OWNER',
  'BUYER_SIDE_PHASE7_ROLLBACK_PLAN_URL',
  'BUYER_SIDE_PHASE7_SUPPORT_OWNER',
  'BUYER_SIDE_PHASE7_SUPPORT_PLAYBOOK_URL',
  'BUYER_SIDE_PHASE7_MONITORING_OWNER',
  'BUYER_SIDE_PHASE7_MONITORING_CHECKLIST_URL',
  'BUYER_SIDE_PHASE7_POST_LAUNCH_WATCH_WINDOW',
]

const staticChecks = [
  {
    key: 'phase0_audit_doc',
    label: 'Buyer launch Phase 0 audit doc locks scope, fixtures, owners, blockers, and phase plan.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 0/,
      /Phase 0 is a scope, fixture, and evidence-contract implementation/,
      /## Launch Story/,
      /## In Scope/,
      /## Out Of Scope/,
      /## Locked Routes/,
      /## Staging Persona Contract/,
      /## Staging Record Contract/,
      /## Environment Contract/,
      /## Owner Map/,
      /## Phase Plan/,
      /## Known Blockers/,
      /## Required Evidence Commands/,
      /## Phase 0 Acceptance/,
      /Decision: GO TO PHASE 1 WITH LIVE FIXTURES REQUIRED/,
    ],
  },
  {
    key: 'env_contract',
    label: '.env.example declares every buyer-side staging fixture placeholder needed by later phases.',
    file: '.env.example',
    patterns: requiredEnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 0 verification command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase0-scope-fixtures":\s*"node scripts\/buyer-side-phase0-scope-fixtures-gate\.mjs"/,
      /"verify:buyer-side-lead-registration-diagnostic":\s*"node scripts\/buyer-side-lead-registration-diagnostic-gate\.mjs"/,
    ],
  },
  {
    key: 'launch_readiness_index',
    label: 'Phase 8 launch readiness links the buyer Phase 0 scope lock and verification command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 0 scope lock: `docs\/audits\/buyer-side-launch-hardening-phase0\.md`/,
      /npm run verify:buyer-side-phase0-scope-fixtures/,
      /npm run verify:buyer-side-lead-registration-diagnostic/,
    ],
  },
  {
    key: 'existing_buyer_diagnostic_contract',
    label: 'Existing buyer diagnostic remains available as the local regression baseline.',
    file: 'docs/audits/buyer-side-lead-registration-diagnostic.md',
    patterns: [
      /Buyer-Side Lead-To-Registration Diagnostic/,
      /npm run verify:buyer-side-lead-registration-diagnostic/,
      /Live staging buyer transaction and RLS evidence/,
    ],
  },
  {
    key: 'buyer_routes_locked',
    label: 'Buyer lead, onboarding, portal, offer, and transaction route surfaces remain registered.',
    file: 'src/App.jsx',
    patterns: [
      /path="\/pipeline\/leads"/,
      /path="\/pipeline\/leads\/:leadId"/,
      /path="\/client\/onboarding\/:token"/,
      /path="\/mobile\/buyer-onboarding\/:token"/,
      /path="\/client\/:token\/buying"/,
      /path="\/client\/offer\/:token"/,
      /path="\/offers\/session\/:token"/,
      /path="\/offers\/:token"/,
      /path="\/transactions\/:transactionId"/,
    ],
  },
]

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function createReport() {
  return {
    phase: '0',
    scope: 'buyer-side-launch-hardening',
    gate: 'scope-fixtures-evidence-contract',
    generatedAt: new Date().toISOString(),
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 0 scope and fixture contract blockers are cleared',
      passCount: 0,
      blockedCount: 0,
    },
    checks: [],
    acceptance: [
      'Buyer launch journey is defined from lead to registration.',
      'Buyer public, authenticated, and transaction routes are locked.',
      'Staging personas are named for buyer, agent, branch manager, attorney, bond, and unrelated-user probes.',
      'Staging records are named for lead, listing, offer, tokens, transaction, onboarding, portal, and document request evidence.',
      'Environment placeholders are declared without storing real secrets in templates.',
      'Known live staging, RLS, token-delivery, offer-token, and document-privacy blockers are tracked for later phases.',
    ],
  }
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

    report.checks.push(result)
    if (result.status === 'PASS') report.summary.passCount += 1
    else report.summary.blockedCount += 1
  }
}

function finalizeReport(report) {
  if (report.summary.blockedCount > 0) return report

  report.summary.status = 'READY'
  report.summary.recommendation = 'Buyer Phase 0 scope and staging fixture contract is locked'
  return report
}

const report = createReport()
runStaticChecks(report)
finalizeReport(report)

console.log(JSON.stringify(report, null, 2))

if (report.summary.status !== 'READY') {
  process.exitCode = 1
}
