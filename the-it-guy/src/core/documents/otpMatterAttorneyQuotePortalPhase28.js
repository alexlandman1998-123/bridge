import {
  OTP_GENERATED_PDF_PROOF_READY_STATUS,
  buildOtpGeneratedPdfProofPhase27Audit,
} from './otpGeneratedPdfProofPhase27.js'
import { OTP_DOCUMENT_VARIANTS, normalizeOtpDocumentVariant } from './otpRouteUniverse.js'

export const OTP_MATTER_ATTORNEY_QUOTE_PORTAL_PHASE28_VERSION = 'otp_matter_attorney_quote_portal_phase28_v1'
export const OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS = 'OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_FOR_PHASE29_FINAL_PRODUCTION_READINESS_GATE'
export const OTP_MATTER_ATTORNEY_QUOTE_PORTAL_CONTRACT = 'otp-vnext-matter-attorney-quote-portal-phase28-v1'

export const OTP_MATTER_ATTORNEY_QUOTE_PORTAL_SERVICE_OPERATIONS = Object.freeze([
  'loadMatterAttorneyQuotePortalState',
  'uploadMatterAttorneyQuoteDocument',
  'reviseMatterAttorneyQuoteDocument',
  'markMatterAttorneyQuoteViewed',
  'submitMatterAttorneyQuoteQuery',
  'acknowledgeMatterAttorneyQuote',
])

const QUOTE_STATUSES = Object.freeze([
  'pending_upload',
  'uploaded',
  'buyer_viewed',
  'buyer_queried',
  'revised',
  'acknowledged',
  'superseded',
])

const DOCUMENT_DEFINITION_KEYS = Object.freeze([
  'buyer_transfer_cost_invoice',
  'buyer_final_statement',
])

