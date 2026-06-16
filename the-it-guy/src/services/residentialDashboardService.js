const ZAR_COMPACT = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const ZAR_STANDARD = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})
const COUNT_FORMAT = new Intl.NumberFormat('en-ZA')

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function getFirstNumber(...values) {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  return 0
}

function getFirstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value
  }
  return []
}

function compactMonthLabel(index = 0) {
  const base = new Date(2026, 0, 1)
  base.setMonth(base.getMonth() + index)
  return base.toLocaleDateString('en-ZA', { month: 'short' })
}

function normalizeSparklinePoints(points = []) {
  const values = (Array.isArray(points) ? points : []).map((value) => toNumber(value)).filter((value) => Number.isFinite(value))
  if (!values.length) return [0, 0]
  if (values.length === 1) return [values[0], values[0]]
  return values
}

function buildEmptySeries(length = 6) {
  return Array.from({ length }, () => 0)
}

function padSeries(values = [], length = 6) {
  const safe = (Array.isArray(values) ? values : []).map((value) => toNumber(value)).filter((value) => Number.isFinite(value))
  if (!safe.length) return buildEmptySeries(length)
  if (safe.length >= length) return safe.slice(-length)
  const padValue = safe.at(-1) || 0
  return [...safe, ...Array.from({ length: length - safe.length }, () => padValue)]
}

function getTitlePrefix(scope = 'principal') {
  return scope === 'agent' ? 'My ' : ''
}

function getModeLabel(mode = 'sales') {
  return mode === 'leasing' ? 'leasing' : 'sales'
}

function formatCount(value, empty = '0') {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return empty
  return COUNT_FORMAT.format(Math.max(0, Math.round(numeric)))
}

function getListingLabel({ scope = 'principal', mode = 'sales' } = {}) {
  const prefix = getTitlePrefix(scope)
  if (mode === 'leasing') return `${prefix}Active Rental Mandates`
  return `${prefix}Active Listings / Mandates`
}

function getTransactionLabel({ scope = 'principal' } = {}) {
  return `${getTitlePrefix(scope)}Active Transactions`
}

function getPipelineLabel({ scope = 'principal' } = {}) {
  return `${getTitlePrefix(scope)}Pipeline Value`
}

function getCommissionLabel({ scope = 'principal' } = {}) {
  return `${getTitlePrefix(scope)}Commission Forecast`
}

function deriveListingsCount(source = {}) {
  return getFirstNumber(
    source.activeListings,
    source.listingCount,
    source.pipeline?.mandateInsights?.active_mandates,
    source.pipeline?.mandateInsights?.unsigned_mandates,
    source.pipeline?.funnel?.find?.((item) => normalizeText(item?.key || item?.label).toLowerCase().includes('mandate'))?.count,
    source.transactions?.flow?.find?.((item) => normalizeText(item?.key || item?.label).toLowerCase().includes('mandate'))?.count,
    source.kpis?.activeListings,
    source.kpis?.mandates,
  )
}

function derivePipelineValue(source = {}) {
  return getFirstNumber(
    source.kpis?.pipelineValue,
    source.pipeline?.totalValue,
    source.pipelineValue,
    source.performance?.pipelineValue,
    source.transactions?.pipelineSnapshot?.value,
    source.agentPerformance?.activeDealValue,
  )
}

function deriveCommissionForecast(source = {}) {
  return getFirstNumber(
    source.kpis?.expectedCommission,
    source.kpis?.forecastRevenue,
    source.revenue?.forecast?.expectedCommission,
    source.revenue?.forecast?.likelyRevenue,
    source.commissionForecast,
    source.commissionForecastValue,
  )
}

