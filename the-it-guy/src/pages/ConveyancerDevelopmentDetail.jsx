import {
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DevelopmentDocumentLibrary from '../components/DevelopmentDocumentLibrary'
import LoadingSkeleton from '../components/LoadingSkeleton'
import PageActionBar from '../components/PageActionBar'
import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { selectConveyancerInsights, selectConveyancerSummary } from '../core/transactions/conveyancerSelectors'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentDetail } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const ATTORNEY_DEVELOPMENT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'documents', label: 'Documents' },
]

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'floorplan', label: 'Floorplan' },
  { value: 'pricing', label: 'Pricing / Sales' },
  { value: 'marketing', label: 'Marketing Asset' },
  { value: 'site_plan', label: 'Site Plan' },
  { value: 'legal', label: 'Development Legal / Compliance' },
  { value: 'specification', label: 'Specification / Finishes' },
  { value: 'other', label: 'Other' },
]

function formatNumber(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return '0'
  return new Intl.NumberFormat('en-ZA').format(parsed)
}

function formatCurrency(value) {
  const parsed = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsed) ? parsed : 0)
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getDocTypeLabel(value) {
  return DOCUMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label || toTitleLabel(value || 'other')
}

const CASH_BOND_COLOR_MAP = {
  cash: '#3f78a8',
  bond: '#2f8a63',
  unknown: '#93a2b5',
}

const BANK_COLOR_MAP = {
  fnb: '#2f8a63',
  absa: '#3f78a8',
  nedbank: '#2f8696',
  standard_bank: '#5b6f88',
  sa_home_loans: '#6b7f98',
  unknown: '#93a2b5',
}

const DEMOGRAPHIC_COLOR_MAP = {
  '18_24': '#9f7aea',
  '25_34': '#3f78a8',
  '35_44': '#2f8696',
  '45_54': '#2f8a63',
  '55_': '#6b7f98',
  male: '#3f78a8',
  female: '#2f8a63',
  other: '#8b5cf6',
  prefer_not_to_say: '#c084fc',
  unknown: '#93a2b5',
}

function toItemPercent(count, total) {
  if (!total) return 0
  return Math.round((Number(count || 0) / total) * 100)
}

