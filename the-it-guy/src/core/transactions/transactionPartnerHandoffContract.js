import {
  isBondFinanceType,
  normalizeFinanceManagedBy,
  normalizeFinanceType,
} from './financeType.js'

export const TRANSACTION_PARTNER_HANDOFF_CONTRACT_VERSION = 'arch9_transaction_partner_handoff_contract_v1'

const ATTORNEY_HANDOFF_ROLE_TYPES = new Set(['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
const PIPELINE_HANDOFF_ROLE_TYPES = new Set(['transfer_attorney', 'bond_originator'])

function text(value) {
  return String(value ?? '').trim()
}

function normalizeRoleType(value) {
  return text(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function getNestedPartner(selection = {}) {
  return selection?.partner && typeof selection.partner === 'object' ? selection.partner : {}
}

export function getTransactionRoleplayerOrganisationId(selection = {}) {
  const partner = getNestedPartner(selection)
  return text(
    selection.partnerOrganisationId ||
      selection.partner_organisation_id ||
      selection.organisationId ||
      selection.organisation_id ||
      selection.targetOrganisationId ||
      selection.target_organisation_id ||
      selection.assignedOrganisationId ||
      selection.assigned_organisation_id ||
      partner.partnerOrganisationId ||
      partner.partner_organisation_id ||
      partner.organisationId ||
      partner.organisation_id ||
      partner.targetOrganisationId ||
      partner.target_organisation_id,
  )
}

function getTransactionRoleplayerDisplay(selection = {}) {
  const partner = getNestedPartner(selection)
  return text(
    selection.partnerName ||
      selection.partner_name ||
      selection.companyName ||
      selection.company_name ||
      selection.contactPerson ||
      selection.contact_person ||
      selection.email ||
      selection.emailAddress ||
      selection.email_address ||
      partner.partnerName ||
      partner.partner_name ||
      partner.companyName ||
      partner.company_name ||
      partner.contactPerson ||
      partner.contact_person ||
      partner.email ||
      partner.emailAddress ||
      partner.email_address,
  )
}

export function isCanonicalTransactionPartnerHandoffSelection(selection = {}) {
  const roleType = normalizeRoleType(selection.roleType || selection.role_type)
  return PIPELINE_HANDOFF_ROLE_TYPES.has(roleType) && Boolean(getTransactionRoleplayerOrganisationId(selection))
}

export function resolveRequiredTransactionPartnerHandoffRoles({
  financeType = 'cash',
  financeManagedBy = 'bond_originator',
  requiredPartnerRoleTypes = [],
} = {}) {
  const explicit = Array.isArray(requiredPartnerRoleTypes)
    ? requiredPartnerRoleTypes.map(normalizeRoleType).filter(Boolean)
    : []
  if (explicit.length) return [...new Set(explicit)]

  const required = ['transfer_attorney']
  const normalizedFinanceType = normalizeFinanceType(financeType, { allowUnknown: true })
  const normalizedFinanceManagedBy = normalizeFinanceManagedBy(financeManagedBy)
  if (isBondFinanceType(normalizedFinanceType) && normalizedFinanceManagedBy === 'bond_originator') {
    required.push('bond_originator')
  }
  return required
}

export function buildTransactionPartnerHandoffContract({
  rolePlayers = [],
  financeType = 'cash',
  financeManagedBy = 'bond_originator',
  requiredPartnerRoleTypes = [],
  strict = false,
} = {}) {
  const selections = Array.isArray(rolePlayers) ? rolePlayers : []
  const normalizedSelections = selections
    .map((selection) => ({
      selection,
      roleType: normalizeRoleType(selection?.roleType || selection?.role_type),
      organisationId: getTransactionRoleplayerOrganisationId(selection),
      display: getTransactionRoleplayerDisplay(selection),
    }))
    .filter((selection) => PIPELINE_HANDOFF_ROLE_TYPES.has(selection.roleType))

  const requiredRoles = resolveRequiredTransactionPartnerHandoffRoles({
    financeType,
    financeManagedBy,
    requiredPartnerRoleTypes,
  })

  const checks = requiredRoles.map((roleType) => {
    const candidates = normalizedSelections.filter((selection) => selection.roleType === roleType)
    const canonical = candidates.find((selection) => selection.organisationId)
    const displayOnly = candidates.find((selection) => !selection.organisationId && selection.display)
    return {
      roleType,
      status: canonical ? 'complete' : 'blocked',
      organisationId: canonical?.organisationId || null,
      display: canonical?.display || displayOnly?.display || '',
      detail: canonical
        ? `${roleType.replaceAll('_', ' ')} has a canonical partner organisation.`
        : displayOnly
          ? `${displayOnly.display} was captured as text, but no partner organisation was linked.`
          : `No ${roleType.replaceAll('_', ' ')} partner organisation was selected.`,
    }
  })

  const displayOnlySelections = normalizedSelections
    .filter((selection) => selection.display && !selection.organisationId)
    .map((selection) => ({
      roleType: selection.roleType,
      display: selection.display,
      detail: `${selection.display} cannot receive a workspace handoff without an organisation id.`,
    }))

  const blockedChecks = checks.filter((check) => check.status === 'blocked')
  const issues = [
    ...blockedChecks.map((check) => ({
      roleType: check.roleType,
      severity: strict ? 'error' : 'warning',
      message:
        check.roleType === 'bond_originator'
          ? 'Select a connected bond originator partner before creating a bond-originator managed transaction.'
          : 'Select a connected transfer attorney partner before creating the transaction.',
      detail: check.detail,
    })),
    ...displayOnlySelections
      .filter((selection) => !blockedChecks.some((check) => check.roleType === selection.roleType))
      .map((selection) => ({
        roleType: selection.roleType,
        severity: strict ? 'error' : 'warning',
        message:
          ATTORNEY_HANDOFF_ROLE_TYPES.has(selection.roleType)
            ? 'A typed attorney name does not create attorney workspace access.'
            : 'A typed bond originator name does not create bond workspace access.',
        detail: selection.detail,
      })),
  ]

  const errors = issues.filter((issue) => issue.severity === 'error')

  return {
    version: TRANSACTION_PARTNER_HANDOFF_CONTRACT_VERSION,
    status: errors.length ? 'blocked' : issues.length ? 'needs_attention' : 'ready',
    strict: Boolean(strict),
    requiredRoles,
    checks,
    issues,
    errors,
  }
}

export function assertTransactionPartnerHandoffContract(input = {}) {
  const contract = buildTransactionPartnerHandoffContract({
    ...input,
    strict: true,
  })
  if (!contract.errors.length) return contract

  const error = new Error(
    [
      'Partner handoff is not ready.',
      ...contract.errors.map((issue) => `${issue.message} ${issue.detail}`),
    ].join(' '),
  )
  error.code = 'transaction_partner_handoff_blocked'
  error.contract = contract
  throw error
}
