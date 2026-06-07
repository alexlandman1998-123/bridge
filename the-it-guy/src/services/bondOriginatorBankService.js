import {
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'

export const BOND_ORIGINATOR_BANK_STATUSES = Object.freeze({
  active: 'active',
  inactive: 'inactive',
  pending: 'pending',
  suspended: 'suspended',
})

export const BANK_SUPPORTED_PRODUCTS = Object.freeze([
  'Residential Bond',
  'Commercial Bond',
  'Development Finance',
  'Bridging Finance',
  'Further Bond',
  'Switch Bond',
])

export const BANK_AGREEMENT_STATUSES = Object.freeze({
  draft: 'draft',
  underReview: 'under_review',
  active: 'active',
  renewalDue: 'renewal_due',
  expired: 'expired',
})

export const BANK_COMMISSION_BASES = Object.freeze({
  grossBondAmount: 'gross_bond_amount',
  bankCommissionReceived: 'bank_commission_received',
  originatorGrossRevenue: 'originator_gross_revenue',
  fixedPerInstruction: 'fixed_per_instruction',
})

export const SYSTEM_BANK_DIRECTORY = Object.freeze([
  { id: 'absa', name: 'ABSA', shortName: 'ABSA', short_name: 'ABSA', country: 'ZA', bankType: 'retail', bank_type: 'retail', isActive: true, is_active: true, displayOrder: 10, display_order: 10 },
  { id: 'fnb', name: 'First National Bank', shortName: 'FNB', short_name: 'FNB', country: 'ZA', bankType: 'retail', bank_type: 'retail', isActive: true, is_active: true, displayOrder: 20, display_order: 20 },
  { id: 'nedbank', name: 'Nedbank', shortName: 'Nedbank', short_name: 'Nedbank', country: 'ZA', bankType: 'retail', bank_type: 'retail', isActive: true, is_active: true, displayOrder: 30, display_order: 30 },
  { id: 'standard-bank', name: 'Standard Bank', shortName: 'Standard Bank', short_name: 'Standard Bank', country: 'ZA', bankType: 'retail', bank_type: 'retail', isActive: true, is_active: true, displayOrder: 40, display_order: 40 },
  { id: 'investec', name: 'Investec', shortName: 'Investec', short_name: 'Investec', country: 'ZA', bankType: 'private', bank_type: 'private', isActive: true, is_active: true, displayOrder: 50, display_order: 50 },
  { id: 'capitec', name: 'Capitec', shortName: 'Capitec', short_name: 'Capitec', country: 'ZA', bankType: 'retail', bank_type: 'retail', isActive: true, is_active: true, displayOrder: 60, display_order: 60 },
  { id: 'sa-home-loans', name: 'SA Home Loans', shortName: 'SA Home Loans', short_name: 'SA Home Loans', country: 'ZA', bankType: 'mortgage_originator', bank_type: 'mortgage_originator', isActive: true, is_active: true, displayOrder: 70, display_order: 70 },
  { id: 'african-bank', name: 'African Bank', shortName: 'African Bank', short_name: 'African Bank', country: 'ZA', bankType: 'retail', bank_type: 'retail', isActive: true, is_active: true, displayOrder: 80, display_order: 80 },
  { id: 'other', name: 'Other', shortName: 'Other', short_name: 'Other', country: 'ZA', bankType: 'other', bank_type: 'other', isActive: true, is_active: true, displayOrder: 999, display_order: 999 },
])

const LOCAL_ORIGINATOR_BANK_PANEL_STORE = new Map()
let localSequence = 0

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function createId(prefix = 'originator-bank') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

export function slugifyBank(value = '') {
  const normalized = normalizeLower(value)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (normalized.includes('absa')) return 'absa'
  if (normalized.includes('fnb') || normalized.includes('first-national') || normalized === 'f-n-b') return 'fnb'
  if (normalized.includes('nedbank')) return 'nedbank'
  if (normalized.includes('standard')) return 'standard-bank'
  if (normalized.includes('investec')) return 'investec'
  if (normalized.includes('capitec')) return 'capitec'
  if (normalized.includes('sa-home') || normalized.includes('south-african-home')) return 'sa-home-loans'
  if (normalized.includes('african-bank')) return 'african-bank'
  return normalized || 'other'
}

function getWorkspaceKey(context = {}, options = {}) {
  return normalizeText(
    options.originatorOrgId ||
      options.workspaceId ||
      context.workspaceId ||
      context.currentWorkspace?.id ||
      context.workspace?.id ||
      context.currentMembership?.workspaceId ||
      context.currentMembership?.organisation_id ||
      context.currentMembership?.organisationId ||
      'default',
  )
}

function normalizeBank(row = {}) {
  const id = slugifyBank(row.id || row.bankId || row.bank_id || row.shortName || row.short_name || row.name)
  const shortName = normalizeText(row.shortName || row.short_name || row.short_name_display || row.name || id)
  return {
    id,
    bankId: id,
    name: normalizeText(row.name || row.bankName || row.bank_name || shortName),
    shortName,
    short_name: shortName,
    logoUrl: normalizeText(row.logoUrl || row.logo_url),
    logo_url: normalizeText(row.logoUrl || row.logo_url),
    logoIconUrl: normalizeText(row.logoIconUrl || row.logo_icon_url || row.iconUrl || row.icon_url),
    logo_icon_url: normalizeText(row.logoIconUrl || row.logo_icon_url || row.iconUrl || row.icon_url),
    country: normalizeText(row.country || 'ZA'),
    bankType: normalizeText(row.bankType || row.bank_type || 'retail'),
    bank_type: normalizeText(row.bankType || row.bank_type || 'retail'),
    isActive: row.isActive ?? row.is_active ?? true,
    is_active: row.isActive ?? row.is_active ?? true,
    displayOrder: Number(row.displayOrder || row.display_order || 100),
    display_order: Number(row.displayOrder || row.display_order || 100),
  }
}

function systemBankMap(systemBanks = SYSTEM_BANK_DIRECTORY) {
  const map = new Map()
  systemBanks.map(normalizeBank).forEach((bank) => {
    map.set(bank.id, bank)
    map.set(slugifyBank(bank.name), bank)
    map.set(slugifyBank(bank.shortName), bank)
  })
  return map
}

function normalizePanelRow(row = {}, orgId = '', systemBanks = SYSTEM_BANK_DIRECTORY) {
  const banksById = systemBankMap(systemBanks)
  const bank = banksById.get(slugifyBank(row.bankId || row.bank_id || row.bank || row.bankName || row.bank_name || row.shortName || row.short_name)) || normalizeBank(row.bank || row)
  const status = normalizeLower(row.status || BOND_ORIGINATOR_BANK_STATUSES.active)
  return {
    id: normalizeText(row.id) || createId(),
    originatorOrgId: normalizeText(row.originatorOrgId || row.originator_org_id || orgId),
    originator_org_id: normalizeText(row.originatorOrgId || row.originator_org_id || orgId),
    bankId: bank.id,
    bank_id: bank.id,
    bank,
    bankName: bank.shortName || bank.name,
    bank_name: bank.shortName || bank.name,
    shortName: bank.shortName,
    name: bank.name,
    status: Object.values(BOND_ORIGINATOR_BANK_STATUSES).includes(status) ? status : BOND_ORIGINATOR_BANK_STATUSES.active,
    primaryContactName: normalizeText(row.primaryContactName || row.primary_contact_name),
    primary_contact_name: normalizeText(row.primaryContactName || row.primary_contact_name),
    primaryContactEmail: normalizeText(row.primaryContactEmail || row.primary_contact_email),
    primary_contact_email: normalizeText(row.primaryContactEmail || row.primary_contact_email),
    primaryContactPhone: normalizeText(row.primaryContactPhone || row.primary_contact_phone),
    primary_contact_phone: normalizeText(row.primaryContactPhone || row.primary_contact_phone),
    submissionEmail: normalizeText(row.submissionEmail || row.submission_email),
    submission_email: normalizeText(row.submissionEmail || row.submission_email),
    portalUrl: normalizeText(row.portalUrl || row.portal_url),
    portal_url: normalizeText(row.portalUrl || row.portal_url),
    slaDays: row.slaDays ?? row.sla_days ?? '',
    sla_days: row.slaDays ?? row.sla_days ?? '',
    slaOwner: normalizeText(row.slaOwner || row.sla_owner),
    sla_owner: normalizeText(row.slaOwner || row.sla_owner),
    relationshipOwner: normalizeText(row.relationshipOwner || row.relationship_owner || row.slaOwner || row.sla_owner),
    relationship_owner: normalizeText(row.relationshipOwner || row.relationship_owner || row.slaOwner || row.sla_owner),
    slaEscalationHours: row.slaEscalationHours ?? row.sla_escalation_hours ?? '',
    sla_escalation_hours: row.slaEscalationHours ?? row.sla_escalation_hours ?? '',
    agreementStatus: normalizeLower(row.agreementStatus || row.agreement_status || BANK_AGREEMENT_STATUSES.draft),
    agreement_status: normalizeLower(row.agreementStatus || row.agreement_status || BANK_AGREEMENT_STATUSES.draft),
    agreementType: normalizeText(row.agreementType || row.agreement_type || 'Panel Agreement'),
    agreement_type: normalizeText(row.agreementType || row.agreement_type || 'Panel Agreement'),
    agreementReference: normalizeText(row.agreementReference || row.agreement_reference),
    agreement_reference: normalizeText(row.agreementReference || row.agreement_reference),
    agreementStartDate: normalizeText(row.agreementStartDate || row.agreement_start_date),
    agreement_start_date: normalizeText(row.agreementStartDate || row.agreement_start_date),
    agreementReviewDate: normalizeText(row.agreementReviewDate || row.agreement_review_date || row.nextReviewDate || row.next_review_date),
    agreement_review_date: normalizeText(row.agreementReviewDate || row.agreement_review_date || row.nextReviewDate || row.next_review_date),
    nextReviewDate: normalizeText(row.nextReviewDate || row.next_review_date || row.agreementReviewDate || row.agreement_review_date),
    next_review_date: normalizeText(row.nextReviewDate || row.next_review_date || row.agreementReviewDate || row.agreement_review_date),
    commissionRate: row.commissionRate ?? row.commission_rate ?? '',
    commission_rate: row.commissionRate ?? row.commission_rate ?? '',
    commissionBasis: normalizeLower(row.commissionBasis || row.commission_basis || BANK_COMMISSION_BASES.bankCommissionReceived),
    commission_basis: normalizeLower(row.commissionBasis || row.commission_basis || BANK_COMMISSION_BASES.bankCommissionReceived),
    commissionTrigger: normalizeText(row.commissionTrigger || row.commission_trigger || 'Instruction issued'),
    commission_trigger: normalizeText(row.commissionTrigger || row.commission_trigger || 'Instruction issued'),
    commissionNotes: normalizeText(row.commissionNotes || row.commission_notes),
    commission_notes: normalizeText(row.commissionNotes || row.commission_notes),
    supportedProducts: normalizeArray(row.supportedProducts || row.supported_products),
    supported_products: normalizeArray(row.supportedProducts || row.supported_products),
    regionsSupported: normalizeArray(row.regionsSupported || row.regions_supported),
    regions_supported: normalizeArray(row.regionsSupported || row.regions_supported),
    notes: normalizeText(row.notes),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    updatedAt: normalizeText(row.updatedAt || row.updated_at) || new Date().toISOString(),
  }
}

function getLocalPanelRows(orgId = '') {
  return [...(LOCAL_ORIGINATOR_BANK_PANEL_STORE.get(normalizeText(orgId || 'default')) || [])]
}

function setLocalPanelRows(orgId = '', rows = []) {
  LOCAL_ORIGINATOR_BANK_PANEL_STORE.set(normalizeText(orgId || 'default'), rows)
}

function resolveScope(context = {}, options = {}) {
  return resolveBondOrganisationScope(context, {
    regions: normalizeArray(options.regions),
    branches: normalizeArray(options.branches || options.units),
    consultants: normalizeArray(options.consultants || options.users),
    applications: normalizeArray(options.applications),
  })
}

function assertHqPanelAccess(context = {}, options = {}) {
  const scope = resolveScope(context, options)
  if (scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) {
    const error = new Error('Only HQ users can manage the bank panel.')
    error.code = 'permission_denied'
    throw error
  }
}

function resolvePanelRows(context = {}, options = {}) {
  const orgId = getWorkspaceKey(context, options)
  const systemBanks = getSystemBanks(options)
  const explicitRows = normalizeArray(options.originatorBanks || options.bankPanel || options.bondOriginatorBanks)
  const rows = explicitRows.length ? explicitRows : getLocalPanelRows(orgId)
  return rows.map((row) => normalizePanelRow(row, orgId, systemBanks))
}

export function getSystemBanks(options = {}) {
  return normalizeArray(options.systemBanks || options.banksDirectory || SYSTEM_BANK_DIRECTORY)
    .map(normalizeBank)
    .filter((bank) => bank.isActive !== false)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.shortName.localeCompare(right.shortName))
}

