const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

export function formatCurrency(value) {
  return currency.format(Number(value) || 0)
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}
