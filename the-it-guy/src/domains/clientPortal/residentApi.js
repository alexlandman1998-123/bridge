// clientPortal owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket } from '../../lib/api/shared/storage.js'
import { createTransactionEvent } from '../transactions/eventActions.js'
import { getDefaultTrustInvestmentForm, getDefaultOccupationalRentRecord } from '../transactions/workspaceReadApi.js'
import { getSignedUrl } from '../documents/listReadApi.js'
import { fetchTransactionEvents } from '../transactions/activityReadApi.js'
import { normalizeNullableBoolean, normalizeNullableText, normalizeOptionalDate, requireClient, isMissingTableError, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage, TRANSACTION_HANDOVER_SELECT, getDefaultHandoverRecord, normalizeHandoverRow, HANDOVER_STATUSES } from '../../core/transactions/legacyReadModel.js'
import { queryClientIssues } from '../developments/unitReadApi.js'
import { ensureDevelopmentSettings } from '../developments/configurationApi.js'
import { resolveClientPortalProfile } from '../../core/clientPortal/clientPortalProfile.js'
import { CLIENT_ISSUE_STATUSES, ALTERATION_REQUEST_STATUSES, TRUST_INVESTMENT_FORM_STATUSES, REVIEW_ELIGIBLE_STAGES } from '../shared/constants.js'
import { requireClientPortalTokenClient } from './appointmentRead.js'
import { TRUST_INVESTMENT_FORM_SELECT, normalizeTrustInvestmentFormRow, normalizeOccupationalRentRecord, getOccupationalRentRecordFromEvents } from '../transactions/workspaceHydration.js'
import { normalizeAlterationChargeTreatment } from '../documents/uploadAutomation.js'
import { resolveClientPortalLinkByToken } from './originatorFinanceRead.js'

function validateHandoverForCompletion(handover = {}) {
  const checklistMissing = []
  if (!handover.inspectionCompleted) checklistMissing.push('inspection complete')
  if (!handover.keysHandedOver) checklistMissing.push('keys handed over')
  if (!handover.remoteHandedOver) checklistMissing.push('remote handed over')
  if (!handover.manualsHandedOver) checklistMissing.push('manuals handed over')

  if (checklistMissing.length) {
    throw new Error(`Complete checklist items first: ${checklistMissing.join(', ')}.`)
  }

  if (!String(handover.electricityMeterReading || '').trim()) {
    throw new Error('Electricity meter reading is required before handover completion.')
  }

  if (!String(handover.waterMeterReading || '').trim()) {
    throw new Error('Water meter reading is required before handover completion.')
  }

  if (!String(handover.signatureName || '').trim()) {
    throw new Error('Signature name is required before handover completion.')
  }
}

function validateTrustInvestmentFormForSubmission(form = {}) {
  const required = [
    ['Purchaser full name', form.purchaserFullName],
    ['Purchaser identity / registration number', form.purchaserIdentityOrRegistrationNumber],
    ['Full name', form.fullName],
    ['Identity / registration number', form.identityOrRegistrationNumber],
    ['Income tax number', form.incomeTaxNumber],
    ['South African resident', form.southAfricanResident === true || form.southAfricanResident === false ? 'yes' : ''],
    ['Physical address', form.physicalAddress],
    ['Postal address', form.postalAddress],
    ['Telephone number', form.telephoneNumber],
    ['Balance to', form.balanceTo],
    ['Bank name', form.bankName],
    ['Account number', form.accountNumber],
    ['Branch number', form.branchNumber],
    ['Source of funds', form.sourceOfFunds],
    ['Signature name', form.signatureName],
    ['Signed date', form.signedDate],
  ]

  const firstMissing = required.find(([, value]) => !String(value || '').trim())
  if (firstMissing) {
    throw new Error(`${firstMissing[0]} is required before submission.`)
  }

  if (!form.declarationAccepted) {
    throw new Error('You must accept the investment instruction declaration before submission.')
  }
}

