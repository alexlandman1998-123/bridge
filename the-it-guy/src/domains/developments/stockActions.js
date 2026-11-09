// Extracted without changing validation, persistence order or recovery behaviour.
import { requireClient, normalizeTextValue, normalizeNullableText, isMissingColumnError, normalizeOptionalNumber, normalizeNullableBoolean } from '../../lib/api/shared/readHelpers.js'
import { normalizeDevelopmentUnitRow } from './unitReadApi.js'
import { persistDevelopmentMedia } from '../../lib/developmentMediaStorage.js'
import { fetchDevelopmentProductCatalogue } from './detailReadApi.js'

export async function saveDevelopmentUnit(input = {}) {
  const client = requireClient()

  if (!input.developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizeTextValue(input.unitNumber)) {
    throw new Error('Unit number is required.')
  }

  const normalized = normalizeDevelopmentUnitRow({
    id: input.id,
    development_id: input.developmentId,
    unit_number: input.unitNumber,
    unit_label: input.unitLabel,
    phase: input.phase,
    block: input.block,
    unit_type: input.unitType,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    parking_count: input.parkingCount,
    size_sqm: input.sizeSqm,
    list_price: input.listPrice,
    current_price: input.currentPrice,
    price: input.listPrice,
    status: input.status,
    vat_applicable: input.vatApplicable,
    floorplan_id: input.floorplanId,
    structure_node_id: input.structureNodeId,
    unit_type_id: input.unitTypeId,
    catalogue_floorplan_id: input.catalogueFloorplanId,
    notes: input.notes,
  })

  const payload = {
    id: normalized.id || undefined,
    development_id: input.developmentId,
    unit_number: normalized.unitNumber,
    unit_label: normalizeNullableText(normalized.unitLabel),
    phase: normalizeNullableText(normalized.phase),
    block: normalizeNullableText(normalized.block),
    unit_type: normalizeNullableText(normalized.unitType),
    bedrooms: normalized.bedrooms,
    bathrooms: normalized.bathrooms,
    parking_count: normalized.parkingCount,
    size_sqm: normalized.sizeSqm,
    list_price: normalized.listPrice,
    current_price: normalized.currentPrice,
    price: normalized.listPrice ?? normalized.currentPrice ?? normalized.price ?? 0,
    status: normalized.status || 'Available',
    vat_applicable: normalized.vatApplicable,
    floorplan_id: normalized.floorplanId,
    structure_node_id: normalized.structureNodeId,
    unit_type_id: normalized.unitTypeId,
    catalogue_floorplan_id: normalized.catalogueFloorplanId,
    notes: normalizeNullableText(normalized.notes),
  }

  const { data, error } = await client
    .from('units')
    .upsert(payload, { onConflict: 'id' })
    .select(
      'id, development_id, unit_number, unit_label, phase, block, unit_type, unit_type_id, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, catalogue_floorplan_id, structure_node_id, notes',
    )
    .single()

  if (error) {
    if (isMissingColumnError(error, 'unit_label') || isMissingColumnError(error, 'list_price') || isMissingColumnError(error, 'structure_node_id') || isMissingColumnError(error, 'unit_type_id') || isMissingColumnError(error, 'catalogue_floorplan_id')) {
      if ((input.requireStructureLink && normalized.structureNodeId) || normalized.catalogueFloorplanId) {
        throw new Error('This environment cannot save the full building and floor stock or unit layout links yet. Unit setup stopped; check the development workspace before retrying.', { cause: error })
      }
      const fallbackPayload = {
        id: normalized.id || undefined,
        development_id: input.developmentId,
        unit_number: normalized.unitNumber,
        phase: normalizeNullableText(normalized.phase),
        price: normalized.listPrice ?? normalized.currentPrice ?? normalized.price ?? 0,
        status: normalized.status || 'Available',
      }

      const fallback = await client
        .from('units')
        .upsert(fallbackPayload, { onConflict: 'id' })
        .select('id, development_id, unit_number, phase, price, status')
        .single()

      if (fallback.error) {
        throw fallback.error
      }

      return normalizeDevelopmentUnitRow(fallback.data)
    }
    throw error
  }

  return normalizeDevelopmentUnitRow(data)
}

