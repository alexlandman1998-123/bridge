import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  COMMISSION_CALCULATION_BASES,
  COMMISSION_PARTY_TYPES,
  COMMISSION_RULE_TYPES,
  calculateRuleAmount,
  normalizeCommissionRule,
} from './bondCommissionRulesService'

export const BOND_REFERRAL_TERM_STATUSES = Object.freeze({
  proposed: 'proposed',
  accepted: 'accepted',
  rejected: 'rejected',
  superseded: 'superseded',
})

export const BOND_REFERRAL_LEDGER_STATUSES = Object.freeze({
  expected: 'expected',
  confirmed: 'confirmed',
  payable: 'payable',
  invoiced: 'invoiced',
  paid: 'paid',
  cancelled: 'cancelled',
})

const REFERRAL_TERM_SELECT = [
  'id', 'originator_org_id', 'agency_org_id', 'partner_relationship_id', 'version', 'status',
  'calculation_basis', 'rate_type', 'percentage', 'fixed_amount', 'tiers', 'terms_snapshot',
  'proposed_by_user_id', 'proposed_at', 'agency_accepted_by_user_id', 'agency_accepted_at',
  'rejected_by_user_id', 'rejected_at', 'rejection_reason', 'superseded_at', 'created_at', 'updated_at',
].join(', ')

const REFERRAL_SNAPSHOT_SELECT = [
  'id', 'originator_org_id', 'agency_org_id', 'partner_relationship_id', 'application_id', 'referral_term_id',
  'term_version', 'calculation_basis', 'rate_type', 'percentage', 'fixed_amount', 'tiers', 'terms_snapshot',
  'snapshotted_by_user_id', 'snapshotted_at', 'created_at', 'updated_at',
].join(', ')

const REFERRAL_LEDGER_SELECT = [
  'id', 'originator_org_id', 'agency_org_id', 'application_id', 'application_snapshot_id', 'referral_term_id',
  'term_version', 'beneficiary_type', 'beneficiary_id', 'beneficiary_name', 'bond_amount', 'gross_commission',
  'calculation_basis', 'rate_type', 'percentage', 'fixed_amount', 'amount_expected', 'amount_confirmed',
  'amount_paid', 'status', 'invoice_status', 'invoice_reference', 'payment_reference', 'payment_date', 'notes',
  'created_by_user_id', 'created_at', 'updated_at',
].join(', ')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function money(value = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function asNullableUuid(value = '') {
  const normalized = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalized) ? normalized : null
}

function getActorUserId(context = {}) {
  return normalizeText(context.userId || context.user?.id || context.profile?.id || context.currentMembership?.user_id || context.currentMembership?.userId)
}

function getActorOrganisationId(context = {}) {
  return normalizeText(
    context.organisationId || context.workspaceId || context.currentWorkspace?.id || context.workspace?.id ||
      context.currentMembership?.organisation_id || context.currentMembership?.organisationId || context.currentMembership?.workspaceId,
  )
}

function getActorRole(context = {}) {
  return normalizeLower(
    context.workspaceRole || context.organisationRole || context.currentMembership?.workspaceRole ||
      context.currentMembership?.workspace_role || context.currentMembership?.organisationRole || context.currentMembership?.organisation_role,
  )
}

function assertPrincipal(context = {}, organisationId = '', action = 'manage referral terms') {
  const actorOrganisationId = getActorOrganisationId(context)
  if (actorOrganisationId && actorOrganisationId !== normalizeText(organisationId)) {
    throw new Error(`Only a principal of the relevant organisation can ${action}.`)
  }
  const role = getActorRole(context)
  if (role && !['owner', 'principal', 'admin', 'organisation_admin', 'organization_admin', 'director', 'hq_manager'].includes(role)) {
    throw new Error(`Only a principal can ${action}.`)
  }
}

function requireClient(options = {}) {
  const client = options.client || supabase
  if (!client || (!options.client && !isSupabaseConfigured)) {
    throw new Error('Referral terms are unavailable until the commercial database connection is configured.')
  }
  return client
}

function throwIfError(error) {
  if (error) throw error
}

function normalizeStatus(value = '', fallback = BOND_REFERRAL_TERM_STATUSES.proposed) {
  const normalized = normalizeLower(value)
  return Object.values(BOND_REFERRAL_TERM_STATUSES).includes(normalized) ? normalized : fallback
}