const CLIENT_PORTAL_PROFILE_ACTION_TRANSACTION_SELECT =
  'id, development_id, unit_id, buyer_id, transaction_type, sale_route, sale_channel, seller_party_type, lead_owner, ownership_model, source_agency_org_id, assigned_agent, assigned_agent_email'

const CLIENT_PORTAL_PROFILE_ACTION_FALLBACK_TRANSACTION_SELECT =
  'id, development_id, unit_id, buyer_id'

const CLIENT_PORTAL_PROFILE_ACTION_ORIGIN_COLUMNS = [
  'transaction_type',
  'sale_route',
  'sale_channel',
  'seller_party_type',
  'lead_owner',
  'ownership_model',
  'source_agency_org_id',
  'assigned_agent',
  'assigned_agent_email',
]

function isMissingClientPortalProfileActionColumnError(error) {
  return CLIENT_PORTAL_PROFILE_ACTION_ORIGIN_COLUMNS.some((columnName) =>
    isMissingColumnError(error, columnName),
  )
}

async function resolveClientPortalProfileForTokenAction(client, link, settings = {}) {
  let transaction = null
  if (link?.transaction_id) {
    let transactionQuery = await client
      .from('transactions')
      .select(CLIENT_PORTAL_PROFILE_ACTION_TRANSACTION_SELECT)
      .eq('id', link.transaction_id)
      .maybeSingle()

    if (transactionQuery.error && isMissingClientPortalProfileActionColumnError(transactionQuery.error)) {
      transactionQuery = await client
        .from('transactions')
        .select(CLIENT_PORTAL_PROFILE_ACTION_FALLBACK_TRANSACTION_SELECT)
        .eq('id', link.transaction_id)
        .maybeSingle()
    }

    if (transactionQuery.error) {
      throw transactionQuery.error
    }

    transaction = transactionQuery.data || null
  }

  return resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      ...(transaction || {}),
      development_id: transaction?.development_id || link?.development_id || null,
      unit_id: transaction?.unit_id || link?.unit_id || null,
      buyer_id: transaction?.buyer_id || link?.buyer_id || null,
    },
    settings,
  })
}

async function assertClientPortalTokenSectionEnabled({
  client,
  link,
  settings = {},
  sectionKey,
  message,
}) {
  const portalProfile = await resolveClientPortalProfileForTokenAction(client, link, settings)
  if (portalProfile?.enabledSections?.[sectionKey] === false) {
    throw new Error(message)
  }
  return portalProfile
}