export async function saveDevelopmentStructureNodes({ developmentId, nodes = [] } = {}) {
  const client = requireClient()
  const normalizedDevelopmentId = normalizeTextValue(developmentId)
  if (!normalizedDevelopmentId) throw new Error('Development is required.')
  if (!Array.isArray(nodes) || !nodes.length) return []

  const payload = nodes.map((node) => ({
    id: node.id,
    development_id: normalizedDevelopmentId,
    parent_id: node.parentId || null,
    node_type: normalizeTextValue(node.nodeType),
    label: normalizeTextValue(node.label),
    sort_order: Number.isFinite(Number(node.sortOrder)) ? Number(node.sortOrder) : 0,
  }))
  if (payload.some((node) => !node.id || !node.node_type || !node.label)) {
    throw new Error('Every structure node needs an ID, type, and label.')
  }

  const { data, error } = await client
    .from('development_structure_nodes')
    .upsert(payload, { onConflict: 'id' })
    .select('id, development_id, parent_id, node_type, label, sort_order')

  if (error) throw error
  return data || []
}

export async function saveDevelopmentProductCatalogue({ developmentId, unitTypes = [], floorplans = [], prices = [], priceBook = {} } = {}) {
  const client = requireClient()
  const normalizedDevelopmentId = normalizeTextValue(developmentId)
  if (!normalizedDevelopmentId) throw new Error('Development is required.')

  for (const layout of floorplans) {
    if (layout.storeys !== undefined && layout.storeys !== null && layout.storeys !== '' && (!Number.isInteger(Number(layout.storeys)) || Number(layout.storeys) < 1)) {
      throw new Error('Number of storeys must be a positive whole number.')
    }
  }

  const unitTypePayload = unitTypes.filter((item) => normalizeTextValue(item.name)).map((item, index) => ({
    id: item.id || undefined, development_id: normalizedDevelopmentId, code: normalizeNullableText(item.code), name: normalizeTextValue(item.name), description: normalizeNullableText(item.description), bedrooms: normalizeOptionalNumber(item.bedrooms), bathrooms: normalizeOptionalNumber(item.bathrooms), parking_count: normalizeOptionalNumber(item.parkingCount), internal_size_sqm: normalizeOptionalNumber(item.internalSizeSqm), external_size_sqm: normalizeOptionalNumber(item.externalSizeSqm), vat_applicable: normalizeNullableBoolean(item.vatApplicable), no_transfer_duty: Boolean(item.noTransferDuty), is_active: item.isActive !== false, sort_order: index,
  }))
  let savedUnitTypes = []
  if (unitTypePayload.length) {
    const { data, error: unitTypesError } = await client.from('development_unit_types').upsert(unitTypePayload, { onConflict: 'id' }).select('id, code, name')
    if (unitTypesError) throw unitTypesError
    savedUnitTypes = data || []
  }
  const typeIdByKey = new Map((savedUnitTypes || []).flatMap((item) => [[String(item.id), item.id], [`code:${String(item.code || '').toLowerCase()}`, item.id], [`name:${String(item.name || '').toLowerCase()}`, item.id]]))

  const resolveUnitTypeId = (item) => typeIdByKey.get(String(item.unitTypeId || '')) || typeIdByKey.get(`code:${String(item.unitTypeCode || '').toLowerCase()}`) || typeIdByKey.get(`name:${String(item.unitTypeName || item.name || '').toLowerCase()}`) || null
  const floorplanPayload = persistDevelopmentMedia(client, floorplans.filter((item) => normalizeTextValue(item.name)).map((item, index) => ({
    id: item.id || undefined, development_id: normalizedDevelopmentId, unit_type_id: resolveUnitTypeId(item), metadata: { ...(item.metadata || {}), ...(item.storeys !== undefined ? { storeys: item.storeys === null || item.storeys === '' ? null : Number(item.storeys) } : {}) }, code: normalizeNullableText(item.code), name: normalizeTextValue(item.name), document_id: item.documentId || null, file_url: normalizeNullableText(item.fileUrl), thumbnail_url: normalizeNullableText(item.thumbnailUrl), internal_size_sqm: normalizeOptionalNumber(item.internalSizeSqm), external_size_sqm: normalizeOptionalNumber(item.externalSizeSqm), is_active: item.isActive !== false, sort_order: index,
  })), normalizedDevelopmentId)
  if (floorplanPayload.length) {
    const { error: floorplansError } = await client.from('development_floorplans').upsert(floorplanPayload, { onConflict: 'id' }).select('id, code, name')
    if (floorplansError) throw floorplansError
  }

  await client.from('development_price_books').update({ is_default: false }).eq('development_id', normalizedDevelopmentId).eq('is_default', true)
  const { data: savedPriceBook, error: priceBookError } = await client.from('development_price_books').upsert({
    id: priceBook.id || undefined, development_id: normalizedDevelopmentId, name: normalizeTextValue(priceBook.name) || 'Current sales price list', currency_code: normalizeTextValue(priceBook.currencyCode) || 'ZAR', effective_from: priceBook.effectiveFrom || null, effective_to: priceBook.effectiveTo || null, status: priceBook.status || 'active', is_default: true,
  }, { onConflict: 'id' }).select('id').single()
  if (priceBookError) throw priceBookError

  const pricePayload = prices.filter((item) => item.unitTypeId || item.unitTypeCode || item.unitTypeName).map((item) => ({
    id: item.id || undefined, development_id: normalizedDevelopmentId, price_book_id: savedPriceBook.id, unit_type_id: resolveUnitTypeId(item), floorplan_id: item.floorplanId || null, unit_id: item.unitId || null, list_price: normalizeOptionalNumber(item.listPrice), price_from: normalizeOptionalNumber(item.priceFrom), price_to: normalizeOptionalNumber(item.priceTo), reservation_fee: normalizeOptionalNumber(item.reservationFee), is_active: true,
  })).filter((item) => item.unit_type_id || item.floorplan_id || item.unit_id)
  if (pricePayload.length) {
    const { error: pricesError } = await client.from('development_unit_prices').upsert(pricePayload, { onConflict: 'id' })
    if (pricesError) throw pricesError
  }

  return fetchDevelopmentProductCatalogue(client, normalizedDevelopmentId)
}

