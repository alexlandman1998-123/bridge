// transactions owns these operations and their existing recovery behavior.
import { resolveProfileIdsByEmail } from '../developments/configurationActions.js'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { resolveDevelopmentParticipantsByIdentity, normalizeStakeholderStatus } from '../developments/participantReadApi.js'
import { normalizeStoredTransactionType } from './listReadApi.js'
import { normalizeEventType } from './activityReadApi.js'
import { normalizeNullableText, normalizeOptionalDate, isMissingTableError, isMissingColumnError, isMissingSchemaError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage, normalizeMainStage, TRANSACTION_HANDOVER_SELECT, getDefaultHandoverRecord, normalizeHandoverRow } from '../../core/transactions/legacyReadModel.js'
import { withRequirementTraceMetadata, getTransactionSellerPartyRequirementMeta, getTransactionAgencyPartyRequirementMeta, isSellerPartyRequirement, isAgencyPartyRequirement, buildRequiredChecklistFromRows } from '../documents/requirementReadModel.js'
import { getMainStageIndex } from '../../core/transactions/stageConfig'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { normalizeRequiredStatus, statusFromLegacyFlags } from '../../core/documents/documentVaultArchitecture'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { resolveTransactionCaptureParticipantPolicy } from '../../core/transactions/transactionCaptureFinance.js'
import { getRolePermissions, normalizeFinanceManagedBy } from '../../core/transactions/permissions'
import { resolveLegalDocumentRequirements } from '../../services/attorneyWorkflow/attorneyDocumentRequirementsResolver'
import { TRUST_INVESTMENT_FORM_STATUSES, OCCUPATIONAL_RENT_STATUSES } from '../shared/constants.js'
import { normalizeTransactionParticipantAssignmentSource, normalizeAttorneyLegalRole, isInternalStakeholderRole, TRANSACTION_PARTICIPANT_FULL_SELECT, TRANSACTION_PARTICIPANT_LEGACY_SELECT, isMissingTransactionParticipantExtendedColumn, normalizeTransactionParticipantRow, upsertTransactionParticipantsRowsWithFallback } from './participantInfrastructure.js'
import { ensureTransactionSubprocesses } from './subprocessApi.js'
import { getOnboardingFinanceSnapshot } from '../finance/onboardingSnapshot.js'

export async function loadWorkflowActionService() {
  return import("../../../server/services/workflowActionService.js")
}

export function isPrivateTransactionType(value) {
  return normalizeStoredTransactionType(value, 'private_property') === 'private_property'
}

export const TRUST_INVESTMENT_FORM_SELECT = `
  id,
  development_id,
  unit_id,
  transaction_id,
  buyer_id,
  attorney_firm_name,
  purchaser_full_name,
  purchaser_identity_or_registration_number,
  full_name,
  identity_or_registration_number,
  income_tax_number,
  south_african_resident,
  physical_address,
  postal_address,
  telephone_number,
  fax_number,
  balance_to,
  bank_name,
  account_number,
  branch_number,
  source_of_funds,
  declaration_accepted,
  signature_name,
  signed_date,
  status,
  submitted_at,
  reviewed_at,
  approved_at,
  created_at,
  updated_at
`

export function normalizeTrustInvestmentFormRow(row, defaults) {
  return {
    ...defaults,
    id: row?.id || null,
    developmentId: row?.development_id || defaults.developmentId || null,
    unitId: row?.unit_id || defaults.unitId || null,
    transactionId: row?.transaction_id || defaults.transactionId || null,
    buyerId: row?.buyer_id || defaults.buyerId || null,
    attorneyFirmName: row?.attorney_firm_name || defaults.attorneyFirmName || '',
    purchaserFullName: row?.purchaser_full_name || defaults.purchaserFullName || '',
    purchaserIdentityOrRegistrationNumber:
      row?.purchaser_identity_or_registration_number || defaults.purchaserIdentityOrRegistrationNumber || '',
    fullName: row?.full_name || defaults.fullName || '',
    identityOrRegistrationNumber: row?.identity_or_registration_number || defaults.identityOrRegistrationNumber || '',
    incomeTaxNumber: row?.income_tax_number || defaults.incomeTaxNumber || '',
    southAfricanResident:
      row?.south_african_resident === true || row?.south_african_resident === false
        ? row.south_african_resident
        : defaults.southAfricanResident,
    physicalAddress: row?.physical_address || defaults.physicalAddress || '',
    postalAddress: row?.postal_address || defaults.postalAddress || '',
    telephoneNumber: row?.telephone_number || defaults.telephoneNumber || '',
    faxNumber: row?.fax_number || defaults.faxNumber || '',
    balanceTo: row?.balance_to || defaults.balanceTo || '',
    bankName: row?.bank_name || defaults.bankName || '',
    accountNumber: row?.account_number || defaults.accountNumber || '',
    branchNumber: row?.branch_number || defaults.branchNumber || '',
    sourceOfFunds: row?.source_of_funds || defaults.sourceOfFunds || '',
    declarationAccepted: Boolean(row?.declaration_accepted),
    signatureName: row?.signature_name || defaults.signatureName || '',
    signedDate: row?.signed_date || defaults.signedDate || '',
    status: TRUST_INVESTMENT_FORM_STATUSES.includes(row?.status) ? row.status : defaults.status || 'Not Started',
    submittedAt: row?.submitted_at || null,
    reviewedAt: row?.reviewed_at || null,
    approvedAt: row?.approved_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export async function fetchTransactionHandover(client, { developmentId, unitId, transaction, buyer }) {
  const defaults = getDefaultHandoverRecord({
    developmentId,
    unitId,
    transaction,
    buyer,
  })

  if (!transaction?.id) {
    return defaults
  }

  const { data, error } = await client
    .from('transaction_handover')
    .select(TRANSACTION_HANDOVER_SELECT)
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_handover')) {
      return defaults
    }

    throw error
  }

  if (!data) {
    return defaults
  }

  return normalizeHandoverRow(data, defaults)
}

