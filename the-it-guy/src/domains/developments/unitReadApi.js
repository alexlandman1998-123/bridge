// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { isMissingColumnError, normalizeTextValue, normalizeOptionalNumber, normalizeNullableBoolean, isMissingTableError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { fetchActiveTransactionsForUnitIds } from '../transactions/summaryReadApi.js'
import { selectWithoutKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeStage, normalizeMainStage, byDevelopmentThenUnit, TRANSACTION_HANDOVER_SELECT, getDefaultHandoverRecord, normalizeHandoverRow } from '../../core/transactions/legacyReadModel.js'

export async function queryClientIssues(client, { unitId = null, unitIds = [] } = {}) {
  const selectVariants = [
    'id, development_id, unit_id, transaction_id, buyer_id, category, description, location, priority, photo_path, signed_off_by, signed_off_at, status, created_at, updated_at',
    'id, development_id, unit_id, transaction_id, buyer_id, category, description, location, priority, photo_path, status, created_at, updated_at',
    'id, development_id, unit_id, buyer_id, category, description, location, priority, photo_path, status, created_at, updated_at',
    'id, development_id, unit_id, buyer_id, category, description, location, priority, status, created_at',
  ]

  let lastError = null

  for (const selectClause of selectVariants) {
    let query = client.from('client_issues').select(selectClause).order('created_at', { ascending: false })

    if (unitId) {
      query = query.eq('unit_id', unitId)
    } else if (unitIds.length) {
      query = query.in('unit_id', unitIds)
    }

    const result = await query
    if (!result.error) {
      return result
    }

    lastError = result.error

    if (
      !isMissingColumnError(result.error, 'transaction_id') &&
      !isMissingColumnError(result.error, 'signed_off_by') &&
      !isMissingColumnError(result.error, 'signed_off_at') &&
      !isMissingColumnError(result.error, 'photo_path') &&
      !isMissingColumnError(result.error, 'updated_at')
    ) {
      return result
    }
  }

  return { data: null, error: lastError }
}

export function normalizeDevelopmentUnitRow(row = {}) {
  const rawFloorplanId = row.floorplan_id || row.floorplanId || null
  const rawStructureNodeId = row.structure_node_id || row.structureNodeId || null
  const rawUnitTypeId = row.unit_type_id || row.unitTypeId || null
  const rawCatalogueFloorplanId = row.catalogue_floorplan_id || row.catalogueFloorplanId || null
  const normalizedFloorplanId =
    typeof rawFloorplanId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawFloorplanId)
      ? rawFloorplanId
      : null

  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    unitNumber: normalizeTextValue(row.unit_number ?? row.unitNumber),
    unitLabel: normalizeTextValue(row.unit_label ?? row.unitLabel),
    phase: normalizeTextValue(row.phase),
    block: normalizeTextValue(row.block),
    unitType: normalizeTextValue(row.unit_type ?? row.unitType),
    bedrooms: normalizeOptionalNumber(row.bedrooms),
    bathrooms: normalizeOptionalNumber(row.bathrooms),
    parkingCount: normalizeOptionalNumber(row.parking_count ?? row.parkingCount),
    sizeSqm: normalizeOptionalNumber(row.size_sqm ?? row.sizeSqm),
    listPrice: normalizeOptionalNumber(row.list_price ?? row.listPrice ?? row.price),
    currentPrice: normalizeOptionalNumber(row.current_price ?? row.currentPrice ?? row.price),
    price: normalizeOptionalNumber(row.price ?? row.list_price ?? row.listPrice),
    status: normalizeTextValue(row.status) || 'Available',
    vatApplicable: normalizeNullableBoolean(row.vat_applicable ?? row.vatApplicable),
    floorplanId: normalizedFloorplanId,
    structureNodeId: typeof rawStructureNodeId === 'string' ? rawStructureNodeId : null,
    unitTypeId: typeof rawUnitTypeId === 'string' ? rawUnitTypeId : null,
    catalogueFloorplanId: typeof rawCatalogueFloorplanId === 'string' ? rawCatalogueFloorplanId : null,
    notes: normalizeTextValue(row.notes),
  }
}

