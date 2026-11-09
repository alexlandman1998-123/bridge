// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { normalizeTextValue, normalizeNullableUuid, normalizeOptionalNumber, isMissingSchemaError, isMissingColumnError, isPermissionDeniedError, requireClient, normalizeOptionalDate } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from './profileNormalization.js'

export const DEFAULT_DEVELOPMENT_SETTINGS = {
  client_portal_enabled: true,
  snag_reporting_enabled: true,
  alteration_requests_enabled: false,
  service_reviews_enabled: false,
  reservation_deposit_enabled_by_default: false,
  reservation_deposit_amount: null,
  reservation_deposit_amount_type: 'fixed',
  reservation_deposit_vat_treatment: 'including_vat',
  reservation_deposit_due_trigger: 'on_reservation',
  reservation_deposit_treatment: 'credited_to_purchase_price',
  reservation_deposit_payable_to: 'developer',
  reservation_deposit_payment_details: {
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    branch_code: '',
    account_type: '',
    payment_reference_format: '',
    payment_instructions: '',
    vat_treatment: 'including_vat',
    due_trigger: 'on_reservation',
  },
  reservation_deposit_notification_recipients: [],
  default_alteration_charge_treatment: 'included_in_purchase_price',
  enabledModules: {
    agent: true,
    conveyancing: true,
    bond_originator: true,
  },
  stakeholderTeams: {
    agents: [],
    conveyancers: [],
    bondOriginators: [],
    developers: [],
    rolePlayerDefaults: {
      defaultAgentSource: 'first_agent',
      defaultAgentRelationshipId: '',
      defaultAgentPreferredPartnerId: '',
      defaultAgentName: '',
      multipleAgentsAllowed: true,
      developerSellingDirectly: false,
      defaultTransferAttorneySource: 'first_conveyancer',
      defaultBondOriginatorSource: 'first_bond_originator',
      defaultTransferAttorneyRelationshipId: '',
      defaultTransferAttorneyPreferredPartnerId: '',
      defaultTransferAttorneyName: '',
      defaultTransferAttorneyEmail: '',
      defaultBondOriginatorRelationshipId: '',
      defaultBondOriginatorPreferredPartnerId: '',
      defaultBondOriginatorName: '',
      defaultBondOriginatorEmail: '',
      buyerAppointedBondOriginatorAllowed: true,
      buyerAppointedBondOriginatorRequiresApproval: true,
      autoInviteSelectedBondOriginator: false,
    },
  },
}

export const ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS = [
  {
    key: 'attorney_invoice',
    label: 'Attorney Invoice',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 1,
  },
  {
    key: 'attorney_statement',
    label: 'Attorney Statement',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 2,
  },
  {
    key: 'registration_confirmation',
    label: 'Registration Confirmation',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 3,
  },
  {
    key: 'signed_transfer_documents',
    label: 'Signed Transfer Documents',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 4,
  },
  {
    key: 'financial_settlement_documents',
    label: 'Financial Settlement Documents',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 5,
  },
  {
    key: 'final_title_deed_copy',
    label: 'Final Title Deed Copy',
    requiredForCloseOut: false,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 6,
  },
]

export const DEFAULT_DEVELOPMENT_ATTORNEY_CONFIG = {
  id: null,
  developmentId: null,
  attorneyFirmName: '',
  attorneyFirmId: null,
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  feeModelType: 'fixed_fee',
  defaultFeeAmount: null,
  vatIncluded: true,
  disbursementsIncluded: false,
  overrideAllowed: true,
  notes: '',
  activeFrom: '',
  activeTo: '',
  isActive: true,
  requiredDocuments: ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => ({
    ...item,
  })),
}

export const BOND_CLOSEOUT_DOCUMENT_DEFINITIONS = [
  {
    key: 'commission_statement',
    label: 'Commission Statement',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToBondOriginator: true,
    internalOnly: false,
    sortOrder: 1,
  },
  {
    key: 'bond_approval_confirmation',
    label: 'Bond Approval Confirmation',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToBondOriginator: true,
    internalOnly: false,
    sortOrder: 2,
  },
  {
    key: 'commission_tax_invoice',
    label: 'Commission Tax Invoice',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToBondOriginator: true,
    internalOnly: false,
    sortOrder: 3,
  },
]

