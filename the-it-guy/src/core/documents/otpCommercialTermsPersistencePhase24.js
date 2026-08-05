import {
  OTP_GENERATOR_RECONCILIATION_READY_STATUS,
  buildOtpGeneratorReconciliationPhase23Audit,
} from './otpGeneratorReconciliationPhase23.js'

export const OTP_COMMERCIAL_TERMS_PERSISTENCE_PHASE24_VERSION = 'otp_commercial_terms_persistence_phase24_v1'
export const OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_STATUS = 'OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_FOR_PHASE25_REVIEW_UI'
export const OTP_COMMERCIAL_TERMS_PERSISTENCE_CONTRACT = 'otp-vnext-commercial-terms-persistence-phase24-v1'

export const OTP_COMMERCIAL_TERMS_PERSISTENCE_TABLES = Object.freeze([
  'otp_commission_variations',
  'otp_cost_obligation_items',
  'matter_attorney_cost_quote_states',
  'otp_commercial_term_events',
])

export const OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS = Object.freeze([
  'bridge_record_otp_commission_variation',
  'bridge_upsert_otp_cost_obligation_item',
  'bridge_upsert_matter_attorney_cost_quote_state',
])

export const OTP_COMMERCIAL_TERMS_PERSISTENCE_SERVICE_OPERATIONS = Object.freeze([
  'recordOtpCommissionVariation',
  'upsertOtpCostObligationItem',
  'upsertMatterAttorneyCostQuoteState',
  'listOtpCommercialTermsPersistenceReadiness',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function includesAll(source = '', tokens = []) {
  return tokens.every((token) => source.includes(token))
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt = new Date().toISOString(),
  migrationSql = '',
  serviceSource = '',
  phase23Audit = buildOtpGeneratorReconciliationPhase23Audit({ checkedAt }),
} = {}) {
  const checks = []

  addCheck(
    checks,
    phase23Audit.status === OTP_GENERATOR_RECONCILIATION_READY_STATUS,
    'PHASE24_PHASE23_RECONCILIATION_READY',
    'Phase 24 starts only after Phase 23 reconciles the template and commercial gap streams.',
  )
  addCheck(
    checks,
    includesAll(migrationSql, OTP_COMMERCIAL_TERMS_PERSISTENCE_TABLES.map((name) => `public.${name}`)),
    'PHASE24_REQUIRED_TABLES_PRESENT',
    'Migration creates commission variation, cost obligation, matter attorney quote state and commercial event tables.',
  )
  addCheck(
    checks,
    includesAll(migrationSql, OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS.map((name) => `public.${name}`)),
    'PHASE24_REQUIRED_RPCS_PRESENT',
    'Migration exposes service RPCs for commission variation, cost obligations and matter attorney quote state.',
  )
  addCheck(
    checks,
    migrationSql.includes('preserves_mandate_commission boolean not null default true') &&
      migrationSql.includes('check (preserves_mandate_commission = true)') &&
      !migrationSql.includes('update public.transaction_commissions'),
    'PHASE24_MANDATE_COMMISSION_PRESERVED',
    'Persistence preserves the mandate commission snapshot and does not mutate transaction_commissions.',
  )
  addCheck(
    checks,
    migrationSql.includes("route_variant in ('resale_existing_property', 'new_development')") &&
      migrationSql.includes('otp_cost_obligation_items_route_check') &&
      migrationSql.includes('matter_attorney_cost_quote_states_route_check'),
    'PHASE24_ROUTE_SCOPING_ENFORCED',
    'Commission, cost and matter quote records are constrained to resale or new-development routes.',
  )
  addCheck(
    checks,
    migrationSql.includes("amount_status in ('known', 'estimated', 'pending', 'not_applicable')") &&
      migrationSql.includes('include_in_otp boolean not null default true') &&
      migrationSql.includes('otp_cost_obligation_items_active_key_idx'),
    'PHASE24_COST_OBLIGATION_MODEL_PERSISTED',
    'Buyer cost obligations persist amount status, OTP inclusion and active route item uniqueness.',
  )
  addCheck(
    checks,
    migrationSql.includes('transaction_attorney_assignment_id uuid not null references public.transaction_attorney_assignments') &&
      migrationSql.includes("source_scope text not null default 'transaction_matter'") &&
      migrationSql.includes("check (source_scope = 'transaction_matter')") &&
      !migrationSql.includes('attorney_lead_quotes'),
    'PHASE24_MATTER_ATTORNEY_QUOTE_SEPARATED_FROM_LEAD_QUOTES',
    'Matter attorney quote state requires a transaction attorney assignment and excludes attorney lead quote tables.',
  )
  addCheck(
    checks,
    includesAll(migrationSql, [
      'alter table public.otp_commission_variations enable row level security',
      'alter table public.otp_cost_obligation_items enable row level security',
      'alter table public.matter_attorney_cost_quote_states enable row level security',
      'alter table public.otp_commercial_term_events enable row level security',
    ]),
    'PHASE24_RLS_ENABLED',
    'All new persistence tables enable RLS.',
  )
  addCheck(
    checks,
    migrationSql.includes('otp_commercial_terms_persistence_readiness_v1') &&
      migrationSql.includes('has_pending_commission_approval') &&
      migrationSql.includes('has_pending_costs'),
    'PHASE24_READINESS_VIEW_PRESENT',
    'Persistence readiness view summarizes pending approval, visible costs and matter quote state.',
  )
  addCheck(
    checks,
    includesAll(serviceSource, OTP_COMMERCIAL_TERMS_PERSISTENCE_SERVICE_OPERATIONS) &&
      includesAll(serviceSource, OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS),
    'PHASE24_SERVICE_WRAPPER_PRESENT',
    'Frontend service wrapper exposes all Phase 24 persistence operations and calls the correct RPCs.',
  )
  addCheck(
    checks,
    migrationSql.includes('otp_commercial_term_events') &&
      migrationSql.includes('otp_commission_variation_recorded') &&
      migrationSql.includes('otp_cost_obligation_item_upserted') &&
      migrationSql.includes('matter_attorney_cost_quote_state_upserted'),
    'PHASE24_AUDIT_EVENTS_RECORDED',
    'Commercial persistence records audit events for commission, cost and matter quote changes.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return {
    version: OTP_COMMERCIAL_TERMS_PERSISTENCE_PHASE24_VERSION,
    contract: OTP_COMMERCIAL_TERMS_PERSISTENCE_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_COMMERCIAL_TERMS_PERSISTENCE_REMEDIATION_REQUIRED' : OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_STATUS,
    mutatedData: false,
    nextPhase: blockers.length ? null : {
      phase: 25,
      key: 'otp_review_ui',
      label: 'OTP Review UI',
    },
    summary: {
      tableCount: OTP_COMMERCIAL_TERMS_PERSISTENCE_TABLES.length,
      rpcCount: OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS.length,
      serviceOperationCount: OTP_COMMERCIAL_TERMS_PERSISTENCE_SERVICE_OPERATIONS.length,
      blockerCount: blockers.length,
    },
    checks,
    blockers,
    tables: [...OTP_COMMERCIAL_TERMS_PERSISTENCE_TABLES],
    rpcs: [...OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS],
    serviceOperations: [...OTP_COMMERCIAL_TERMS_PERSISTENCE_SERVICE_OPERATIONS],
    evidence: {
      phase23: {
        version: phase23Audit.version,
        status: phase23Audit.status,
        blockerCount: phase23Audit.summary?.blockerCount ?? phase23Audit.blockers?.length ?? 0,
      },
    },
  }
}

export function formatOtpCommercialTermsPersistencePhase24Markdown(report = buildOtpCommercialTermsPersistencePhase24Audit()) {
  return [
    '# OTP Generator Phase 24 Commercial Terms Persistence',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Tables', report.summary.tableCount],
        ['RPCs', report.summary.rpcCount],
        ['Service operations', report.summary.serviceOperationCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Tables',
    '',
    table(['Table'], report.tables.map((name) => [name])),
    '',
    '## RPCs',
    '',
    table(['RPC'], report.rpcs.map((name) => [name])),
    '',
    '## Service Operations',
    '',
    table(['Operation'], report.serviceOperations.map((name) => [name])),
    '',
    '## Boundary',
    '',
    'Phase 24 adds additive persistence and service wrappers only. It does not build the review UI, render generated PDFs, publish buyer portal quote documents, or activate production defaults. Phase 25 is the next implementation phase.',
    '',
  ].join('\n')
}
