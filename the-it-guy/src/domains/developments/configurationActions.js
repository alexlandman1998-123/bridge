// Settings and managed default participants commit together through the database.
import { DEVELOPMENT_TEAM_ROLE_MAP, normalizeStakeholderTeamParticipant } from './participantReadApi.js'
import { normalizeNullableText, isMissingColumnError, isMissingTableError, isMissingSchemaError, requireClient, normalizeOptionalNumber, isPermissionDeniedError, normalizeOptionalDate, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from './profileNormalization.js'
import { normalizeDevelopmentSettingsRow, DEFAULT_DEVELOPMENT_SETTINGS, normalizeDevelopmentRolePlayerDefaults, buildDefaultDevelopmentAttorneyDocuments, ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS, normalizeDevelopmentAttorneyDocumentRow, normalizeDevelopmentAttorneyConfigRow, buildDefaultDevelopmentBondDocuments, BOND_CLOSEOUT_DOCUMENT_DEFINITIONS, normalizeDevelopmentBondDocumentRow, normalizeDevelopmentBondConfigRow } from './configurationApi.js'
import { upsertByDevelopmentIdWithFallback } from './persistenceHelpers.js'

export function buildDevelopmentParticipantRowsFromTeams(stakeholderTeams = {}) {
  const rows = []

  for (const [teamKey, definition] of Object.entries(DEVELOPMENT_TEAM_ROLE_MAP)) {
    const members = Array.isArray(stakeholderTeams?.[teamKey]) ? stakeholderTeams[teamKey] : []
    for (const member of members) {
      const normalized = normalizeStakeholderTeamParticipant(member, teamKey)
      if (!normalized) {
        continue
      }

      rows.push({
        role_type: definition.roleType,
        participant_name: normalizeNullableText(normalized.participantName),
        participant_email: normalizeNullableText(normalized.participantEmail) || null,
        organisation_name: normalizeNullableText(normalized.organisationName),
        is_primary: false,
        can_view: true,
        can_create_transactions: definition.roleType === 'agent',
        assignment_source: 'development_default',
        is_active: true,
      })
    }
  }

  return rows
}

export async function syncDevelopmentParticipantsFromSettings(
  client, { developmentId, stakeholderTeams = {}, settingsPayload = null } = {},
) {
  if (!developmentId) throw new Error('Development is required.')

  const desiredRows = buildDevelopmentParticipantRowsFromTeams(stakeholderTeams)
  const profileIdByEmail = await resolveProfileIdsByEmail(
    client, desiredRows.map((row) => row.participant_email).filter(Boolean),
  )
  const rowsWithUsers = desiredRows.map((row) => ({
    ...row,
    user_id: row.participant_email ? profileIdByEmail[row.participant_email] || null : null,
  }))
  // The settings and replacement assignments commit together. There is no
  // browser-side delete fallback: a failed insert must leave the old team intact.
  const { data, error } = await client.rpc('bridge_save_development_settings', {
    target_development_id: developmentId,
    settings_patch: settingsPayload,
    default_participants: rowsWithUsers,
  })
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) {
      throw Object.assign(new Error(
        'Development settings could not be saved because this workspace needs a database update. Please contact your administrator.',
        { cause: error },
      ), { code: error.code })
    }
    throw error
  }
  if (data?.development_id !== developmentId || data?.participants_saved !== rowsWithUsers.length) {
    throw new Error('The saved development settings and team assignments could not be confirmed.')
  }
  return data.settings
}

