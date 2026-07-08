import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  fetchOrganisationSettings,
  listOrganisationCommissionStructures,
  listOrganisationUsers,
} from '../lib/settingsApi'

export const DEFAULT_COMPANY_MONTHLY_TARGET = 500000
export const DEFAULT_AGENT_MONTHLY_TARGET = 75000

export const COMMISSION_TARGET_PERIODS = ['monthly', 'quarterly', 'yearly']
export const COMMISSION_TARGET_METRICS = ['company_commission', 'agent_commission', 'gross_commission']

export const DEFAULT_COMMISSION_LEVELS = [
  { key: 'standard', name: 'Standard', agentPercentage: 60, agencyPercentage: 40, monthlyTarget: null, annualTarget: null, isDefault: true, isActive: true },
  { key: 'senior', name: 'Senior', agentPercentage: 70, agencyPercentage: 30, monthlyTarget: null, annualTarget: null, isDefault: false, isActive: true },
  { key: 'top_producer', name: 'Top Producer', agentPercentage: 80, agencyPercentage: 20, monthlyTarget: null, annualTarget: null, isDefault: false, isActive: true },
  { key: 'principal', name: 'Principal', agentPercentage: 100, agencyPercentage: 0, monthlyTarget: null, annualTarget: null, isDefault: false, isActive: true },
]

export const DEFAULT_REFERRAL_RULES = [
  { key: 'same_branch', name: 'Same branch referral', referralType: 'same_branch', percentage: 10, basis: 'gross_commission', isDefault: true, isActive: true },
  { key: 'different_branch', name: 'Different branch referral', referralType: 'different_branch', percentage: 15, basis: 'gross_commission', isDefault: true, isActive: true },
  { key: 'external_agency', name: 'External agency referral', referralType: 'external_agency', percentage: 20, basis: 'gross_commission', isDefault: true, isActive: true },
  { key: 'buyer_intro_listing', name: "Buyer introduced to another agent's listing", referralType: 'buyer_intro_listing', percentage: 10, basis: 'gross_commission', isDefault: false, isActive: true },
  { key: 'custom', name: 'Custom referral', referralType: 'custom', percentage: 0, basis: 'gross_commission', isDefault: false, isActive: false },
]

const TRANSACTION_SELECT_FIELDS = [
  'id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent_id, owner_user_id, created_by, transaction_reference, transaction_type, property_type, sales_price, purchase_price, gross_commission_percentage, gross_commission_amount, agent_split_percentage_snapshot, agency_split_percentage_snapshot, agent_commission_amount, agency_commission_amount, stage, lifecycle_state, operational_state, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, expected_transfer_date, target_registration_date, registration_date, registered_at, completed_at, archived_at, cancelled_at, deleted_at, updated_at, created_at, is_active',
  'id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent_id, owner_user_id, created_by, transaction_reference, sales_price, purchase_price, gross_commission_percentage, gross_commission_amount, agent_commission_amount, agency_commission_amount, stage, lifecycle_state, operational_state, current_main_stage, assigned_agent, assigned_agent_email, expected_transfer_date, registration_date, registered_at, completed_at, archived_at, cancelled_at, updated_at, created_at, is_active',
]

const COMMISSION_SELECT_FIELDS =
  'id, organisation_id, transaction_id, assigned_agent_id, assigned_agent_email, commission_structure_id, commission_structure_name_snapshot, sale_price, gross_commission_percentage, gross_commission_amount, agent_split_percentage_snapshot, agency_split_percentage_snapshot, agent_commission_amount, agency_commission_amount, status, created_at, updated_at'

const LEVEL_SELECT_FIELDS =
  'id, organisation_id, name, agent_percentage, agency_percentage, monthly_target, annual_target, is_default, is_active, created_at, updated_at'

const TARGET_SELECT_FIELDS_WITH_METRIC =
  'id, organisation_id, branch_id, user_id, target_type, target_metric, period, target_amount, start_month, is_active, created_at, updated_at'

const TARGET_SELECT_FIELDS_LEGACY =
  'id, organisation_id, branch_id, user_id, target_type, period, target_amount, start_month, is_active, created_at, updated_at'

const TARGET_SELECT_FIELDS = [TARGET_SELECT_FIELDS_WITH_METRIC, TARGET_SELECT_FIELDS_LEGACY]

const REFERRAL_RULE_SELECT_FIELDS =
  'id, organisation_id, name, referral_type, percentage, basis, is_default, is_active, created_at, updated_at'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeTargetPeriod(value, fallback = 'monthly') {
  const normalized = normalizeKey(value || fallback || 'monthly')
  return COMMISSION_TARGET_PERIODS.includes(normalized) ? normalized : 'monthly'
}

function normalizeTargetMetric(value, fallback = 'company_commission') {
  const normalized = normalizeKey(value || fallback || 'company_commission')
  return COMMISSION_TARGET_METRICS.includes(normalized) ? normalized : 'company_commission'
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null
}

function normalizePercentage(value, fallback = 0) {
  return Number(Math.max(0, Math.min(100, toNumber(value, fallback))).toFixed(3))
}

function roundMoney(value) {
  return Number(toNumber(value, 0).toFixed(2))
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function startOfQuarter(date = new Date()) {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), quarterMonth, 1)
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1)
}

function resolveTargetPeriodRange(period = 'monthly', now = new Date()) {
  const normalizedPeriod = normalizeTargetPeriod(period)
  if (normalizedPeriod === 'yearly') {
    const start = startOfYear(now)
    return { period: normalizedPeriod, start, end: new Date(start.getFullYear() + 1, 0, 1) }
  }
  if (normalizedPeriod === 'quarterly') {
    const start = startOfQuarter(now)
    return { period: normalizedPeriod, start, end: addMonths(start, 3) }
  }
  const start = startOfMonth(now)
  return { period: normalizedPeriod, start, end: addMonths(start, 1) }
}

function daySpan(start, end) {
  const milliseconds = Math.max(0, end.getTime() - start.getTime())
  return Math.max(1, Math.ceil(milliseconds / 86400000))
}

function daysLeftInRange(now = new Date(), end = addMonths(startOfMonth(now), 1)) {
  const milliseconds = Math.max(0, end.getTime() - now.getTime())
  return Math.max(0, Math.ceil(milliseconds / 86400000))
}

function daysInMonth(date = new Date()) {
  const monthStart = startOfMonth(date)
  return daySpan(monthStart, addMonths(monthStart, 1))
}

function daysLeftInMonth(date = new Date()) {
  return daysLeftInRange(date, addMonths(startOfMonth(date), 1))
}

function isBetween(value, start, end) {
  const date = toDate(value)
  if (!date) return false
  return date >= start && date < end
}

function looksLikeUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function createLocalId(prefix = 'commission') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isMissingSourceError(error) {
  if (!error) return false
  const code = normalizeKey(error.code)
  const message = normalizeKey(`${error.message || ''} ${error.details || ''}`)
  const status = Number(error.status || error.statusCode || 0)
  return (
    status === 404 ||
    code === '42p01' ||
    code === '42703' ||
    code === 'pgrst116' ||
    code === 'pgrst204' ||
    code === 'pgrst205' ||
    message.includes('does_not_exist') ||
    message.includes('schema_cache') ||
    message.includes('could_not_find')
  )
}

