// onboarding owns these operations and their existing recovery behavior.
import { normalizeNullableUuid, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { deriveFinanceManagedBy, isBondFinanceType } from '../../core/transactions/financeType'
import { getOnboardingFinanceSnapshot } from '../finance/onboardingSnapshot.js'

export function deriveOnboardingFinanceManagedBy({ formData = {}, transaction = null } = {}) {
  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const finance = formData?.finance && typeof formData.finance === 'object' ? formData.finance : {}
  const assistanceSelection = normalizeTextValue(
    finance.bond_assistance_selection || formData.bond_assistance_selection || '',
  )
  const assistanceConsent = String(
    finance.bond_assistance_contact_consent || formData.bond_assistance_contact_consent || '',
  ).trim().toLowerCase()
  if (isBondFinanceType(snapshot.financeType) && assistanceSelection && assistanceConsent !== 'yes') {
    return 'client'
  }
  return deriveFinanceManagedBy({
    financeType: snapshot.financeType,
    financeManagedBy:
      formData.finance_managed_by ||
      formData.financeManagedBy ||
      transaction?.finance_managed_by ||
      transaction?.financeManagedBy,
    formData,
  })
}

export async function resolveTransactionAndContext(client, transactionId) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) {
    throw new Error(
      'Onboarding link is missing its linked transaction. Please ask your agent to resend the onboarding link.',
    )
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, organisation_id, development_id, unit_id, buyer_id, transaction_reference, property_address_line_1, property_address_line_2, suburb, city, province, property_description, sales_price, purchase_price, finance_type, finance_managed_by, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, reservation_proof_uploaded_at, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_reviewed_at, reservation_reviewed_by, reservation_review_notes, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at, purchaser_type, stage, current_main_stage, assigned_agent, assigned_agent_email, attorney, bond_originator, next_action, comment, updated_at, created_at',
    )
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'sales_price') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'reservation_paid_date') ||
      isMissingColumnError(transactionQuery.error, 'reservation_proof_document') ||
      isMissingColumnError(transactionQuery.error, 'reservation_proof_uploaded_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_reviewed_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_reviewed_by') ||
      isMissingColumnError(transactionQuery.error, 'reservation_review_notes') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_status') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_completed_at') ||
      isMissingColumnError(transactionQuery.error, 'external_onboarding_submitted_at') ||
      isMissingColumnError(transactionQuery.error, 'organisation_id') ||
      isMissingColumnError(transactionQuery.error, 'transaction_reference') ||
      isMissingColumnError(transactionQuery.error, 'property_address_line_1') ||
      isMissingColumnError(transactionQuery.error, 'property_address_line_2') ||
      isMissingColumnError(transactionQuery.error, 'suburb') ||
      isMissingColumnError(transactionQuery.error, 'city') ||
      isMissingColumnError(transactionQuery.error, 'province') ||
      isMissingColumnError(transactionQuery.error, 'property_description') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent') ||
      isMissingColumnError(transactionQuery.error, 'finance_managed_by') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent_email'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, sales_price, finance_type, purchaser_type, stage, current_main_stage, attorney, bond_originator, next_action, comment, updated_at, created_at',
      )
      .eq('id', normalizedTransactionId)
      .maybeSingle()
  }

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error, 'purchaser_type')) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, attorney, bond_originator, next_action, comment, updated_at, created_at',
      )
      .eq('id', normalizedTransactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  if (!transactionQuery.data) {
    throw new Error('Transaction not found.')
  }

  const transaction = transactionQuery.data
  const normalizedUnitId = normalizeNullableUuid(transaction.unit_id)
  const normalizedBuyerId = normalizeNullableUuid(transaction.buyer_id)
  const normalizedOrganisationId = normalizeNullableUuid(transaction.organisation_id)
  const normalizedDevelopmentId = normalizeNullableUuid(transaction.development_id)
  const [unitResult, buyerQuery, transactionOrganisation, directDevelopment] = await Promise.all([
    normalizedUnitId
      ? client
          .from('units')
          .select('id, development_id, unit_number, phase, status, development:developments(id, name, organisation_id, developer_company)')
          .eq('id', normalizedUnitId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    normalizedBuyerId
      ? client.from('buyers').select('id, name, phone, email').eq('id', normalizedBuyerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fetchOrganisationBrandContext(client, normalizedOrganisationId),
    fetchDevelopmentBrandContext(client, normalizedDevelopmentId),
  ])

  let unitQuery = unitResult
  if (
    unitQuery.error &&
    (
      isMissingColumnError(unitQuery.error, 'organisation_id') ||
      isMissingColumnError(unitQuery.error, 'developer_company')
    )
  ) {
    unitQuery = normalizedUnitId
      ? await client
          .from('units')
          .select('id, development_id, unit_number, phase, status, development:developments(id, name)')
          .eq('id', normalizedUnitId)
          .maybeSingle()
      : { data: null, error: null }
  }

  if (unitQuery.error) {
    throw unitQuery.error
  }

  if (buyerQuery.error) {
    throw buyerQuery.error
  }

  const embeddedDevelopment = Array.isArray(unitQuery.data?.development)
    ? unitQuery.data.development[0]
    : unitQuery.data?.development
  const development =
    directDevelopment && embeddedDevelopment
      ? { ...embeddedDevelopment, ...directDevelopment, organisation_id: directDevelopment.organisation_id || embeddedDevelopment.organisation_id }
      : directDevelopment || embeddedDevelopment || null
  const developmentOrganisationId = normalizeNullableUuid(development?.organisation_id)
  const brandingOrganisation =
    developmentOrganisationId && developmentOrganisationId !== normalizedOrganisationId
      ? await fetchOrganisationBrandContext(client, developmentOrganisationId)
      : developmentOrganisationId && developmentOrganisationId === normalizedOrganisationId
        ? transactionOrganisation
        : transactionOrganisation

  return {
    transaction,
    unit: unitQuery.data || null,
    buyer: buyerQuery.data || null,
    organisation: transactionOrganisation,
    brandingOrganisation: brandingOrganisation || transactionOrganisation,
    brandingSource:
      developmentOrganisationId && brandingOrganisation
        ? 'development_organisation'
        : 'transaction_organisation',
    development,
  }
}

export async function fetchDevelopmentBrandContext(client, developmentId) {
  const normalizedDevelopmentId = normalizeNullableUuid(developmentId)
  if (!normalizedDevelopmentId) {
    return null
  }

  let developmentQuery = await client
    .from('developments')
    .select('id, name, organisation_id, developer_company')
    .eq('id', normalizedDevelopmentId)
    .maybeSingle()

  if (
    developmentQuery.error &&
    (
      isMissingColumnError(developmentQuery.error, 'developer_company') ||
      isMissingColumnError(developmentQuery.error, 'organisation_id')
    )
  ) {
    developmentQuery = await client
      .from('developments')
      .select(
        isMissingColumnError(developmentQuery.error, 'organisation_id')
          ? 'id, name'
          : 'id, name, organisation_id',
      )
      .eq('id', normalizedDevelopmentId)
      .maybeSingle()
  }

  if (developmentQuery.error) {
    if (
      isMissingTableError(developmentQuery.error, 'developments') ||
      isMissingSchemaError(developmentQuery.error) ||
      isPermissionDeniedError(developmentQuery.error)
    ) {
      return null
    }
    throw developmentQuery.error
  }

  return developmentQuery.data || null
}

export async function fetchOrganisationBrandContext(client, organisationId) {
  const normalizedOrganisationId = normalizeNullableUuid(organisationId)
  if (!normalizedOrganisationId) {
    return null
  }

  let organisationQuery = await client
    .from('organisations')
    .select('id, name, display_name, logo_url')
    .eq('id', normalizedOrganisationId)
    .maybeSingle()

  if (organisationQuery.error && isMissingColumnError(organisationQuery.error, 'logo_url')) {
    organisationQuery = await client
      .from('organisations')
      .select('id, name, display_name')
      .eq('id', normalizedOrganisationId)
      .maybeSingle()
  }

  if (organisationQuery.error && isMissingColumnError(organisationQuery.error, 'display_name')) {
    organisationQuery = await client
      .from('organisations')
      .select('id, name')
      .eq('id', normalizedOrganisationId)
      .maybeSingle()
  }

  if (organisationQuery.error) {
    if (
      isMissingTableError(organisationQuery.error, 'organisations') ||
      isMissingSchemaError(organisationQuery.error) ||
      isPermissionDeniedError(organisationQuery.error)
    ) {
      return null
    }

    throw organisationQuery.error
  }

  if (!organisationQuery.data) {
    return null
  }

  let organisationBranding = {}
  try {
    let brandingQuery = await client
      .from('organisation_branding')
      .select('organisation_id, organisation_display_name, logo_light_url, logo_dark_url, logo_icon_url, primary_brand_color, secondary_brand_color, accent_brand_color')
      .eq('organisation_id', normalizedOrganisationId)
      .maybeSingle()

    if (
      brandingQuery.error &&
      (
        isMissingColumnError(brandingQuery.error, 'organisation_display_name') ||
        isMissingColumnError(brandingQuery.error, 'logo_icon_url') ||
        isMissingColumnError(brandingQuery.error, 'primary_brand_color') ||
        isMissingColumnError(brandingQuery.error, 'secondary_brand_color') ||
        isMissingColumnError(brandingQuery.error, 'accent_brand_color')
      )
    ) {
      brandingQuery = await client
        .from('organisation_branding')
        .select('organisation_id, logo_light_url, logo_dark_url, primary_color, secondary_color, metadata_json')
        .eq('organisation_id', normalizedOrganisationId)
        .maybeSingle()
    }

    if (brandingQuery.error) {
      if (
        !isMissingTableError(brandingQuery.error, 'organisation_branding') &&
        !isMissingSchemaError(brandingQuery.error) &&
        !isPermissionDeniedError(brandingQuery.error)
      ) {
        throw brandingQuery.error
      }
    } else if (brandingQuery.data && typeof brandingQuery.data === 'object') {
      organisationBranding = brandingQuery.data
    }
  } catch (brandingError) {
    if (
      !isMissingTableError(brandingError, 'organisation_branding') &&
      !isMissingSchemaError(brandingError) &&
      !isPermissionDeniedError(brandingError)
    ) {
      throw brandingError
    }
  }

  let settingsJson = {}
  try {
    const settingsQuery = await client
      .from('organisation_settings')
      .select('settings_json')
      .eq('organisation_id', normalizedOrganisationId)
      .maybeSingle()

    if (settingsQuery.error) {
      if (
        !isMissingTableError(settingsQuery.error, 'organisation_settings') &&
        !isMissingColumnError(settingsQuery.error, 'settings_json') &&
        !isMissingSchemaError(settingsQuery.error) &&
        !isPermissionDeniedError(settingsQuery.error)
      ) {
        throw settingsQuery.error
      }
    } else if (settingsQuery.data?.settings_json && typeof settingsQuery.data.settings_json === 'object') {
      settingsJson = settingsQuery.data.settings_json
    }
  } catch (settingsError) {
    if (
      !isMissingTableError(settingsError, 'organisation_settings') &&
      !isMissingColumnError(settingsError, 'settings_json') &&
      !isMissingSchemaError(settingsError) &&
      !isPermissionDeniedError(settingsError)
    ) {
      throw settingsError
    }
  }

  return {
    ...organisationQuery.data,
    branding: organisationBranding,
    settingsJson,
  }
}