export const DEFAULT_DEVELOPMENT_BOND_CONFIG = {
  id: null,
  developmentId: null,
  bondOriginatorName: '',
  bondOriginatorId: null,
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  commissionModelType: 'fixed_fee',
  defaultCommissionAmount: null,
  vatIncluded: true,
  overrideAllowed: true,
  notes: '',
  activeFrom: '',
  activeTo: '',
  isActive: true,
  requiredDocuments: BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => ({
    ...item,
  })),
}

export function normalizeDevelopmentSettingChoice(value, allowedValues, fallback) {
  const normalized = String(value || '').trim()
  return allowedValues.includes(normalized) ? normalized : fallback
}

export function normalizeDevelopmentRolePlayerDefaults(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const developerSellingDirectly =
    source.developerSellingDirectly ??
    source.developer_selling_directly ??
    DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.developerSellingDirectly
  const defaultAgentSource = normalizeDevelopmentSettingChoice(
    source.defaultAgentSource || source.default_agent_source,
    ['first_agent', 'developer_partner_default', 'none'],
    developerSellingDirectly
      ? 'none'
      : DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.defaultAgentSource,
  )
  const multipleAgentsAllowed =
    source.multipleAgentsAllowed ??
    source.multiple_agents_allowed ??
    DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.multipleAgentsAllowed
  const defaultTransferAttorneySource = normalizeDevelopmentSettingChoice(
    source.defaultTransferAttorneySource || source.default_transfer_attorney_source,
    ['first_conveyancer', 'developer_partner_default', 'none'],
    DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.defaultTransferAttorneySource,
  )
  const defaultBondOriginatorSource = normalizeDevelopmentSettingChoice(
    source.defaultBondOriginatorSource || source.default_bond_originator_source,
    ['first_bond_originator', 'developer_partner_default', 'none'],
    DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.defaultBondOriginatorSource,
  )
  const buyerAppointedBondOriginatorAllowed =
    source.buyerAppointedBondOriginatorAllowed ??
    source.buyer_appointed_bond_originator_allowed ??
    DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.buyerAppointedBondOriginatorAllowed
  const buyerAppointedBondOriginatorRequiresApproval =
    source.buyerAppointedBondOriginatorRequiresApproval ??
    source.buyer_appointed_bond_originator_requires_approval ??
    DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.buyerAppointedBondOriginatorRequiresApproval
  const autoInviteSelectedBondOriginator =
    source.autoInviteSelectedBondOriginator ??
    source.auto_invite_selected_bond_originator ??
    DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams.rolePlayerDefaults.autoInviteSelectedBondOriginator

  return {
    defaultAgentSource: developerSellingDirectly ? 'none' : defaultAgentSource,
    defaultAgentRelationshipId: normalizeTextValue(
      source.defaultAgentRelationshipId || source.default_agent_relationship_id,
    ),
    defaultAgentPreferredPartnerId: normalizeTextValue(
      source.defaultAgentPreferredPartnerId || source.default_agent_preferred_partner_id,
    ),
    defaultAgentName: normalizeTextValue(source.defaultAgentName || source.default_agent_name),
    multipleAgentsAllowed: Boolean(multipleAgentsAllowed) && !developerSellingDirectly,
    developerSellingDirectly: Boolean(developerSellingDirectly),
    defaultTransferAttorneySource,
    defaultBondOriginatorSource,
    defaultTransferAttorneyRelationshipId: normalizeTextValue(
      source.defaultTransferAttorneyRelationshipId || source.default_transfer_attorney_relationship_id,
    ),
    defaultTransferAttorneyPreferredPartnerId: normalizeTextValue(
      source.defaultTransferAttorneyPreferredPartnerId || source.default_transfer_attorney_preferred_partner_id,
    ),
    defaultTransferAttorneyOrganisationId: normalizeNullableUuid(
      source.defaultTransferAttorneyOrganisationId || source.default_transfer_attorney_organisation_id,
    ),
    defaultTransferAttorneyName: normalizeTextValue(
      source.defaultTransferAttorneyName || source.default_transfer_attorney_name,
    ),
    defaultTransferAttorneyEmail: normalizeEmailAddress(
      source.defaultTransferAttorneyEmail || source.default_transfer_attorney_email,
    ),
    defaultBondOriginatorRelationshipId: normalizeTextValue(
      source.defaultBondOriginatorRelationshipId || source.default_bond_originator_relationship_id,
    ),
    defaultBondOriginatorPreferredPartnerId: normalizeTextValue(
      source.defaultBondOriginatorPreferredPartnerId || source.default_bond_originator_preferred_partner_id,
    ),
    defaultBondOriginatorOrganisationId: normalizeNullableUuid(
      source.defaultBondOriginatorOrganisationId || source.default_bond_originator_organisation_id,
    ),
    defaultBondOriginatorName: normalizeTextValue(
      source.defaultBondOriginatorName || source.default_bond_originator_name,
    ),
    defaultBondOriginatorEmail: normalizeEmailAddress(
      source.defaultBondOriginatorEmail || source.default_bond_originator_email,
    ),
    buyerAppointedBondOriginatorAllowed: Boolean(buyerAppointedBondOriginatorAllowed),
    buyerAppointedBondOriginatorRequiresApproval:
      Boolean(buyerAppointedBondOriginatorAllowed) && Boolean(buyerAppointedBondOriginatorRequiresApproval),
    autoInviteSelectedBondOriginator: Boolean(autoInviteSelectedBondOriginator),
  }
}