async function getContext() {
  if (!isSupabaseConfigured || !supabase) {
    return { organisationId: '', userId: '', email: '' }
  }

  const [settings, authResult] = await Promise.all([
    fetchOrganisationSettings(),
    supabase.auth.getUser(),
  ])

  return {
    organisationId: normalizeText(settings?.organisation?.id),
    userId: normalizeText(authResult?.data?.user?.id),
    email: normalizeText(authResult?.data?.user?.email).toLowerCase(),
    settings,
  }
}

async function safeSelect(table, selectVariants, { organisationId = '', organisationColumn = 'organisation_id', order = 'updated_at', ascending = false, limit = 1000, filters = [] } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const variants = (Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']).map((variant) => (
    typeof variant === 'string' ? { fields: variant, filters: [] } : { fields: variant?.fields || '*', filters: variant?.filters || [] }
  ))
  let lastError = null

  for (const variant of variants) {
    const fields = variant.fields
    let query = supabase.from(table).select(fields)
    if (organisationId && organisationColumn) query = query.eq(organisationColumn, organisationId)
    for (const filter of [...filters, ...variant.filters]) {
      if (!filter || !filter.column) continue
      if (filter.operator === 'is') query = query.is(filter.column, filter.value)
      else if (filter.operator === 'in') query = query.in(filter.column, Array.isArray(filter.value) ? filter.value : [])
      else query = query.eq(filter.column, filter.value)
    }
    if (order) query = query.order(order, { ascending })
    if (limit) query = query.limit(limit)
    const { data, error } = await query
    if (!error) return Array.isArray(data) ? data : []
    lastError = error
    if (!isMissingSourceError(error)) throw error
  }

  console.debug('[CommissionService] Source unavailable; using fallback.', { table, message: lastError?.message })
  return []
}

async function safeMaybeSingle(table, selectFields, { organisationId = '', filters = [] } = {}) {
  const rows = await safeSelect(table, selectFields, {
    organisationId,
    filters,
    order: 'updated_at',
    limit: 1,
  })
  return rows[0] || null
}

function normalizeCommissionLevel(input = {}, index = 0) {
  const agentPercentage = normalizePercentage(input.agentPercentage ?? input.agent_percentage, DEFAULT_COMMISSION_LEVELS[index]?.agentPercentage ?? 60)
  const agencyPercentage = normalizePercentage(input.agencyPercentage ?? input.agency_percentage, 100 - agentPercentage)
  return {
    id: normalizeText(input.id) || normalizeText(input.key) || createLocalId('level'),
    key: normalizeText(input.key) || normalizeKey(input.name) || `level_${index + 1}`,
    name: normalizeText(input.name) || DEFAULT_COMMISSION_LEVELS[index]?.name || 'Commission Level',
    agentPercentage,
    agencyPercentage: normalizePercentage(agentPercentage + agencyPercentage === 100 ? agencyPercentage : 100 - agentPercentage, 100 - agentPercentage),
    monthlyTarget: nullableNumber(input.monthlyTarget ?? input.monthly_target),
    annualTarget: nullableNumber(input.annualTarget ?? input.annual_target),
    isDefault: input.isDefault ?? input.is_default ?? index === 0,
    isActive: input.isActive ?? input.is_active ?? true,
    assignedAgentsCount: toNumber(input.assignedAgentsCount ?? input.assigned_agents_count, 0),
    sourceStructureId: normalizeText(input.sourceStructureId || input.source_structure_id),
    createdAt: input.createdAt || input.created_at || null,
    updatedAt: input.updatedAt || input.updated_at || null,
  }
}

function normalizeTarget(input = {}, fallback = {}) {
  const targetType = normalizeKey(input.targetType || input.target_type || fallback.targetType || fallback.target_type || 'company')
  return {
    id: normalizeText(input.id || fallback.id) || createLocalId('target'),
    organisationId: normalizeText(input.organisationId || input.organisation_id || fallback.organisationId || fallback.organisation_id),
    branchId: normalizeText(input.branchId || input.branch_id || fallback.branchId || fallback.branch_id),
    userId: normalizeText(input.userId || input.user_id || fallback.userId || fallback.user_id),
    targetType,
    targetMetric: normalizeTargetMetric(input.targetMetric || input.target_metric || fallback.targetMetric || fallback.target_metric),
    period: normalizeTargetPeriod(input.period || fallback.period),
    targetAmount: roundMoney(input.targetAmount ?? input.target_amount ?? fallback.targetAmount ?? fallback.target_amount ?? 0),
    startMonth: normalizeText(input.startMonth || input.start_month || fallback.startMonth || fallback.start_month) || new Date().toISOString().slice(0, 7) + '-01',
    isActive: input.isActive ?? input.is_active ?? fallback.isActive ?? fallback.is_active ?? true,
    createdAt: input.createdAt || input.created_at || fallback.createdAt || fallback.created_at || null,
    updatedAt: input.updatedAt || input.updated_at || fallback.updatedAt || fallback.updated_at || null,
  }
}

function normalizeReferralRule(input = {}, index = 0) {
  const fallback = DEFAULT_REFERRAL_RULES[index] || DEFAULT_REFERRAL_RULES[DEFAULT_REFERRAL_RULES.length - 1]
  return {
    id: normalizeText(input.id) || normalizeText(input.key) || createLocalId('referral-rule'),
    key: normalizeText(input.key) || normalizeKey(input.referralType || input.referral_type || input.name || fallback.key),
    name: normalizeText(input.name) || fallback.name,
    referralType: normalizeKey(input.referralType || input.referral_type || fallback.referralType),
    percentage: normalizePercentage(input.percentage, fallback.percentage),
    basis: normalizeKey(input.basis || fallback.basis || 'gross_commission') || 'gross_commission',
    isDefault: input.isDefault ?? input.is_default ?? fallback.isDefault,
    isActive: input.isActive ?? input.is_active ?? fallback.isActive,
    createdAt: input.createdAt || input.created_at || null,
    updatedAt: input.updatedAt || input.updated_at || null,
  }
}

function mapStructuresToLevels(structures = []) {
  const mapped = (Array.isArray(structures) ? structures : [])
    .filter((structure) => structure?.isActive !== false)
    .map((structure, index) => normalizeCommissionLevel({
      id: `structure:${structure.id || index}`,
      key: normalizeKey(structure.name || `structure_${index + 1}`),
      name: structure.name || DEFAULT_COMMISSION_LEVELS[index]?.name || 'Commission Level',
      agentPercentage: structure.agentSplitPercentage,
      agencyPercentage: structure.agencySplitPercentage,
      isDefault: structure.isDefault,
      isActive: structure.isActive,
      assignedAgentsCount: structure.assignedAgentsCount,
      sourceStructureId: structure.id,
      createdAt: structure.createdAt,
      updatedAt: structure.updatedAt,
    }, index))

  return mapped.length ? mapped : DEFAULT_COMMISSION_LEVELS.map(normalizeCommissionLevel)
}

async function getCommissionProfileRows(organisationId) {
  return safeSelect(
    'organisation_user_commission_profiles',
    'id, organisation_id, organisation_user_id, user_id, email_address, commission_structure_id, commission_level_id, override_agent_split_percentage, effective_from, is_active, created_at, updated_at',
    {
      organisationId,
      filters: [{ column: 'is_active', value: true }],
      order: 'updated_at',
      limit: 1000,
    },
  )
}