function normalizeLedgerStatus(value = '', fallback = BOND_REFERRAL_LEDGER_STATUSES.expected) {
  const normalized = normalizeLower(value)
  return Object.values(BOND_REFERRAL_LEDGER_STATUSES).includes(normalized) ? normalized : fallback
}

export function normalizeBondReferralTerms(row = {}) {
  const rule = normalizeCommissionRule({
    type: row.rateType || row.rate_type || row.type || COMMISSION_RULE_TYPES.percentage,
    partyType: COMMISSION_PARTY_TYPES.agency,
    calculationBasis: row.calculationBasis || row.calculation_basis || COMMISSION_CALCULATION_BASES.originatorCommission,
    percentage: row.percentage,
    fixedAmount: row.fixedAmount ?? row.fixed_amount,
    tiers: row.tiers,
  })
  return {
    id: normalizeText(row.id),
    originatorOrganisationId: normalizeText(row.originatorOrganisationId || row.originator_org_id),
    agencyOrganisationId: normalizeText(row.agencyOrganisationId || row.agency_org_id),
    partnerRelationshipId: normalizeText(row.partnerRelationshipId || row.partner_relationship_id),
    version: Math.max(1, Number(row.version || 1)),
    status: normalizeStatus(row.status),
    calculationBasis: rule.calculationBasis,
    rateType: rule.type,
    percentage: Number(rule.percentage || 0),
    fixedAmount: money(rule.fixedAmount),
    tiers: normalizeArray(rule.tiers),
    termsSnapshot: row.termsSnapshot || row.terms_snapshot || {},
    proposedByUserId: normalizeText(row.proposedByUserId || row.proposed_by_user_id),
    proposedAt: normalizeText(row.proposedAt || row.proposed_at),
    agencyAcceptedByUserId: normalizeText(row.agencyAcceptedByUserId || row.agency_accepted_by_user_id),
    agencyAcceptedAt: normalizeText(row.agencyAcceptedAt || row.agency_accepted_at),
    rejectedByUserId: normalizeText(row.rejectedByUserId || row.rejected_by_user_id),
    rejectedAt: normalizeText(row.rejectedAt || row.rejected_at),
    rejectionReason: normalizeText(row.rejectionReason || row.rejection_reason),
    supersededAt: normalizeText(row.supersededAt || row.superseded_at),
    createdAt: normalizeText(row.createdAt || row.created_at),
    updatedAt: normalizeText(row.updatedAt || row.updated_at),
  }
}

export function calculateBondReferralCommission(terms = {}, amounts = {}) {
  const normalized = normalizeBondReferralTerms(terms)
  const bondAmount = money(amounts.bondAmount ?? amounts.bond_amount)
  const grossCommission = money(amounts.grossCommission ?? amounts.gross_commission)
  const baseAmount = normalized.calculationBasis === COMMISSION_CALCULATION_BASES.grossBondAmount
    ? bondAmount
    : normalized.calculationBasis === COMMISSION_CALCULATION_BASES.originatorCommission
      ? grossCommission
      : normalized.calculationBasis === COMMISSION_CALCULATION_BASES.fixedAmount
        ? 0
        : money(amounts.manualBaseAmount ?? amounts.manual_base_amount)
  return money(calculateRuleAmount({
    type: normalized.rateType,
    calculationBasis: normalized.calculationBasis,
    percentage: normalized.percentage,
    fixedAmount: normalized.fixedAmount,
    tiers: normalized.tiers,
  }, { baseAmount, volume: amounts.volume || bondAmount }))
}