export async function syncPrimaryAttorneyDevelopmentParticipant(
  client,
  { developmentId, attorneyFirmName = '', primaryContactName = '', primaryContactEmail = '' } = {},
) {
  if (!developmentId) {
    return
  }

  const normalizedEmail = normalizeEmailAddress(primaryContactEmail)
  const participantName = normalizeNullableText(primaryContactName || attorneyFirmName)
  const organisationName = normalizeNullableText(attorneyFirmName)

  let listQuery = await client
    .from('development_participants')
    .select('id, participant_email, participant_name, assignment_source, is_primary')
    .eq('development_id', developmentId)
    .eq('role_type', 'attorney')

  if (
    listQuery.error &&
    (isMissingColumnError(listQuery.error, 'assignment_source') || isMissingColumnError(listQuery.error, 'is_primary'))
  ) {
    listQuery = await client
      .from('development_participants')
      .select('id, participant_email, participant_name')
      .eq('development_id', developmentId)
      .eq('role_type', 'attorney')
  }

  if (listQuery.error) {
    if (isMissingTableError(listQuery.error, 'development_participants') || isMissingSchemaError(listQuery.error)) {
      return
    }
    throw listQuery.error
  }

  const existingRows = listQuery.data || []

  if (!normalizedEmail && !participantName) {
    if (!existingRows.length) {
      return
    }

    const resetResult = await client
      .from('development_participants')
      .update({ is_primary: false })
      .eq('development_id', developmentId)
      .eq('role_type', 'attorney')
    if (
      resetResult.error &&
      !isMissingSchemaError(resetResult.error) &&
      !isMissingColumnError(resetResult.error, 'is_primary')
    ) {
      throw resetResult.error
    }
    return
  }

  const profileIdByEmail = await resolveProfileIdsByEmail(client, normalizedEmail ? [normalizedEmail] : [])
  const userId = normalizedEmail ? profileIdByEmail[normalizedEmail] || null : null
  const matched =
    existingRows.find((row) => normalizeEmailAddress(row.participant_email) === normalizedEmail) ||
    existingRows.find((row) => String(row.participant_name || '').trim() === String(participantName || '').trim()) ||
    null

  const payload = {
    development_id: developmentId,
    user_id: userId,
    role_type: 'attorney',
    participant_name: participantName,
    participant_email: normalizedEmail || null,
    organisation_name: organisationName,
    is_primary: true,
    can_view: true,
    can_create_transactions: false,
    assignment_source: 'development_default',
    is_active: true,
  }

  if (matched?.id) {
    let updateResult = await client.from('development_participants').update(payload).eq('id', matched.id)

    if (
      updateResult.error &&
      (isMissingColumnError(updateResult.error, 'user_id') ||
        isMissingColumnError(updateResult.error, 'organisation_name') ||
        isMissingColumnError(updateResult.error, 'assignment_source') ||
        isMissingColumnError(updateResult.error, 'can_create_transactions') ||
        isMissingColumnError(updateResult.error, 'is_active'))
    ) {
      const fallbackPayload = {
        role_type: 'attorney',
        participant_name: participantName,
        participant_email: normalizedEmail || null,
      }
      updateResult = await client.from('development_participants').update(fallbackPayload).eq('id', matched.id)
    }

    if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
      throw updateResult.error
    }
  } else {
    let insertResult = await client.from('development_participants').insert(payload)

    if (
      insertResult.error &&
      (isMissingColumnError(insertResult.error, 'user_id') ||
        isMissingColumnError(insertResult.error, 'organisation_name') ||
        isMissingColumnError(insertResult.error, 'assignment_source') ||
        isMissingColumnError(insertResult.error, 'can_create_transactions') ||
        isMissingColumnError(insertResult.error, 'is_active'))
    ) {
      insertResult = await client.from('development_participants').insert({
        development_id: developmentId,
        role_type: 'attorney',
        participant_name: participantName,
        participant_email: normalizedEmail || null,
      })
    }

    if (insertResult.error && !isMissingSchemaError(insertResult.error)) {
      throw insertResult.error
    }
  }

  if (existingRows.length && (matched?.id || normalizedEmail)) {
    let clearPrimaryQuery = client
      .from('development_participants')
      .update({ is_primary: false })
      .eq('development_id', developmentId)
      .eq('role_type', 'attorney')

    if (matched?.id) {
      clearPrimaryQuery = clearPrimaryQuery.neq('id', matched.id)
    } else if (normalizedEmail) {
      clearPrimaryQuery = clearPrimaryQuery.neq('participant_email', normalizedEmail)
    }

    const clearPrimaryResult = await clearPrimaryQuery
    if (
      clearPrimaryResult.error &&
      !isMissingSchemaError(clearPrimaryResult.error) &&
      !isMissingColumnError(clearPrimaryResult.error, 'is_primary')
    ) {
      throw clearPrimaryResult.error
    }
  }
}