export async function createUnit({
  developmentId,
  unitNumber,
  unitLabel = '',
  block = '',
  unitType = '',
  bedrooms = null,
  bathrooms = null,
  parkingCount = null,
  sizeSqm = null,
  currentPrice = null,
  status = 'Available',
  vatApplicable = null,
  floorplanId = null,
  notes = '',
  price,
}) {
  const client = requireClient()
  const normalizedUnit = unitNumber?.trim()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizedUnit) {
    throw new Error('Unit number is required.')
  }

  const parsedPrice = Number(price)
  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    throw new Error('Price must be 0 or greater.')
  }

  const { data, error } = await client
    .from('units')
    .insert({
      development_id: developmentId,
      unit_number: normalizedUnit,
      unit_label: normalizeNullableText(unitLabel),
      phase: null,
      block: normalizeNullableText(block),
      unit_type: normalizeNullableText(unitType),
      bedrooms: normalizeOptionalNumber(bedrooms),
      bathrooms: normalizeOptionalNumber(bathrooms),
      parking_count: normalizeOptionalNumber(parkingCount),
      size_sqm: normalizeOptionalNumber(sizeSqm),
      list_price: parsedPrice,
      current_price: normalizeOptionalNumber(currentPrice) ?? parsedPrice,
      price: parsedPrice,
      status,
      vat_applicable: normalizeNullableBoolean(vatApplicable),
      floorplan_id: floorplanId || null,
      notes: normalizeNullableText(notes),
    })
    .select(
      'id, development_id, unit_number, unit_label, phase, block, unit_type, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, notes',
    )
    .single()

  if (error) {
    throw error
  }

  return data
}