function buildInsightDonutGradient(items = [], total = 0, colorMap = {}) {
  if (!total) return 'conic-gradient(#d8e3ef 0% 100%)'

  let cursor = 0
  const slices = items
    .filter((item) => Number(item?.count || 0) > 0)
    .map((item) => {
      const percent = (Number(item.count || 0) / total) * 100
      const start = cursor
      const end = cursor + percent
      cursor = end
      const color =
        colorMap[item.key] ||
        colorMap[String(item.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')] ||
        '#93a2b5'
      return `${color} ${start}% ${end}%`
    })

  return slices.length ? `conic-gradient(${slices.join(', ')})` : 'conic-gradient(#d8e3ef 0% 100%)'
}

function getInsightItemColor(item, colorMap = {}) {
  return (
    colorMap[item.key] ||
    colorMap[String(item.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')] ||
    '#93a2b5'
  )
}

function ConveyancerDevelopmentDetail() {
  const navigate = useNavigate()
  const { developmentId } = useParams()
  const { profile } = useWorkspace()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.id) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const detail = await fetchDevelopmentDetail(developmentId)
      setData(detail)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load development workspace.')
    } finally {
      setLoading(false)
    }
  }, [developmentId, profile?.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => data?.rows || [], [data?.rows])
  const documents = useMemo(() => data?.documents || [], [data?.documents])
  const effectiveRows = useMemo(() => data?.rows || [], [data?.rows])
  const summary = useMemo(() => selectConveyancerSummary(effectiveRows), [effectiveRows])
  const insights = useMemo(() => selectConveyancerInsights(effectiveRows), [effectiveRows])

  const totalUnits = useMemo(
    () => Number(data?.development?.total_units_expected || data?.stats?.totalUnits || rows.length || 0),
    [data?.development?.total_units_expected, data?.stats?.totalUnits, rows.length],
  )
  const unitsWithActiveMatter = useMemo(
    () => effectiveRows.filter((row) => Boolean(row?.transaction?.id)).length,
    [effectiveRows],
  )
  const lodgedOrPrepCount = useMemo(
    () =>
      effectiveRows.filter((row) => {
        const stageKey = getAttorneyTransferStage(row)
        return stageKey === 'lodgement' || stageKey === 'registration_preparation'
      }).length,
    [effectiveRows],
  )
  const registeredCount = useMemo(
    () => effectiveRows.filter((row) => String(row?.stage || '').toLowerCase() === 'registered').length,
    [effectiveRows],
  )
  const salesProgressPercent = useMemo(
    () => (totalUnits > 0 ? Math.min(100, Math.round((unitsWithActiveMatter / totalUnits) * 100)) : 0),
    [totalUnits, unitsWithActiveMatter],
  )
  const lodgedProgressPercent = useMemo(
    () => (totalUnits > 0 ? Math.min(100, Math.round((lodgedOrPrepCount / totalUnits) * 100)) : 0),
    [totalUnits, lodgedOrPrepCount],
  )
  const registeredProgressPercent = useMemo(
    () => (totalUnits > 0 ? Math.min(100, Math.round((registeredCount / totalUnits) * 100)) : 0),
    [totalUnits, registeredCount],
  )

  const locationLine = [
    data?.profile?.location || data?.development?.location,
    data?.profile?.suburb || data?.profile?.city || data?.profile?.province,
  ]
    .filter(Boolean)
    .join(' • ')

  const conveyancingSnapshotItems = [
    { label: 'Mandated Firm', value: data?.attorneyConfig?.attorneyFirmName || 'Not configured' },
    { label: 'Primary Contact', value: data?.attorneyConfig?.contactName || 'Not set' },
    { label: 'Contact Email', value: data?.attorneyConfig?.contactEmail || 'Not set' },
    { label: 'Contact Phone', value: data?.attorneyConfig?.contactPhone || 'Not set' },
    { label: 'Onboarding Enabled', value: data?.development?.onboarding_enabled ? 'Enabled' : 'Disabled' },
    { label: 'Handover Enabled', value: data?.development?.handover_enabled ? 'Enabled' : 'Disabled' },
    { label: 'Snag Tracking', value: data?.development?.snag_tracking_enabled ? 'Enabled' : 'Disabled' },
    { label: 'Alterations', value: data?.development?.alterations_enabled ? 'Enabled' : 'Disabled' },
    { label: 'Documents Uploaded', value: formatNumber(documents.length) },
    { label: 'Active Files', value: formatNumber(summary.activeTransactions) },
  ]

  const transactionRows = useMemo(
    () =>
      effectiveRows.map((row) => {
        const hasMatter = Boolean(row?.transaction?.id)
        const stageLabel = hasMatter
          ? stageLabelFromAttorneyKey(getAttorneyTransferStage(row))
          : toTitleLabel(row?.unit?.status || 'Available')
        const matterReference = row?.transaction?.id ? `TRX-${String(row.transaction.id).slice(0, 8).toUpperCase()}` : 'No active matter'
        const unitStatus = toTitleLabel(row?.unit?.status || 'Available')
        const fileStatus = hasMatter
          ? stageLabel === 'Registered'
            ? 'Registered file'
            : 'Live file'
          : 'No active matter'

        return {
          key: row?.unit?.id || row?.unit?.unit_number,
          matterId: row?.transaction?.id || null,
          unitId: row?.unit?.id || null,
          unitNumber: row?.unit?.unit_number || row?.unit?.unitNumber || '-',
          buyerName: row?.buyer?.name || 'No purchaser assigned',
          unitStatus,
          matterReference,
          stageLabel,
          fileStatus,
          purchasePrice: Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.list_price || row?.unit?.listPrice || 0),
          hasMatter,
        }
      }),
    [effectiveRows],
  )

  if (!isSupabaseConfigured) {
    return <p className="status-message error">Supabase is not configured for this workspace.</p>
  }

  if (loading) {
    return <LoadingSkeleton lines={10} className="panel" />
  }

  if (!data) {
    return <p className="status-message error">Development not found.</p>
  }

  return (
    <section className="page development-hub-page">
      <PageActionBar
        actions={[
          {
            id: 'back',
            label: 'Back to developments',
            variant: 'ghost',
            icon: <ArrowLeft size={14} />,
            onClick: () => navigate('/developments'),
          },
          {
            id: 'refresh',
            label: 'Refresh',
            variant: 'primary',
            icon: <RefreshCw size={14} />,
            onClick: loadData,
            disabled: loading,
          },
        ]}
      />

      {error ? <p className="status-message error">{error}</p> : null}

      <section className="panel development-hub-header">
        <div className="development-hub-header-main">
          <div className="development-hub-header-copy">
            <span className="development-hub-kicker">Development Hub</span>
            <h1>{data.development?.name || 'Development'}</h1>
            <p>
              {locationLine || 'Location pending'}
              {data?.profile?.address ? ` • ${data.profile.address}` : ''}
            </p>
          </div>

          <div className="development-hub-status-row">
            <span className="meta-chip">{toTitleLabel(data?.profile?.status || data?.development?.status || 'active')}</span>
          </div>
        </div>
      </section>

      <section className="panel development-hub-tabs-panel no-print">
        <div className="development-hub-tabs attorney-development-tabs" role="tablist" aria-label="Attorney development workspace tabs">
          {ATTORNEY_DEVELOPMENT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'overview' ? (
        <section className="development-overview-stack">
          <article className="panel development-sales-progress-panel">
            <div className="section-header">
              <div className="section-header-copy">
                <h3>Overall Sales Progress</h3>
                <p>Development-level progression from active files through to registration.</p>
              </div>
              <span className="meta-chip">
                {formatNumber(unitsWithActiveMatter)} / {formatNumber(totalUnits)} units with active files
              </span>
            </div>

            <div className="development-sales-progress-main">
              <div className="development-sales-progress-track" aria-hidden>
                <span style={{ width: `${salesProgressPercent}%` }} />
              </div>
              <div className="development-sales-progress-metrics">
                <article>
                  <span>Total units</span>
                  <strong>{formatNumber(totalUnits)}</strong>
                </article>
                <article>
                  <span>Open legal files</span>
                  <strong>{formatNumber(unitsWithActiveMatter)}</strong>
                </article>
                <article>
                  <span>Lodgement pipeline</span>
                  <strong>{formatNumber(lodgedOrPrepCount)}</strong>
                </article>
                <article>
                  <span>Registered</span>
                  <strong>{formatNumber(registeredCount)}</strong>
                </article>
              </div>
            </div>

            <div className="development-sales-progress-breakdown">
              <article>
                <header>
                  <strong>File coverage</strong>
                  <span>{salesProgressPercent}%</span>
                </header>
                <div className="development-sales-progress-row-track" aria-hidden>
                  <span style={{ width: `${salesProgressPercent}%` }} />
                </div>
              </article>
              <article>
                <header>
                  <strong>Lodgement readiness</strong>
                  <span>{lodgedProgressPercent}%</span>
                </header>
                <div className="development-sales-progress-row-track is-info" aria-hidden>
                  <span style={{ width: `${lodgedProgressPercent}%` }} />
                </div>
              </article>
              <article>
                <header>
                  <strong>Registration conversion</strong>
                  <span>{registeredProgressPercent}%</span>
                </header>
                <div className="development-sales-progress-row-track is-success" aria-hidden>
                  <span style={{ width: `${registeredProgressPercent}%` }} />
                </div>
              </article>
            </div>
          </article>

          <section className="development-tab-grid">
            <section className="panel development-form-card stack-form">
              <div className="section-header">
                <div className="section-header-copy">
                  <h3>Development Details</h3>
                  <p>Core development information visible to the conveyancing team.</p>
                </div>
                <span className="meta-chip">Read-only for attorneys and agents</span>
              </div>

              <div className="development-readonly-grid">
                <article><span>Development Name</span><strong>{data.development?.name || 'Not set'}</strong></article>
                <article><span>Development Code</span><strong>{data.profile?.code || data.development?.code || 'Not set'}</strong></article>
                <article><span>Location</span><strong>{data.profile?.location || data.development?.location || 'Not set'}</strong></article>
                <article><span>Suburb</span><strong>{data.profile?.suburb || 'Not set'}</strong></article>
                <article><span>City</span><strong>{data.profile?.city || 'Not set'}</strong></article>
                <article><span>Province</span><strong>{data.profile?.province || 'Not set'}</strong></article>
                <article><span>Country</span><strong>{data.profile?.country || 'South Africa'}</strong></article>
                <article><span>Status</span><strong>{toTitleLabel(data.profile?.status || data.development?.status || 'active')}</strong></article>
                <article><span>Expected Units</span><strong>{formatNumber(data.development?.total_units_expected || data.stats?.totalUnits || 0)}</strong></article>
                <article><span>Launch Date</span><strong>{formatDate(data.profile?.launchDate || data.development?.launch_date)}</strong></article>
                <article><span>Expected Completion</span><strong>{formatDate(data.profile?.expectedCompletionDate || data.development?.expected_completion_date)}</strong></article>
                <article><span>Address</span><strong>{data.profile?.address || 'Not set'}</strong></article>
              </div>

              <div className="development-empty-state compact">
                <p>{data.profile?.description || data.development?.description || 'No development description has been added yet.'}</p>
              </div>
            </section>

            <aside className="panel development-form-card development-readonly-side">
              <div className="section-header">
                <div className="section-header-copy">
                  <h3>Mandate Snapshot</h3>
                  <p>Read-only conveyancing setup and project defaults relevant to the legal team.</p>
                </div>
              </div>

              <div className="development-readonly-grid development-readonly-grid-single">
                {conveyancingSnapshotItems.map((item) => (
                  <article key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
            </aside>
          </section>

          <section className="panel development-progress-insights-panel">
            <div className="section-header">
              <div className="section-header-copy">
                <h3>Development Progress Insights</h3>
                <p>Buyer, funding, and bank distribution signals from mapped transaction and onboarding data.</p>
              </div>
            </div>

            <div className="development-progress-insights-grid">
              <article className="development-progress-insight-card">
                <header>
                  <h4>Cash vs Bond Clients</h4>
                  <span className="meta-chip">{insights.cashVsBond.total} files</span>
                </header>

                {insights.cashVsBond.total > 0 ? (
                  <div className="development-progress-insight-body">
                    <div
                      className="development-progress-insight-donut"
                      style={{
                        background: buildInsightDonutGradient(
                          insights.cashVsBond.items,
                          insights.cashVsBond.total,
                          CASH_BOND_COLOR_MAP,
                        ),
                      }}
                    >
                      <div>
                        <strong>{insights.cashVsBond.total}</strong>
                        <small>Total</small>
                      </div>
                    </div>
                    <ul>
                      {insights.cashVsBond.items
                        .filter((item) => item.count > 0)
                        .map((item) => (
                          <li key={item.key}>
                            <span>
                              <i style={{ backgroundColor: getInsightItemColor(item, CASH_BOND_COLOR_MAP) }} aria-hidden />
                              {item.label}
                            </span>
                            <strong>
                              {item.count} ({toItemPercent(item.count, insights.cashVsBond.total)}%)
                            </strong>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : (
                  <div className="development-empty-state compact">
                    <p>No finance data available yet.</p>
                  </div>
                )}
              </article>

              <article className="development-progress-insight-card">
                <header>
                  <h4>Bond Bank Split</h4>
                  <span className="meta-chip">{insights.bondBankSplit.total} bond files</span>
                </header>

                {insights.bondBankSplit.total > 0 ? (
                  <div className="development-progress-insight-body">
                    <div
                      className="development-progress-insight-donut"
                      style={{
                        background: buildInsightDonutGradient(
                          insights.bondBankSplit.items,
                          insights.bondBankSplit.total,
                          BANK_COLOR_MAP,
                        ),
                      }}
                    >
                      <div>
                        <strong>{insights.bondBankSplit.total}</strong>
                        <small>Bonds</small>
                      </div>
                    </div>
                    <ul>
                      {insights.bondBankSplit.items.slice(0, 6).map((item) => (
                        <li key={item.key}>
                          <span>
                            <i style={{ backgroundColor: getInsightItemColor(item, BANK_COLOR_MAP) }} aria-hidden />
                            {item.label}
                          </span>
                          <strong>
                            {item.count} ({toItemPercent(item.count, insights.bondBankSplit.total)}%)
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="development-empty-state compact">
                    <p>No bond bank data captured yet.</p>
                  </div>
                )}
              </article>

              <article className="development-progress-insight-card">
                <header>
                  <h4>Buyer Demographic / Age Group</h4>
                  <span className="meta-chip">{insights.buyerAgeGroup.total} buyers</span>
                </header>

                {insights.buyerAgeGroup.total > 0 ? (
                  <ul className="development-progress-insight-bars">
                    {insights.buyerAgeGroup.items
                      .filter((item) => item.count > 0)
                      .map((item) => {
                        const percent = toItemPercent(item.count, insights.buyerAgeGroup.total)
                        return (
                          <li key={item.key}>
                            <div>
                              <span>{item.label}</span>
                              <strong>
                                {item.count} ({percent}%)
                              </strong>
                            </div>
                            <div className="development-progress-insight-bar-track" aria-hidden>
                              <span
                                style={{
                                  width: `${Math.max(percent, item.count > 0 ? 4 : 0)}%`,
                                  backgroundColor: getInsightItemColor(item, DEMOGRAPHIC_COLOR_MAP),
                                }}
                              />
                            </div>
                          </li>
                        )
                      })}
                  </ul>
                ) : (
                  <div className="development-empty-state compact">
                    <p>No buyer demographic data available yet.</p>
                  </div>
                )}
              </article>

              <article className="development-progress-insight-card">
                <header>
                  <h4>Gender Demographics</h4>
                  <span className="meta-chip">{insights.buyerGender.total} buyers</span>
                </header>

                {insights.buyerGender.total > 0 ? (
                  <ul className="development-progress-insight-bars">
                    {insights.buyerGender.items
                      .filter((item) => item.count > 0)
                      .map((item) => {
                        const percent = toItemPercent(item.count, insights.buyerGender.total)
                        return (
                          <li key={item.key}>
                            <div>
                              <span>{item.label}</span>
                              <strong>
                                {item.count} ({percent}%)
                              </strong>
                            </div>
                            <div className="development-progress-insight-bar-track" aria-hidden>
                              <span
                                style={{
                                  width: `${Math.max(percent, item.count > 0 ? 4 : 0)}%`,
                                  backgroundColor: getInsightItemColor(item, DEMOGRAPHIC_COLOR_MAP),
                                }}
                              />
                            </div>
                          </li>
                        )
                      })}
                  </ul>
                ) : (
                  <div className="development-empty-state compact">
                    <p>No buyer gender data available yet.</p>
                  </div>
                )}
              </article>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === 'transactions' ? (
        <section className="development-tab-grid development-transactions-layout">
          <section className="panel development-data-table-card full-span">
            <div className="section-header">
              <div className="section-header-copy">
                <h3>Stock & Matters</h3>
                <p>All units in this development, with live legal matter context where a file is already active.</p>
              </div>
            </div>

            {transactionRows.length ? (
              <div className="development-data-table-wrap">
                <table className="development-data-table">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Purchaser</th>
                      <th>Unit Status</th>
                      <th>Matter</th>
                      <th>Current Stage</th>
                      <th>File Status</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionRows.map((row) => (
                      <tr
                        key={row.key}
                        className="development-clickable-row"
                        onClick={() => {
                          if (row.unitId) {
                            navigate(`/units/${row.unitId}`, { state: { headerTitle: `Unit ${row.unitNumber}` } })
                          } else if (row.matterId) {
                            navigate(`/transactions/${row.matterId}`)
                          }
                        }}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && (row.unitId || row.hasMatter)) {
                            event.preventDefault()
                            if (row.unitId) {
                              navigate(`/units/${row.unitId}`, { state: { headerTitle: `Unit ${row.unitNumber}` } })
                            } else if (row.matterId) {
                              navigate(`/transactions/${row.matterId}`)
                            }
                          }
                        }}
                        role={row.unitId || row.hasMatter ? 'button' : undefined}
                        tabIndex={row.unitId || row.hasMatter ? 0 : -1}
                      >
                        <td>
                          <strong>Unit {row.unitNumber}</strong>
                          <span>{row.hasMatter ? 'Open matter available' : 'No active matter yet'}</span>
                        </td>
                        <td>{row.buyerName}</td>
                        <td><span className="meta-chip">{row.unitStatus}</span></td>
                        <td>
                          <strong>{row.matterReference}</strong>
                          <span>{row.hasMatter ? 'Live legal file' : 'Stock-only unit'}</span>
                        </td>
                        <td>{row.stageLabel}</td>
                        <td><span className="meta-chip">{row.fileStatus}</span></td>
                        <td>{formatCurrency(row.purchasePrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="development-empty-state">
                <p>No units or legal matters found for this development yet.</p>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <section className="development-tab-grid development-documents-layout">
          <section className="panel development-form-card stack-form development-assets-summary-panel">
            <div className="section-header">
              <div className="section-header-copy">
                <h3>Development Assets</h3>
                <p>High-level shared assets available to the conveyancing team for this project.</p>
              </div>
            </div>

            <div className="development-asset-summary-list">
              {DOCUMENT_TYPE_OPTIONS.map((group) => {
                const count = documents.filter((item) => item.documentType === group.value).length
                return (
                  <article key={group.value}>
                    <span>{group.label}</span>
                    <strong>{count}</strong>
                  </article>
                )
              })}
            </div>
          </section>

          <DevelopmentDocumentLibrary
            documents={documents}
            title="Document Library"
            description="High-level development documents, floorplans, and shared assets in a scrollable card view."
            emptyTitle="No development documents uploaded yet."
            documentTypeOptions={DOCUMENT_TYPE_OPTIONS}
            formatDocumentTypeLabel={getDocTypeLabel}
          />
        </section>
      ) : null}
    </section>
  )
}

export default ConveyancerDevelopmentDetail