export function normalizeOccupationalRentRecord(row, defaults) {
  const enabled =
    row?.enabled === true || row?.enabled === false
      ? row.enabled
      : row?.is_enabled === true || row?.is_enabled === false
        ? row.is_enabled
        : defaults.enabled || false
  const rawStatus = String(row?.status || defaults.status || 'not_applicable')
    .trim()
    .toLowerCase()
  const normalizedStatus = OCCUPATIONAL_RENT_STATUSES.includes(rawStatus)
    ? rawStatus
    : enabled
      ? 'pending_setup'
      : 'not_applicable'

  return {
    ...defaults,
    id: row?.id || defaults.id || null,
    transactionId: row?.transaction_id || row?.transactionId || defaults.transactionId || null,
    developmentId: row?.development_id || row?.developmentId || defaults.developmentId || null,
    unitId: row?.unit_id || row?.unitId || defaults.unitId || null,
    buyerId: row?.buyer_id || row?.buyerId || defaults.buyerId || null,
    buyerName: row?.buyer_name || row?.buyerName || defaults.buyerName || '',
    enabled,
    status: normalizedStatus,
    occupationDate: normalizeOptionalDate(row?.occupation_date ?? row?.occupationDate) || '',
    rentStartDate: normalizeOptionalDate(row?.rent_start_date ?? row?.rentStartDate) || '',
    monthlyAmount: normalizeOptionalNumber(row?.monthly_amount ?? row?.monthlyAmount),
    proRataAmount: normalizeOptionalNumber(row?.pro_rata_amount ?? row?.proRataAmount),
    nextDueDate: normalizeOptionalDate(row?.next_due_date ?? row?.nextDueDate) || '',
    waived:
      row?.waived === true || row?.waived === false
        ? row.waived
        : row?.is_waived === true || row?.is_waived === false
          ? row.is_waived
          : Boolean(defaults.waived),
    waiverReason: row?.waiver_reason || row?.waiverReason || '',
    notes: row?.notes || '',
    createdAt: row?.created_at || row?.createdAt || defaults.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || defaults.updatedAt || null,
  }
}

export function getOccupationalRentRecordFromEvents(events = [], defaults) {
  const event = (events || []).find(
    (item) =>
      normalizeEventType(item?.eventType || item?.event_type) === 'OccupationalRentUpdated' &&
      item?.eventData &&
      typeof item.eventData === 'object',
  )

  if (!event) {
    return defaults
  }

  return normalizeOccupationalRentRecord(
    {
      ...event.eventData,
      id: event.id || null,
      transaction_id: defaults.transactionId,
      development_id: defaults.developmentId,
      unit_id: defaults.unitId,
      buyer_id: defaults.buyerId,
      created_at: event.createdAt || null,
      updated_at: event.updatedAt || null,
    },
    defaults,
  )
}