export async function fetchUnitsBase(client, developmentId = null) {
  let query = client
    .from('units')
    .select(
      'id, development_id, unit_number, unit_label, phase, block, unit_type, unit_type_id, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, catalogue_floorplan_id, structure_node_id, notes, development:developments(id, name)',
    )

  if (developmentId && developmentId !== 'all') {
    query = query.eq('development_id', developmentId)
  }

  let result = await query.order('unit_number', { ascending: true })

  if (
    result.error &&
    (isMissingColumnError(result.error, 'unit_label') || isMissingColumnError(result.error, 'list_price') || isMissingColumnError(result.error, 'unit_type_id') || isMissingColumnError(result.error, 'catalogue_floorplan_id') || isMissingColumnError(result.error, 'structure_node_id'))
  ) {
    result = await client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .order('unit_number', { ascending: true })

    if (developmentId && developmentId !== 'all') {
      result = await client
        .from('units')
        .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
        .eq('development_id', developmentId)
        .order('unit_number', { ascending: true })
    }
  }

  const { data, error } = result

  if (error) {
    throw error
  }

  return (data || []).map((row) => ({
    ...row,
    ...normalizeDevelopmentUnitRow(row),
  }))
}

export async function hydrateUnitRows(client, units, { includeOperationalSignals = true } = {}) {
  if (!units.length) {
    return []
  }

  const unitIds = units.map((unit) => unit.id)
  const transactions = await fetchActiveTransactionsForUnitIds(client, unitIds)

  const latestByUnit = {}
  for (const transaction of transactions) {
    if (!latestByUnit[transaction.unit_id]) {
      latestByUnit[transaction.unit_id] = transaction
    }
  }

  const buyerIds = [...new Set(transactions.map((transaction) => transaction.buyer_id).filter(Boolean))]
  let buyersById = {}

  if (buyerIds.length) {
    const buyersQuery = await client
      .from('buyers')
      .select(selectWithoutKnownMissingColumns('id, name, phone, email'))
      .in('id', buyerIds)

    const { data: buyers, error: buyersError } = buyersQuery

    if (buyersError) {
      throw buyersError
    }

    buyersById = buyers.reduce((accumulator, buyer) => {
      accumulator[buyer.id] = buyer
      return accumulator
    }, {})
  }

  const transactionOrganisationIds = [
    ...new Set(transactions.map((transaction) => transaction.organisation_id).filter(Boolean)),
  ]
  let organisationsById = {}

  if (transactionOrganisationIds.length) {
    let organisationsQuery = await client
      .from('organisations')
      .select('id, name, display_name, logo_url')
      .in('id', transactionOrganisationIds)

    if (
      organisationsQuery.error &&
      (isMissingColumnError(organisationsQuery.error, 'display_name') ||
        isMissingColumnError(organisationsQuery.error, 'logo_url'))
    ) {
      organisationsQuery = await client
        .from('organisations')
        .select('id, name')
        .in('id', transactionOrganisationIds)
    }

    if (organisationsQuery.error) {
      if (
        !isMissingTableError(organisationsQuery.error, 'organisations') &&
        !isPermissionDeniedError(organisationsQuery.error)
      ) {
        throw organisationsQuery.error
      }
    } else {
      organisationsById = (organisationsQuery.data || []).reduce((accumulator, organisation) => {
        accumulator[organisation.id] = {
          id: organisation.id,
          name: normalizeTextValue(organisation.display_name || organisation.name),
          displayName: normalizeTextValue(organisation.display_name || organisation.name),
          logoUrl: normalizeTextValue(organisation.logo_url),
        }
        return accumulator
      }, {})
    }
  }

  const rows = units.map((unit) => {
    const transaction = latestByUnit[unit.id] || null
    const buyer = transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null
    const stage = normalizeStage(transaction?.stage, unit.status)
    const responsibleAgency = transaction?.organisation_id ? organisationsById[transaction.organisation_id] || null : null

    return {
      unit,
      development: unit.development,
      transaction,
      buyer,
      responsibleAgency,
      stage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, stage),
    }
  })

  if (!includeOperationalSignals) {
    return rows.sort(byDevelopmentThenUnit)
  }

  const transactionIds = rows.map((row) => row.transaction?.id).filter(Boolean)
  const transactionIdByUnitId = rows.reduce((accumulator, row) => {
    if (row.transaction?.id) {
      accumulator[row.unit.id] = row.transaction.id
    }
    return accumulator
  }, {})

  let handoverRows = []
  if (transactionIds.length) {
    const handoverQuery = await client
      .from('transaction_handover')
      .select(TRANSACTION_HANDOVER_SELECT)
      .in('transaction_id', transactionIds)
      .order('updated_at', { ascending: false })

    if (handoverQuery.error) {
      if (!isMissingTableError(handoverQuery.error, 'transaction_handover')) {
        throw handoverQuery.error
      }
    } else {
      handoverRows = handoverQuery.data || []
    }
  }

  const handoverByUnitId = {}
  for (const handoverRow of handoverRows) {
    const unitId =
      handoverRow.unit_id ||
      Object.keys(transactionIdByUnitId).find((key) => transactionIdByUnitId[key] === handoverRow.transaction_id)
    if (!unitId || handoverByUnitId[unitId]) {
      continue
    }

    const row = rows.find((item) => item.unit.id === unitId)
    const defaults = getDefaultHandoverRecord({
      developmentId: row?.unit?.development_id || handoverRow.development_id || null,
      unitId,
      transaction: row?.transaction || {
        id: handoverRow.transaction_id,
        buyer_id: handoverRow.buyer_id,
      },
      buyer: row?.buyer || null,
    })

    handoverByUnitId[unitId] = normalizeHandoverRow(handoverRow, defaults)
  }

  const issuesResult = await queryClientIssues(client, { unitIds })
  let issues = []
  if (issuesResult.error) {
    if (!isMissingTableError(issuesResult.error, 'client_issues') && !isPermissionDeniedError(issuesResult.error)) {
      throw issuesResult.error
    }
  } else {
    issues = issuesResult.data || []
  }

  const snagSummaryByUnitId = {}
  for (const issue of issues) {
    const unitId = issue.unit_id
    if (!unitId) {
      continue
    }

    if (!snagSummaryByUnitId[unitId]) {
      snagSummaryByUnitId[unitId] = {
        totalCount: 0,
        openCount: 0,
        latestUpdatedAt: null,
      }
    }

    const summary = snagSummaryByUnitId[unitId]
    const normalizedStatus = String(issue.status || '')
      .trim()
      .toLowerCase()
    const updatedAt = issue.updated_at || issue.created_at || null

    summary.totalCount += 1
    if (!['resolved', 'closed', 'completed'].includes(normalizedStatus)) {
      summary.openCount += 1
    }

    if (updatedAt && (!summary.latestUpdatedAt || new Date(updatedAt) > new Date(summary.latestUpdatedAt))) {
      summary.latestUpdatedAt = updatedAt
    }
  }

  return rows
    .map((row) => {
      const defaultHandover = getDefaultHandoverRecord({
        developmentId: row.unit?.development_id || null,
        unitId: row.unit?.id || null,
        transaction: row.transaction,
        buyer: row.buyer,
      })
      const handover = handoverByUnitId[row.unit.id] || defaultHandover
      const snagSummary = snagSummaryByUnitId[row.unit.id] || {
        totalCount: 0,
        openCount: 0,
        latestUpdatedAt: null,
      }

      return {
        ...row,
        handover,
        snagSummary: {
          ...snagSummary,
          status: snagSummary.totalCount === 0 ? 'clear' : snagSummary.openCount > 0 ? 'open' : 'resolved',
        },
      }
    })
    .sort(byDevelopmentThenUnit)
}