export function normalizeDevelopmentSettingsRow(row) {
  const enabledModules = {
    ...DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
    ...(row?.enabled_modules || row?.enabledModules || {}),
  }

  const rawTeams = row?.stakeholder_teams || row?.stakeholderTeams || {}
  const stakeholderTeams = {
    agents: Array.isArray(rawTeams.agents) ? rawTeams.agents : [],
    conveyancers: Array.isArray(rawTeams.conveyancers) ? rawTeams.conveyancers : [],
    bondOriginators: Array.isArray(rawTeams.bondOriginators || rawTeams.bond_originators)
      ? rawTeams.bondOriginators || rawTeams.bond_originators
      : [],
    developers: Array.isArray(rawTeams.developers) ? rawTeams.developers : [],
    rolePlayerDefaults: normalizeDevelopmentRolePlayerDefaults(
      rawTeams.rolePlayerDefaults || rawTeams.role_player_defaults,
    ),
  }

  const rawReservationDetails = row?.reservation_deposit_payment_details || row?.reservationDepositPaymentDetails || {}
  const reservationDepositVatTreatment = normalizeDevelopmentSettingChoice(
    row?.reservation_deposit_vat_treatment ??
      row?.reservationDepositVatTreatment ??
      rawReservationDetails.vat_treatment ??
      rawReservationDetails.vatTreatment,
    ['including_vat', 'excluding_vat'],
    DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_vat_treatment,
  )
  const reservationDepositDueTrigger = normalizeDevelopmentSettingChoice(
    row?.reservation_deposit_due_trigger ??
      row?.reservationDepositDueTrigger ??
      rawReservationDetails.due_trigger ??
      rawReservationDetails.dueTrigger,
    ['on_reservation'],
    DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_due_trigger,
  )
  const reservationDepositPaymentDetails = {
    account_holder_name: normalizeTextValue(
      rawReservationDetails.account_holder_name || rawReservationDetails.accountHolderName,
    ),
    bank_name: normalizeTextValue(rawReservationDetails.bank_name || rawReservationDetails.bankName),
    account_number: normalizeTextValue(rawReservationDetails.account_number || rawReservationDetails.accountNumber),
    branch_code: normalizeTextValue(rawReservationDetails.branch_code || rawReservationDetails.branchCode),
    account_type: normalizeTextValue(rawReservationDetails.account_type || rawReservationDetails.accountType),
    payment_reference_format: normalizeTextValue(
      rawReservationDetails.payment_reference_format || rawReservationDetails.paymentReferenceFormat,
    ),
    payment_instructions: normalizeTextValue(
      rawReservationDetails.payment_instructions || rawReservationDetails.paymentInstructions,
    ),
    vat_treatment: reservationDepositVatTreatment,
    due_trigger: reservationDepositDueTrigger,
  }
  const reservationDepositNotificationRecipients = Array.isArray(
    row?.reservation_deposit_notification_recipients || row?.reservationDepositNotificationRecipients,
  )
    ? (row.reservation_deposit_notification_recipients || row.reservationDepositNotificationRecipients)
        .map((value) => normalizeEmailAddress(value))
        .filter(Boolean)
    : []
  const reservationDepositAmount = normalizeOptionalNumber(
    row?.reservation_deposit_amount ?? row?.reservationDepositAmount,
  )
  const reservationDepositAmountType = normalizeDevelopmentSettingChoice(
    row?.reservation_deposit_amount_type ?? row?.reservationDepositAmountType,
    ['fixed', 'percentage'],
    DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_amount_type,
  )
  const reservationDepositTreatment = normalizeDevelopmentSettingChoice(
    row?.reservation_deposit_treatment ?? row?.reservationDepositTreatment,
    ['credited_to_purchase_price', 'separate_invoice', 'refundable_hold'],
    DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_treatment,
  )
  const reservationDepositPayableTo = normalizeDevelopmentSettingChoice(
    row?.reservation_deposit_payable_to ?? row?.reservationDepositPayableTo,
    ['developer', 'agency_trust', 'attorney_trust'],
    DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payable_to,
  )
  const defaultAlterationChargeTreatment = normalizeDevelopmentSettingChoice(
    row?.default_alteration_charge_treatment ?? row?.defaultAlterationChargeTreatment,
    ['included_in_purchase_price', 'separate_invoice', 'no_charge'],
    DEFAULT_DEVELOPMENT_SETTINGS.default_alteration_charge_treatment,
  )
  const reservationDepositEnabledByDefault =
    row?.reservation_deposit_enabled_by_default === true || row?.reservationDepositEnabledByDefault === true

  return {
    ...DEFAULT_DEVELOPMENT_SETTINGS,
    ...row,
    enabledModules,
    stakeholderTeams,
    reservation_deposit_enabled_by_default: reservationDepositEnabledByDefault,
    reservation_deposit_amount: reservationDepositAmount,
    reservation_deposit_amount_type: reservationDepositAmountType,
    reservation_deposit_vat_treatment: reservationDepositVatTreatment,
    reservation_deposit_due_trigger: reservationDepositDueTrigger,
    reservation_deposit_treatment: reservationDepositTreatment,
    reservation_deposit_payable_to: reservationDepositPayableTo,
    reservation_deposit_payment_details: reservationDepositPaymentDetails,
    reservation_deposit_notification_recipients: reservationDepositNotificationRecipients,
    default_alteration_charge_treatment: defaultAlterationChargeTreatment,
    rolePlayerDefaults: stakeholderTeams.rolePlayerDefaults,
    reservationDepositEnabledByDefault: reservationDepositEnabledByDefault,
    reservationDepositAmount: reservationDepositAmount,
    reservationDepositAmountType: reservationDepositAmountType,
    reservationDepositVatTreatment: reservationDepositVatTreatment,
    reservationDepositDueTrigger: reservationDepositDueTrigger,
    reservationDepositTreatment: reservationDepositTreatment,
    reservationDepositPayableTo: reservationDepositPayableTo,
    reservationDepositPaymentDetails: reservationDepositPaymentDetails,
    reservationDepositNotificationRecipients: reservationDepositNotificationRecipients,
    defaultAlterationChargeTreatment,
  }
}