function countProfilesByLevel(profileRows = []) {
  const counts = new Map()
  for (const row of profileRows) {
    const key = normalizeText(row?.commission_level_id)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

export async function getCommissionLevels() {
  const structures = await listOrganisationCommissionStructures().catch(() => [])
  const fallbackLevels = mapStructuresToLevels(structures)
  if (!isSupabaseConfigured || !supabase) return fallbackLevels

  const { organisationId } = await getContext()
  if (!organisationId) return fallbackLevels

  const rows = await safeSelect('commission_levels', LEVEL_SELECT_FIELDS, {
    organisationId,
    order: 'name',
    ascending: true,
    limit: 200,
  })
  if (!rows.length) return fallbackLevels

  const profileRows = await getCommissionProfileRows(organisationId)
  const profileCounts = countProfilesByLevel(profileRows)
  return rows
    .map((row, index) => ({
      ...normalizeCommissionLevel(row, index),
      assignedAgentsCount: profileCounts.get(normalizeText(row.id)) || 0,
    }))
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || String(left.name).localeCompare(String(right.name)))
}

export async function createCommissionLevel(input = {}) {
  return updateCommissionLevel(input)
}

export async function updateCommissionLevel(input = {}) {
  const normalized = normalizeCommissionLevel(input)
  if (!isSupabaseConfigured || !supabase) return normalized

  const { organisationId, userId } = await getContext()
  if (!organisationId) return normalized

  if (normalized.isDefault) {
    const clearResult = await supabase
      .from('commission_levels')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('organisation_id', organisationId)
    if (clearResult.error && !isMissingSourceError(clearResult.error)) throw clearResult.error
  }

  const payload = {
    organisation_id: organisationId,
    name: normalized.name,
    agent_percentage: normalized.agentPercentage,
    agency_percentage: normalized.agencyPercentage,
    monthly_target: normalized.monthlyTarget,
    annual_target: normalized.annualTarget,
    is_default: Boolean(normalized.isDefault),
    is_active: Boolean(normalized.isActive),
    created_by: userId || null,
    updated_at: new Date().toISOString(),
  }
  if (looksLikeUuid(normalized.id)) payload.id = normalized.id

  let result = await supabase
    .from('commission_levels')
    .upsert(payload, { onConflict: payload.id ? 'id' : 'organisation_id,name' })
    .select(LEVEL_SELECT_FIELDS)
    .single()

  if (result.error && isMissingSourceError(result.error)) return normalized
  if (result.error) throw result.error
  return normalizeCommissionLevel(result.data)
}

export async function assignUserCommissionLevel({
  organisationUserId = '',
  userId = '',
  email = '',
  commissionLevelId = '',
  overrideAgentSplitPercentage = null,
} = {}) {
  if (!isSupabaseConfigured || !supabase) return null
  const context = await getContext()
  if (!context.organisationId) return null

  const normalizedOrganisationUserId = normalizeText(organisationUserId)
  const normalizedUserId = normalizeText(userId)
  const normalizedEmail = normalizeText(email).toLowerCase()
  const normalizedLevelId = normalizeText(commissionLevelId)
  if (!normalizedOrganisationUserId && !normalizedUserId && !normalizedEmail) {
    throw new Error('A target user is required to assign a commission level.')
  }

  const clearPayload = { is_active: false, updated_at: new Date().toISOString() }
  let clearQuery = supabase
    .from('organisation_user_commission_profiles')
    .update(clearPayload)
    .eq('organisation_id', context.organisationId)
  if (normalizedOrganisationUserId) clearQuery = clearQuery.eq('organisation_user_id', normalizedOrganisationUserId)
  else if (normalizedUserId) clearQuery = clearQuery.eq('user_id', normalizedUserId)
  else clearQuery = clearQuery.eq('email_address', normalizedEmail)
  const clearResult = await clearQuery
  if (clearResult.error && !isMissingSourceError(clearResult.error)) throw clearResult.error

  if (!normalizedLevelId) return null

  const payload = {
    organisation_id: context.organisationId,
    organisation_user_id: normalizedOrganisationUserId || null,
    user_id: normalizedUserId || null,
    email_address: normalizedEmail || null,
    commission_level_id: normalizedLevelId,
    override_agent_split_percentage: nullableNumber(overrideAgentSplitPercentage),
    effective_from: new Date().toISOString().slice(0, 10),
    is_active: true,
    created_by: context.userId || null,
    updated_at: new Date().toISOString(),
  }

  const result = await supabase
    .from('organisation_user_commission_profiles')
    .insert(payload)
    .select('id, organisation_user_id, user_id, email_address, commission_level_id, override_agent_split_percentage, effective_from, is_active, created_at, updated_at')
    .single()
  if (result.error && isMissingSourceError(result.error)) return null
  if (result.error) throw result.error
  return result.data
}

export async function getReferralCommissionRules() {
  if (!isSupabaseConfigured || !supabase) {
    return DEFAULT_REFERRAL_RULES.map(normalizeReferralRule)
  }
  const { organisationId } = await getContext()
  if (!organisationId) return DEFAULT_REFERRAL_RULES.map(normalizeReferralRule)

  const rows = await safeSelect('referral_commission_rules', REFERRAL_RULE_SELECT_FIELDS, {
    organisationId,
    order: 'referral_type',
    ascending: true,
    limit: 200,
  })
  if (!rows.length) return DEFAULT_REFERRAL_RULES.map(normalizeReferralRule)

  const rowsByType = new Map(rows.map((row, index) => [normalizeKey(row.referral_type), normalizeReferralRule(row, index)]))
  return DEFAULT_REFERRAL_RULES.map((defaultRule, index) => rowsByType.get(defaultRule.referralType) || normalizeReferralRule(defaultRule, index))
}

export async function updateReferralCommissionRule(input = {}) {
  const normalized = normalizeReferralRule(input)
  if (!isSupabaseConfigured || !supabase) return normalized

  const { organisationId, userId } = await getContext()
  if (!organisationId) return normalized

  const payload = {
    organisation_id: organisationId,
    name: normalized.name,
    referral_type: normalized.referralType,
    percentage: normalized.percentage,
    basis: normalized.basis,
    is_default: Boolean(normalized.isDefault),
    is_active: Boolean(normalized.isActive),
    created_by: userId || null,
    updated_at: new Date().toISOString(),
  }
  if (looksLikeUuid(normalized.id)) payload.id = normalized.id

  const result = await supabase
    .from('referral_commission_rules')
    .upsert(payload, { onConflict: payload.id ? 'id' : 'organisation_id,referral_type' })
    .select(REFERRAL_RULE_SELECT_FIELDS)
    .single()
  if (result.error && isMissingSourceError(result.error)) return normalized
  if (result.error) throw result.error
  return normalizeReferralRule(result.data)
}

async function getCommissionTargets({ targetType = '', targetMetric = '', period = '', branchId = '', userId = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const { organisationId } = await getContext()
  if (!organisationId) return []
  const filters = [{ column: 'is_active', value: true }]
  if (targetType) filters.push({ column: 'target_type', value: targetType })
  if (period) filters.push({ column: 'period', value: normalizeTargetPeriod(period) })
  if (branchId) filters.push({ column: 'branch_id', value: branchId })
  if (userId) filters.push({ column: 'user_id', value: userId })
  const normalizedMetric = normalizeTargetMetric(targetMetric || (targetType === 'agent' ? 'agent_commission' : 'company_commission'))
  const targetSelectVariants = targetMetric
    ? [
        {
          fields: TARGET_SELECT_FIELDS_WITH_METRIC,
          filters: [{ column: 'target_metric', value: normalizedMetric }],
        },
        {
          fields: TARGET_SELECT_FIELDS_LEGACY,
          filters: [],
        },
      ]
    : TARGET_SELECT_FIELDS
  const rows = await safeSelect('commission_targets', targetSelectVariants, {
    organisationId,
    filters,
    order: 'start_month',
    ascending: false,
    limit: 100,
  })
  return rows.map((row) => normalizeTarget(row, targetMetric ? { targetMetric: normalizedMetric } : {}))
}

export async function updateCommissionTarget(input = {}) {
  const normalized = normalizeTarget(input)
  if (!isSupabaseConfigured || !supabase) return normalized

  const { organisationId, userId: actorUserId } = await getContext()
  if (!organisationId) return normalized

  const targetType = normalizeKey(normalized.targetType || 'company')
  const targetMetric = normalizeTargetMetric(normalized.targetMetric)
  const clearPayload = { is_active: false, updated_at: new Date().toISOString() }
  const buildClearQuery = ({ includeMetric = true } = {}) => {
    let query = supabase
      .from('commission_targets')
      .update(clearPayload)
      .eq('organisation_id', organisationId)
      .eq('target_type', targetType)
    if (includeMetric) query = query.eq('target_metric', targetMetric)
    if (targetType === 'branch') query = query.eq('branch_id', normalized.branchId)
    if (targetType === 'agent') query = query.eq('user_id', normalized.userId)
    return query
  }

  let clearResult = await buildClearQuery({ includeMetric: true })
  if (clearResult.error && isMissingSourceError(clearResult.error)) {
    clearResult = await buildClearQuery({ includeMetric: false })
  }
  if (clearResult.error && !isMissingSourceError(clearResult.error)) throw clearResult.error

  const payload = {
    organisation_id: organisationId,
    branch_id: targetType === 'branch' ? normalized.branchId || null : null,
    user_id: targetType === 'agent' ? normalized.userId || null : null,
    target_type: targetType,
    target_metric: targetMetric,
    period: normalizeTargetPeriod(normalized.period),
    target_amount: normalized.targetAmount,
    start_month: normalized.startMonth,
    is_active: true,
    created_by: actorUserId || null,
    updated_at: new Date().toISOString(),
  }
  if (looksLikeUuid(normalized.id)) payload.id = normalized.id

  const result = await supabase
    .from('commission_targets')
    .insert(payload)
    .select(TARGET_SELECT_FIELDS_WITH_METRIC)
    .single()
  if (!result.error) return normalizeTarget(result.data)
  if (!isMissingSourceError(result.error)) throw result.error

  const { target_metric: _targetMetric, ...legacyPayload } = payload
  const legacyResult = await supabase
    .from('commission_targets')
    .insert(legacyPayload)
    .select(TARGET_SELECT_FIELDS_LEGACY)
    .single()
  if (legacyResult.error && isMissingSourceError(legacyResult.error)) return normalized
  if (legacyResult.error) throw legacyResult.error
  return normalizeTarget(legacyResult.data, { targetMetric })
}

function getDealValue(row = {}) {
  return toNumber(row.purchase_price ?? row.sales_price ?? row.sale_price ?? row.transaction?.purchase_price ?? row.transaction?.sales_price, 0)
}

function getTransactionId(row = {}) {
  return normalizeText(row.id || row.transaction_id || row.transaction?.id)
}

function getTransactionStatusText(row = {}) {
  const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
  return [
    source.lifecycle_state,
    source.operational_state,
    source.stage,
    source.current_main_stage,
    source.current_sub_stage_summary,
    source.status,
  ].map(normalizeKey).join(' ')
}

function isRegisteredTransaction(row = {}) {
  const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
  const status = getTransactionStatusText(source)
  return Boolean(
    source.registered_at ||
    source.registration_date ||
    source.completed_at ||
    status.includes('registered') ||
    status.includes('closed') ||
    status.includes('completed'),
  )
}

function isCancelledTransaction(row = {}) {
  const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
  const status = getTransactionStatusText(source)
  return Boolean(source.cancelled_at || source.deleted_at || source.archived_at || status.includes('cancel') || status.includes('lost'))
}

function getTransactionCompletedAt(row = {}) {
  const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
  return source.registered_at || source.registration_date || source.completed_at || null
}

function getExpectedCommissionAt(row = {}) {
  const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
  return source.expected_transfer_date || source.target_registration_date || source.registration_date || source.updated_at || source.created_at || null
}

function getAgentIdentity(row = {}, commissionRow = {}) {
  const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
  return {
    userId: normalizeText(commissionRow.assigned_agent_id || source.assigned_user_id || source.assigned_agent_id || source.owner_user_id || source.created_by),
    email: normalizeText(commissionRow.assigned_agent_email || source.assigned_agent_email).toLowerCase(),
    name: normalizeText(source.assigned_agent || source.assigned_agent_name || commissionRow.assigned_agent_email || source.assigned_agent_email) || 'Unassigned',
  }
}

function transactionMatchesScope(row = {}, commissionRow = {}, { userId = '', userEmail = '', branchId = '' } = {}) {
  const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
  const normalizedBranchId = normalizeText(branchId)
  if (normalizedBranchId && normalizeText(source.assigned_branch_id || source.branch_id) !== normalizedBranchId) return false

  const normalizedUserId = normalizeText(userId).toLowerCase()
  const normalizedEmail = normalizeText(userEmail).toLowerCase()
  if (!normalizedUserId && !normalizedEmail) return true

  const agent = getAgentIdentity(source, commissionRow)
  return Boolean(
    (normalizedUserId && agent.userId.toLowerCase() === normalizedUserId) ||
    (normalizedEmail && agent.email === normalizedEmail),
  )
}

export function getCommissionStatusBucket(transaction = {}, commissionRow = {}) {
  const rawStatus = normalizeKey(commissionRow.status || transaction.commission_status || transaction.status)
  if (isCancelledTransaction(transaction) || rawStatus.includes('cancel')) return 'cancelled'
  if (rawStatus.includes('paid')) return 'paid'
  if (rawStatus.includes('due') || rawStatus.includes('pending_payment')) return 'due'
  if (isRegisteredTransaction(transaction)) return 'due'
  const transactionStatus = getTransactionStatusText(transaction)
  if (
    rawStatus.includes('confirmed') ||
    transactionStatus.includes('accepted') ||
    transactionStatus.includes('otp') ||
    transactionStatus.includes('signed') ||
    transactionStatus.includes('transfer') ||
    transactionStatus.includes('lodg') ||
    transactionStatus.includes('finance')
  ) {
    return 'confirmed'
  }
  return 'projected'
}

export function calculateCommissionAmounts({
  transaction = {},
  commissionRow = {},
  level = null,
  referralPayout = 0,
} = {}) {
  const salePrice = toNumber(commissionRow.sale_price ?? transaction.sale_price ?? getDealValue(transaction), 0)
  const grossPercentage = nullableNumber(commissionRow.gross_commission_percentage ?? transaction.gross_commission_percentage)
  const grossAmount = roundMoney(
    commissionRow.gross_commission_amount ??
      transaction.gross_commission_amount ??
      (grossPercentage !== null && salePrice ? (salePrice * grossPercentage) / 100 : 0),
  )
  const agentSplit = normalizePercentage(
    commissionRow.agent_split_percentage_snapshot ??
      transaction.agent_split_percentage_snapshot ??
      level?.agentPercentage,
    60,
  )
  const agencySplit = normalizePercentage(
    commissionRow.agency_split_percentage_snapshot ??
      transaction.agency_split_percentage_snapshot ??
      level?.agencyPercentage ??
      (100 - agentSplit),
    100 - agentSplit,
  )
  const agentCommission = roundMoney(
    commissionRow.agent_commission_amount ??
      transaction.agent_commission_amount ??
      ((grossAmount * agentSplit) / 100),
  )
  const agencyCommission = roundMoney(
    commissionRow.agency_commission_amount ??
      transaction.agency_commission_amount ??
      Math.max(0, grossAmount - agentCommission),
  )
  return {
    salePrice,
    grossPercentage,
    grossAmount,
    agentSplit,
    agencySplit,
    agentCommission,
    agencyCommission,
    referralPayout: roundMoney(referralPayout),
    companyCommission: roundMoney(Math.max(0, grossAmount - agentCommission - referralPayout)),
  }
}

function buildReferralByTransaction(referralRows = []) {
  const map = new Map()
  for (const row of referralRows || []) {
    const transactionId = normalizeText(row.transaction_id || row.converted_transaction_id)
    if (!transactionId) continue
    map.set(transactionId, (map.get(transactionId) || 0) + toNumber(row.referral_commission_amount, 0))
  }
  return map
}

function resolveTargetAmount(target, fallback) {
  const amount = toNumber(target?.targetAmount ?? target?.target_amount, 0)
  return amount > 0 ? amount : fallback
}

function resolveTargetMetricForScope(scope = 'company', target = null, explicitTargetMetric = '') {
  if (explicitTargetMetric) return normalizeTargetMetric(explicitTargetMetric)
  const targetMetric = target?.targetMetric || target?.target_metric
  if (targetMetric) return normalizeTargetMetric(targetMetric)
  return scope === 'agent' ? 'agent_commission' : 'company_commission'
}

function getContributionAmount(amounts = {}, targetMetric = 'company_commission') {
  const normalized = normalizeTargetMetric(targetMetric)
  if (normalized === 'agent_commission') return amounts.agentCommission
  if (normalized === 'gross_commission') return amounts.grossAmount
  return amounts.companyCommission
}

function resolveFallbackTargetAmount(scope = 'company', targetMetric = 'company_commission', targetLevel = {}) {
  const normalizedMetric = normalizeTargetMetric(targetMetric)
  if (scope === 'agent' && normalizedMetric === 'agent_commission') {
    return targetLevel.monthlyTarget || DEFAULT_AGENT_MONTHLY_TARGET
  }
  if (scope === 'agent' && normalizedMetric === 'company_commission') return 0
  return DEFAULT_COMPANY_MONTHLY_TARGET
}

function buildStatus(targetAmount, currentAmount, projectedTotal, now = new Date(), periodRange = resolveTargetPeriodRange('monthly', now)) {
  const achieved = targetAmount > 0 ? Math.round((currentAmount / targetAmount) * 100) : 0
  const projected = targetAmount > 0 ? Math.round((projectedTotal / targetAmount) * 100) : 0
  const elapsedDays = Math.max(1, daySpan(periodRange.start, now))
  const totalDays = daySpan(periodRange.start, periodRange.end)
  const elapsed = Math.round((elapsedDays / totalDays) * 100)
  if (targetAmount > 0 && currentAmount >= targetAmount) return { key: 'exceeded', label: 'Exceeded', tone: 'green', percentage: achieved, projectedPercentage: projected }
  if (targetAmount > 0 && (projectedTotal >= targetAmount || achieved >= Math.max(10, elapsed * 0.85))) {
    return { key: 'on_track', label: 'On track', tone: 'green', percentage: achieved, projectedPercentage: projected }
  }
  if (!targetAmount) return { key: 'no_target', label: 'No target set', tone: 'slate', percentage: 0, projectedPercentage: 0 }
  return { key: 'behind', label: 'Behind target', tone: 'orange', percentage: achieved, projectedPercentage: projected }
}

export function buildCommissionTrackerFromRows({
  transactions = [],
  transactionCommissions = [],
  referralEvents = [],
  levels = [],
  profiles = [],
  target = null,
  scope = 'company',
  userId = '',
  userEmail = '',
  branchId = '',
  targetMetric = '',
  now = new Date(),
} = {}) {
  const normalizedTarget = target ? normalizeTarget(target) : null
  const normalizedTargetMetric = resolveTargetMetricForScope(scope, normalizedTarget, targetMetric)
  const periodRange = resolveTargetPeriodRange(normalizedTarget?.period || 'monthly', now)
  const commissionByTransaction = new Map((transactionCommissions || []).map((row) => [normalizeText(row.transaction_id), row]))
  const referralByTransaction = buildReferralByTransaction(referralEvents)
  const levelsById = new Map((levels || []).map((level, index) => {
    const normalized = normalizeCommissionLevel(level, index)
    return [normalizeText(normalized.id), normalized]
  }))
  const defaultLevel = (levels || []).find((level) => level?.isDefault) || levels[0] || normalizeCommissionLevel(DEFAULT_COMMISSION_LEVELS[0])
  const profileByUserId = new Map()
  const profileByEmail = new Map()
  for (const profile of profiles || []) {
    const normalizedUserId = normalizeText(profile.user_id || profile.userId)
    const normalizedEmail = normalizeText(profile.email_address || profile.email).toLowerCase()
    if (normalizedUserId) profileByUserId.set(normalizedUserId, profile)
    if (normalizedEmail) profileByEmail.set(normalizedEmail, profile)
  }

  const buckets = {
    projected: 0,
    confirmed: 0,
    due: 0,
    paid: 0,
    cancelled: 0,
  }
  const counts = {
    projected: 0,
    confirmed: 0,
    due: 0,
    paid: 0,
    cancelled: 0,
  }
  const topContributorMap = new Map()
  const branchMap = new Map()
  let grossCommission = 0
  let activeDealsCount = 0
  let targetLevel = normalizeCommissionLevel(defaultLevel)

  for (const row of transactions || []) {
    const transactionId = getTransactionId(row)
    const commissionRow = commissionByTransaction.get(transactionId) || {}
    if (!transactionMatchesScope(row, commissionRow, { userId, userEmail, branchId })) continue

    const agentIdentity = getAgentIdentity(row, commissionRow)
    const profile = profileByUserId.get(agentIdentity.userId) || profileByEmail.get(agentIdentity.email) || null
    const level = levelsById.get(normalizeText(profile?.commission_level_id || profile?.commissionLevelId)) || targetLevel
    if (scope === 'agent' && (agentIdentity.userId || agentIdentity.email)) targetLevel = normalizeCommissionLevel(level)

    const amounts = calculateCommissionAmounts({
      transaction: row,
      commissionRow,
      level,
      referralPayout: referralByTransaction.get(transactionId) || 0,
    })
    if (amounts.grossAmount <= 0 && amounts.agentCommission <= 0 && amounts.agencyCommission <= 0) continue

    const bucket = getCommissionStatusBucket(row, commissionRow)
    const dateForPeriod = bucket === 'paid' || bucket === 'due' ? getTransactionCompletedAt(row) || getExpectedCommissionAt(row) : getExpectedCommissionAt(row)
    const includeInPeriod = isBetween(dateForPeriod, periodRange.start, periodRange.end) || (!isRegisteredTransaction(row) && bucket !== 'cancelled')
    if (!includeInPeriod) continue

    const contribution = getContributionAmount(amounts, normalizedTargetMetric)
    buckets[bucket] = roundMoney((buckets[bucket] || 0) + contribution)
    counts[bucket] = (counts[bucket] || 0) + 1
    grossCommission = roundMoney(grossCommission + amounts.grossAmount)
    if (bucket === 'projected' || bucket === 'confirmed') activeDealsCount += 1

    const contributorKey = agentIdentity.userId || agentIdentity.email || agentIdentity.name
    const contributor = topContributorMap.get(contributorKey) || {
      id: contributorKey,
      name: agentIdentity.name,
      amount: 0,
      deals: 0,
    }
    contributor.amount = roundMoney(contributor.amount + contribution)
    contributor.deals += 1
    topContributorMap.set(contributorKey, contributor)

    const source = row.transaction && typeof row.transaction === 'object' ? row.transaction : row
    const branchKey = normalizeText(source.assigned_branch_id || source.branch_id) || 'unassigned'
    const branch = branchMap.get(branchKey) || { id: branchKey, name: branchKey === 'unassigned' ? 'Unassigned' : 'Branch', amount: 0, deals: 0 }
    branch.amount = roundMoney(branch.amount + contribution)
    branch.deals += 1
    branchMap.set(branchKey, branch)
  }

  const currentAmount = roundMoney(buckets.confirmed + buckets.due + buckets.paid)
  const pendingAmount = roundMoney(buckets.confirmed + buckets.due)
  const projectedCommission = roundMoney(currentAmount + buckets.projected)
  const fallbackTarget = resolveFallbackTargetAmount(scope, normalizedTargetMetric, targetLevel)
  const targetAmount = resolveTargetAmount(normalizedTarget, fallbackTarget)
  const status = buildStatus(targetAmount, currentAmount, projectedCommission, now, periodRange)

  return {
    scope,
    title: scope === 'agent'
      ? normalizedTargetMetric === 'company_commission'
        ? 'Company Contribution'
        : 'My Commission'
      : scope === 'branch'
        ? 'Branch Commission'
        : 'Company Commission',
    targetMetric: normalizedTargetMetric,
    targetMetricLabel: normalizedTargetMetric.replaceAll('_', ' '),
    period: periodRange.period,
    periodLabel: periodRange.period.charAt(0).toUpperCase() + periodRange.period.slice(1),
    periodStart: periodRange.start.toISOString(),
    periodEnd: periodRange.end.toISOString(),
    targetAmount,
    currentAmount,
    confirmedAmount: buckets.confirmed,
    dueAmount: buckets.due,
    paidAmount: buckets.paid,
    registeredPaidAmount: roundMoney(buckets.due + buckets.paid),
    pendingAmount,
    projectedAmount: buckets.projected,
    projectedCommission,
    grossCommission,
    percentageAchieved: status.percentage,
    projectedPercentage: status.projectedPercentage,
    progressPercent: Math.max(0, Math.min(100, status.percentage)),
    daysLeftInMonth: daysLeftInMonth(now),
    daysLeftInPeriod: daysLeftInRange(now, periodRange.end),
    status: status.key,
    statusLabel: status.label,
    statusTone: status.tone,
    activeDealsCount,
    commissionLevel: targetLevel.name,
    agentSplit: targetLevel.agentPercentage,
    agencySplit: targetLevel.agencyPercentage,
    bucketBreakdown: [
      { key: 'paid', label: 'Paid', value: buckets.paid, count: counts.paid },
      { key: 'due', label: 'Due', value: buckets.due, count: counts.due },
      { key: 'confirmed', label: 'Confirmed', value: buckets.confirmed, count: counts.confirmed },
      { key: 'projected', label: 'Projected', value: buckets.projected, count: counts.projected },
    ],
    topContributors: [...topContributorMap.values()].sort((left, right) => right.amount - left.amount).slice(0, 5),
    branchBreakdown: [...branchMap.values()].sort((left, right) => right.amount - left.amount),
    generatedAt: new Date().toISOString(),
  }
}

async function getTrackerSourceRows(organisationId) {
  const [transactions, transactionCommissions, referralEvents, profiles] = await Promise.all([
    safeSelect('transactions', TRANSACTION_SELECT_FIELDS, { organisationId, order: 'updated_at', limit: 1500 }),
    safeSelect('transaction_commissions', COMMISSION_SELECT_FIELDS, { organisationId, order: 'updated_at', limit: 1500 }),
    safeSelect('lead_referrals', 'id, source_organisation_id, converted_transaction_id, referral_commission_amount, commission_status, created_at, updated_at', {
      organisationId,
      organisationColumn: 'source_organisation_id',
      order: 'updated_at',
      limit: 1000,
    }),
    getCommissionProfileRows(organisationId),
  ])
  return { transactions, transactionCommissions, referralEvents, profiles }
}

export async function getCompanyCommissionTracker() {
  if (!isSupabaseConfigured || !supabase) {
    return buildCommissionTrackerFromRows({ scope: 'company', target: { targetAmount: DEFAULT_COMPANY_MONTHLY_TARGET } })
  }
  const { organisationId } = await getContext()
  if (!organisationId) {
    return buildCommissionTrackerFromRows({ scope: 'company', target: { targetAmount: DEFAULT_COMPANY_MONTHLY_TARGET } })
  }
  const [levels, targets, sourceRows] = await Promise.all([
    getCommissionLevels(),
    getCommissionTargets({ targetType: 'company', targetMetric: 'company_commission' }),
    getTrackerSourceRows(organisationId),
  ])
  return buildCommissionTrackerFromRows({
    ...sourceRows,
    levels,
    target: targets[0] || { targetAmount: DEFAULT_COMPANY_MONTHLY_TARGET },
    scope: 'company',
    targetMetric: 'company_commission',
  })
}

export async function getAgentCommissionTracker(userId = '', options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return buildCommissionTrackerFromRows({ scope: 'agent', target: { targetAmount: DEFAULT_AGENT_MONTHLY_TARGET } })
  }
  const context = await getContext()
  const explicitUserId = normalizeText(userId || options.userId)
  const explicitEmail = normalizeText(options.userEmail || options.email).toLowerCase()
  const resolvedUserId = normalizeText(explicitUserId || (explicitEmail ? '' : context.userId))
  const resolvedEmail = normalizeText(explicitEmail || context.email).toLowerCase()
  if (!context.organisationId) {
    return buildCommissionTrackerFromRows({ scope: 'agent', target: { targetAmount: DEFAULT_AGENT_MONTHLY_TARGET }, userId: resolvedUserId, userEmail: resolvedEmail })
  }
  const [levels, targets, sourceRows] = await Promise.all([
    getCommissionLevels(),
    resolvedUserId ? getCommissionTargets({ targetType: 'agent', targetMetric: 'agent_commission', userId: resolvedUserId }) : Promise.resolve([]),
    getTrackerSourceRows(context.organisationId),
  ])
  return buildCommissionTrackerFromRows({
    ...sourceRows,
    levels,
    target: targets[0] || null,
    scope: 'agent',
    targetMetric: 'agent_commission',
    userId: resolvedUserId,
    userEmail: resolvedEmail,
  })
}

export async function getAgentCompanyContributionTracker(userId = '', options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return buildCommissionTrackerFromRows({
      scope: 'agent',
      target: { targetAmount: 0, targetMetric: 'company_commission', period: options.period || 'monthly' },
      targetMetric: 'company_commission',
      userId,
      userEmail: options.userEmail || '',
    })
  }
  const context = await getContext()
  const explicitUserId = normalizeText(userId || options.userId)
  const explicitEmail = normalizeText(options.userEmail || options.email).toLowerCase()
  const resolvedUserId = normalizeText(explicitUserId || (explicitEmail ? '' : context.userId))
  const resolvedEmail = normalizeText(explicitEmail || context.email).toLowerCase()
  if (!context.organisationId) {
    return buildCommissionTrackerFromRows({
      scope: 'agent',
      target: { targetAmount: 0, targetMetric: 'company_commission', period: options.period || 'monthly' },
      targetMetric: 'company_commission',
      userId: resolvedUserId,
      userEmail: resolvedEmail,
    })
  }
  const [levels, targets, sourceRows] = await Promise.all([
    getCommissionLevels(),
    resolvedUserId ? getCommissionTargets({ targetType: 'agent', targetMetric: 'company_commission', userId: resolvedUserId }) : Promise.resolve([]),
    getTrackerSourceRows(context.organisationId),
  ])
  return buildCommissionTrackerFromRows({
    ...sourceRows,
    levels,
    target: targets[0] || { targetAmount: 0, targetMetric: 'company_commission', period: options.period || 'monthly' },
    scope: 'agent',
    targetMetric: 'company_commission',
    userId: resolvedUserId,
    userEmail: resolvedEmail,
  })
}