const PORTAL_ACTIONS = Object.freeze([
  Object.freeze({
    key: 'attorney_upload_quote',
    actorRole: 'attorney',
    nextStatus: 'uploaded',
    documentDefinitionKey: 'buyer_transfer_cost_invoice',
    eventType: 'matter_attorney_quote_uploaded',
  }),
  Object.freeze({
    key: 'attorney_revise_quote',
    actorRole: 'attorney',
    nextStatus: 'revised',
    documentDefinitionKey: 'buyer_transfer_cost_invoice',
    eventType: 'matter_attorney_quote_revised',
  }),
  Object.freeze({
    key: 'attorney_upload_final_statement',
    actorRole: 'attorney',
    nextStatus: 'uploaded',
    documentDefinitionKey: 'buyer_final_statement',
    eventType: 'matter_attorney_final_statement_uploaded',
  }),
  Object.freeze({
    key: 'buyer_view_quote',
    actorRole: 'buyer',
    nextStatus: 'buyer_viewed',
    documentDefinitionKey: 'buyer_transfer_cost_invoice',
    eventType: 'matter_attorney_quote_viewed',
  }),
  Object.freeze({
    key: 'buyer_query_quote',
    actorRole: 'buyer',
    nextStatus: 'buyer_queried',
    documentDefinitionKey: 'buyer_transfer_cost_invoice',
    eventType: 'matter_attorney_quote_queried',
  }),
  Object.freeze({
    key: 'buyer_acknowledge_quote',
    actorRole: 'buyer',
    nextStatus: 'acknowledged',
    documentDefinitionKey: 'buyer_transfer_cost_invoice',
    eventType: 'matter_attorney_quote_acknowledged',
  }),
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function normalizeStatus(value = '') {
  const status = normalizeKey(value || 'pending_upload')
  return QUOTE_STATUSES.includes(status) ? status : 'pending_upload'
}

function normalizeDocumentDefinitionKey(value = '') {
  const key = normalizeKey(value || 'buyer_transfer_cost_invoice')
  return DOCUMENT_DEFINITION_KEYS.includes(key) ? key : 'buyer_transfer_cost_invoice'
}

function list(value) {
  return Array.isArray(value) ? value : []
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

function includesAll(source = '', tokens = []) {
  return tokens.every((token) => source.includes(token))
}

function actionByKey(actionKey = '') {
  return PORTAL_ACTIONS.find((action) => action.key === normalizeKey(actionKey)) || null
}

function hasQuoteDocument(state = {}) {
  return Boolean(normalizeText(state.fileUrl || state.file_url || state.document?.fileUrl))
}

function canAttorneyAct(state = {}) {
  return Boolean(
    state.transactionScoped === true &&
      state.separatedFromAttorneyLeadQuote === true &&
      state.transactionAttorneyAssignmentId &&
      state.attorneyFirmId &&
      !['superseded', 'acknowledged'].includes(state.status)
  )
}

function canBuyerView(state = {}) {
  return Boolean(
    state.transactionScoped === true &&
      state.separatedFromAttorneyLeadQuote === true &&
      hasQuoteDocument(state) &&
      ['uploaded', 'buyer_viewed', 'buyer_queried', 'revised', 'acknowledged'].includes(state.status)
  )
}

function canBuyerQuery(state = {}) {
  return canBuyerView(state) && !['acknowledged', 'superseded'].includes(state.status)
}

function canBuyerAcknowledge(state = {}) {
  return canBuyerView(state) && ['uploaded', 'buyer_viewed', 'buyer_queried', 'revised'].includes(state.status)
}

export function buildMatterAttorneyQuotePortalState({
  transactionId = '',
  routeVariant = 'resale_existing_property',
  transactionAttorneyAssignmentId = '',
  attorneyFirmId = '',
  buyerParticipantIds = [],
  quoteState = {},
  checkedAt = new Date().toISOString(),
} = {}) {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  const sourceScope = normalizeKey(quoteState.sourceScope || quoteState.source_scope || 'transaction_matter')
  const status = normalizeStatus(quoteState.status || quoteState.quoteStatus || quoteState.quote_status)
  const documentDefinitionKey = normalizeDocumentDefinitionKey(
    quoteState.documentDefinitionKey ||
      quoteState.document_definition_key ||
      quoteState.document?.documentDefinitionKey,
  )
  const assignmentId = normalizeText(
    transactionAttorneyAssignmentId ||
      quoteState.transactionAttorneyAssignmentId ||
      quoteState.transaction_attorney_assignment_id,
  )
  const firmId = normalizeText(attorneyFirmId || quoteState.attorneyFirmId || quoteState.attorney_firm_id)
  const leadQuoteId = normalizeText(quoteState.attorneyLeadQuoteId || quoteState.attorney_lead_quote_id)
  const fileUrl = normalizeText(quoteState.fileUrl || quoteState.file_url || quoteState.document?.fileUrl)
  const state = {
    checkedAt,
    transactionId: normalizeText(transactionId || quoteState.transactionId || quoteState.transaction_id),
    routeVariant: routeKey,
    status,
    documentDefinitionKey,
    transactionAttorneyAssignmentId: assignmentId,
    attorneyFirmId: firmId,
    fileUrl,
    amount: quoteState.amount ?? quoteState.document?.amount ?? null,
    buyerQueryCount: Number(quoteState.buyerQueryCount ?? quoteState.buyer_query_count ?? 0),
    revisionCount: Number(quoteState.revisionCount ?? quoteState.revision_count ?? 0),
    acknowledgedAt: normalizeText(quoteState.acknowledgedAt || quoteState.acknowledged_at),
    sourceScope,
    attorneyLeadQuoteId: leadQuoteId,
    transactionScoped: Boolean(assignmentId && routeKey && sourceScope === 'transaction_matter'),
    separatedFromAttorneyLeadQuote: sourceScope === 'transaction_matter' && !leadQuoteId,
    buyerParticipantIds: Object.freeze(list(buyerParticipantIds).map(normalizeText).filter(Boolean)),
  }
  const allowedActions = PORTAL_ACTIONS.filter((action) => {
    if (action.actorRole === 'attorney') return canAttorneyAct(state)
    if (action.key === 'buyer_view_quote') return canBuyerView(state)
    if (action.key === 'buyer_query_quote') return canBuyerQuery(state)
    if (action.key === 'buyer_acknowledge_quote') return canBuyerAcknowledge(state)
    return false
  }).map((action) => action.key)

  return Object.freeze({
    ...state,
    portalReady: state.transactionScoped === true && state.separatedFromAttorneyLeadQuote === true,
    roleScopes: Object.freeze({
      attorney: Object.freeze({
        transactionAttorneyAssignmentId: assignmentId,
        attorneyFirmId: firmId,
        canUploadOrRevise: canAttorneyAct(state),
      }),
      buyer: Object.freeze({
        participantIds: state.buyerParticipantIds,
        canView: canBuyerView(state),
        canQuery: canBuyerQuery(state),
        canAcknowledge: canBuyerAcknowledge(state),
      }),
    }),
    allowedActions: Object.freeze(allowedActions),
  })
}

export function buildMatterAttorneyQuotePortalAction({
  portalState = {},
  actionKey = '',
  actorRole = '',
  actorId = '',
  fileUrl = '',
  amount = null,
  queryText = '',
} = {}) {
  const action = actionByKey(actionKey)
  const normalizedRole = normalizeKey(actorRole)
  const allowed = Boolean(action && action.actorRole === normalizedRole && list(portalState.allowedActions).includes(action.key))
  return Object.freeze({
    actionKey: action?.key || normalizeKey(actionKey),
    allowed,
    actorRole: normalizedRole,
    actorId: normalizeText(actorId),
    transactionId: portalState.transactionId || '',
    transactionAttorneyAssignmentId: portalState.transactionAttorneyAssignmentId || '',
    routeVariant: portalState.routeVariant || '',
    documentDefinitionKey: action?.documentDefinitionKey || portalState.documentDefinitionKey || 'buyer_transfer_cost_invoice',
    quoteStatus: action?.nextStatus || portalState.status || 'pending_upload',
    fileUrl: normalizeText(fileUrl || portalState.fileUrl),
    amount: amount ?? portalState.amount ?? null,
    queryText: normalizeText(queryText),
    eventType: action?.eventType || '',
    sourceScope: 'transaction_matter',
    publicAttorneyLeadQuoteTouched: false,
  })
}

function buildSampleStates(checkedAt = new Date().toISOString()) {
  const resaleUploaded = buildMatterAttorneyQuotePortalState({
    checkedAt,
    transactionId: 'tx-phase28-resale',
    routeVariant: 'resale_existing_property',
    transactionAttorneyAssignmentId: 'assignment-phase28-resale-transfer',
    attorneyFirmId: 'firm-phase28-transfer',
    buyerParticipantIds: ['buyer-phase28-resale'],
    quoteState: {
      quote_status: 'uploaded',
      document_definition_key: 'buyer_transfer_cost_invoice',
      file_url: 'secure://matter/tx-phase28-resale/transfer-cost-quote.pdf',
      amount: 42000,
      source_scope: 'transaction_matter',
    },
  })
  const resaleQuery = buildMatterAttorneyQuotePortalAction({
    portalState: resaleUploaded,
    actionKey: 'buyer_query_quote',
    actorRole: 'buyer',
    actorId: 'buyer-phase28-resale',
    queryText: 'Please confirm transfer duty and deeds office fee split.',
  })
  const resaleRevision = buildMatterAttorneyQuotePortalAction({
    portalState: resaleUploaded,
    actionKey: 'attorney_revise_quote',
    actorRole: 'attorney',
    actorId: 'attorney-phase28-resale',
    fileUrl: 'secure://matter/tx-phase28-resale/transfer-cost-quote-revision-1.pdf',
    amount: 42550,
  })
  const resaleAcknowledge = buildMatterAttorneyQuotePortalAction({
    portalState: buildMatterAttorneyQuotePortalState({
      checkedAt,
      transactionId: 'tx-phase28-resale',
      routeVariant: 'resale_existing_property',
      transactionAttorneyAssignmentId: 'assignment-phase28-resale-transfer',
      attorneyFirmId: 'firm-phase28-transfer',
      buyerParticipantIds: ['buyer-phase28-resale'],
      quoteState: {
        quote_status: 'revised',
        document_definition_key: 'buyer_transfer_cost_invoice',
        file_url: 'secure://matter/tx-phase28-resale/transfer-cost-quote-revision-1.pdf',
        amount: 42550,
        revision_count: 1,
        source_scope: 'transaction_matter',
      },
    }),
    actionKey: 'buyer_acknowledge_quote',
    actorRole: 'buyer',
    actorId: 'buyer-phase28-resale',
  })
  const developmentPending = buildMatterAttorneyQuotePortalState({
    checkedAt,
    transactionId: 'tx-phase28-development',
    routeVariant: 'new_development',
    transactionAttorneyAssignmentId: 'assignment-phase28-development-transfer',
    attorneyFirmId: 'firm-phase28-development-transfer',
    buyerParticipantIds: ['buyer-phase28-development'],
    quoteState: {
      quote_status: 'pending_upload',
      document_definition_key: 'buyer_transfer_cost_invoice',
      source_scope: 'transaction_matter',
    },
  })
  const developmentUpload = buildMatterAttorneyQuotePortalAction({
    portalState: developmentPending,
    actionKey: 'attorney_upload_quote',
    actorRole: 'attorney',
    actorId: 'attorney-phase28-development',
    fileUrl: 'secure://matter/tx-phase28-development/transfer-cost-quote.pdf',
    amount: 39500,
  })
  const blockedLeadScope = buildMatterAttorneyQuotePortalState({
    checkedAt,
    transactionId: 'tx-phase28-blocked',
    routeVariant: 'resale_existing_property',
    transactionAttorneyAssignmentId: 'assignment-phase28-blocked',
    attorneyFirmId: 'firm-phase28-blocked',
    quoteState: {
      quote_status: 'uploaded',
      source_scope: 'attorney_lead_quote',
      attorney_lead_quote_id: 'lead-quote-phase28',
      file_url: 'secure://lead/quote.pdf',
    },
  })

  return Object.freeze({
    resaleUploaded,
    resaleQuery,
    resaleRevision,
    resaleAcknowledge,
    developmentPending,
    developmentUpload,
    blockedLeadScope,
  })
}

function serviceOperationsPresent(serviceSource = '') {
  return OTP_MATTER_ATTORNEY_QUOTE_PORTAL_SERVICE_OPERATIONS.every((operation) => (
    serviceSource.includes(`export async function ${operation}`)
  ))
}

function migrationSupportsPortalFlow(migrationSql = '') {
  return includesAll(migrationSql, [
    'create table if not exists public.matter_attorney_cost_quote_states',
    'transaction_attorney_assignment_id uuid not null references public.transaction_attorney_assignments',
    "check (source_scope = 'transaction_matter')",
    'bridge_upsert_matter_attorney_cost_quote_state',
    'buyer_query_count = case when p_quote_status = \'buyer_queried\'',
    'revision_count = case when p_quote_status = \'revised\'',
    'acknowledged_by = case when p_quote_status = \'acknowledged\'',
    'matter_attorney_cost_quote_states_select',
    'matter_attorney_cost_quote_states_write',
  ])
}

export function buildOtpMatterAttorneyQuotePortalPhase28Audit({
  checkedAt = new Date().toISOString(),
  phase27Audit = buildOtpGeneratedPdfProofPhase27Audit({ checkedAt }),
  migrationSql = '',
  serviceSource = '',
} = {}) {
  const checks = []
  const samples = buildSampleStates(checkedAt)
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) => {
    const sample = variant.key === 'new_development' ? samples.developmentPending : samples.resaleUploaded
    return {
      routeKey: variant.key,
      label: variant.label,
      portalReady: sample.portalReady,
      transactionScoped: sample.transactionScoped,
      separatedFromAttorneyLeadQuote: sample.separatedFromAttorneyLeadQuote,
      allowedActions: sample.allowedActions.join(', '),
      status: sample.status,
    }
  })
  const actions = [
    samples.resaleQuery,
    samples.resaleRevision,
    samples.resaleAcknowledge,
    samples.developmentUpload,
  ]

  addCheck(
    checks,
    phase27Audit.status === OTP_GENERATED_PDF_PROOF_READY_STATUS,
    'PHASE28_PHASE27_GENERATED_PDF_PROOF_READY',
    'Matter attorney quote portal flow starts only after generated PDF proof is green.',
  )
  addCheck(
    checks,
    migrationSupportsPortalFlow(migrationSql),
    'PHASE28_PERSISTENCE_SUPPORTS_PORTAL_STATE',
    'Existing persistence supports transaction-scoped quote upload, buyer viewed/queried, revision and acknowledgement states.',
  )
  addCheck(
    checks,
    serviceOperationsPresent(serviceSource) &&
      serviceSource.includes('assertMatterQuotePortalAccess') &&
      serviceSource.includes('allowedTransactionAttorneyAssignmentIds'),
    'PHASE28_SERVICE_WRAPPER_PRESENT',
    'Service wrapper exposes role-scoped portal operations and checks transaction assignment access before write actions.',
  )
  addCheck(
    checks,
    routeRows.length === 2 && routeRows.every((row) => row.portalReady && row.transactionScoped && row.separatedFromAttorneyLeadQuote),
    'PHASE28_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATED',
    'Resale and new-development matter quote portal states are route-aware and transaction-scoped.',
  )
  addCheck(
    checks,
    actions.every((action) => action.allowed) &&
      actions.some((action) => action.quoteStatus === 'buyer_queried') &&
      actions.some((action) => action.quoteStatus === 'revised') &&
      actions.some((action) => action.quoteStatus === 'acknowledged'),
    'PHASE28_BUYER_QUERY_REVISION_ACK_FLOW_PROVED',
    'Buyer view/query/acknowledge and attorney upload/revision actions produce the expected transaction-matter statuses.',
  )
  addCheck(
    checks,
    samples.blockedLeadScope.portalReady === false &&
      samples.blockedLeadScope.separatedFromAttorneyLeadQuote === false &&
      actions.every((action) => action.publicAttorneyLeadQuoteTouched === false) &&
      !serviceSource.includes('attorney_lead_quotes') &&
      !serviceSource.includes('bridge_prepare_attorney_quote_email'),
    'PHASE28_PUBLIC_ATTORNEY_LEAD_QUOTES_EXCLUDED',
    'Portal flow rejects attorney lead quote scope and does not call public attorney lead quote/email workflows.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return Object.freeze({
    version: OTP_MATTER_ATTORNEY_QUOTE_PORTAL_PHASE28_VERSION,
    contract: OTP_MATTER_ATTORNEY_QUOTE_PORTAL_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_MATTER_ATTORNEY_QUOTE_PORTAL_REMEDIATION_REQUIRED' : OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS,
    mutatedData: false,
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 29,
      key: 'final_production_readiness_gate',
      label: 'Final Production Readiness Gate',
    }),
    summary: Object.freeze({
      routeCount: routeRows.length,
      serviceOperationCount: OTP_MATTER_ATTORNEY_QUOTE_PORTAL_SERVICE_OPERATIONS.length,
      actionProofCount: actions.length,
      blockerCount: blockers.length,
    }),
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    routeRows: Object.freeze(routeRows),
    actionRows: Object.freeze(actions.map((action) => ({
      actionKey: action.actionKey,
      actorRole: action.actorRole,
      quoteStatus: action.quoteStatus,
      documentDefinitionKey: action.documentDefinitionKey,
      eventType: action.eventType,
      allowed: action.allowed,
    }))),
    evidence: Object.freeze({
      phase27: Object.freeze({
        version: phase27Audit.version,
        status: phase27Audit.status,
        blockerCount: phase27Audit.summary?.blockerCount ?? phase27Audit.blockers?.length ?? 0,
      }),
      blockedLeadScope: Object.freeze({
        portalReady: samples.blockedLeadScope.portalReady,
        sourceScope: samples.blockedLeadScope.sourceScope,
        attorneyLeadQuoteId: samples.blockedLeadScope.attorneyLeadQuoteId,
      }),
    }),
  })
}