export function buildBondReferralLedgerEntry({ terms = {}, application = {}, beneficiary = {}, status = BOND_REFERRAL_LEDGER_STATUSES.expected } = {}) {
  const normalizedTerms = normalizeBondReferralTerms(terms)
  const bondAmount = money(application.bondAmount ?? application.bond_amount)
  const grossCommission = money(application.grossCommission ?? application.gross_commission)
  const amountExpected = calculateBondReferralCommission(normalizedTerms, { bondAmount, grossCommission, volume: application.volume || bondAmount })
  return {
    originatorOrganisationId: normalizedTerms.originatorOrganisationId,
    agencyOrganisationId: normalizedTerms.agencyOrganisationId,
    applicationId: normalizeText(application.id || application.applicationId || application.application_id),
    referralTermId: normalizedTerms.id,
    termVersion: normalizedTerms.version,
    beneficiaryType: normalizeLower(beneficiary.type || beneficiary.beneficiaryType || COMMISSION_PARTY_TYPES.agency) || COMMISSION_PARTY_TYPES.agency,
    beneficiaryId: normalizeText(beneficiary.id || beneficiary.beneficiaryId),
    beneficiaryName: normalizeText(beneficiary.name || beneficiary.beneficiaryName || 'Agency referral'),
    bondAmount,
    grossCommission,
    calculationBasis: normalizedTerms.calculationBasis,
    rateType: normalizedTerms.rateType,
    percentage: normalizedTerms.percentage,
    fixedAmount: normalizedTerms.fixedAmount,
    amountExpected,
    amountConfirmed: money(application.amountConfirmed ?? application.amount_confirmed),
    amountPaid: money(application.amountPaid ?? application.amount_paid),
    status: normalizeLedgerStatus(status),
    invoiceStatus: normalizeLower(application.invoiceStatus || application.invoice_status || 'not_invoiced') || 'not_invoiced',
  }
}

function mapTermsForPersistence(terms = {}, context = {}) {
  const normalized = normalizeBondReferralTerms(terms)
  const now = new Date().toISOString()
  return {
    originator_org_id: asNullableUuid(normalized.originatorOrganisationId),
    agency_org_id: asNullableUuid(normalized.agencyOrganisationId),
    partner_relationship_id: asNullableUuid(normalized.partnerRelationshipId),
    version: normalized.version,
    status: normalized.status,
    calculation_basis: normalized.calculationBasis,
    rate_type: normalized.rateType,
    percentage: normalized.percentage,
    fixed_amount: normalized.fixedAmount,
    tiers: normalized.tiers,
    terms_snapshot: normalized.termsSnapshot,
    proposed_by_user_id: asNullableUuid(normalized.proposedByUserId || getActorUserId(context)),
    proposed_at: normalized.proposedAt || now,
    updated_at: now,
  }
}

export async function listBondReferralTerms({ originatorOrganisationId = '', agencyOrganisationId = '', partnerRelationshipId = '' } = {}, options = {}) {
  const client = requireClient(options)
  let query = client.from('bond_partner_referral_terms').select(REFERRAL_TERM_SELECT).order('version', { ascending: false })
  if (originatorOrganisationId) query = query.eq('originator_org_id', originatorOrganisationId)
  if (agencyOrganisationId) query = query.eq('agency_org_id', agencyOrganisationId)
  if (partnerRelationshipId) query = query.eq('partner_relationship_id', partnerRelationshipId)
  const { data, error } = await query
  throwIfError(error)
  return (data || []).map(normalizeBondReferralTerms)
}

export async function proposeBondReferralTerms(input = {}, context = {}, options = {}) {
  const originatorOrganisationId = normalizeText(input.originatorOrganisationId || input.originator_org_id)
  const agencyOrganisationId = normalizeText(input.agencyOrganisationId || input.agency_org_id)
  if (!asNullableUuid(originatorOrganisationId) || !asNullableUuid(agencyOrganisationId)) {
    throw new Error('A connected originator and agency organisation are required before proposing referral terms.')
  }
  assertPrincipal(context, originatorOrganisationId, 'propose referral terms')
  const client = requireClient(options)
  const { data: previous, error: previousError } = await client
    .from('bond_partner_referral_terms')
    .select('version')
    .eq('originator_org_id', originatorOrganisationId)
    .eq('agency_org_id', agencyOrganisationId)
    .order('version', { ascending: false })
    .limit(1)
  throwIfError(previousError)
  const version = Number(previous?.[0]?.version || 0) + 1
  const terms = normalizeBondReferralTerms({
    ...input,
    originatorOrganisationId,
    agencyOrganisationId,
    version,
    status: BOND_REFERRAL_TERM_STATUSES.proposed,
    proposedByUserId: getActorUserId(context),
    termsSnapshot: {
      ...input.termsSnapshot,
      proposedAt: new Date().toISOString(),
      proposedByUserId: getActorUserId(context),
    },
  })
  const { data, error } = await client
    .from('bond_partner_referral_terms')
    .insert(mapTermsForPersistence(terms, context))
    .select(REFERRAL_TERM_SELECT)
    .single()
  throwIfError(error)
  return normalizeBondReferralTerms(data)
}