export async function fetchDevelopmentFeatureFlags(client, developmentId) {
  if (!developmentId) {
    return null
  }

  const { data, error } = await client
    .from('developments')
    .select('id, snag_tracking_enabled, alterations_enabled')
    .eq('id', developmentId)
    .maybeSingle()

  if (error) {
    if (
      isMissingSchemaError(error) ||
      isMissingColumnError(error, 'snag_tracking_enabled') ||
      isMissingColumnError(error, 'alterations_enabled') ||
      isPermissionDeniedError(error)
    ) {
      return null
    }

    throw error
  }

  return data || null
}

export async function ensureDevelopmentSettings(client, developmentId, { createIfMissing = false } = {}) {
  if (!developmentId) {
    return DEFAULT_DEVELOPMENT_SETTINGS
  }

  const developmentFeatureFlags = await fetchDevelopmentFeatureFlags(client, developmentId)
  const fallbackSnagSetting =
    developmentFeatureFlags?.snag_tracking_enabled === null ||
    developmentFeatureFlags?.snag_tracking_enabled === undefined
      ? DEFAULT_DEVELOPMENT_SETTINGS.snag_reporting_enabled
      : Boolean(developmentFeatureFlags.snag_tracking_enabled)
  const fallbackAlterationSetting =
    developmentFeatureFlags?.alterations_enabled === null || developmentFeatureFlags?.alterations_enabled === undefined
      ? DEFAULT_DEVELOPMENT_SETTINGS.alteration_requests_enabled
      : Boolean(developmentFeatureFlags.alterations_enabled)

  const { data, error } = await client
    .from('development_settings')
    .select(
      'development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_amount_type, reservation_deposit_treatment, reservation_deposit_payable_to, reservation_deposit_payment_details, reservation_deposit_notification_recipients, default_alteration_charge_treatment, enabled_modules, stakeholder_teams',
    )
    .eq('development_id', developmentId)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (
      isMissingSchemaError(error) ||
      isMissingColumnError(error, 'enabled_modules') ||
      isMissingColumnError(error, 'reservation_deposit_enabled_by_default') ||
      isMissingColumnError(error, 'reservation_deposit_amount') ||
      isMissingColumnError(error, 'reservation_deposit_amount_type') ||
      isMissingColumnError(error, 'reservation_deposit_treatment') ||
      isMissingColumnError(error, 'reservation_deposit_payable_to') ||
      isMissingColumnError(error, 'reservation_deposit_payment_details') ||
      isMissingColumnError(error, 'reservation_deposit_notification_recipients') ||
      isMissingColumnError(error, 'default_alteration_charge_treatment') ||
      isPermissionDeniedError(error)
    ) {
      return {
        ...DEFAULT_DEVELOPMENT_SETTINGS,
        snag_reporting_enabled: fallbackSnagSetting,
        alteration_requests_enabled: fallbackAlterationSetting,
      }
    }

    throw error
  }

  if (data) {
    const normalized = normalizeDevelopmentSettingsRow(data)
    const merged = {
      ...normalized,
      snag_reporting_enabled: fallbackSnagSetting,
      alteration_requests_enabled: fallbackAlterationSetting,
    }

    if (createIfMissing && (
      normalized.snag_reporting_enabled !== merged.snag_reporting_enabled ||
      normalized.alteration_requests_enabled !== merged.alteration_requests_enabled
    )) {
      try {
        await client
          .from('development_settings')
          .update({
            snag_reporting_enabled: merged.snag_reporting_enabled,
            alteration_requests_enabled: merged.alteration_requests_enabled,
          })
          .eq('development_id', developmentId)
      } catch (syncError) {
        if (!(isMissingSchemaError(syncError) || isPermissionDeniedError(syncError))) {
          throw syncError
        }
      }
    }

    return merged
  }

  if (!createIfMissing) {
    return {
      ...DEFAULT_DEVELOPMENT_SETTINGS,
      snag_reporting_enabled: fallbackSnagSetting,
      alteration_requests_enabled: fallbackAlterationSetting,
    }
  }

  const { data: inserted, error: insertError } = await client
    .from('development_settings')
    .insert({
      development_id: developmentId,
      client_portal_enabled: DEFAULT_DEVELOPMENT_SETTINGS.client_portal_enabled,
      snag_reporting_enabled: fallbackSnagSetting,
      alteration_requests_enabled: fallbackAlterationSetting,
      service_reviews_enabled: DEFAULT_DEVELOPMENT_SETTINGS.service_reviews_enabled,
      reservation_deposit_enabled_by_default: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_enabled_by_default,
      reservation_deposit_amount: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_amount,
      reservation_deposit_amount_type: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_amount_type,
      reservation_deposit_treatment: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_treatment,
      reservation_deposit_payable_to: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payable_to,
      reservation_deposit_payment_details: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payment_details,
      reservation_deposit_notification_recipients:
        DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_notification_recipients,
      default_alteration_charge_treatment: DEFAULT_DEVELOPMENT_SETTINGS.default_alteration_charge_treatment,
      enabled_modules: DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
      stakeholder_teams: DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams,
    })
    .select(
      'development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_amount_type, reservation_deposit_treatment, reservation_deposit_payable_to, reservation_deposit_payment_details, reservation_deposit_notification_recipients, default_alteration_charge_treatment, enabled_modules, stakeholder_teams',
    )
    .single()

  if (insertError) {
    if (
      isMissingSchemaError(insertError) ||
      isMissingColumnError(insertError, 'enabled_modules') ||
      isMissingColumnError(insertError, 'reservation_deposit_enabled_by_default') ||
      isMissingColumnError(insertError, 'reservation_deposit_amount') ||
      isMissingColumnError(insertError, 'reservation_deposit_amount_type') ||
      isMissingColumnError(insertError, 'reservation_deposit_treatment') ||
      isMissingColumnError(insertError, 'reservation_deposit_payable_to') ||
      isMissingColumnError(insertError, 'reservation_deposit_payment_details') ||
      isMissingColumnError(insertError, 'reservation_deposit_notification_recipients') ||
      isMissingColumnError(insertError, 'default_alteration_charge_treatment') ||
      isPermissionDeniedError(insertError)
    ) {
      return {
        ...DEFAULT_DEVELOPMENT_SETTINGS,
        snag_reporting_enabled: fallbackSnagSetting,
        alteration_requests_enabled: fallbackAlterationSetting,
      }
    }

    throw insertError
  }

  return normalizeDevelopmentSettingsRow(inserted)
}

