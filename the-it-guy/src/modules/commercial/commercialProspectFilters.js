import {
  COMMERCIAL_DEAL_TYPES,
  COMMERCIAL_PROPERTY_CATEGORIES,
  COMMERCIAL_PROSPECT_ROLES,
  getDealTypeFromRole,
  getDealTypeLabel,
  getPropertyCategoryLabel,
  getRoleLabel,
} from './commercialProspectTypes'
import { normalizeKey, normalizeText } from './commercialProspectFormatters'

function inferProspectRole(raw = {}) {
  const explicit = normalizeKey(raw.prospectRole || raw.prospect_role || raw.role)
  if (COMMERCIAL_PROSPECT_ROLES.includes(explicit)) return explicit

  const prospectType = normalizeKey(raw.prospectType || raw.prospect_type || raw.type)
  if (prospectType.includes('seller')) return 'seller'
  if (prospectType.includes('buyer') || prospectType.includes('investor')) return 'buyer'
  if (prospectType.includes('landlord')) return 'landlord'
  if (prospectType.includes('tenant') || prospectType.includes('occupier')) return 'tenant'
  if (prospectType.includes('owner')) return 'seller'
  if (prospectType.includes('lease')) return 'landlord'
  return 'seller'
}

function inferPropertyCategory(raw = {}) {
  const explicit = normalizeKey(raw.propertyCategory || raw.property_category || raw.propertyType || raw.property_type || raw.assetType || raw.asset_type)
  if (!explicit) return ''
  if (COMMERCIAL_PROPERTY_CATEGORIES.includes(explicit)) return explicit
  if (explicit.includes('mixed')) return 'mixed_use'
  if (explicit.includes('retail')) return 'retail'
  if (explicit.includes('industrial') || explicit.includes('warehouse')) return 'industrial'
  if (explicit.includes('office')) return 'office'
  if (explicit.includes('commercial')) return 'commercial'
  if (explicit.includes('agricultural') || explicit.includes('farm')) return 'agricultural'
  return 'other'
}

function inferDealType(raw = {}, role = inferProspectRole(raw)) {
  const explicit = normalizeKey(raw.dealType || raw.deal_type || raw.commercialType || raw.commercial_type)
  if (COMMERCIAL_DEAL_TYPES.includes(explicit)) return explicit
  return getDealTypeFromRole(role)
}

function getDisplayName(raw = {}) {
  return normalizeText(raw.companyName || raw.company_name || raw.contactName || raw.contact_name || [raw.firstName, raw.lastName].filter(Boolean).join(' ') || raw.area || raw.propertyName || raw.property_name) || 'Unknown prospect'
}

function getSecondaryLine(raw = {}, role = '') {
  const company = normalizeText(raw.companyName || raw.company_name)
  const contact = normalizeText(raw.contactName || raw.contact_name)
  const area = normalizeText(raw.area || raw.propertyAddress || raw.property_address)
  if (role === 'seller' || role === 'landlord') {
    return [contact, area].filter(Boolean).join(' · ') || company || 'No contact captured'
  }
  return [company, contact].filter(Boolean).join(' · ') || area || 'No contact captured'
}

function getAreaLabel(raw = {}, role = '') {
  const propertyName = normalizeText(raw.propertyName || raw.property_name || raw.vacancyName || raw.vacancy_name)
  const propertyAddress = normalizeText(raw.propertyAddress || raw.property_address || raw.area || raw.preferredArea || raw.preferred_area)
  const size = normalizeText(raw.sizeRange || raw.size_range)
  const requirement = normalizeText(raw.spaceRequirement || raw.space_requirement || raw.lookingFor || raw.looking_for)
  if (role === 'seller') return propertyAddress || propertyName || 'Area pending'
  if (role === 'buyer') return [propertyAddress || 'Preferred area pending', requirement].filter(Boolean).join(' · ') || 'Preference pending'
  if (role === 'landlord') return [propertyName || 'Portfolio pending', propertyAddress].filter(Boolean).join(' · ') || 'Portfolio pending'
  if (role === 'tenant') return [propertyAddress || 'Preferred area pending', size || requirement].filter(Boolean).join(' · ') || 'Requirement pending'
  return propertyAddress || propertyName || 'Area pending'
}