export async function updateDevelopmentSettings(developmentId, settings) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const payload = {
    development_id: developmentId,
    client_portal_enabled: Boolean(settings.client_portal_enabled),
    snag_reporting_enabled: Boolean(settings.snag_reporting_enabled),
    alteration_requests_enabled: Boolean(settings.alteration_requests_enabled),
    service_reviews_enabled: Boolean(settings.service_reviews_enabled),
    reservation_deposit_enabled_by_default: Boolean(
      settings.reservation_deposit_enabled_by_default ?? settings.reservationDepositEnabledByDefault,
    ),
    reservation_deposit_amount: normalizeOptionalNumber(
      settings.reservation_deposit_amount ?? settings.reservationDepositAmount,
    ),
    reservation_deposit_amount_type: normalizeDevelopmentSettingsRow({
      reservation_deposit_amount_type:
        settings.reservation_deposit_amount_type || settings.reservationDepositAmountType,
    }).reservation_deposit_amount_type,
    reservation_deposit_treatment: normalizeDevelopmentSettingsRow({
      reservation_deposit_treatment: settings.reservation_deposit_treatment || settings.reservationDepositTreatment,
    }).reservation_deposit_treatment,
    reservation_deposit_payable_to: normalizeDevelopmentSettingsRow({
      reservation_deposit_payable_to: settings.reservation_deposit_payable_to || settings.reservationDepositPayableTo,
    }).reservation_deposit_payable_to,
    reservation_deposit_payment_details: normalizeDevelopmentSettingsRow({
      reservation_deposit_payment_details:
        {
          ...(settings.reservation_deposit_payment_details || settings.reservationDepositPaymentDetails || {}),
          vat_treatment:
            settings.reservation_deposit_vat_treatment ||
            settings.reservationDepositVatTreatment ||
            settings.vatTreatment,
          due_trigger:
            settings.reservation_deposit_due_trigger ||
            settings.reservationDepositDueTrigger ||
            settings.dueTrigger,
        },
    }).reservation_deposit_payment_details,
    reservation_deposit_notification_recipients: normalizeDevelopmentSettingsRow({
      reservation_deposit_notification_recipients:
        settings.reservation_deposit_notification_recipients || settings.reservationDepositNotificationRecipients,
    }).reservation_deposit_notification_recipients,
    default_alteration_charge_treatment: normalizeDevelopmentSettingsRow({
      default_alteration_charge_treatment:
        settings.default_alteration_charge_treatment || settings.defaultAlterationChargeTreatment,
    }).default_alteration_charge_treatment,
    enabled_modules: {
      ...DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
      ...(settings.enabledModules || settings.enabled_modules || {}),
    },
    stakeholder_teams: {
      agents: Array.isArray(settings.stakeholderTeams?.agents || settings.stakeholder_teams?.agents)
        ? settings.stakeholderTeams?.agents || settings.stakeholder_teams?.agents
        : [],
      conveyancers: Array.isArray(settings.stakeholderTeams?.conveyancers || settings.stakeholder_teams?.conveyancers)
        ? settings.stakeholderTeams?.conveyancers || settings.stakeholder_teams?.conveyancers
        : [],
      bondOriginators: Array.isArray(
        settings.stakeholderTeams?.bondOriginators ||
          settings.stakeholder_teams?.bondOriginators ||
          settings.stakeholder_teams?.bond_originators,
      )
        ? settings.stakeholderTeams?.bondOriginators ||
          settings.stakeholder_teams?.bondOriginators ||
          settings.stakeholder_teams?.bond_originators
        : [],
      developers: Array.isArray(settings.stakeholderTeams?.developers || settings.stakeholder_teams?.developers)
        ? settings.stakeholderTeams?.developers || settings.stakeholder_teams?.developers
        : [],
      rolePlayerDefaults: normalizeDevelopmentRolePlayerDefaults(
        settings.rolePlayerDefaults ||
          settings.role_player_defaults ||
          settings.stakeholderTeams?.rolePlayerDefaults ||
          settings.stakeholderTeams?.role_player_defaults ||
          settings.stakeholder_teams?.rolePlayerDefaults ||
          settings.stakeholder_teams?.role_player_defaults,
      ),
    },
  }

  const normalized = normalizeDevelopmentSettingsRow(payload)
  const savedSettings = await syncDevelopmentParticipantsFromSettings(client, {
    developmentId,
    stakeholderTeams: normalized.stakeholderTeams,
    settingsPayload: payload,
  })
  if (savedSettings?.development_id !== developmentId) {
    throw new Error('The saved development settings could not be confirmed.')
  }
  return normalizeDevelopmentSettingsRow(savedSettings)
}