export async function getBranchCommissionTracker(branchId = '') {
  if (!isSupabaseConfigured || !supabase) {
    return buildCommissionTrackerFromRows({ scope: 'branch', target: { targetAmount: DEFAULT_COMPANY_MONTHLY_TARGET } })
  }
  const context = await getContext()
  const normalizedBranchId = normalizeText(branchId)
  if (!context.organisationId) {
    return buildCommissionTrackerFromRows({ scope: 'branch', target: { targetAmount: DEFAULT_COMPANY_MONTHLY_TARGET }, branchId: normalizedBranchId })
  }
  const [levels, targets, sourceRows] = await Promise.all([
    getCommissionLevels(),
    normalizedBranchId ? getCommissionTargets({ targetType: 'branch', targetMetric: 'company_commission', branchId: normalizedBranchId }) : Promise.resolve([]),
    getTrackerSourceRows(context.organisationId),
  ])
  return buildCommissionTrackerFromRows({
    ...sourceRows,
    levels,
    target: targets[0] || { targetAmount: DEFAULT_COMPANY_MONTHLY_TARGET },
    scope: 'branch',
    targetMetric: 'company_commission',
    branchId: normalizedBranchId,
  })
}

export async function calculateTransactionCommission(transactionId) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) throw new Error('A transaction id is required.')
  if (!isSupabaseConfigured || !supabase) return calculateCommissionAmounts()

  const transaction = await safeMaybeSingle('transactions', TRANSACTION_SELECT_FIELDS, {
    filters: [{ column: 'id', value: normalizedTransactionId }],
  })
  const commissionRow = await safeMaybeSingle('transaction_commissions', COMMISSION_SELECT_FIELDS, {
    filters: [{ column: 'transaction_id', value: normalizedTransactionId }],
  })
  return calculateCommissionAmounts({ transaction: transaction || {}, commissionRow: commissionRow || {} })
}