export async function updateClientIssueStatus(issueId, status) {
  const client = requireClient()

  if (!CLIENT_ISSUE_STATUSES.includes(status)) {
    throw new Error('Invalid issue status.')
  }

  const { data, error } = await client
    .from('client_issues')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', issueId)
    .select('id, status, updated_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function signOffClientIssue(issueId, signedOffBy) {
  const client = requireClient()
  const signedOffAt = new Date().toISOString()

  let result = await client
    .from('client_issues')
    .update({ signed_off_by: signedOffBy || null, signed_off_at: signedOffAt })
    .eq('id', issueId)
    .select('id, signed_off_by, signed_off_at')
    .single()

  if (
    result.error &&
    (isMissingColumnError(result.error, 'signed_off_by') || isMissingColumnError(result.error, 'signed_off_at'))
  ) {
    result = await client
      .from('client_issues')
      .update({ updated_at: signedOffAt })
      .eq('id', issueId)
      .select('id')
      .single()
  }

  if (result.error) {
    throw result.error
  }

  return {
    id: result.data?.id || issueId,
    signed_off_by: signedOffBy || null,
    signed_off_at: signedOffAt,
  }
}

export async function fetchDeveloperSnagsData() {
  const client = requireClient()

  const { data: issuesData, error: issuesError } = await queryClientIssues(client)

  if (issuesError && issuesError.code !== '42P01') {
    throw issuesError
  }

  const issues = issuesData || []
  if (!issues.length) {
    return []
  }

  const developmentIds = [...new Set(issues.map((item) => item.development_id).filter(Boolean))]
  const unitIds = [...new Set(issues.map((item) => item.unit_id).filter(Boolean))]
  const transactionIds = [...new Set(issues.map((item) => item.transaction_id).filter(Boolean))]
  const buyerIds = [...new Set(issues.map((item) => item.buyer_id).filter(Boolean))]

  const [developmentsResult, unitsResult, transactionsResult, buyersResult] = await Promise.all([
    developmentIds.length
      ? client.from('developments').select('id, name, location').in('id', developmentIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? client.from('units').select('id, unit_number, price, list_price').in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
    transactionIds.length
      ? client.from('transactions').select('id, unit_id, buyer_id, finance_type').in('id', transactionIds)
      : Promise.resolve({ data: [], error: null }),
    buyerIds.length
      ? client.from('buyers').select('id, name, email, phone').in('id', buyerIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (developmentsResult.error) throw developmentsResult.error
  if (unitsResult.error) throw unitsResult.error
  if (transactionsResult.error) throw transactionsResult.error
  if (buyersResult.error) throw buyersResult.error

  const developmentMap = new Map((developmentsResult.data || []).map((item) => [String(item.id), item]))
  const unitMap = new Map((unitsResult.data || []).map((item) => [String(item.id), item]))
  const transactionMap = new Map((transactionsResult.data || []).map((item) => [String(item.id), item]))
  const buyerMap = new Map((buyersResult.data || []).map((item) => [String(item.id), item]))

  return Promise.all(
    issues.map(async (issue) => {
      const development = issue.development_id ? developmentMap.get(String(issue.development_id)) || null : null
      const unit = issue.unit_id ? unitMap.get(String(issue.unit_id)) || null : null
      const transaction = issue.transaction_id ? transactionMap.get(String(issue.transaction_id)) || null : null
      const buyer = issue.buyer_id ? buyerMap.get(String(issue.buyer_id)) || null : null

      return {
        ...issue,
        reference: `SNAG-${String(issue.id).slice(0, 8).toUpperCase()}`,
        development,
        unit,
        transaction,
        buyer,
        photo_url: issue.photo_path ? await getSignedUrl(issue.photo_path) : null,
      }
    }),
  )
}

export async function updateAlterationRequestStatus(requestId, status) {
  const client = requireClient()

  if (!ALTERATION_REQUEST_STATUSES.includes(status)) {
    throw new Error('Invalid alteration request status.')
  }

  const { data, error } = await client
    .from('alteration_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('id, status, updated_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

async function upsertTrustInvestmentFormByToken({ token, form = {}, submit = false }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this development.')
  }

  const defaults = getDefaultTrustInvestmentForm({
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction: {
      id: link.transaction_id,
      buyer_id: link.buyer_id,
    },
    buyer: null,
  })

  const { data: existing, error: existingError } = await client
    .from('trust_investment_forms')
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .eq('transaction_id', link.transaction_id)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'trust_investment_forms')) {
      throw new Error('Trust investment forms are not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  const normalizedForm = normalizeTrustInvestmentFormRow(
    {
      ...existing,
      purchaser_full_name: form.purchaserFullName ?? existing?.purchaser_full_name,
      purchaser_identity_or_registration_number:
        form.purchaserIdentityOrRegistrationNumber ?? existing?.purchaser_identity_or_registration_number,
      full_name: form.fullName ?? existing?.full_name,
      identity_or_registration_number: form.identityOrRegistrationNumber ?? existing?.identity_or_registration_number,
      income_tax_number: form.incomeTaxNumber ?? existing?.income_tax_number,
      south_african_resident:
        form.southAfricanResident ?? (existing ? existing.south_african_resident : defaults.southAfricanResident),
      physical_address: form.physicalAddress ?? existing?.physical_address,
      postal_address: form.postalAddress ?? existing?.postal_address,
      telephone_number: form.telephoneNumber ?? existing?.telephone_number,
      fax_number: form.faxNumber ?? existing?.fax_number,
      balance_to: form.balanceTo ?? existing?.balance_to,
      bank_name: form.bankName ?? existing?.bank_name,
      account_number: form.accountNumber ?? existing?.account_number,
      branch_number: form.branchNumber ?? existing?.branch_number,
      source_of_funds: form.sourceOfFunds ?? existing?.source_of_funds,
      declaration_accepted: form.declarationAccepted ?? existing?.declaration_accepted,
      signature_name: form.signatureName ?? existing?.signature_name,
      signed_date: form.signedDate ?? existing?.signed_date,
      attorney_firm_name: form.attorneyFirmName ?? existing?.attorney_firm_name,
      status: existing?.status || defaults.status,
    },
    defaults,
  )

  if (submit) {
    validateTrustInvestmentFormForSubmission(normalizedForm)
  }

  const nowIso = new Date().toISOString()
  const nowDate = nowIso.slice(0, 10)
  const existingStatus = TRUST_INVESTMENT_FORM_STATUSES.includes(existing?.status) ? existing.status : 'Not Started'
  const nextStatus = submit
    ? 'Submitted'
    : ['Reviewed', 'Approved'].includes(existingStatus)
      ? existingStatus
      : 'In Progress'

  const payload = {
    development_id: link.development_id,
    unit_id: link.unit_id,
    transaction_id: link.transaction_id,
    buyer_id: link.buyer_id || null,
    attorney_firm_name: normalizeNullableText(normalizedForm.attorneyFirmName),
    purchaser_full_name: normalizeNullableText(normalizedForm.purchaserFullName),
    purchaser_identity_or_registration_number: normalizeNullableText(
      normalizedForm.purchaserIdentityOrRegistrationNumber,
    ),
    full_name: normalizeNullableText(normalizedForm.fullName),
    identity_or_registration_number: normalizeNullableText(normalizedForm.identityOrRegistrationNumber),
    income_tax_number: normalizeNullableText(normalizedForm.incomeTaxNumber),
    south_african_resident: normalizeNullableBoolean(normalizedForm.southAfricanResident),
    physical_address: normalizeNullableText(normalizedForm.physicalAddress),
    postal_address: normalizeNullableText(normalizedForm.postalAddress),
    telephone_number: normalizeNullableText(normalizedForm.telephoneNumber),
    fax_number: normalizeNullableText(normalizedForm.faxNumber),
    balance_to: normalizeNullableText(normalizedForm.balanceTo),
    bank_name: normalizeNullableText(normalizedForm.bankName),
    account_number: normalizeNullableText(normalizedForm.accountNumber),
    branch_number: normalizeNullableText(normalizedForm.branchNumber),
    source_of_funds: normalizeNullableText(normalizedForm.sourceOfFunds),
    declaration_accepted: Boolean(normalizedForm.declarationAccepted),
    signature_name: normalizeNullableText(normalizedForm.signatureName),
    signed_date: normalizeOptionalDate(normalizedForm.signedDate) || (submit ? nowDate : null),
    status: nextStatus,
    submitted_at: submit ? nowIso : existing?.submitted_at || null,
  }

  const { data, error } = await client
    .from('trust_investment_forms')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'trust_investment_forms')) {
      throw new Error('Trust investment forms are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeTrustInvestmentFormRow(data, defaults)
}

export async function saveTrustInvestmentFormDraft({ token, form }) {
  return upsertTrustInvestmentFormByToken({ token, form, submit: false })
}

export async function submitTrustInvestmentForm({ token, form }) {
  return upsertTrustInvestmentFormByToken({ token, form, submit: true })
}

async function upsertTransactionHandoverByToken({ token, handover = {}, complete = false }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this development.')
  }
  await assertClientPortalTokenSectionEnabled({
    client,
    link,
    settings,
    sectionKey: 'handover',
    message: 'Handover is not available for this portal.',
  })

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, unit_id, buyer_id')
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  const defaults = getDefaultHandoverRecord({
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction,
    buyer: null,
  })

  const { data: existing, error: existingError } = await client
    .from('transaction_handover')
    .select(TRANSACTION_HANDOVER_SELECT)
    .eq('transaction_id', link.transaction_id)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'transaction_handover')) {
      throw new Error('Handover module is not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  const merged = normalizeHandoverRow(
    {
      ...existing,
      status: handover.status ?? existing?.status ?? defaults.status,
      handover_date: handover.handoverDate ?? existing?.handover_date,
      electricity_meter_reading: handover.electricityMeterReading ?? existing?.electricity_meter_reading,
      water_meter_reading: handover.waterMeterReading ?? existing?.water_meter_reading,
      gas_meter_reading: handover.gasMeterReading ?? existing?.gas_meter_reading,
      keys_handed_over: handover.keysHandedOver ?? existing?.keys_handed_over,
      remote_handed_over: handover.remoteHandedOver ?? existing?.remote_handed_over,
      manuals_handed_over: handover.manualsHandedOver ?? existing?.manuals_handed_over,
      inspection_completed: handover.inspectionCompleted ?? existing?.inspection_completed,
      notes: handover.notes ?? existing?.notes,
      signature_name: handover.signatureName ?? existing?.signature_name,
      signature_signed_at: handover.signatureSignedAt ?? existing?.signature_signed_at,
    },
    defaults,
  )

  if (complete) {
    validateHandoverForCompletion(merged)
  }

  const completedNowIso = new Date().toISOString()
  const payload = {
    transaction_id: link.transaction_id,
    development_id: link.development_id,
    unit_id: link.unit_id,
    buyer_id: link.buyer_id || null,
    status: complete ? 'completed' : merged.status === 'completed' ? 'completed' : 'in_progress',
    handover_date: normalizeOptionalDate(merged.handoverDate) || (complete ? completedNowIso.slice(0, 10) : null),
    electricity_meter_reading: normalizeNullableText(merged.electricityMeterReading),
    water_meter_reading: normalizeNullableText(merged.waterMeterReading),
    gas_meter_reading: normalizeNullableText(merged.gasMeterReading),
    keys_handed_over: Boolean(merged.keysHandedOver),
    remote_handed_over: Boolean(merged.remoteHandedOver),
    manuals_handed_over: Boolean(merged.manualsHandedOver),
    inspection_completed: Boolean(merged.inspectionCompleted),
    notes: normalizeNullableText(merged.notes),
    signature_name: normalizeNullableText(merged.signatureName),
    signature_signed_at: complete ? completedNowIso : merged.signatureSignedAt || null,
  }

  const { data, error } = await client
    .from('transaction_handover')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(TRANSACTION_HANDOVER_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'transaction_handover')) {
      throw new Error('Handover module is not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeHandoverRow(data, defaults)
}

export async function saveClientHandoverDraft({ token, handover }) {
  return upsertTransactionHandoverByToken({
    token,
    handover,
    complete: false,
  })
}

export async function submitClientHandover({ token, handover }) {
  return upsertTransactionHandoverByToken({
    token,
    handover,
    complete: true,
  })
}

export async function upsertTransactionOccupationalRent({ transactionId, occupationalRent = {}, actorRole = null }) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const existingEvents = await fetchTransactionEvents(transactionId, {
    limit: 250,
  })
  const defaults = getDefaultOccupationalRentRecord({
    transaction: { id: transactionId },
  })
  const existing = getOccupationalRentRecordFromEvents(existingEvents, defaults)
  const merged = normalizeOccupationalRentRecord(
    {
      ...existing,
      ...occupationalRent,
      enabled:
        occupationalRent.enabled === true || occupationalRent.enabled === false
          ? occupationalRent.enabled
          : existing.enabled,
      status:
        occupationalRent.enabled === false
          ? 'not_applicable'
          : occupationalRent.status || existing.status || 'pending_setup',
    },
    defaults,
  )

  const normalizedRecord = {
    enabled: Boolean(merged.enabled),
    status: merged.enabled ? merged.status : 'not_applicable',
    occupationDate: merged.occupationDate || '',
    rentStartDate: merged.rentStartDate || '',
    monthlyAmount: merged.monthlyAmount,
    proRataAmount: merged.proRataAmount,
    nextDueDate: merged.nextDueDate || '',
    waived: Boolean(merged.waived),
    waiverReason: merged.waiverReason || '',
    notes: merged.notes || '',
  }

  await createTransactionEvent({
    transactionId,
    eventType: 'OccupationalRentUpdated',
    eventData: normalizedRecord,
    createdByRole: actorRole || null,
  })

  return normalizeOccupationalRentRecord(normalizedRecord, defaults)
}

export async function upsertTransactionHandover({ transactionId, handover = {} }) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, unit_id, buyer_id')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const defaults = getDefaultHandoverRecord({
    developmentId: transaction.development_id,
    unitId: transaction.unit_id,
    transaction,
    buyer: null,
  })

  const payload = {
    transaction_id: transactionId,
    development_id: transaction.development_id || null,
    unit_id: transaction.unit_id || null,
    buyer_id: transaction.buyer_id || null,
    status: HANDOVER_STATUSES.includes(String(handover.status || '').toLowerCase())
      ? String(handover.status).toLowerCase()
      : 'in_progress',
    handover_date: normalizeOptionalDate(handover.handoverDate),
    electricity_meter_reading: normalizeNullableText(handover.electricityMeterReading),
    water_meter_reading: normalizeNullableText(handover.waterMeterReading),
    gas_meter_reading: normalizeNullableText(handover.gasMeterReading),
    keys_handed_over: Boolean(handover.keysHandedOver),
    remote_handed_over: Boolean(handover.remoteHandedOver),
    manuals_handed_over: Boolean(handover.manualsHandedOver),
    inspection_completed: Boolean(handover.inspectionCompleted),
    notes: normalizeNullableText(handover.notes),
    signature_name: normalizeNullableText(handover.signatureName),
    signature_signed_at: handover.signatureSignedAt || null,
  }

  const { data, error } = await client
    .from('transaction_handover')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(TRANSACTION_HANDOVER_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'transaction_handover')) {
      throw new Error('Handover module is not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeHandoverRow(data, defaults)
}

export async function updateTrustInvestmentFormStatus(formId, status) {
  const client = requireClient()

  if (!formId) {
    throw new Error('Form ID is required.')
  }

  if (!TRUST_INVESTMENT_FORM_STATUSES.includes(status)) {
    throw new Error('Invalid trust form status.')
  }

  const payload = {
    status,
  }

  if (status === 'Reviewed') {
    payload.reviewed_at = new Date().toISOString()
  }

  if (status === 'Approved') {
    payload.approved_at = new Date().toISOString()
  }

  const { data, error } = await client
    .from('trust_investment_forms')
    .update(payload)
    .eq('id', formId)
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'trust_investment_forms')) {
      throw new Error('Trust investment forms are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeTrustInvestmentFormRow(data, getDefaultTrustInvestmentForm())
}

export async function submitClientIssue({
  token,
  category,
  description,
  location = '',
  priority = '',
  photoFile = null,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled || !settings.snag_reporting_enabled) {
    throw new Error('Issue reporting is not enabled for this development.')
  }
  await assertClientPortalTokenSectionEnabled({
    client,
    link,
    settings,
    sectionKey: 'snags',
    message: 'Issue reporting is not available for this portal.',
  })

  if (!category?.trim() || !description?.trim()) {
    throw new Error('Category and description are required.')
  }

  const { data: created, error: createError } = await client
    .from('client_issues')
    .insert({
      development_id: link.development_id,
      unit_id: link.unit_id,
      transaction_id: link.transaction_id,
      buyer_id: link.buyer_id || null,
      category: category.trim(),
      description: description.trim(),
      location: location?.trim() || null,
      priority: priority?.trim() || null,
      status: 'Open',
    })
    .select('id, photo_path')
    .single()

  if (createError) {
    throw createError
  }

  if (photoFile) {
    const safeName = photoFile.name.replace(/[^a-zA-Z0-9.-]/g, '-')
    const filePath = `client-issues/${created.id}/${Date.now()}-${safeName}`
    await uploadToDocumentsBucket(client, filePath, photoFile)

    const { error: updateIssueError } = await client
      .from('client_issues')
      .update({ photo_path: filePath })
      .eq('id', created.id)

    if (updateIssueError) {
      throw updateIssueError
    }
  }
}

export async function submitAlterationRequest({
  token,
  title,
  category = '',
  description,
  budgetRange = '',
  preferredTiming = '',
  referenceImageFile = null,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled || !settings.alteration_requests_enabled) {
    throw new Error('Alteration requests are not enabled for this development.')
  }
  await assertClientPortalTokenSectionEnabled({
    client,
    link,
    settings,
    sectionKey: 'alterations',
    message: 'Alteration requests are not available for this portal.',
  })

  if (!title?.trim() || !description?.trim()) {
    throw new Error('Title and description are required.')
  }

  let defaultChargeTreatment = normalizeAlterationChargeTreatment(
    settings.default_alteration_charge_treatment || settings.defaultAlterationChargeTreatment,
  )
  if (link.transaction_id) {
    const transactionQuery = await client
      .from('transactions')
      .select('id, alteration_charge_treatment')
      .eq('id', link.transaction_id)
      .maybeSingle()

    if (!transactionQuery.error && transactionQuery.data?.alteration_charge_treatment) {
      defaultChargeTreatment = normalizeAlterationChargeTreatment(transactionQuery.data.alteration_charge_treatment)
    }
  }

  const alterationPayload = {
    development_id: link.development_id,
    unit_id: link.unit_id,
    transaction_id: link.transaction_id,
    buyer_id: link.buyer_id || null,
    title: title.trim(),
    category: category?.trim() || null,
    description: description.trim(),
    budget_range: budgetRange?.trim() || null,
    preferred_timing: preferredTiming?.trim() || null,
    charge_treatment: defaultChargeTreatment,
    status: 'Pending Review',
  }

  let createResult = await client.from('alteration_requests').insert(alterationPayload).select('id').single()

  if (createResult.error && isMissingColumnError(createResult.error, 'charge_treatment')) {
    const fallbackPayload = { ...alterationPayload }
    delete fallbackPayload.charge_treatment
    createResult = await client.from('alteration_requests').insert(fallbackPayload).select('id').single()
  }

  if (createResult.error) {
    throw createResult.error
  }

  const created = createResult.data

  if (referenceImageFile) {
    const safeName = referenceImageFile.name.replace(/[^a-zA-Z0-9.-]/g, '-')
    const filePath = `alteration-requests/${created.id}/${Date.now()}-${safeName}`
    await uploadToDocumentsBucket(client, filePath, referenceImageFile)

    const { error: updateError } = await client
      .from('alteration_requests')
      .update({ reference_image_path: filePath })
      .eq('id', created.id)

    if (updateError) {
      throw updateError
    }
  }
}

async function uploadAlterationAsset({ client, alterationId, field, label, file }) {
  if (!file) {
    return
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `alteration-requests/${alterationId}/${label}-${Date.now()}-${safeName}`
  await uploadToDocumentsBucket(client, filePath, file)

  const { error: updateError } = await client
    .from('alteration_requests')
    .update({ [field]: filePath })
    .eq('id', alterationId)
  if (updateError) {
    throw updateError
  }
}

export async function createWorkspaceAlteration({
  developmentId,
  unitId,
  transactionId,
  buyerId = null,
  title,
  description,
  category = '',
  amountIncVat = 0,
  chargeTreatment = 'included_in_purchase_price',
  invoiceFile = null,
  proofFile = null,
}) {
  if (!developmentId || !unitId || !transactionId) {
    throw new Error('Development, unit, and transaction context are required.')
  }

  if (!title?.trim() || !description?.trim()) {
    throw new Error('Title and description are required.')
  }

  const client = requireClient()
  const alterationPayload = {
    development_id: developmentId,
    unit_id: unitId,
    transaction_id: transactionId,
    buyer_id: buyerId || null,
    title: title.trim(),
    category: category?.trim() || null,
    description: description.trim(),
    amount_inc_vat: Number(amountIncVat) || 0,
    charge_treatment: normalizeAlterationChargeTreatment(chargeTreatment),
    status: 'Pending Review',
  }

  let createResult = await client.from('alteration_requests').insert(alterationPayload).select('id').single()

  if (createResult.error && isMissingColumnError(createResult.error, 'charge_treatment')) {
    const fallbackPayload = { ...alterationPayload }
    delete fallbackPayload.charge_treatment
    createResult = await client.from('alteration_requests').insert(fallbackPayload).select('id').single()
  }

  if (createResult.error) {
    throw createResult.error
  }

  const created = createResult.data

  await uploadAlterationAsset({
    client,
    alterationId: created.id,
    field: 'invoice_path',
    label: 'invoice',
    file: invoiceFile,
  })

  await uploadAlterationAsset({
    client,
    alterationId: created.id,
    field: 'proof_of_payment_path',
    label: 'proof',
    file: proofFile,
  })

  return created
}

export async function submitServiceReview({
  token,
  rating,
  reviewText = '',
  positives = '',
  improvements = '',
  allowMarketingUse = false,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled || !settings.service_reviews_enabled) {
    throw new Error('Service reviews are not enabled for this development.')
  }
  await assertClientPortalTokenSectionEnabled({
    client,
    link,
    settings,
    sectionKey: 'review',
    message: 'Service reviews are not available for this portal.',
  })

  const { data: transaction, error: txError } = await client
    .from('transactions')
    .select('id, stage')
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (txError) {
    throw txError
  }

  const stage = normalizeStage(transaction?.stage, null)
  if (!REVIEW_ELIGIBLE_STAGES.has(stage)) {
    throw new Error('Reviews are available once your unit reaches registration/handover stages.')
  }

  const parsedRating = Number(rating)
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    throw new Error('Rating must be between 1 and 5.')
  }

  const payload = {
    development_id: link.development_id,
    unit_id: link.unit_id,
    transaction_id: link.transaction_id,
    buyer_id: link.buyer_id || null,
    rating: parsedRating,
    review_text: reviewText?.trim() || null,
    positives: positives?.trim() || null,
    improvements: improvements?.trim() || null,
    allow_marketing_use: Boolean(allowMarketingUse),
  }

  let result = await client.from('service_reviews').insert(payload).select('id').single()

  if (result.error && result.error.code === '23505') {
    let updateQuery = client.from('service_reviews').update(payload).eq('unit_id', link.unit_id)

    if (link.buyer_id) {
      updateQuery = updateQuery.eq('buyer_id', link.buyer_id)
    } else {
      updateQuery = updateQuery.is('buyer_id', null)
    }

    result = await updateQuery.select('id').single()
  }

  if (result.error) {
    throw result.error
  }
}