export async function syncDevelopmentAttorneyRequiredDocs(client, configId, selectedDocuments = []) {
  if (!configId) {
    return buildDefaultDevelopmentAttorneyDocuments()
  }

  const selectedKeys = new Set(
    (selectedDocuments.length ? selectedDocuments : buildDefaultDevelopmentAttorneyDocuments())
      .filter((item) => item.isActive !== false)
      .map((item) => item.key),
  )

  const payload = ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.map((definition) => ({
    development_attorney_config_id: configId,
    document_type_key: definition.key,
    label: definition.label,
    required_for_close_out: selectedKeys.has(definition.key),
    visible_to_developer: definition.visibleToDeveloper,
    visible_to_attorney: definition.visibleToAttorney,
    internal_only: definition.internalOnly,
    sort_order: definition.sortOrder,
    is_active: true,
  }))

  const { error } = await client.from('development_attorney_required_closeout_docs').upsert(payload, {
    onConflict: 'development_attorney_config_id,document_type_key',
  })

  if (error) {
    if (isMissingSchemaError(error)) {
      return buildDefaultDevelopmentAttorneyDocuments()
    }

    throw error
  }

  const { data, error: docsError } = await client
    .from('development_attorney_required_closeout_docs')
    .select(
      'id, development_attorney_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_attorney, internal_only, sort_order, is_active',
    )
    .eq('development_attorney_config_id', configId)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return buildDefaultDevelopmentAttorneyDocuments()
    }

    throw docsError
  }

  return (data || []).map((item) => normalizeDevelopmentAttorneyDocumentRow(item))
}

export async function saveDevelopmentAttorneyConfig(developmentId, input = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const payload = {
    development_id: developmentId,
    attorney_firm_name: normalizeNullableText(input.attorneyFirmName),
    attorney_firm_id: input.attorneyFirmId || null,
    primary_contact_name: normalizeNullableText(input.primaryContactName),
    primary_contact_email: normalizeNullableText(input.primaryContactEmail)?.toLowerCase() || null,
    primary_contact_phone: normalizeNullableText(input.primaryContactPhone),
    fee_model_type: 'fixed_fee',
    default_fee_amount: normalizeOptionalNumber(input.defaultFeeAmount),
    vat_included: Boolean(input.vatIncluded),
    disbursements_included: Boolean(input.disbursementsIncluded),
    override_allowed: Boolean(input.overrideAllowed),
    notes: normalizeNullableText(input.notes),
    active_from: normalizeOptionalDate(input.activeFrom),
    active_to: normalizeOptionalDate(input.activeTo),
    is_active: input.isActive !== false,
  }

  const { data, error } = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_attorney_configs',
    payload,
    selectClause:
      'id, development_id, attorney_firm_name, attorney_firm_id, primary_contact_name, primary_contact_email, primary_contact_phone, fee_model_type, default_fee_amount, vat_included, disbursements_included, override_allowed, notes, active_from, active_to, is_active',
    expectSingleRow: true,
  })

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Attorney commercial setup tables are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  const requiredDocuments = await syncDevelopmentAttorneyRequiredDocs(
    client,
    data.id,
    Array.isArray(input.requiredDocuments) ? input.requiredDocuments : [],
  )

  try {
    await syncPrimaryAttorneyDevelopmentParticipant(client, {
      developmentId,
      attorneyFirmName: payload.attorney_firm_name || '',
      primaryContactName: payload.primary_contact_name || '',
      primaryContactEmail: payload.primary_contact_email || '',
    })
  } catch (participantSyncError) {
    if (!isPermissionDeniedError(participantSyncError)) {
      throw participantSyncError
    }
    console.warn(
      '[Developments] Primary attorney participant was not synced because development_participants RLS blocked the write.',
      participantSyncError,
    )
  }

  return normalizeDevelopmentAttorneyConfigRow(data, requiredDocuments)
}

