export const ATTORNEY_MOCK_ROWS = []

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.filter(Boolean) : []
}

export function buildAttorneyDemoRows(rows = []) {
  return normalizeRows(rows)
}

export function buildAgentDemoRows(rows = []) {
  return normalizeRows(rows)
}

export function buildBondDemoRows(rows = []) {
  return normalizeRows(rows)
}

export function getAttorneyMockRowsForDevelopment() {
  return []
}

export function getAttorneyMockDevelopmentDetail() {
  return null
}

export function getAttorneyMockTransactionDetail() {
  return null
}

export function getAttorneyMockTransactionDetailByUnitId() {
  return null
}
