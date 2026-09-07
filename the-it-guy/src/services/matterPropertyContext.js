const text = (value = '') => String(value || '').trim()
const hasCapturedAmount = (value) => Number(value || 0) > 0

function isSchemaCompatibilityError(error) {
  const code = text(error?.code).toUpperCase()
  const message = text(error?.message).toLowerCase()
  return ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(code) ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('permission denied')
}

function profileWithAliases(profile = {}) {
  return {
    ...profile,
    developmentId: profile.development_id || '',
    formattedAddress: profile.formatted_address || '',
    streetAddress: profile.street_address || '',
    postalCode: profile.postal_code || '',
    developerCompany: profile.developer_company || '',
    launchDate: profile.launch_date || '',
    expectedCompletionDate: profile.expected_completion_date || '',
    imageLinks: Array.isArray(profile.image_links) ? profile.image_links : [],
    marketingContent: profile.marketing_content || {},
    sellerDetails: profile.seller_details || null,
  }
}

async function fetchRows(client, table, select, ids, fallbackSelect) {
  if (!ids.length) return []
  let result = await client.from(table).select(select).in(table === 'development_profiles' ? 'development_id' : 'id', ids)
  if (result.error && fallbackSelect && isSchemaCompatibilityError(result.error)) {
    result = await client.from(table).select(fallbackSelect).in(table === 'development_profiles' ? 'development_id' : 'id', ids)
  }
  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return []
    throw result.error
  }
  return result.data || []
}

// A matter keeps foreign keys to the unit/development; it should never carry a
// copied development snapshot. This adds the currently saved source records to
// the read model so attorney cards and opened matters agree after an update.
export async function hydrateMatterPropertyContext(client, transactions = []) {
  let rows = Array.isArray(transactions) ? transactions.filter(Boolean) : []
  if (!client || !rows.length) return rows

  // RPC snapshots intentionally keep their payload small. When a snapshot has
  // only a transaction id, resolve the relationship keys before loading the
  // source property records.
  const transactionIdsNeedingCoreFields = rows
    .filter((row) => (
      !text(row.development_id || row.developmentId || row.unit_id || row.unitId) ||
      !hasCapturedAmount(row.purchase_price || row.purchasePrice || row.sales_price || row.salesPrice || row.bond_amount || row.bondAmount)
    ))
    .map((row) => text(row.id || row.transaction_id || row.transactionId))
    .filter(Boolean)
  if (transactionIdsNeedingCoreFields.length) {
    const coreRows = await fetchRows(
      client,
      'transactions',
      'id, development_id, unit_id, purchase_price, sales_price, bond_amount, deposit_amount',
      [...new Set(transactionIdsNeedingCoreFields)],
      'id, development_id, unit_id, purchase_price, sales_price',
    )
    const coreByTransactionId = new Map(coreRows.map((row) => [text(row.id), row]))
    rows = rows.map((row) => {
      const core = coreByTransactionId.get(text(row.id || row.transaction_id || row.transactionId))
      return core ? {
        ...row,
        development_id: row.development_id || row.developmentId || core.development_id || null,
        unit_id: row.unit_id || row.unitId || core.unit_id || null,
        ...(!hasCapturedAmount(row.purchase_price || row.purchasePrice) && hasCapturedAmount(core.purchase_price)
          ? { purchase_price: core.purchase_price }
          : {}),
        ...(!hasCapturedAmount(row.sales_price || row.salesPrice) && hasCapturedAmount(core.sales_price)
          ? { sales_price: core.sales_price }
          : {}),
        ...(!hasCapturedAmount(row.bond_amount || row.bondAmount) && hasCapturedAmount(core.bond_amount)
          ? { bond_amount: core.bond_amount }
          : {}),
        ...(!hasCapturedAmount(row.deposit_amount || row.depositAmount) && hasCapturedAmount(core.deposit_amount)
          ? { deposit_amount: core.deposit_amount }
          : {}),
      } : row
    })
  }

  const unitIds = [...new Set(rows.map((row) => text(row.unit_id || row.unitId)).filter(Boolean))]
  const directDevelopmentIds = rows.map((row) => text(row.development_id || row.developmentId)).filter(Boolean)
  const units = await fetchRows(
    client,
    'units',
    'id, development_id, unit_number, unit_label, phase, block, price, current_price, list_price, status, property_type, property_title_type',
    unitIds,
    'id, development_id, unit_number, phase, price, status',
  )
  const unitsById = new Map(units.map((unit) => [text(unit.id), unit]))
  const developmentIds = [...new Set([
    ...directDevelopmentIds,
    ...units.map((unit) => text(unit.development_id)).filter(Boolean),
  ])]
  const [developments, profiles] = await Promise.all([
    fetchRows(client, 'developments', 'id, name, location', developmentIds),
    fetchRows(
      client,
      'development_profiles',
      'development_id, code, location, suburb, city, province, country, address, formatted_address, street_address, postal_code, description, status, developer_company, launch_date, expected_completion_date, image_links, seller_details, marketing_content',
      developmentIds,
      'development_id, location, address, description, status, image_links',
    ),
  ])
  const developmentsById = new Map(developments.map((development) => [text(development.id), development]))
  const profilesByDevelopmentId = new Map(profiles.map((profile) => [text(profile.development_id), profileWithAliases(profile)]))

  return rows.map((transaction) => {
    const unit = unitsById.get(text(transaction.unit_id || transaction.unitId)) || transaction.property_unit || transaction.propertyUnit || null
    const developmentId = text(transaction.development_id || transaction.developmentId || unit?.development_id || unit?.developmentId)
    const sourceDevelopment = developmentsById.get(developmentId) || transaction.property_development || transaction.propertyDevelopment || null
    const profile = profilesByDevelopmentId.get(developmentId) || sourceDevelopment?.profile || sourceDevelopment?.developmentProfile || null
    const development = sourceDevelopment || profile ? {
      ...(sourceDevelopment || {}),
      id: developmentId || sourceDevelopment?.id || null,
      profile,
      developmentProfile: profile,
      address: profile?.address || sourceDevelopment?.address || '',
      formatted_address: profile?.formatted_address || sourceDevelopment?.formatted_address || '',
      street_address: profile?.street_address || sourceDevelopment?.street_address || '',
      suburb: profile?.suburb || sourceDevelopment?.suburb || '',
      city: profile?.city || sourceDevelopment?.city || '',
      province: profile?.province || sourceDevelopment?.province || '',
      country: profile?.country || sourceDevelopment?.country || '',
      developer_company: profile?.developer_company || sourceDevelopment?.developer_company || '',
    } : null

    return {
      ...transaction,
      ...(developmentId && !transaction.development_id ? { development_id: developmentId } : {}),
      property_unit: unit,
      propertyUnit: unit,
      property_development: development,
      propertyDevelopment: development,
    }
  })
}