export async function syncDevelopmentBondRequiredDocs(client, configId, selectedDocuments = []) {
  if (!configId) {
    return buildDefaultDevelopmentBondDocuments()
  }

  const selectedKeys = new Set(
    (selectedDocuments.length ? selectedDocuments : buildDefaultDevelopmentBondDocuments())
      .filter((item) => item.isActive !== false)
      .map((item) => item.key),
  )

  const payload = BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.map((definition) => ({
    development_bond_config_id: configId,
    document_type_key: definition.key,
    label: definition.label,
    required_for_close_out: selectedKeys.has(definition.key),
    visible_to_developer: definition.visibleToDeveloper,
    visible_to_bond_originator: definition.visibleToBondOriginator,
    internal_only: definition.internalOnly,
    sort_order: definition.sortOrder,
    is_active: true,
  }))

  const { error } = await client.from('development_bond_required_closeout_docs').upsert(payload, {
    onConflict: 'development_bond_config_id,document_type_key',
  })

  if (error) {
    if (isMissingSchemaError(error)) {
      return buildDefaultDevelopmentBondDocuments()
    }
    throw error
  }

  const { data, error: docsError } = await client
    .from('development_bond_required_closeout_docs')
    .select(
      'id, development_bond_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_bond_originator, internal_only, sort_order, is_active',
    )
    .eq('development_bond_config_id', configId)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return buildDefaultDevelopmentBondDocuments()
    }
    throw docsError
  }

  return (data || []).map((item) => normalizeDevelopmentBondDocumentRow(item))
}

export async function saveDevelopmentBondConfig(developmentId, input = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const payload = {
    development_id: developmentId,
    bond_originator_name: normalizeNullableText(input.bondOriginatorName),
    bond_originator_id: input.bondOriginatorId || null,
    primary_contact_name: normalizeNullableText(input.primaryContactName),
    primary_contact_email: normalizeNullableText(input.primaryContactEmail)?.toLowerCase() || null,
    primary_contact_phone: normalizeNullableText(input.primaryContactPhone),
    commission_model_type: normalizeTextValue(input.commissionModelType) || 'fixed_fee',
    default_commission_amount: normalizeOptionalNumber(input.defaultCommissionAmount),
    vat_included: Boolean(input.vatIncluded),
    override_allowed: Boolean(input.overrideAllowed),
    notes: normalizeNullableText(input.notes),
    active_from: normalizeOptionalDate(input.activeFrom),
    active_to: normalizeOptionalDate(input.activeTo),
    is_active: input.isActive !== false,
  }

  const { data, error } = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_bond_configs',
    payload,
    selectClause:
      'id, development_id, bond_originator_name, bond_originator_id, primary_contact_name, primary_contact_email, primary_contact_phone, commission_model_type, default_commission_amount, vat_included, override_allowed, notes, active_from, active_to, is_active',
    expectSingleRow: true,
  })

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Bond commercial setup tables are not set up yet. Run sql/schema.sql first.')
    }
    throw error
  }

  const requiredDocuments = await syncDevelopmentBondRequiredDocs(
    client,
    data.id,
    Array.isArray(input.requiredDocuments) ? input.requiredDocuments : [],
  )

  return normalizeDevelopmentBondConfigRow(data, requiredDocuments)
}

export async function resolveProfileIdsByEmail(client, emails = []) {
  const normalizedEmails = [
    ...new Set(
      (emails || [])
        .map((item) =>
          String(item || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ]
  if (!normalizedEmails.length) {
    return {}
  }

  const { data, error } = await client.from('profiles').select('id, email').in('email', normalizedEmails)
  if (error) {
    if (isMissingSchemaError(error)) {
      return {}
    }

    throw error
  }

  return (data || []).reduce((accumulator, row) => {
    const email = String(row?.email || '')
      .trim()
      .toLowerCase()
    if (email && row?.id) {
      accumulator[email] = row.id
    }
    return accumulator
  }, {})
}