export async function fetchDevelopmentSettings(developmentId) {
  const client = requireClient()
  return ensureDevelopmentSettings(client, developmentId)
}

export function normalizeDevelopmentAttorneyDocumentRow(row = {}) {
  const fallback =
    ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) ||
    {}

  return {
    id: row.id || null,
    key: row.document_type_key || row.key || fallback.key || '',
    label: row.label || fallback.label || 'Close-Out Document',
    requiredForCloseOut: row.required_for_close_out ?? fallback.requiredForCloseOut ?? true,
    visibleToDeveloper: row.visible_to_developer ?? fallback.visibleToDeveloper ?? true,
    visibleToAttorney: row.visible_to_attorney ?? fallback.visibleToAttorney ?? true,
    internalOnly: row.internal_only ?? fallback.internalOnly ?? false,
    sortOrder: Number(row.sort_order ?? fallback.sortOrder ?? 0),
    isActive: row.is_active ?? true,
  }
}

export function buildDefaultDevelopmentAttorneyDocuments() {
  return ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => normalizeDevelopmentAttorneyDocumentRow(item))
}

export function normalizeDevelopmentAttorneyConfigRow(row = null, documents = []) {
  const normalizedDocuments = documents.length
    ? documents.map((item) => normalizeDevelopmentAttorneyDocumentRow(item)).sort((a, b) => a.sortOrder - b.sortOrder)
    : buildDefaultDevelopmentAttorneyDocuments()

  return {
    ...DEFAULT_DEVELOPMENT_ATTORNEY_CONFIG,
    id: row?.id || null,
    developmentId: row?.development_id || row?.developmentId || null,
    attorneyFirmName: normalizeTextValue(row?.attorney_firm_name || row?.attorneyFirmName),
    attorneyFirmId: row?.attorney_firm_id || row?.attorneyFirmId || null,
    primaryContactName: normalizeTextValue(row?.primary_contact_name || row?.primaryContactName),
    primaryContactEmail: normalizeTextValue(row?.primary_contact_email || row?.primaryContactEmail),
    primaryContactPhone: normalizeTextValue(row?.primary_contact_phone || row?.primaryContactPhone),
    feeModelType: normalizeTextValue(row?.fee_model_type || row?.feeModelType) || 'fixed_fee',
    defaultFeeAmount: normalizeOptionalNumber(row?.default_fee_amount ?? row?.defaultFeeAmount),
    vatIncluded: row?.vat_included ?? row?.vatIncluded ?? true,
    disbursementsIncluded: row?.disbursements_included ?? row?.disbursementsIncluded ?? false,
    overrideAllowed: row?.override_allowed ?? row?.overrideAllowed ?? true,
    notes: normalizeTextValue(row?.notes),
    activeFrom: normalizeOptionalDate(row?.active_from ?? row?.activeFrom) || '',
    activeTo: normalizeOptionalDate(row?.active_to ?? row?.activeTo) || '',
    isActive: row?.is_active ?? row?.isActive ?? true,
    requiredDocuments: normalizedDocuments,
  }
}