export async function acceptBondReferralTerms(termId = '', context = {}, options = {}) {
  const client = requireClient(options)
  const { data: row, error: readError } = await client.from('bond_partner_referral_terms').select(REFERRAL_TERM_SELECT).eq('id', termId).single()
  throwIfError(readError)
  const terms = normalizeBondReferralTerms(row)
  if (terms.status !== BOND_REFERRAL_TERM_STATUSES.proposed) throw new Error('Only proposed referral terms can be accepted.')
  assertPrincipal(context, terms.agencyOrganisationId, 'accept referral terms')
  const now = new Date().toISOString()
  const { error: supersedeError } = await client
    .from('bond_partner_referral_terms')
    .update({ status: BOND_REFERRAL_TERM_STATUSES.superseded, superseded_at: now, updated_at: now })
    .eq('originator_org_id', terms.originatorOrganisationId)
    .eq('agency_org_id', terms.agencyOrganisationId)
    .eq('status', BOND_REFERRAL_TERM_STATUSES.accepted)
  throwIfError(supersedeError)
  const { data, error } = await client
    .from('bond_partner_referral_terms')
    .update({ status: BOND_REFERRAL_TERM_STATUSES.accepted, agency_accepted_by_user_id: asNullableUuid(getActorUserId(context)), agency_accepted_at: now, updated_at: now })
    .eq('id', terms.id)
    .select(REFERRAL_TERM_SELECT)
    .single()
  throwIfError(error)
  return normalizeBondReferralTerms(data)
}

export async function rejectBondReferralTerms(termId = '', reason = '', context = {}, options = {}) {
  const client = requireClient(options)
  const { data: row, error: readError } = await client.from('bond_partner_referral_terms').select(REFERRAL_TERM_SELECT).eq('id', termId).single()
  throwIfError(readError)
  const terms = normalizeBondReferralTerms(row)
  if (terms.status !== BOND_REFERRAL_TERM_STATUSES.proposed) throw new Error('Only proposed referral terms can be rejected.')
  assertPrincipal(context, terms.agencyOrganisationId, 'reject referral terms')
  const { data, error } = await client
    .from('bond_partner_referral_terms')
    .update({ status: BOND_REFERRAL_TERM_STATUSES.rejected, rejected_by_user_id: asNullableUuid(getActorUserId(context)), rejected_at: new Date().toISOString(), rejection_reason: normalizeText(reason) || null, updated_at: new Date().toISOString() })
    .eq('id', terms.id)
    .select(REFERRAL_TERM_SELECT)
    .single()
  throwIfError(error)
  return normalizeBondReferralTerms(data)
}

export async function snapshotBondReferralTermsForApplication({ applicationId = '', originatorOrganisationId = '', agencyOrganisationId = '', partnerRelationshipId = '' } = {}, context = {}, options = {}) {
  if (!asNullableUuid(applicationId)) throw new Error('A valid application id is required to snapshot referral terms.')
  const client = requireClient(options)
  const { data: rows, error: termsError } = await client
    .from('bond_partner_referral_terms')
    .select(REFERRAL_TERM_SELECT)
    .eq('originator_org_id', originatorOrganisationId)
    .eq('agency_org_id', agencyOrganisationId)
    .eq('status', BOND_REFERRAL_TERM_STATUSES.accepted)
    .order('version', { ascending: false })
    .limit(1)
  throwIfError(termsError)
  const terms = rows?.[0] ? normalizeBondReferralTerms(rows[0]) : null
  if (!terms) return null
  const now = new Date().toISOString()
  const payload = {
    originator_org_id: asNullableUuid(terms.originatorOrganisationId),
    agency_org_id: asNullableUuid(terms.agencyOrganisationId),
    partner_relationship_id: asNullableUuid(partnerRelationshipId || terms.partnerRelationshipId),
    application_id: asNullableUuid(applicationId),
    referral_term_id: asNullableUuid(terms.id),
    term_version: terms.version,
    calculation_basis: terms.calculationBasis,
    rate_type: terms.rateType,
    percentage: terms.percentage,
    fixed_amount: terms.fixedAmount,
    tiers: terms.tiers,
    terms_snapshot: { ...terms.termsSnapshot, acceptedAt: terms.agencyAcceptedAt, acceptedByUserId: terms.agencyAcceptedByUserId },
    snapshotted_by_user_id: asNullableUuid(getActorUserId(context)),
    snapshotted_at: now,
    updated_at: now,
  }
  const { data, error } = await client
    .from('bond_application_referral_term_snapshots')
    .upsert(payload, { onConflict: 'application_id' })
    .select(REFERRAL_SNAPSHOT_SELECT)
    .single()
  throwIfError(error)
  return data
}