function findCommissionProfileForIdentity(profiles = [], { organisationUserId = '', userId = '', userEmail = '' } = {}) {
  const normalizedOrganisationUserId = normalizeText(organisationUserId).toLowerCase()
  const normalizedUserId = normalizeText(userId).toLowerCase()
  const normalizedEmail = normalizeText(userEmail).toLowerCase()
  return (profiles || []).find((profile) => {
    const profileOrganisationUserId = normalizeText(profile?.organisation_user_id || profile?.organisationUserId).toLowerCase()
    const profileUserId = normalizeText(profile?.user_id || profile?.userId).toLowerCase()
    const profileEmail = normalizeText(profile?.email_address || profile?.email).toLowerCase()
    return Boolean(
      (normalizedOrganisationUserId && profileOrganisationUserId === normalizedOrganisationUserId) ||
      (normalizedUserId && profileUserId === normalizedUserId) ||
      (normalizedEmail && profileEmail === normalizedEmail),
    )
  }) || null
}

function findById(rows = [], id = '') {
  const normalizedId = normalizeText(id)
  if (!normalizedId) return null
  return (rows || []).find((row) => normalizeText(row?.id) === normalizedId) || null
}

function formatListingCommission(structure = null) {
  const type = normalizeKey(structure?.listingCommissionType || structure?.listing_commission_type || 'percentage')
  if (type === 'fixed') {
    return {
      label: `Fixed ${roundMoney(structure?.listingCommissionAmount ?? structure?.listing_commission_amount ?? 0)}`,
      basis: 'Fixed amount',
      type,
    }
  }
  const percentage = normalizePercentage(structure?.listingCommissionPercentage ?? structure?.listing_commission_percentage, 7.5)
  return {
    label: `${percentage}%`,
    basis: 'Selling price',
    type: 'percentage',
  }
}