function buildSearchText(raw = {}, role = '', category = '', brokerName = '', displayName = '', areaLabel = '') {
  return [
    displayName,
    raw.companyName,
    raw.company_name,
    raw.contactName,
    raw.contact_name,
    raw.firstName,
    raw.lastName,
    raw.phone,
    raw.email,
    raw.area,
    raw.propertyName,
    raw.propertyAddress,
    raw.propertyType,
    raw.property_category,
    raw.propertyCategory,
    raw.notes,
    raw.followUpNote,
    raw.source,
    raw.canvassingMethod,
    raw.assignedBrokerName,
    brokerName,
    role,
    getRoleLabel(role),
    category,
    getPropertyCategoryLabel(category),
    areaLabel,
    getDealTypeLabel(inferDealType(raw, role)),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function normaliseCommercialProspect(raw = {}, context = {}) {
  const role = inferProspectRole(raw)
  const dealType = inferDealType(raw, role)
  const propertyCategory = inferPropertyCategory(raw)
  const displayName = getDisplayName(raw)
  const areaLabel = getAreaLabel(raw, role)
  const assignedBrokerName = normalizeText(context.assignedBrokerName || raw.assignedBrokerName || raw.assigned_broker_name)
  const lastActivity = context.lastActivity || null

  return {
    ...raw,
    prospectRole: role,
    dealType,
    propertyCategory,
    displayName,
    secondaryLine: getSecondaryLine(raw, role),
    areaLabel,
    assignedBrokerName,
    assignedBrokerDisplay: assignedBrokerName || 'Unassigned',
    searchText: buildSearchText(raw, role, propertyCategory, assignedBrokerName, displayName, areaLabel),
    roleLabel: getRoleLabel(role),
    dealTypeLabel: getDealTypeLabel(dealType),
    categoryLabel: getPropertyCategoryLabel(propertyCategory),
    lastActivity,
    sourceLabel: normalizeText(raw.canvassingMethod || raw.source || raw.method) || 'Other',
    stageLabel: normalizeText(raw.status) || 'New',
    nextStepLabel: normalizeText(raw.followUpNote || raw.nextStep || raw.next_step) || 'No next step captured',
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

export function filterCommercialProspects(prospects = [], filters = {}) {
  const search = normalizeKey(filters.search)
  const dealFilter = normalizeKey(filters.dealType || filters.segment || 'all')
  const roleFilter = normalizeKey(filters.role || 'all')
  const categoryFilter = normalizeKey(filters.category || 'all')
  const assignedFilter = normalizeKey(filters.assigned || 'all')

  return prospects.filter((prospect) => {
    const dealType = normalizeKey(prospect.dealType || inferDealType(prospect))
    const role = normalizeKey(prospect.prospectRole || inferProspectRole(prospect))
    const category = normalizeKey(prospect.propertyCategory || inferPropertyCategory(prospect))
    const assigned = normalizeKey(prospect.assignedBrokerId || prospect.assigned_broker_id || prospect.assignedBrokerName || '')
    const matchesSearch = !search || normalizeText(prospect.searchText || '').includes(search)
    const matchesDeal = dealFilter === 'all' || dealType === dealFilter
    const matchesRole = roleFilter === 'all' || role === roleFilter
    const matchesCategory = categoryFilter === 'all' || category === categoryFilter
    const matchesAssigned = assignedFilter === 'all' || assigned === assignedFilter || normalizeKey(prospect.assignedBrokerName) === assignedFilter
    return matchesSearch && matchesDeal && matchesRole && matchesCategory && matchesAssigned
  })
}

export function deriveCommercialCanvassingMetrics(prospects = [], activities = []) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfWeek = new Date(today)
  const dayOfWeek = endOfWeek.getDay() || 7
  endOfWeek.setDate(endOfWeek.getDate() + (7 - dayOfWeek))
  endOfWeek.setHours(23, 59, 59, 999)

  const activeProspects = prospects.filter((prospect) => !['archived', 'lost', 'closed'].includes(normalizeKey(prospect.status)))
  const openProspects = activeProspects.filter((prospect) => normalizeKey(prospect.status) !== 'converted').length
  const activitiesThisMonth = toArray(activities).filter((activity) => {
    const created = new Date(activity?.createdAt || activity?.created_at || activity?.activityDate || activity?.activity_date || '')
    return !Number.isNaN(created.getTime()) && created >= startOfMonth
  }).length
  const followUpsDue = activeProspects.filter((prospect) => {
    const due = new Date(prospect.nextFollowUpDate || prospect.next_follow_up_date || '')
    return !Number.isNaN(due.getTime()) && due.getTime() <= endOfWeek.getTime()
  }).length
  const overdueFollowUps = activeProspects.filter((prospect) => {
    const due = new Date(prospect.nextFollowUpDate || prospect.next_follow_up_date || '')
    return !Number.isNaN(due.getTime()) && due.getTime() < today.getTime()
  }).length
  const converted = prospects.filter((prospect) => normalizeKey(prospect.status).includes('converted')).length
  const pipelineValue = activeProspects.reduce((total, prospect) => {
    const value = Number(
      prospect.estimatedValue ||
      prospect.estimated_value ||
      prospect.estimated_sale_value ||
      prospect.estimated_annual_rental_value ||
      prospect.estimated_monthly_rental_value * 12 ||
      0,
    )
    return total + (Number.isFinite(value) ? value : 0)
  }, 0)

  return {
    prospects: openProspects,
    activities: activitiesThisMonth,
    followUpsDue,
    overdueFollowUps,
    converted,
    pipelineValue,
  }
}

