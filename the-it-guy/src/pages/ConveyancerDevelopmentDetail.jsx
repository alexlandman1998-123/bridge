import {
  ArrowLeft,
  Building2,
  FileCheck2,
  FolderKanban,
  Landmark,
  MapPin,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DevelopmentDocumentLibrary from '../components/DevelopmentDocumentLibrary'
import LoadingSkeleton from '../components/LoadingSkeleton'
import PageActionBar from '../components/PageActionBar'
import SummaryCards from '../components/SummaryCards'
import { getAttorneyMockDevelopmentDetail } from '../core/transactions/attorneyMockData'
import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { selectConveyancerPipeline, selectConveyancerRecentFeed, selectConveyancerSummary } from '../core/transactions/conveyancerSelectors'
import { getReportNextAction } from '../core/transactions/reportNextAction'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentDetail } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const ATTORNEY_DEVELOPMENT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
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

function formatRelativeTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent update'
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just now'
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`
  return date.toLocaleDateString('en-ZA')
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getDocTypeLabel(value) {
  return DOCUMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label || toTitleLabel(value || 'other')
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
      const detail = String(developmentId || '').startsWith('mock-dev-')
        ? getAttorneyMockDevelopmentDetail(developmentId)
        : await fetchDevelopmentDetail(developmentId)
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
  const pipeline = useMemo(() => selectConveyancerPipeline(effectiveRows), [effectiveRows])
  const recentFeed = useMemo(() => selectConveyancerRecentFeed(effectiveRows, 5), [effectiveRows])
  const totalListedStockValue = useMemo(
    () =>
      effectiveRows.reduce(
        (sum, row) => sum + Number(row?.unit?.list_price || row?.unit?.listPrice || row?.unit?.price || 0),
        0,
      ),
    [effectiveRows],
  )

  const locationLine = [
    data?.profile?.location || data?.development?.location,
    data?.profile?.suburb || data?.profile?.city || data?.profile?.province,
  ]
    .filter(Boolean)
    .join(' • ')

  const summaryItems = useMemo(
    () => [
      { label: 'Total Units', value: formatNumber(data?.stats?.totalUnits || rows.length), icon: Building2 },
      { label: 'Active Files', value: formatNumber(summary.activeTransactions), icon: Workflow },
      { label: 'Lodged', value: formatNumber(summary.lodged), icon: Landmark },
      { label: 'Registered This Month', value: formatNumber(summary.registeredThisMonth), icon: FileCheck2 },
      { label: 'Listed Stock Value', value: formatCurrency(totalListedStockValue), icon: Receipt },
    ],
    [data?.stats?.totalUnits, rows.length, summary.activeTransactions, summary.lodged, summary.registeredThisMonth, totalListedStockValue],
  )

  const overviewQuickLinks = [
    { id: 'details', label: 'Development Details', icon: ShieldCheck },
    { id: 'transactions', label: 'Stock & Matters', icon: Workflow },
    { id: 'documents', label: 'Floorplans & Assets', icon: FolderKanban },
  ]

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
          nextAction: hasMatter ? getReportNextAction(row) : 'Open a matter when instruction is received',
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
        <>
          <SummaryCards items={summaryItems} />

          <section className="development-dashboard-top">
            <div className="development-dashboard-top-grid">
              <article className="panel development-dashboard-card development-funnel-card card-tier-standard">
                <div className="section-header">
                  <div className="section-header-copy">
                    <h3>Transaction Funnel</h3>
                    <p>High-level stage distribution and movement conversion inside this development.</p>
                  </div>
                  <span className="meta-chip">
                    <Building2 size={12} />
                    {effectiveRows.length} tracked files
                  </span>
                </div>

                <div className="dashboard-funnel-list development-dashboard-funnel-list">
                  {pipeline.map((item, index) => {
                    const maxCount = Math.max(...pipeline.map((stage) => stage.count), 0)
                    const width = maxCount > 0 ? Math.max((item.count / maxCount) * 100, item.count ? 10 : 0) : 0

                    return (
                      <div key={item.key} className="dashboard-funnel-row">
                        <div className="dashboard-funnel-stage">{item.label}</div>
                        <div className="dashboard-funnel-track" aria-hidden>
                          <span style={{ width: `${width}%` }} />
                        </div>
                        <div className="dashboard-funnel-metrics">
                          <strong>{item.count}</strong>
                          <em>{item.count === 1 ? 'file' : 'files'}</em>
                          <small>{String(index + 1).padStart(2, '0')}</small>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>

              <div className="development-overview-side-stack">
                <article className="panel development-overview-activity-card">
                  <div className="section-header">
                    <div className="section-header-copy">
                      <h3>Recent Activity</h3>
                      <p>Most recent movement across units and deals in this development.</p>
                    </div>
                  </div>

                  {recentFeed.length ? (
                    <ul className="development-activity-list">
                      {recentFeed.map((item) => (
                        <li
                          key={`${item.transactionId || item.unitId}-${item.updatedAt}`}
                          onClick={() => {
                            if (item.unitId && !String(item.unitId).startsWith('mock-')) {
                              navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                            } else if (item.transactionId) {
                              navigate(`/transactions/${item.transactionId}`)
                            }
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && (item.unitId || item.transactionId)) {
                              event.preventDefault()
                              if (item.unitId && !String(item.unitId).startsWith('mock-')) {
                                navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                              } else if (item.transactionId) {
                                navigate(`/transactions/${item.transactionId}`)
                              }
                            }
                          }}
                          role={item.unitId || item.transactionId ? 'button' : undefined}
                          tabIndex={item.unitId || item.transactionId ? 0 : -1}
                        >
                          <div>
                            <strong>{item.eventLabel}</strong>
                            <span>{item.buyerName} • Unit {item.unitNumber}</span>
                          </div>
                          <div>
                            <em>{item.stageLabel}</em>
                            <small>{formatRelativeTime(item.updatedAt)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="development-empty-state compact">
                      <p>No transaction activity yet.</p>
                    </div>
                  )}
                </article>

                <article className="panel development-overview-links-card">
                  <div className="section-header">
                    <div className="section-header-copy">
                      <h3>Quick Links</h3>
                      <p>Jump into the main development work surfaces.</p>
                    </div>
                  </div>

                  <div className="development-quick-links-grid">
                    {overviewQuickLinks.map((item) => {
                      const Icon = item.icon
                      return (
                        <button key={item.id} type="button" className="ghost-button" onClick={() => setActiveTab(item.id)}>
                          <Icon size={15} />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </article>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'details' ? (
        <section className="development-tab-grid">
          <section className="panel development-form-card stack-form">
            <div className="section-header">
              <div className="section-header-copy">
                <h3>General Details</h3>
                <p>Core development information visible to the conveyancing team.</p>
              </div>
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
                          if (row.unitId && !String(row.unitId).startsWith('mock-')) {
                            navigate(`/units/${row.unitId}`, { state: { headerTitle: `Unit ${row.unitNumber}` } })
                          } else if (row.matterId) {
                            navigate(`/transactions/${row.matterId}`)
                          }
                        }}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && (row.unitId || row.hasMatter)) {
                            event.preventDefault()
                            if (row.unitId && !String(row.unitId).startsWith('mock-')) {
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