export function buildAgentCommissionSummary({
  agent = {},
  structures = [],
  levels = [],
  profiles = [],
  companyContributionTracker = null,
} = {}) {
  const organisationUserId = normalizeText(agent.organisationUserId || agent.organisation_user_id)
  const userId = normalizeText(agent.userId || agent.user_id || agent.id)
  const userEmail = normalizeText(agent.email || agent.email_address).toLowerCase()
  const profile = findCommissionProfileForIdentity(profiles, { organisationUserId, userId, userEmail })
  const activeStructures = (structures || []).filter((structure) => structure?.isActive !== false)
  const defaultStructure = activeStructures.find((structure) => structure?.isDefault) || activeStructures[0] || null
  const explicitStructureId = normalizeText(
    profile?.commission_structure_id ||
      profile?.commissionStructureId ||
      agent.commissionStructureId ||
      agent.commission_structure_id,
  )
  const appliedStructure = findById(activeStructures, explicitStructureId) || defaultStructure
  const activeLevels = (levels || []).filter((level) => level?.isActive !== false)
  const defaultLevel = activeLevels.find((level) => level?.isDefault) || activeLevels[0] || normalizeCommissionLevel(DEFAULT_COMMISSION_LEVELS[0])
  const explicitLevelId = normalizeText(profile?.commission_level_id || profile?.commissionLevelId || agent.commissionLevelId || agent.commission_level_id)
  const appliedLevel = findById(activeLevels, explicitLevelId) || defaultLevel
  const overrideSplit = nullableNumber(profile?.override_agent_split_percentage ?? profile?.overrideAgentSplitPercentage ?? agent.overrideAgentSplitPercentage)
  const structureSplit = nullableNumber(appliedStructure?.agentSplitPercentage ?? appliedStructure?.agent_split_percentage)
  const levelSplit = nullableNumber(appliedLevel?.agentPercentage ?? appliedLevel?.agent_percentage)
  const agentSplitPercentage = normalizePercentage(overrideSplit ?? levelSplit ?? structureSplit, 60)
  const companySplitPercentage = normalizePercentage(100 - agentSplitPercentage, 40)
  const listingCommission = formatListingCommission(appliedStructure)
  const tracker = companyContributionTracker || buildCommissionTrackerFromRows({
    scope: 'agent',
    target: { targetAmount: 0, targetMetric: 'company_commission', period: 'monthly' },
    targetMetric: 'company_commission',
    userId,
    organisationUserId,
    userEmail,
  })

  return {
    userId,
    userEmail,
    commissionProfileId: normalizeText(profile?.id),
    commissionEffectiveFrom: profile?.effective_from || profile?.effectiveFrom || agent.commissionEffectiveFrom || null,
    commissionStructureId: normalizeText(appliedStructure?.id || explicitStructureId),
    commissionStructureName: normalizeText(appliedStructure?.name) || 'Default commission structure',
    commissionLevelId: normalizeText(appliedLevel?.id || explicitLevelId),
    commissionLevelName: normalizeText(appliedLevel?.name) || 'Standard',
    listingCommissionLabel: listingCommission.label,
    listingCommissionBasis: listingCommission.basis,
    listingCommissionType: listingCommission.type,
    agentSplitPercentage,
    companySplitPercentage,
    splitOverrideApplied: overrideSplit !== null,
    companyTargetAmount: tracker.targetAmount || 0,
    companyTargetPeriod: tracker.period || 'monthly',
    companyTargetMetric: tracker.targetMetric || 'company_commission',
    companyContributionAmount: tracker.currentAmount || 0,
    companyContributionProjectedAmount: tracker.projectedCommission || 0,
    companyContributionProgress: tracker.percentageAchieved || 0,
    companyContributionProjectedProgress: tracker.projectedPercentage || 0,
    companyTargetStatus: tracker.status || 'no_target',
    companyTargetStatusLabel: tracker.statusLabel || 'No target set',
    companyContributionTracker: tracker,
  }
}