export function formatOtpMatterAttorneyQuotePortalPhase28Markdown(report = buildOtpMatterAttorneyQuotePortalPhase28Audit()) {
  return [
    '# OTP Generator Phase 28 Matter Attorney Quote Portal Flow',
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
        ['Routes', report.summary.routeCount],
        ['Service operations', report.summary.serviceOperationCount],
        ['Action proofs', report.summary.actionProofCount],
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
    '## Route Portal States',
    '',
    table(
      ['Route', 'Status', 'Portal ready', 'Transaction scoped', 'Lead quote separated', 'Allowed actions'],
      report.routeRows.map((row) => [
        row.routeKey,
        row.status,
        row.portalReady ? 'yes' : 'no',
        row.transactionScoped ? 'yes' : 'no',
        row.separatedFromAttorneyLeadQuote ? 'yes' : 'no',
        row.allowedActions,
      ]),
    ),
    '',
    '## Action Proofs',
    '',
    table(
      ['Action', 'Role', 'Next status', 'Document', 'Event', 'Allowed'],
      report.actionRows.map((row) => [
        row.actionKey,
        row.actorRole,
        row.quoteStatus,
        row.documentDefinitionKey,
        row.eventType,
        row.allowed ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Runtime Boundary',
    '',
    'Phase 28 proves the transaction-scoped matter attorney quote portal flow only. It does not publish quote documents, send public attorney quote emails, mutate production templates, dispatch signing envelopes, or activate production defaults. Phase 29 is the final production readiness gate.',
    '',
  ].join('\n')
}