function deriveTrend(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.kpis?.trends?.[key] ?? source?.trends?.[key] ?? source?.performance?.[key] ?? source?.revenue?.forecast?.[`${key}Trend`]
    if (Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function deriveSalesStages(source = {}) {
  const salesStages = getFirstArray(source.pipeline?.salesFunnel?.stages, source.pipeline?.funnel, source.flowStages, source.transactionFlow, source.transactions?.flow)
  const stageMap = new Map()
  for (const row of salesStages) {
    const key = normalizeText(row?.key || row?.stage || row?.label).toLowerCase()
    stageMap.set(key, row)
  }
  const labels = [
    { key: 'new_listings', aliases: ['leads', 'lead', 'new', 'new listings', 'new_listing'], label: 'New Listings' },
    { key: 'under_offer', aliases: ['under_offer', 'offer', 'offers'], label: 'Under Offer' },
    { key: 'conditional', aliases: ['conditional', 'qualifying', 'pending'], label: 'Conditional' },
    { key: 'unconditional', aliases: ['unconditional', 'otp', 'acceptedotps', 'accepted otps', 'signed'], label: 'Unconditional' },
    { key: 'settled_pending_registration', aliases: ['settled_pending_registration', 'registration', 'registrations', 'complete'], label: 'Settled Pending Registration' },
  ]
  const total = labels.reduce((sum, item) => {
    const row = [...stageMap.entries()].find(([key]) => item.aliases.some((alias) => key.includes(alias)))
    return sum + getFirstNumber(row?.[1]?.count, row?.[1]?.value)
  }, 0)
  return labels.map((item, index) => {
    const row = [...stageMap.entries()].find(([key]) => item.aliases.some((alias) => key.includes(alias)))
    const count = getFirstNumber(row?.[1]?.count, row?.[1]?.value)
    return {
      key: item.key,
      label: item.label,
      count,
      value: getFirstNumber(row?.[1]?.value, count ? count * 1 : 0),
      percentage: total ? Math.round((count / total) * 100) : 0,
      trend: row?.[1]?.trend ?? null,
      tone: ['blue', 'green', 'orange', 'purple', 'slate'][index] || 'blue',
    }
  })
}

function deriveTransactionHealth(source = {}, { mode = 'sales' } = {}) {
  if (mode === 'leasing') {
    return {
      title: 'Transaction Health',
      total: 0,
      segments: [],
      emptyState: true,
      emptyCopy: 'Leasing health metrics will appear once residential leasing is enabled.',
    }
  }

  const healthSource = source.transactionHealth || source.transactions?.health || source.health || {}
  const segments = getFirstArray(healthSource.flow, source.transactions?.flow, source.flowStages).map((row) => ({
    key: normalizeText(row?.key || row?.label).toLowerCase(),
    label: row?.label || row?.key || 'Stage',
    count: toNumber(row?.count || row?.value),
    percentage: toNumber(row?.percentage || row?.rawPercentage),
  }))

  const fallbackSegments = segments.length
    ? segments
    : deriveSalesStages(source).map((row) => ({
        key: row.key,
        label: row.label,
        count: row.count,
        percentage: row.percentage,
      }))

  return {
    title: 'Transaction Health',
    total: getFirstNumber(healthSource.total, source.kpis?.activeTransactions, source.transactions?.totalActive, source.activeTransactions?.length),
    movingNormally: getFirstNumber(healthSource.movingNormally),
    attentionRequired: getFirstNumber(healthSource.attentionRequired, source.attentionRequired?.stuckTransactions),
    criticalDelays: getFirstNumber(healthSource.criticalDelays, source.attentionRequired?.attorneyDelays),
    averageRegistrationTime: Number.isFinite(Number(healthSource.averageRegistrationTime)) ? Number(healthSource.averageRegistrationTime) : null,
    averageRegistrationTrend: Number.isFinite(Number(healthSource.averageRegistrationTrend)) ? Number(healthSource.averageRegistrationTrend) : null,
    segments: fallbackSegments,
    emptyState: false,
  }
}

function deriveResidentialPerformanceSeries(source = {}, { scope = 'principal', mode = 'sales' } = {}) {
  if (mode === 'leasing') {
    return {
      title: scope === 'agent' ? 'My Performance' : 'Agency Performance',
      subtitle: scope === 'agent' ? 'Your lead to contract conversion rate over time.' : 'Lead to contract conversion rate over time.',
      currentValue: null,
      series: [],
      emptyState: true,
      emptyCopy: 'Residential leasing performance will appear once leasing is enabled.',
    }
  }

  const metrics = getFirstArray(source.performance, source.performanceMetrics, source.agentPerformance, source.pipeline?.salesFunnel?.stages)
  const values = metrics.map((item) => toNumber(item?.percentage ?? item?.count ?? item?.value))
  const currentValue = getFirstNumber(
    source.pipeline?.salesFunnel?.leadToOtpConversion,
    source.kpis?.leadToDealConversion,
    source.performance?.currentRate,
    source.performance?.conversionRate,
    source.agentPerformance?.conversionRate,
  )
  return {
    title: scope === 'agent' ? 'My Performance' : 'Agency Performance',
    subtitle: scope === 'agent' ? 'Your lead to contract conversion rate over time.' : 'Lead to contract conversion rate over time.',
    currentValue,
    series: normalizeSparklinePoints(padSeries(values, 6)),
    emptyState: false,
    emptyCopy: '',
  }
}

function deriveResidentialTransactionFlow(source = {}, { mode = 'sales', scope = 'principal' } = {}) {
  if (mode === 'leasing') {
    return {
      title: scope === 'agent' ? 'My Transaction Flow' : 'Transaction Flow',
      stages: [],
      overallConversionRate: null,
      emptyState: true,
      emptyCopy: 'Residential leasing dashboard is ready. Rental mandates and lease deals will appear here once leasing is enabled.',
    }
  }

  const stages = deriveSalesStages(source)
  const total = stages.reduce((sum, item) => sum + item.count, 0)
  return {
    title: scope === 'agent' ? 'My Transaction Flow' : 'Transaction Flow',
    stages: stages.map((stage, index) => ({
      ...stage,
      trend: Number.isFinite(Number(stage.trend)) ? Number(stage.trend) : null,
      totalValue: getFirstNumber(stage.value),
      order: index,
    })),
    overallConversionRate: total ? Math.round(((stages.at(-1)?.count || 0) / Math.max(1, total)) * 100) : null,
    emptyState: false,
    emptyCopy: '',
  }
}

function deriveResidentialAttentionItems(source = {}, { scope = 'principal', mode = 'sales' } = {}) {
  if (mode === 'leasing') {
    return {
      title: scope === 'agent' ? 'My Attention Required' : 'Attention Required',
      items: [],
      emptyState: true,
      emptyCopy: 'Leasing attention items will appear once the residential leasing workflow is active.',
    }
  }

  const items = getFirstArray(source.attentionRows, source.attention, source.attentionRequired?.items).map((row) => ({
    key: normalizeText(row?.key || row?.label).toLowerCase(),
    label: row?.label || 'Attention item',
    reason: row?.reason || row?.subtitle || row?.copy || '',
    count: toNumber(row?.count),
    tone: row?.tone || 'blue',
  }))

  return {
    title: scope === 'agent' ? 'My Attention Required' : 'Attention Required',
    items,
    emptyState: !items.length,
    emptyCopy: scope === 'agent' ? 'No personal blockers right now.' : 'No high-signal blockers right now.',
  }
}

function deriveResidentialTopPerformers(source = {}, { scope = 'principal', mode = 'sales' } = {}) {
  if (scope === 'agent') {
    return {
      title: 'My Ranking',
      items: [],
      emptyState: true,
      emptyCopy: '',
      hidden: true,
    }
  }

  if (mode === 'leasing') {
    return {
      title: 'Top Performers',
      items: [],
      emptyState: true,
      emptyCopy: 'Top performers will appear once residential leasing is enabled.',
      hidden: false,
    }
  }

  const rows = getFirstArray(source.topPerformers, source.performers, source.pipeline?.topAgents, source.revenue?.topAgents).map((row, index) => ({
    id: normalizeText(row?.agentId || row?.id || row?.agentName || index),
    rank: row?.rank || index + 1,
    name: row?.agentName || row?.name || row?.agent || 'Agent',
    deals: getFirstNumber(row?.deals, row?.dealCount, row?.activeDeals, row?.registeredCount),
    commission: getFirstNumber(row?.commission, row?.pipelineValue, row?.value),
    trend: Number.isFinite(Number(row?.trend)) ? Number(row.trend) : null,
    avatarUrl: row?.avatarUrl || '',
  }))

  return {
    title: 'Top Performers',
    items: rows,
    emptyState: !rows.length,
    emptyCopy: 'No top performer data yet.',
    hidden: false,
  }
}

function deriveResidentialCommissionForecast(source = {}, { scope = 'principal', mode = 'sales' } = {}) {
  if (mode === 'leasing') {
    return {
      title: getCommissionLabel({ scope }),
      currentValue: 0,
      trend: null,
      rows: [],
      series: [],
      emptyState: true,
      emptyCopy: 'Residential leasing commission forecasts will appear once leasing is enabled.',
    }
  }

  const rows = getFirstArray(source.forecastRows, source.revenue?.forecastChart, source.commissionForecast?.rows).map((row, index) => ({
    key: normalizeText(row?.key || row?.label || index),
    label: row?.label || compactMonthLabel(index),
    value: getFirstNumber(row?.rawValue, row?.expectedCommission, row?.value),
    trend: Number.isFinite(Number(row?.trend)) ? Number(row.trend) : null,
    trendLabel: row?.trendLabel || 'vs previous period',
  }))
  const series = rows.map((row) => row.value)
  const currentValue = getFirstNumber(
    source.commissionForecastValue,
    source.kpis?.expectedCommission,
    source.revenue?.forecast?.expectedCommission,
    rows[0]?.value,
  )

  return {
    title: getCommissionLabel({ scope }),
    currentValue,
    trend: deriveTrend(source, ['expectedCommission', 'forecastRevenue', 'likelyRevenue']),
    rows,
    series: normalizeSparklinePoints(padSeries(series, 6)),
    emptyState: !rows.length,
    emptyCopy: scope === 'agent' ? 'No personal commission forecast yet.' : 'No commission forecast yet.',
  }
}

function deriveResidentialAppointments(source = {}, { scope = 'principal' } = {}) {
  const rows = getFirstArray(source.appointments, source.upcoming?.dailyBreakdown).map((row, index) => ({
    id: normalizeText(row?.id || `${index}`),
    time: row?.time || row?.label || '',
    type: row?.type || row?.appointmentType || 'Appointment',
    property: row?.property || row?.propertyName || row?.title || '',
    client: row?.client || row?.clientName || row?.subtitle || '',
    agent: row?.agent || row?.agentName || row?.broker || '',
    status: row?.status || row?.tone || 'Upcoming',
  }))

  return {
    title: scope === 'agent' ? 'My Appointments' : 'Appointments',
    rows,
    emptyState: !rows.length,
    emptyCopy: 'No upcoming appointments.',
  }
}

export function formatCurrencyCompactZAR(value, empty = 'R0') {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return empty
  return ZAR_COMPACT.format(numeric).replace('ZAR', 'R')
}

export function deriveResidentialDashboardMetrics({
  scope = 'principal',
  mode = 'sales',
  dateRange = 'last_30_days',
  branchId = '',
  teamId = '',
  currentUserId = '',
  source = {},
} = {}) {
  const salesMode = getModeLabel(mode) === 'sales'
  const leasingMode = !salesMode
  const emptyLeasing = leasingMode && !source.leasing?.enabled && !source.leasing?.isReady && !source.leasingAvailable

  const activeTransactions = getFirstNumber(source.kpis?.activeTransactions, source.health?.total, source.transactions?.totalActive, source.activeTransactions?.length)
  const activeListings = deriveListingsCount(source)
  const pipelineValue = derivePipelineValue(source)
  const commissionForecast = deriveCommissionForecast(source)
  const kpiTrends = source.kpis?.trends || source.trends || {}

  const kpis = [
    {
      key: 'active_transactions',
      label: getTransactionLabel({ scope }),
      value: emptyLeasing ? '0' : formatCount(activeTransactions),
      compactValue: emptyLeasing ? '0' : formatCount(activeTransactions),
      trend: deriveTrend(source, ['activeTransactions']),
      sparkline: normalizeSparklinePoints(getFirstArray(source.transactions?.flow, source.transactionFlow, source.flowStages).map((row) => toNumber(row?.count || row?.value))),
      tone: 'blue',
    },
    {
      key: 'active_listings',
      label: getListingLabel({ scope, mode }),
      value: emptyLeasing ? '0' : formatCount(activeListings),
      compactValue: emptyLeasing ? '0' : formatCount(activeListings),
      trend: deriveTrend(source, ['activeListings', 'mandates']),
      sparkline: normalizeSparklinePoints(buildEmptySeries(6).map((value, index) => value + (index % 2 === 0 ? activeListings : 0))),
      tone: 'green',
    },
    {
      key: 'pipeline_value',
      label: getPipelineLabel({ scope }),
      value: emptyLeasing ? 'R0' : formatCurrencyCompactZAR(pipelineValue),
      compactValue: emptyLeasing ? 'R0' : formatCurrencyCompactZAR(pipelineValue),
      trend: deriveTrend(source, ['pipelineValue', 'likelyRevenue', 'forecastRevenue']),
      sparkline: normalizeSparklinePoints(getFirstArray(source.performance?.series, source.revenue?.forecastChart).map((row) => toNumber(row?.value || row?.expectedCommission || row?.rawValue))),
      tone: 'orange',
    },
    {
      key: 'commission_forecast',
      label: getCommissionLabel({ scope }),
      value: emptyLeasing ? 'R0' : formatCurrencyCompactZAR(commissionForecast),
      compactValue: emptyLeasing ? 'R0' : formatCurrencyCompactZAR(commissionForecast),
      trend: kpiTrends.expectedCommission ?? kpiTrends.forecastRevenue ?? deriveTrend(source, ['expectedCommission', 'forecastRevenue', 'likelyRevenue']),
      sparkline: normalizeSparklinePoints(getFirstArray(source.forecastValues, source.revenue?.forecastChart).map((row) => toNumber(row?.rawValue || row?.expectedCommission || row?.value || row))),
      tone: 'purple',
    },
  ]

  return {
    scope,
    mode: getModeLabel(mode),
    dateRange,
    branchId,
    teamId,
    currentUserId,
    emptyLeasing,
    kpis,
    transactionHealth: deriveTransactionHealth(source, { mode }),
    performance: deriveResidentialPerformanceSeries(source, { scope, mode }),
    transactionFlow: deriveResidentialTransactionFlow(source, { mode, scope }),
    activeTransactions: {
      title: getTransactionLabel({ scope }),
      rows: getFirstArray(source.activeTransactions, source.recentTransactions, source.transactions?.activeTransactions).map((row, index) => ({
        id: normalizeText(row?.id || row?.transactionId || index),
        propertyImage: row?.propertyImage || row?.imageUrl || row?.thumbnailUrl || '',
        imageUrl: row?.imageUrl || row?.propertyImage || row?.thumbnailUrl || '',
        status: row?.status || row?.stage || row?.stageLabel || 'Active',
        stageKey: row?.stageKey || '',
        valueRaw: getFirstNumber(row?.value, row?.dealValue, row?.transactionValue, row?.price, row?.salesPrice, row?.sales_price, row?.purchase_price),
        value: formatCurrencyCompactZAR(getFirstNumber(row?.value, row?.dealValue, row?.transactionValue, row?.price, row?.salesPrice, row?.sales_price, row?.purchase_price)),
        address: row?.address || row?.title || row?.propertyIdentifier || row?.propertyName || '',
        area: row?.area || row?.suburb || row?.developmentName || '',
        assignedAgent: row?.assignedAgent || row?.assigned_agent || row?.agent || '',
        ownerName: row?.assignedAgent || row?.assigned_agent || row?.agent || '',
        ownerRoleLabel: row?.ownerRoleLabel || 'Agent',
        clientLabel: row?.clientLabel || 'Buyer',
        clientName: row?.clientName || row?.buyerName || '',
        daysInStage: row?.daysInStage || row?.daysActive || '',
      })),
      emptyState: emptyLeasing || !getFirstArray(source.activeTransactions, source.recentTransactions, source.transactions?.activeTransactions).length,
      emptyCopy: scope === 'agent'
        ? 'No active transactions yet. Transactions will appear here once offers are accepted and deals move into progress.'
        : 'No active transactions yet. Transactions will appear here once offers are accepted and deals move into progress.',
    },
    attention: deriveResidentialAttentionItems(source, { scope, mode }),
    topPerformers: deriveResidentialTopPerformers(source, { scope, mode }),
    commissionForecast: deriveResidentialCommissionForecast(source, { scope, mode }),
    appointments: deriveResidentialAppointments(source, { scope }),
  }
}

export {
  deriveResidentialAppointments,
  deriveResidentialAttentionItems,
  deriveResidentialCommissionForecast,
  deriveResidentialPerformanceSeries,
  deriveResidentialTopPerformers,
  deriveResidentialTransactionFlow,
  deriveTransactionHealth as deriveResidentialTransactionHealth,
}