export function getOriginatorBanks(originatorOrgId = '', context = {}, options = {}) {
  const orgId = normalizeText(originatorOrgId || getWorkspaceKey(context, options))
  return resolvePanelRows(context, { ...options, originatorOrgId: orgId })
    .sort((left, right) => left.bank.displayOrder - right.bank.displayOrder || left.bankName.localeCompare(right.bankName))
}

export function getActiveOriginatorBanks(originatorOrgId = '', context = {}, options = {}) {
  return getOriginatorBanks(originatorOrgId, context, options).filter((row) => row.status === BOND_ORIGINATOR_BANK_STATUSES.active)
}

export function getBankPanelForCurrentUser(context = {}, options = {}) {
  const scope = resolveScope(context, options)
  const orgId = getWorkspaceKey(context, options)
  const rows = getOriginatorBanks(orgId, context, options)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return rows
  return rows.filter((row) => row.status === BOND_ORIGINATOR_BANK_STATUSES.active)
}

export function getActiveBankOptionsForCurrentUser(context = {}, options = {}) {
  return getBankPanelForCurrentUser(context, options)
    .filter((row) => row.status === BOND_ORIGINATOR_BANK_STATUSES.active)
    .map((row) => ({
      id: row.bankId,
      value: row.bankName,
      label: row.bankName,
      bankId: row.bankId,
      bankName: row.bankName,
      panelId: row.id,
    }))
}