export async function upsertBondReferralLedgerEntry({ applicationSnapshot = {}, application = {}, beneficiary = {}, status } = {}, context = {}, options = {}) {
  const client = requireClient(options)
  const terms = normalizeBondReferralTerms({
    id: applicationSnapshot.referralTermId || applicationSnapshot.referral_term_id,
    originatorOrganisationId: applicationSnapshot.originatorOrganisationId || applicationSnapshot.originator_org_id,
    agencyOrganisationId: applicationSnapshot.agencyOrganisationId || applicationSnapshot.agency_org_id,
    version: applicationSnapshot.termVersion || applicationSnapshot.term_version,
    calculationBasis: applicationSnapshot.calculationBasis || applicationSnapshot.calculation_basis,
    rateType: applicationSnapshot.rateType || applicationSnapshot.rate_type,
    percentage: applicationSnapshot.percentage,
    fixedAmount: applicationSnapshot.fixedAmount || applicationSnapshot.fixed_amount,
    tiers: applicationSnapshot.tiers,
    termsSnapshot: applicationSnapshot.termsSnapshot || applicationSnapshot.terms_snapshot,
  })
  const entry = buildBondReferralLedgerEntry({ terms, application, beneficiary, status })
  if (!asNullableUuid(entry.applicationId) || !asNullableUuid(terms.originatorOrganisationId) || !asNullableUuid(terms.agencyOrganisationId)) {
    throw new Error('A snapshotted application and both organisations are required for referral reconciliation.')
  }
  const payload = {
    originator_org_id: asNullableUuid(entry.originatorOrganisationId),
    agency_org_id: asNullableUuid(entry.agencyOrganisationId),
    application_id: asNullableUuid(entry.applicationId),
    application_snapshot_id: asNullableUuid(applicationSnapshot.id),
    referral_term_id: asNullableUuid(entry.referralTermId),
    term_version: entry.termVersion,
    beneficiary_type: entry.beneficiaryType,
    beneficiary_id: asNullableUuid(entry.beneficiaryId) || asNullableUuid(entry.agencyOrganisationId),
    beneficiary_name: entry.beneficiaryName,
    bond_amount: entry.bondAmount,
    gross_commission: entry.grossCommission,
    calculation_basis: entry.calculationBasis,
    rate_type: entry.rateType,
    percentage: entry.percentage,
    fixed_amount: entry.fixedAmount,
    amount_expected: entry.amountExpected,
    amount_confirmed: entry.amountConfirmed,
    amount_paid: entry.amountPaid,
    status: entry.status,
    invoice_status: entry.invoiceStatus,
    invoice_reference: normalizeText(application.invoiceReference || application.invoice_reference) || null,
    payment_reference: normalizeText(application.paymentReference || application.payment_reference) || null,
    payment_date: application.paymentDate || application.payment_date || null,
    notes: normalizeText(application.notes) || null,
    created_by_user_id: asNullableUuid(getActorUserId(context)),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await client
    .from('bond_referral_commission_ledger')
    .upsert(payload, { onConflict: 'application_id,beneficiary_type,beneficiary_id' })
    .select(REFERRAL_LEDGER_SELECT)
    .single()
  throwIfError(error)
  return data
}

export async function getBondReferralReconciliation({ organisationId = '', applicationId = '', beneficiaryId = '' } = {}, options = {}) {
  const client = requireClient(options)
  let query = client.from('bond_referral_commission_ledger').select(REFERRAL_LEDGER_SELECT).order('created_at', { ascending: false })
  if (organisationId) query = query.or(`originator_org_id.eq.${organisationId},agency_org_id.eq.${organisationId}`)
  if (applicationId) query = query.eq('application_id', applicationId)
  if (beneficiaryId) query = query.eq('beneficiary_id', beneficiaryId)
  const { data, error } = await query
  throwIfError(error)
  const rows = data || []
  const totals = rows.reduce((summary, row) => ({
    expected: money(summary.expected + Number(row.amount_expected || 0)),
    confirmed: money(summary.confirmed + Number(row.amount_confirmed || 0)),
    paid: money(summary.paid + Number(row.amount_paid || 0)),
  }), { expected: 0, confirmed: 0, paid: 0 })
  return { rows, totals: { ...totals, outstanding: money(totals.confirmed || totals.expected) - totals.paid } }
}
