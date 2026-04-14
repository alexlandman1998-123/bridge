function formatReference(transactionId) {
  return transactionId ? `TRX-${String(transactionId).replaceAll('-', '').slice(0, 8).toUpperCase()}` : 'Pending'
}

function getClientType(row) {
  const type = String(row?.transaction?.purchaser_type || '').trim().toLowerCase()
  if (type === 'trust') return 'trust'
  if (type === 'company') return 'company'
  return 'individual'
}

function getClientRole() {
  return 'buyer'
}

function getMatterType(row) {
  const explicit = String(row?.transaction?.transaction_type || '').trim().toLowerCase()
  if (explicit === 'private' || explicit === 'private_property') return 'private'
  if (explicit === 'development' || explicit === 'developer_sale') return 'development'
  return row?.development?.id || row?.unit?.id ? 'development' : 'private'
}

function getLastActivityAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getPropertyLabel(row) {
  if (getMatterType(row) === 'private') {
    return (
      [
        row?.transaction?.property_address_line_1,
        row?.transaction?.suburb || row?.transaction?.city,
      ]
        .filter(Boolean)
        .join(', ') ||
      row?.transaction?.property_description ||
      'Private property matter'
    )
  }

  return `${row?.development?.name || 'Unknown Development'} • Unit ${row?.unit?.unit_number || '-'}`
}

function buildClientId(row) {
  return (
    row?.buyer?.id ||
    row?.transaction?.buyer_id ||
    String(row?.buyer?.email || '').trim().toLowerCase() ||
    String(row?.buyer?.name || '').trim().toLowerCase().replace(/\s+/g, '-')
  )
}

function getDisplayName(row) {
  return row?.buyer?.name || 'Unnamed client'
}

function getTypeBadgeLabel(type) {
  if (type === 'trust') return 'Trust'
  if (type === 'company') return 'Company'
  return 'Individual'
}

function getRoleBadgeLabel(role) {
  if (role === 'seller') return 'Seller'
  if (role === 'both') return 'Buyer / Seller'
  return 'Buyer'
}

export function deriveAttorneyClients(rows = []) {
  const grouped = new Map()

  for (const row of rows) {
    if (!row?.transaction || !row?.buyer) continue
    const clientId = buildClientId(row)
    if (!clientId) continue

    if (!grouped.has(clientId)) {
      const clientType = getClientType(row)
      const role = getClientRole(row)

      grouped.set(clientId, {
        id: clientId,
        name: getDisplayName(row),
        email: row?.buyer?.email || '',
        phone: row?.buyer?.phone || '',
        type: clientType,
        typeLabel: getTypeBadgeLabel(clientType),
        role,
        roleLabel: getRoleBadgeLabel(role),
        entityName: clientType === 'individual' ? '' : getDisplayName(row),
        activeTransactions: 0,
        completedTransactions: 0,
        totalTransactions: 0,
        lastActivityAt: null,
        latestTransactionId: null,
        latestPropertyLabel: '',
        latestStage: '',
        transactions: [],
      })
    }

    const client = grouped.get(clientId)
    const lastActivityAt = getLastActivityAt(row)
    const isCompleted = String(row?.stage || row?.transaction?.stage || '').toLowerCase() === 'registered'

    client.totalTransactions += 1
    client.activeTransactions += isCompleted ? 0 : 1
    client.completedTransactions += isCompleted ? 1 : 0
    client.transactions.push(row)

    if (!client.lastActivityAt || new Date(lastActivityAt || 0) > new Date(client.lastActivityAt || 0)) {
      client.lastActivityAt = lastActivityAt
      client.latestTransactionId = row?.transaction?.id || null
      client.latestPropertyLabel = getPropertyLabel(row)
      client.latestStage = row?.stage || row?.transaction?.stage || 'Unknown'
    }
  }

  return Array.from(grouped.values())
    .map((client) => ({
      ...client,
      status: client.activeTransactions > 0 ? 'active' : 'inactive',
      statusLabel: client.activeTransactions > 0 ? 'Active' : 'Inactive',
    }))
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
}

export function filterAttorneyClients(clients = [], { search = '', filter = 'all' } = {}) {
  const normalizedSearch = String(search || '').trim().toLowerCase()

  return clients.filter((client) => {
    const filterMatch =
      filter === 'all'
        ? true
        : filter === 'buyers'
          ? client.role === 'buyer' || client.role === 'both'
          : filter === 'sellers'
            ? client.role === 'seller' || client.role === 'both'
            : filter === 'trusts'
              ? client.type === 'trust'
              : filter === 'companies'
                ? client.type === 'company'
                : filter === 'active'
                  ? client.status === 'active'
                  : filter === 'inactive'
                    ? client.status === 'inactive'
                    : true

    if (!filterMatch) return false
    if (!normalizedSearch) return true

    const haystack = [
      client.name,
      client.email,
      client.phone,
      client.typeLabel,
      client.roleLabel,
      client.latestPropertyLabel,
      client.latestStage,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ')

    return haystack.includes(normalizedSearch)
  })
}

export function getAttorneyClientProfile(rows = [], clientId) {
  const clients = deriveAttorneyClients(rows)
  const client = clients.find((item) => String(item.id) === String(clientId))
  if (!client) return null

  const transactions = (client.transactions || [])
    .map((row) => ({
      id: row?.transaction?.id || null,
      unitId: row?.unit?.id || null,
      reference: formatReference(row?.transaction?.id),
      propertyLabel: getPropertyLabel(row),
      stageLabel: row?.stage || row?.transaction?.stage || 'Unknown',
      type: getMatterType(row),
      typeLabel: getMatterType(row) === 'private' ? 'Private' : 'Development',
      status: String(row?.stage || row?.transaction?.stage || '').toLowerCase() === 'registered' ? 'Completed' : 'Active',
      lastActivityAt: getLastActivityAt(row),
    }))
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))

  return {
    client,
    transactions,
  }
}