export function addOriginatorBank(payload = {}, context = {}, options = {}) {
  assertHqPanelAccess(context, options)
  const orgId = getWorkspaceKey(context, options)
  const current = getOriginatorBanks(orgId, context, options)
  const next = normalizePanelRow(payload, orgId, getSystemBanks(options))
  if (current.some((row) => row.bankId === next.bankId)) {
    const error = new Error('This bank is already in the originator bank panel.')
    error.code = 'duplicate_bank'
    throw error
  }
  const rows = [next, ...getLocalPanelRows(orgId)]
  setLocalPanelRows(orgId, rows)
  return next
}

export function updateOriginatorBank(id = '', payload = {}, context = {}, options = {}) {
  assertHqPanelAccess(context, options)
  const orgId = getWorkspaceKey(context, options)
  const current = getOriginatorBanks(orgId, context, options)
  const existing = current.find((row) => row.id === id || row.bankId === slugifyBank(id))
  if (!existing) {
    const error = new Error('Originator bank panel row not found.')
    error.code = 'not_found'
    throw error
  }
  const updated = normalizePanelRow({ ...existing, ...payload, id: existing.id, updatedAt: new Date().toISOString() }, orgId, getSystemBanks(options))
  setLocalPanelRows(orgId, current.map((row) => (row.id === existing.id ? updated : row)))
  return updated
}

export function deactivateOriginatorBank(id = '', context = {}, options = {}) {
  return updateOriginatorBank(id, { status: BOND_ORIGINATOR_BANK_STATUSES.inactive }, context, options)
}

export const __bondOriginatorBankServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_ORIGINATOR_BANK_PANEL_STORE.clear()
    localSequence = 0
  },
  seedOriginatorBanks(originatorOrgId = '', rows = []) {
    setLocalPanelRows(originatorOrgId, rows.map((row) => normalizePanelRow(row, originatorOrgId, SYSTEM_BANK_DIRECTORY)))
  },
  getOriginatorBankRows(originatorOrgId = '') {
    return getLocalPanelRows(originatorOrgId)
  },
})
