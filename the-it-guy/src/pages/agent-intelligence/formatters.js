export function formatCurrency(value) {
  const numeric = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(numeric)
}

export function formatPercent(value, digits = 1) {
  const numeric = Number(value || 0)
  return `${numeric.toFixed(digits)}%`
}

export function formatInteger(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}