export async function getAgentCommissionSummary(userId = '', options = {}) {
  const context = await getContext()
  const explicitUserId = normalizeText(userId || options.userId)
  const explicitEmail = normalizeText(options.userEmail || options.email).toLowerCase()
  const resolvedUserId = normalizeText(explicitUserId || (explicitEmail ? '' : context.userId))
  const resolvedEmail = normalizeText(explicitEmail || context.email).toLowerCase()
  const [structures, levels, profiles, companyContributionTracker] = await Promise.all([
    listOrganisationCommissionStructures().catch(() => []),
    getCommissionLevels(),
    context.organisationId ? getCommissionProfileRows(context.organisationId) : Promise.resolve([]),
    getAgentCompanyContributionTracker(resolvedUserId, { userEmail: resolvedEmail, period: options.period }),
  ])
  return buildAgentCommissionSummary({
    agent: { id: resolvedUserId, userId: resolvedUserId, email: resolvedEmail },
    structures,
    levels,
    profiles,
    companyContributionTracker,
  })
}

export async function getCommissionOverview() {
  const [structures, levels, referralRules, companyTracker] = await Promise.all([
    listOrganisationCommissionStructures().catch(() => []),
    getCommissionLevels(),
    getReferralCommissionRules(),
    getCompanyCommissionTracker(),
  ])
  const defaultStructure =
    structures.find((structure) => structure.isDefault && structure.isActive) ||
    structures.find((structure) => structure.isActive) ||
    null
  const defaultLevel = levels.find((level) => level.isDefault && level.isActive) || levels.find((level) => level.isActive) || normalizeCommissionLevel(DEFAULT_COMMISSION_LEVELS[0])

  return {
    structures,
    levels,
    referralRules,
    companyTracker,
    defaultStructure,
    defaultLevel,
    listingRows: buildListingCommissionRows(defaultStructure, defaultLevel),
  }
}