export async function fetchDevelopmentAttorneyConfig(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return normalizeDevelopmentAttorneyConfigRow(null, [])
  }

  const { data, error } = await client
    .from('development_attorney_configs')
    .select(
      'id, development_id, attorney_firm_name, attorney_firm_id, primary_contact_name, primary_contact_email, primary_contact_phone, fee_model_type, default_fee_amount, vat_included, disbursements_included, override_allowed, notes, active_from, active_to, is_active',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return normalizeDevelopmentAttorneyConfigRow({ development_id: developmentId }, [])
    }

    throw error
  }

  if (!data) {
    return normalizeDevelopmentAttorneyConfigRow({ development_id: developmentId }, [])
  }

  const { data: docs, error: docsError } = await client
    .from('development_attorney_required_closeout_docs')
    .select(
      'id, development_attorney_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_attorney, internal_only, sort_order, is_active',
    )
    .eq('development_attorney_config_id', data.id)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError) || isPermissionDeniedError(docsError)) {
      return normalizeDevelopmentAttorneyConfigRow(data, [])
    }

    throw docsError
  }

  return normalizeDevelopmentAttorneyConfigRow(data, docs || [])
}

export function normalizeDevelopmentBondDocumentRow(row = {}) {
  const fallback =
    BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) || {}

  return {
    id: row.id || null,
    key: row.document_type_key || row.key || fallback.key || '',
    label: row.label || fallback.label || 'Commission Document',
    requiredForCloseOut: row.required_for_close_out ?? fallback.requiredForCloseOut ?? true,
    visibleToDeveloper: row.visible_to_developer ?? fallback.visibleToDeveloper ?? true,
    visibleToBondOriginator: row.visible_to_bond_originator ?? fallback.visibleToBondOriginator ?? true,
    internalOnly: row.internal_only ?? fallback.internalOnly ?? false,
    sortOrder: Number(row.sort_order ?? fallback.sortOrder ?? 0),
    isActive: row.is_active ?? true,
  }
}