export async function syncTransactionSubprocessOwners(client, transaction, subprocesses = []) {
  if (!transaction?.id || !subprocesses.length) {
    return subprocesses
  }

  const managedBy = normalizeFinanceManagedBy(transaction.finance_managed_by)
  const desiredFinanceOwner = managedBy === 'bond_originator' ? 'bond_originator' : 'internal'
  const desiredAttorneyOwner = 'attorney'
  const updates = []

  for (const process of subprocesses) {
    const desiredOwner =
      process.process_type === 'finance'
        ? desiredFinanceOwner
        : ['transfer', 'bond', 'attorney'].includes(process.process_type)
          ? desiredAttorneyOwner
          : desiredAttorneyOwner
    if (process.owner_type !== desiredOwner) {
      updates.push({
        id: process.id,
        transaction_id: transaction.id,
        process_type: process.process_type,
        owner_type: desiredOwner,
        status: process.status || 'not_started',
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (!updates.length) {
    return subprocesses
  }

  const { error } = await client.from('transaction_subprocesses').upsert(updates, { onConflict: 'id' })
  if (error) {
    if (isMissingSchemaError(error)) {
      return subprocesses
    }
    throw error
  }

  return ensureTransactionSubprocesses(client, transaction.id)
}

function relabelDeveloperRequirement(requirement = {}, partyMeta = getTransactionSellerPartyRequirementMeta()) {
  if (!partyMeta.isDeveloperSale) return requirement
  const sellerToDeveloper = (value = '') => String(value || '').replace(/\b[Ss]eller\b/g, (match) => (match === 'seller' ? 'developer' : 'Developer'))
  const requiredFrom = String(requirement.requiredFrom || requirement.required_from_role || '').trim().toLowerCase()
  const appliesTo = String(requirement.appliesTo || requirement.applies_to || '').trim().toLowerCase()

  return {
    ...requirement,
    label: sellerToDeveloper(requirement.label),
    description: sellerToDeveloper(requirement.description),
    reason: requirement.reason
      ? sellerToDeveloper(requirement.reason)
      : partyMeta.triggeringCondition,
    requiredFrom: requiredFrom === 'seller' ? partyMeta.partyRole : requirement.requiredFrom,
    appliesTo: appliesTo === 'seller' ? partyMeta.partyRole : requirement.appliesTo,
  }
}

function mergeLiveRequirementRows(expectedRows = [], persistedRows = [], context = {}) {
  const mergedByKey = new Map()

  for (const row of expectedRows) {
    if (row?.key) {
      mergedByKey.set(row.key, row)
    }
  }

  for (const row of persistedRows || []) {
    if (!row?.key || mergedByKey.has(row.key)) {
      continue
    }

    const normalizedRow = withRequirementTraceMetadata(row, context)
    const status = normalizeRequiredStatus(
      normalizedRow.status,
      statusFromLegacyFlags({
        isRequired: normalizedRow.isRequired !== false,
        isUploaded: Boolean(normalizedRow.isUploaded),
      }),
    )
    if (normalizedRow.isRequired === false || normalizedRow.isEnabled === false || status === 'not_required') {
      continue
    }

    mergedByKey.set(normalizedRow.key, normalizedRow)
  }

  return [...mergedByKey.values()].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
}

function buildSupplementalAttorneyRequirementRows({ transaction = null, currentMainStage = 'AVAIL' } = {}) {
  const sellerPartyMeta = getTransactionSellerPartyRequirementMeta(transaction)
  if (!transaction?.id) {
    return {
      rows: [],
      sellerEmptyReason: `${sellerPartyMeta.partyLabel} details are not captured yet.`,
    }
  }

  const mainStage = normalizeMainStage(currentMainStage, transaction?.stage || 'Available')
  const mainStageIndex = getMainStageIndex(mainStage)
  if (mainStageIndex < getMainStageIndex('OTP')) {
    return {
      rows: [],
      sellerEmptyReason: sellerPartyMeta.deferredReason,
    }
  }

  const resolved = resolveLegalDocumentRequirements(transaction || {})
  const facts = resolved?.facts || {}
  const agencyPartyMeta = getTransactionAgencyPartyRequirementMeta(transaction)
  if (!sellerPartyMeta.isDeveloperSale && facts.sellerEntityType === 'unknown') {
    return { rows: [], sellerEmptyReason: sellerPartyMeta.unknownEntityReason }
  }

  const rows = (resolved?.requirements || [])
    .filter((requirement) => {
      if (!requirement?.id) return false
      if (requirement.laneKey === 'bond') return false
      if (requirement.laneKey === 'cancellation') {
        if (requirement.id === 'existing_bond_account_details' && mainStageIndex >= getMainStageIndex('OTP')) {
          return true
        }
        return mainStageIndex >= getMainStageIndex('ATTY')
      }
      if (requirement.category === 'property_compliance' || requirement.laneKey === 'transfer') {
        return mainStageIndex >= getMainStageIndex('ATTY')
      }
      return (
        isSellerPartyRequirement(requirement, sellerPartyMeta) ||
        isAgencyPartyRequirement(requirement, agencyPartyMeta)
      )
    })
    .map((requirement, index) => {
      const displayRequirement = relabelDeveloperRequirement(requirement, sellerPartyMeta)
      let groupKey = 'seller_documents'
      let owningWorkflow = sellerPartyMeta.onboardingWorkflow
      let visibleSection = 'seller_documents'
      let blockingStage = 'OTP'
      const isAgencyRequirement = isAgencyPartyRequirement(displayRequirement, agencyPartyMeta)

      if (isAgencyRequirement) {
        groupKey = 'agency_documents'
        owningWorkflow = agencyPartyMeta.onboardingWorkflow
        visibleSection = 'agency_documents'
        blockingStage = 'OTP'
      } else if (displayRequirement.laneKey === 'cancellation' && displayRequirement.id !== 'existing_bond_account_details') {
        groupKey = 'cancellation_documents'
        owningWorkflow = 'Bond Cancellation'
        visibleSection = 'transfer_documents'
        blockingStage = 'ATTY'
      } else if (displayRequirement.category === 'property_compliance' || displayRequirement.laneKey === 'transfer') {
        groupKey = 'transfer'
        owningWorkflow = 'Transfer of Property'
        visibleSection = 'transfer_documents'
        blockingStage = 'ATTY'
      }

      return withRequirementTraceMetadata(
        {
          id: `supplemental:${transaction.id}:${displayRequirement.id}`,
          transactionId: transaction.id,
          key: displayRequirement.id,
          label: displayRequirement.label,
          groupKey,
          groupLabel:
            visibleSection === 'agency_documents'
              ? agencyPartyMeta.documentsLabel
              : visibleSection === 'seller_documents'
                ? sellerPartyMeta.documentsLabel
                : visibleSection === 'finance_documents'
                  ? 'Finance'
                  : 'Transfer / Attorney',
          group:
            visibleSection === 'agency_documents'
              ? agencyPartyMeta.documentsLabel
              : visibleSection === 'seller_documents'
                ? sellerPartyMeta.documentsLabel
                : visibleSection === 'finance_documents'
                  ? 'Finance'
                  : 'Transfer / Attorney',
          description: displayRequirement.description || displayRequirement.reason || '',
          requirementLevel: displayRequirement.required === false ? 'optional' : 'required',
          isRequired: displayRequirement.required !== false,
          isUploaded: false,
          isEnabled: true,
          status: displayRequirement.required === false ? 'not_required' : 'missing',
          expectedFromRole: isAgencyRequirement
            ? agencyPartyMeta.partyRole
            : displayRequirement.requiredFrom || sellerPartyMeta.partyRole,
          visibilityScope: sellerPartyMeta.isDeveloperSale || isAgencyRequirement
            ? 'shared'
            : displayRequirement.visibilityDefault === 'client_visible'
              ? 'client'
              : 'shared',
          allowMultiple: false,
          uploadedDocumentId: null,
          uploadedAt: null,
          verifiedAt: null,
          rejectedAt: null,
          notes: '',
          sortOrder: 500 + index,
          canonicalRequirementInstanceId: null,
          canonical_requirement_instance_id: null,
          owningWorkflow,
          visibleSection,
          blockingStage,
          preCollectionAllowed: false,
          isBlocking: displayRequirement.required !== false,
          sourceEngine: 'attorney_document_requirements_resolver',
          sourceRuleOrLegacyPath:
            '/src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js#resolveLegalDocumentRequirements',
          triggeringCondition: displayRequirement.reason || 'Attorney workflow requirement',
          currentMainStageAtGeneration: mainStage,
          lastRecalculatedAt: transaction?.updated_at || transaction?.created_at || null,
          createdAt: transaction?.created_at || null,
          updatedAt: transaction?.updated_at || null,
        },
        {
          transaction,
          currentMainStage: mainStage,
          stage: transaction?.stage || 'Available',
        },
      )
    })

  return {
    rows,
    sellerEmptyReason: rows.length ? '' : sellerPartyMeta.inactiveReason,
  }
}

function buildDocumentChecklistInsights({ transaction = null, checklist = [] } = {}) {
  const stage = normalizeStage(transaction?.stage, 'Available')
  const currentMainStage = normalizeMainStage(transaction?.current_main_stage, stage)
  const financeType = normalizeFinanceType(transaction?.finance_type || 'cash', {
    allowUnknown: true,
  })
  const facts = resolveLegalDocumentRequirements(transaction || {}).facts || {}
  const financeRows = checklist.filter((item) => item?.visibleSection === 'finance_documents')
  const sellerRows = checklist.filter((item) => item?.visibleSection === 'seller_documents')
  const transferRows = checklist.filter((item) => item?.visibleSection === 'transfer_documents')

  let financeEmptyReason = 'No finance requirements are active yet.'
  if (getMainStageIndex(currentMainStage) < getMainStageIndex('FIN')) {
    financeEmptyReason =
      financeType === 'bond' || financeType === 'hybrid' || financeType === 'cash'
        ? 'Finance requirements unlock when the transaction reaches Finance.'
        : 'Finance type is still unknown.'
  }

  const sellerPartyMeta = getTransactionSellerPartyRequirementMeta(transaction)
  let sellerEmptyReason = sellerPartyMeta.noActiveReason
  if (getMainStageIndex(currentMainStage) < getMainStageIndex('OTP')) {
    sellerEmptyReason = sellerPartyMeta.deferredReason
  } else if (!sellerPartyMeta.isDeveloperSale && facts.sellerEntityType === 'unknown') {
    sellerEmptyReason = sellerPartyMeta.unknownEntityReason
  }

  let transferEmptyReason = 'No transfer or attorney requirements are active yet.'
  if (getMainStageIndex(currentMainStage) < getMainStageIndex('ATTY')) {
    transferEmptyReason = 'Transfer and attorney requirements unlock once the matter moves to attorneys.'
  }

  return {
    sections: {
      buyer_documents: {
        emptyReason: 'No buyer requirements are active yet.',
      },
      finance_documents: {
        emptyReason: financeRows.length ? '' : financeEmptyReason,
      },
      seller_documents: {
        emptyReason: sellerRows.length ? '' : sellerEmptyReason,
      },
      transfer_documents: {
        emptyReason: transferRows.length ? '' : transferEmptyReason,
      },
    },
  }
}

export async function buildLiveTransactionChecklistData(
  client,
  { transaction = null, onboardingFormData = null, documents = [], persistedRequirements = [] } = {},
) {
  if (!transaction?.id) {
    return {
      requiredDocuments: [],
      requiredDocumentChecklist: [],
      documentSummary: { uploadedCount: 0, totalRequired: 0 },
      documentChecklistInsights: buildDocumentChecklistInsights({
        transaction,
        checklist: [],
      }),
    }
  }

  const formValues =
    onboardingFormData?.formData && typeof onboardingFormData.formData === 'object'
      ? onboardingFormData.formData
      : onboardingFormData && typeof onboardingFormData === 'object'
        ? onboardingFormData
        : {}
  const stage = normalizeStage(transaction?.stage, 'Available')
  const currentMainStage = normalizeMainStage(transaction?.current_main_stage, stage)
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: formValues,
    transaction,
  })
  const expectedRows = await ensureTransactionRequiredDocuments(
    client,
    {
      transactionId: transaction.id,
      purchaserType: normalizePurchaserType(formValues.purchaser_type || transaction?.purchaser_type),
      financeType: financeSnapshot.financeType,
      reservationRequired:
        financeSnapshot.reservationRequired === true ||
        String(formValues?.reservation_required || '')
          .trim()
          .toLowerCase() === 'yes' ||
        Boolean(transaction?.reservation_required),
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      formData: formValues,
      stage,
      currentMainStage,
    },
    { sync: false },
  )
  const mergedRows = mergeLiveRequirementRows(expectedRows, persistedRequirements, {
    transaction,
    stage,
    currentMainStage,
    formData: formValues,
    financeType: financeSnapshot.financeType,
  })
  const sellerSupplement = buildSupplementalAttorneyRequirementRows({
    transaction,
    currentMainStage,
  })
  const mergedWithSellerSupplement = mergeLiveRequirementRows(mergedRows, sellerSupplement.rows, {
    transaction,
    stage,
    currentMainStage,
    formData: formValues,
    financeType: financeSnapshot.financeType,
  })
  const checklistResult = buildRequiredChecklistFromRows(mergedWithSellerSupplement, documents)
  const insights = buildDocumentChecklistInsights({
    transaction,
    checklist: checklistResult.checklist,
  })

  if (
    !checklistResult.checklist.some((item) => item?.visibleSection === 'seller_documents') &&
    sellerSupplement.sellerEmptyReason
  ) {
    insights.sections.seller_documents.emptyReason = sellerSupplement.sellerEmptyReason
  }

  return {
    requiredDocuments: mergedWithSellerSupplement,
    requiredDocumentChecklist: checklistResult.checklist,
    documentSummary: checklistResult.summary,
    documentChecklistInsights: insights,
  }
}

function pickInheritedParticipant(inheritedParticipants, roleType) {
  const candidates = (inheritedParticipants || []).filter((item) => item.roleType === roleType)
  if (!candidates.length) {
    return null
  }

  return candidates.find((item) => item.isPrimary) || candidates[0]
}

function buildDefaultParticipantRows(transaction, buyer, inheritedParticipants = []) {
  const managedBy = normalizeFinanceManagedBy(transaction?.finance_managed_by)
  const includeSeller = isPrivateTransactionType(transaction?.transaction_type)
  const inheritedAgent = pickInheritedParticipant(inheritedParticipants, 'agent')
  const inheritedAttorney = pickInheritedParticipant(inheritedParticipants, 'attorney')
  const inheritedBondOriginator = pickInheritedParticipant(inheritedParticipants, 'bond_originator')

  const defaults = [
    {
      roleType: 'developer',
      participantName: 'Samlin Internal Team',
      participantEmail: '',
      participantScope: 'reference',
      assignmentSource: 'system_inherited',
    },
    {
      roleType: 'agent',
      participantName: transaction?.assigned_agent || inheritedAgent?.participantName || 'Estate Agent',
      participantEmail: transaction?.assigned_agent_email || inheritedAgent?.participantEmail || '',
      participantScope:
        transaction?.assigned_agent || transaction?.assigned_agent_email
          ? 'transaction'
          : inheritedAgent
            ? 'development'
            : 'reference',
      assignmentSource:
        transaction?.assigned_agent || transaction?.assigned_agent_email
          ? 'transaction_direct'
          : inheritedAgent
            ? 'development_default'
            : 'reference_only',
      userId: transaction?.assigned_agent_email ? null : inheritedAgent?.userId || null,
    },
    {
      roleType: 'attorney',
      legalRole: 'transfer',
      participantName: transaction?.attorney || inheritedAttorney?.participantName || 'Attorney / Conveyancer',
      participantEmail: transaction?.assigned_attorney_email || inheritedAttorney?.participantEmail || '',
      participantScope:
        transaction?.attorney || transaction?.assigned_attorney_email
          ? 'transaction'
          : inheritedAttorney
            ? 'development'
            : 'reference',
      assignmentSource:
        transaction?.attorney || transaction?.assigned_attorney_email
          ? 'transaction_direct'
          : inheritedAttorney
            ? 'development_default'
            : 'reference_only',
      userId: transaction?.assigned_attorney_email ? null : inheritedAttorney?.userId || null,
    },
    {
      roleType: 'bond_originator',
      participantName: transaction?.bond_originator || inheritedBondOriginator?.participantName || 'Bond Originator',
      participantEmail: transaction?.assigned_bond_originator_email || inheritedBondOriginator?.participantEmail || '',
      participantScope:
        transaction?.bond_originator || transaction?.assigned_bond_originator_email
          ? 'transaction'
          : inheritedBondOriginator
            ? 'development'
            : 'reference',
      assignmentSource:
        transaction?.bond_originator || transaction?.assigned_bond_originator_email
          ? 'transaction_direct'
          : inheritedBondOriginator
            ? 'development_default'
            : 'reference_only',
      userId: transaction?.assigned_bond_originator_email ? null : inheritedBondOriginator?.userId || null,
    },
    {
      roleType: 'client',
      participantName: buyer?.name || 'Client / Buyer',
      participantEmail: buyer?.email || '',
      participantScope: 'transaction',
      assignmentSource: 'transaction_direct',
    },
  ]

  if (includeSeller) {
    defaults.push({
      roleType: 'seller',
      participantName: transaction?.seller_name || 'Seller',
      participantEmail: transaction?.seller_email || '',
      participantScope: 'transaction',
      assignmentSource: 'transaction_direct',
    })
  }

  return defaults.map((item) => {
    const permissions = getRolePermissions({
      role: item.roleType,
      financeManagedBy: managedBy,
    })
    const legalRole = item.roleType === 'attorney' ? normalizeAttorneyLegalRole(item.legalRole, 'transfer') : 'none'
    const isInternal = typeof item.isInternal === 'boolean' ? item.isInternal : isInternalStakeholderRole(item.roleType)
    return {
      role_type: item.roleType,
      legal_role: legalRole,
      status: normalizeStakeholderStatus(item.status, 'active'),
      invited_at: item.invitedAt || new Date().toISOString(),
      accepted_at: item.acceptedAt || new Date().toISOString(),
      removed_at: null,
      visibility_scope: item.visibilityScope || (isInternal ? 'internal' : 'shared'),
      is_internal: isInternal,
      participant_name: normalizeNullableText(item.participantName),
      participant_email: normalizeNullableText(item.participantEmail)?.toLowerCase() || null,
      participant_scope: item.participantScope || 'transaction',
      assignment_source: normalizeTransactionParticipantAssignmentSource(item.assignmentSource, 'transaction_direct'),
      user_id: item.userId || null,
      firm_id: item.firmId || null,
      invited_by_user_id: item.invitedByUserId || null,
      invitation_token: null,
      invitation_expires_at: null,
      can_view: permissions.canView,
      can_comment: permissions.canComment,
      can_upload_documents: permissions.canUploadDocuments,
      can_edit_finance_workflow: permissions.canEditFinanceWorkflow,
      can_edit_attorney_workflow: permissions.canEditAttorneyWorkflow,
      can_edit_core_transaction: permissions.canEditCoreTransaction,
    }
  })
}

async function resolveViewerRole(client, participants = []) {
  let viewerEmail = ''
  try {
    const { data } = await client.auth.getSession()
    viewerEmail = String(data?.session?.user?.email || '')
      .trim()
      .toLowerCase()
  } catch {
    viewerEmail = ''
  }

  if (!viewerEmail) {
    return 'developer'
  }

  const matched = participants.find(
    (item) =>
      normalizeStakeholderStatus(item.stakeholderStatus, 'active') === 'active' &&
      String(item.participantEmail || '')
        .trim()
        .toLowerCase() === viewerEmail,
  )
  return matched?.roleType || 'developer'
}

export async function ensureTransactionParticipants(client, { transaction, buyer, explicitCapture = null, sellerContactSlotId = null }) {
  if (!transaction?.id) {
    return {
      participants: [],
      viewerRole: 'developer',
      viewerPermissions: getRolePermissions({
        role: 'developer',
        financeManagedBy: 'bond_originator',
      }),
    }
  }

  const inheritedParticipants = transaction?.development_id
    ? await resolveDevelopmentParticipantsByIdentity(client, {
        developmentIds: [transaction.development_id],
      })
    : []

  const participantPolicy = await resolveTransactionCaptureParticipantPolicy({ client, transactionId: transaction.id, explicitCapture,
    defaults: buildDefaultParticipantRows(transaction, buyer, inheritedParticipants) })
  // Loading a transaction or saving other roleplayers must never rewrite a
  // seller person from the transaction's older contact summary.
  const existingSellers = await client.from('transaction_participants').select('id').eq('transaction_id', transaction.id).eq('role_type', 'seller').is('removed_at', null).limit(1)
  if (existingSellers.error && !isMissingSchemaError(existingSellers.error)) throw existingSellers.error
  const defaults = existingSellers.data?.length ? participantPolicy.defaults.filter((row) => row.role_type !== 'seller') : participantPolicy.defaults.map((row) => row.role_type === 'seller' && sellerContactSlotId ? { ...row, id: sellerContactSlotId } : row)
  const rowSelect = TRANSACTION_PARTICIPANT_FULL_SELECT

  const profileIdByEmail = await resolveProfileIdsByEmail(
    client,
    defaults.map((row) => row.participant_email),
  )
  const upsertRows = defaults.map((row) => ({
    transaction_id: transaction.id,
    user_id: row.user_id || (row.participant_email ? profileIdByEmail[row.participant_email] || null : null),
    ...row,
  }))

  let onConflictKey = 'transaction_id,role_type,legal_role'
  let upsertResult = await upsertTransactionParticipantsRowsWithFallback(client, {
    rows: upsertRows,
    onConflict: onConflictKey,
    rowSelect,
    matchOnLegalRole: true,
  })

  if (
    upsertResult.error &&
    (isMissingColumnError(upsertResult.error, 'can_edit_core_transaction') ||
      isMissingColumnError(upsertResult.error, 'user_id') ||
      isMissingColumnError(upsertResult.error, 'legal_role') ||
      isMissingColumnError(upsertResult.error, 'status') ||
      isMissingColumnError(upsertResult.error, 'firm_id') ||
      isMissingColumnError(upsertResult.error, 'invited_by_user_id') ||
      isMissingColumnError(upsertResult.error, 'invitation_token') ||
      isMissingColumnError(upsertResult.error, 'invitation_expires_at') ||
      isMissingColumnError(upsertResult.error, 'invited_at') ||
      isMissingColumnError(upsertResult.error, 'accepted_at') ||
      isMissingColumnError(upsertResult.error, 'removed_at') ||
      isMissingColumnError(upsertResult.error, 'visibility_scope') ||
      isMissingColumnError(upsertResult.error, 'is_internal') ||
      isMissingColumnError(upsertResult.error, 'participant_scope') ||
      isMissingColumnError(upsertResult.error, 'assignment_source') ||
      isMissingTransactionParticipantExtendedColumn(upsertResult.error))
  ) {
    const missingCanEditCoreTransactionColumn = isMissingColumnError(upsertResult.error, 'can_edit_core_transaction')
    const missingUserIdColumn = isMissingColumnError(upsertResult.error, 'user_id')
    const missingLegalRoleColumn = isMissingColumnError(upsertResult.error, 'legal_role')
    const missingStatusColumn = isMissingColumnError(upsertResult.error, 'status')
    const missingFirmIdColumn = isMissingColumnError(upsertResult.error, 'firm_id')
    const missingInvitedByUserIdColumn = isMissingColumnError(upsertResult.error, 'invited_by_user_id')
    const missingInvitationTokenColumn = isMissingColumnError(upsertResult.error, 'invitation_token')
    const missingInvitationExpiresAtColumn = isMissingColumnError(upsertResult.error, 'invitation_expires_at')
    const missingInvitedAtColumn = isMissingColumnError(upsertResult.error, 'invited_at')
    const missingAcceptedAtColumn = isMissingColumnError(upsertResult.error, 'accepted_at')
    const missingRemovedAtColumn = isMissingColumnError(upsertResult.error, 'removed_at')
    const missingVisibilityColumn = isMissingColumnError(upsertResult.error, 'visibility_scope')
    const missingIsInternalColumn = isMissingColumnError(upsertResult.error, 'is_internal')
    const missingParticipantScopeColumn = isMissingColumnError(upsertResult.error, 'participant_scope')
    const missingAssignmentSourceColumn = isMissingColumnError(upsertResult.error, 'assignment_source')
    const legacyRowSelect = missingLegalRoleColumn
      ? `
      id,
      transaction_id,
      role_type,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      created_at,
      updated_at
    `
      : `
      id,
      transaction_id,
      role_type,
      legal_role,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      created_at,
      updated_at
    `
    const legacyRows = upsertRows.map((row) => {
      const clone = { ...row }
      if (missingUserIdColumn) {
        delete clone.user_id
      }
      if (missingCanEditCoreTransactionColumn) {
        delete clone.can_edit_core_transaction
      }
      if (missingLegalRoleColumn) {
        delete clone.legal_role
      }
      if (missingStatusColumn) {
        delete clone.status
      }
      if (missingVisibilityColumn) {
        delete clone.visibility_scope
      }
      if (missingFirmIdColumn) {
        delete clone.firm_id
      }
      if (missingInvitedByUserIdColumn) {
        delete clone.invited_by_user_id
      }
      if (missingInvitationTokenColumn) {
        delete clone.invitation_token
      }
      if (missingInvitationExpiresAtColumn) {
        delete clone.invitation_expires_at
      }
      if (missingInvitedAtColumn) {
        delete clone.invited_at
      }
      if (missingAcceptedAtColumn) {
        delete clone.accepted_at
      }
      if (missingRemovedAtColumn) {
        delete clone.removed_at
      }
      if (missingIsInternalColumn) {
        delete clone.is_internal
      }
      if (missingParticipantScopeColumn) {
        delete clone.participant_scope
      }
      if (missingAssignmentSourceColumn) {
        delete clone.assignment_source
      }
      return clone
    })

    onConflictKey = missingLegalRoleColumn ? 'transaction_id,role_type' : 'transaction_id,role_type,legal_role'
    upsertResult = await upsertTransactionParticipantsRowsWithFallback(client, {
      rows: legacyRows,
      onConflict: onConflictKey,
      rowSelect: legacyRowSelect,
      matchOnLegalRole: !missingLegalRoleColumn,
    })
  }

  if (upsertResult.error) {
    if (isMissingTableError(upsertResult.error, 'transaction_participants')) {
      const fallbackParticipants = defaults.map((row) =>
        normalizeTransactionParticipantRow({
          transaction_id: transaction.id,
          ...row,
        }),
      )
      const viewerRole = await resolveViewerRole(client, fallbackParticipants)
      const activeViewer = fallbackParticipants.find((item) => item.roleType === viewerRole) || fallbackParticipants[0]
      return {
        participants: fallbackParticipants,
        viewerRole,
        viewerPermissions: activeViewer
          ? {
              canView: activeViewer.canView,
              canComment: activeViewer.canComment,
              canUploadDocuments: activeViewer.canUploadDocuments,
              canEditFinanceWorkflow: activeViewer.canEditFinanceWorkflow,
              canEditAttorneyWorkflow: activeViewer.canEditAttorneyWorkflow,
              canEditCoreTransaction: activeViewer.canEditCoreTransaction,
              canRequestAdditionalDocuments: activeViewer.canRequestAdditionalDocuments,
            }
          : getRolePermissions({
              role: 'developer',
              financeManagedBy: transaction.finance_managed_by,
            }),
      }
    }

    throw upsertResult.error
  }

  // Captured professionals are owned by nomination/connection, not defaults.
  // Include those persisted rows in the view without overwriting their access.
  if (participantPolicy.captured) {
    let persisted = await client.from('transaction_participants').select(rowSelect).eq('transaction_id', transaction.id)
    if (persisted.error && isMissingTransactionParticipantExtendedColumn(persisted.error)) {
      persisted = await client.from('transaction_participants').select(TRANSACTION_PARTICIPANT_LEGACY_SELECT).eq('transaction_id', transaction.id)
    }
    if (persisted.error) throw persisted.error
    upsertResult = persisted
  }
  const participants = (upsertResult.data || []).map((row) => normalizeTransactionParticipantRow(row))
  const viewerRole = await resolveViewerRole(client, participants)
  const activeViewer = participants.find((item) => item.roleType === viewerRole) || participants[0]

  return {
    participants,
    viewerRole,
    viewerPermissions: activeViewer
      ? {
          canView: activeViewer.canView,
          canComment: activeViewer.canComment,
          canUploadDocuments: activeViewer.canUploadDocuments,
          canEditFinanceWorkflow: activeViewer.canEditFinanceWorkflow,
          canEditAttorneyWorkflow: activeViewer.canEditAttorneyWorkflow,
          canEditCoreTransaction: activeViewer.canEditCoreTransaction,
          canRequestAdditionalDocuments: activeViewer.canRequestAdditionalDocuments,
        }
      : getRolePermissions({
          role: 'developer',
          financeManagedBy: transaction.finance_managed_by,
        }),
  }
}