export function buildListingCommissionRows(defaultStructure = null, defaultLevel = null) {
  const salesPercentage = normalizePercentage(defaultStructure?.listingCommissionPercentage, 7.5)
  const levelName = normalizeText(defaultLevel?.name) || 'Standard'
  return [
    {
      key: 'residential_sales',
      category: 'Residential Sales',
      defaultCommission: defaultStructure?.listingCommissionType === 'fixed'
        ? `Fixed ${roundMoney(defaultStructure?.listingCommissionAmount || 0)}`
        : `${salesPercentage}%`,
      commissionLevel: levelName,
      appliesTo: 'Mandates and sales',
      type: defaultStructure?.listingCommissionType || 'percentage',
    },
    { key: 'residential_rentals', category: 'Residential Rentals', defaultCommission: "1 Month's Rent", commissionLevel: levelName, appliesTo: 'Rental mandates', type: 'one_month_rental' },
    { key: 'commercial_sales', category: 'Commercial Sales', defaultCommission: '5%', commissionLevel: levelName, appliesTo: 'Commercial sales', type: 'percentage' },
    { key: 'commercial_rentals', category: 'Commercial Rentals', defaultCommission: "1 Month's Rent", commissionLevel: levelName, appliesTo: 'Commercial leases', type: 'one_month_rental' },
    { key: 'development_sales', category: 'Development Sales', defaultCommission: 'Custom', commissionLevel: 'Custom', appliesTo: 'Development stock', type: 'custom' },
  ]
}

export async function getCommissionAssignableUsers() {
  const [users, levels, profileRows] = await Promise.all([
    listOrganisationUsers().catch(() => []),
    getCommissionLevels(),
    isSupabaseConfigured && supabase
      ? getContext().then((context) => (context.organisationId ? getCommissionProfileRows(context.organisationId) : []))
      : Promise.resolve([]),
  ])
  const profileByUserId = new Map()
  const profileByEmail = new Map()
  for (const profile of profileRows || []) {
    const userId = normalizeText(profile.user_id)
    const email = normalizeText(profile.email_address).toLowerCase()
    if (userId) profileByUserId.set(userId, profile)
    if (email) profileByEmail.set(email, profile)
  }
  return {
    users: (Array.isArray(users) ? users : []).filter((user) => user?.status !== 'deactivated'),
    levels,
    profiles: profileRows,
    profileByUserId,
    profileByEmail,
  }
}