export function buildDefaultDevelopmentBondDocuments() {
  return BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => normalizeDevelopmentBondDocumentRow(item))
}

export function normalizeDevelopmentBondConfigRow(row = null, documents = []) {
  const normalizedDocuments = documents.length
    ? documents.map((item) => normalizeDevelopmentBondDocumentRow(item)).sort((a, b) => a.sortOrder - b.sortOrder)
    : buildDefaultDevelopmentBondDocuments()

  return {
    ...DEFAULT_DEVELOPMENT_BOND_CONFIG,
    id: row?.id || null,
    developmentId: row?.development_id || row?.developmentId || null,
    bondOriginatorName: normalizeTextValue(row?.bond_originator_name || row?.bondOriginatorName),
    bondOriginatorId: row?.bond_originator_id || row?.bondOriginatorId || null,
    primaryContactName: normalizeTextValue(row?.primary_contact_name || row?.primaryContactName),
    primaryContactEmail: normalizeTextValue(row?.primary_contact_email || row?.primaryContactEmail),
    primaryContactPhone: normalizeTextValue(row?.primary_contact_phone || row?.primaryContactPhone),
    commissionModelType: normalizeTextValue(row?.commission_model_type || row?.commissionModelType) || 'fixed_fee',
    defaultCommissionAmount: normalizeOptionalNumber(row?.default_commission_amount ?? row?.defaultCommissionAmount),
    vatIncluded: row?.vat_included ?? row?.vatIncluded ?? true,
    overrideAllowed: row?.override_allowed ?? row?.overrideAllowed ?? true,
    notes: normalizeTextValue(row?.notes),
    activeFrom: normalizeOptionalDate(row?.active_from ?? row?.activeFrom) || '',
    activeTo: normalizeOptionalDate(row?.active_to ?? row?.activeTo) || '',
    isActive: row?.is_active ?? row?.isActive ?? true,
    requiredDocuments: normalizedDocuments,
  }
}

export async function fetchDevelopmentBondConfig(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return normalizeDevelopmentBondConfigRow(null, [])
  }

  const { data, error } = await client
    .from('development_bond_configs')
    .select(
      'id, development_id, bond_originator_name, bond_originator_id, primary_contact_name, primary_contact_email, primary_contact_phone, commission_model_type, default_commission_amount, vat_included, override_allowed, notes, active_from, active_to, is_active',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return normalizeDevelopmentBondConfigRow({ development_id: developmentId }, [])
    }
    throw error
  }

  if (!data) {
    return normalizeDevelopmentBondConfigRow({ development_id: developmentId }, [])
  }

  const { data: docs, error: docsError } = await client
    .from('development_bond_required_closeout_docs')
    .select(
      'id, development_bond_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_bond_originator, internal_only, sort_order, is_active',
    )
    .eq('development_bond_config_id', data.id)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError) || isPermissionDeniedError(docsError)) {
      return normalizeDevelopmentBondConfigRow(data, [])
    }
    throw docsError
  }

  return normalizeDevelopmentBondConfigRow(data, docs || [])
}
