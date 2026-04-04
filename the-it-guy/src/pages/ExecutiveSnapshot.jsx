import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Building2,
  CheckCircle2,
  Clock3,
  Layers,
  PieChart,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchExecutiveSnapshotByToken } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const integer = new Intl.NumberFormat('en-ZA')

function formatSnapshotTimestamp(isoValue) {
  if (!isoValue) {
    return 'just now'
  }

  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) {
    return 'just now'
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatPercent(value) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) {
    return '0%'
  }

  return `${Math.round(normalized)}%`
}

function DevelopmentCard({ development }) {
  const total = Math.max(1, development.totalUnits || 0)
  const segments = [
    { key: 'available', label: 'Available', value: development.availableUnits, tone: 'available' },
    {
      key: 'active',
      label: 'Active',
      value: Math.max(0, development.soldActiveUnits - development.unitsInTransfer - development.unitsRegistered),
      tone: 'active',
    },
    { key: 'transfer', label: 'Transfer', value: development.unitsInTransfer, tone: 'transfer' },
    { key: 'registered', label: 'Registered', value: development.unitsRegistered, tone: 'registered' },
  ]

  return (
    <article className="snapshot-development-card">
      <header>
        <div>
          <h3>{development.name}</h3>
          <p>{currency.format(Number(development.revenueSecured) || 0)} secured</p>
        </div>
        <span className="snapshot-chip">{formatPercent(development.sellThroughPercent)} sold</span>
      </header>

      <div className="snapshot-segment-bar" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={`segment ${segment.tone}`}
            style={{ width: `${Math.max(6, (segment.value / total) * 100)}%` }}
          />
        ))}
      </div>

      <dl>
        <div>
          <dt>Total Units</dt>
          <dd>{integer.format(development.totalUnits || 0)}</dd>
        </div>
        <div>
          <dt>Deals In Progress</dt>
          <dd>{integer.format(development.dealsInProgress || 0)}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{integer.format(development.availableUnits || 0)}</dd>
        </div>
        <div>
          <dt>In Transfer</dt>
          <dd>{integer.format(development.unitsInTransfer || 0)}</dd>
        </div>
      </dl>
    </article>
  )
}

function SnapshotSkeleton() {
  return (
    <div className="snapshot-skeleton-grid">
      <div className="snapshot-skeleton-block" />
      <div className="snapshot-skeleton-block" />
      <div className="snapshot-skeleton-block" />
      <div className="snapshot-skeleton-block" />
    </div>
  )
}

function ExecutiveSnapshot() {
  const { token } = useParams()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadSnapshot() {
      if (!isSupabaseConfigured) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')
        const data = await fetchExecutiveSnapshotByToken(token)
        setSnapshot(data)
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setLoading(false)
      }
    }

    void loadSnapshot()
  }, [token])

  const metricItems = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return [
      {
        label: 'Revenue Secured',
        value: currency.format(Number(snapshot.metrics.revenueSecured) || 0),
        icon: Wallet,
      },
      {
        label: 'Remaining Inventory',
        value: currency.format(Number(snapshot.metrics.remainingInventoryValue) || 0),
        icon: Banknote,
      },
      {
        label: 'Total Portfolio Value',
        value: currency.format(Number(snapshot.metrics.totalPortfolioValue) || 0),
        icon: PieChart,
      },
      {
        label: 'Deals In Progress',
        value: integer.format(snapshot.metrics.dealsInProgress || 0),
        icon: ArrowRightLeft,
      },
      {
        label: 'Units Sold',
        value: integer.format(snapshot.metrics.soldActiveUnits || 0),
        icon: Layers,
      },
      {
        label: 'Units Available',
        value: integer.format(snapshot.metrics.availableUnits || 0),
        icon: Building2,
      },
    ]
  }, [snapshot])

  const healthSegments = useMemo(() => {
    if (!snapshot?.metrics?.health || !snapshot.metrics.totalUnits) {
      return []
    }

    const total = snapshot.metrics.totalUnits
    return [
      { key: 'available', label: 'Available', value: snapshot.metrics.health.available || 0 },
      { key: 'early', label: 'Early Stage', value: snapshot.metrics.health.early || 0 },
      { key: 'finance', label: 'Finance', value: snapshot.metrics.health.finance || 0 },
      { key: 'transfer', label: 'Transfer', value: snapshot.metrics.health.transfer || 0 },
      { key: 'registered', label: 'Registered', value: snapshot.metrics.health.registered || 0 },
    ].map((segment) => ({
      ...segment,
      percent: total ? (segment.value / total) * 100 : 0,
    }))
  }, [snapshot])

  const attentionGroups = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return [
      {
        key: 'waitingDeposit',
        label: 'Waiting for Deposit',
        count: snapshot.alerts.waitingDeposit?.count || 0,
        items: snapshot.alerts.waitingDeposit?.items || [],
      },
      {
        key: 'waitingOtp',
        label: 'Waiting for OTP',
        count: snapshot.alerts.waitingOtp?.count || 0,
        items: snapshot.alerts.waitingOtp?.items || [],
      },
      {
        key: 'waitingBondApproval',
        label: 'Waiting for Bond Approval',
        count: snapshot.alerts.waitingBondApproval?.count || 0,
        items: snapshot.alerts.waitingBondApproval?.items || [],
      },
      {
        key: 'waitingAttorneys',
        label: 'Waiting on Attorneys',
        count: snapshot.alerts.waitingAttorneys?.count || 0,
        items: snapshot.alerts.waitingAttorneys?.items || [],
      },
      {
        key: 'delayedTransactions',
        label: 'Delayed / Blocked',
        count: snapshot.alerts.delayedTransactions?.count || 0,
        items: snapshot.alerts.delayedTransactions?.items || [],
      },
    ]
  }, [snapshot])

  return (
    <div className="snapshot-page">
      <main className="snapshot-shell">
        <header className="snapshot-hero-card">
          <div className="snapshot-hero-head">
            <div>
              <p className="snapshot-brand">bridge.</p>
              <h1>Sam&apos;s Update</h1>
              <p className="snapshot-subtitle">Premium live executive portfolio overview.</p>
            </div>
            <span className="snapshot-live-pill">Live</span>
          </div>

          <div className="snapshot-hero-strip">
            <div>
              <span>Sell-through</span>
              <strong>{formatPercent(snapshot?.metrics?.sellThroughPercent || 0)}</strong>
            </div>
            <div>
              <span>Developments</span>
              <strong>{integer.format(snapshot?.metrics?.totalDevelopments || 0)}</strong>
            </div>
            <div>
              <span>Units</span>
              <strong>{integer.format(snapshot?.metrics?.totalUnits || 0)}</strong>
            </div>
            <div>
              <span>Attention Needed</span>
              <strong>{integer.format(snapshot?.alerts?.totalAttention || 0)}</strong>
            </div>
          </div>

          <span className="snapshot-updated">Last updated {formatSnapshotTimestamp(snapshot?.generatedAt)}</span>
        </header>

        {!isSupabaseConfigured ? (
          <section className="snapshot-card snapshot-error-card">
            <p>
              Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_KEY</code> to
              your <code>.env</code> file.
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="snapshot-card snapshot-error-card">
            <p>{error}</p>
          </section>
        ) : null}

        {loading ? <SnapshotSkeleton /> : null}

        {!loading && snapshot ? (
          <>
            <section className="snapshot-section">
              <h2>Executive KPIs</h2>
              <div className="snapshot-metrics-grid">
                {metricItems.map((item, index) => (
                  <article key={item.label} className="snapshot-metric-card" style={{ animationDelay: `${index * 45}ms` }}>
                    <div>
                      <p>{item.label}</p>
                      <strong>{item.value}</strong>
                    </div>
                    <item.icon size={18} />
                  </article>
                ))}
              </div>
            </section>

            <section className="snapshot-section">
              <h2>Portfolio Health</h2>
              <article className="snapshot-card snapshot-health-card">
                <div className="snapshot-health-bar" aria-hidden="true">
                  {healthSegments.map((segment) => (
                    <span
                      key={segment.key}
                      className={`segment ${segment.key}`}
                      style={{ width: `${Math.max(6, segment.percent)}%` }}
                    />
                  ))}
                </div>
                <div className="snapshot-health-legend">
                  {healthSegments.map((segment) => (
                    <div key={segment.key}>
                      <span>{segment.label}</span>
                      <strong>{integer.format(segment.value)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="snapshot-section">
              <h2>Development Performance</h2>
              <div className="snapshot-development-grid">
                {snapshot.developments.map((development) => (
                  <DevelopmentCard key={development.id} development={development} />
                ))}
              </div>
            </section>

            <section className="snapshot-section">
              <h2>Attention Needed</h2>
              <div className="snapshot-alerts-grid">
                {attentionGroups.map((group) => (
                  <article key={group.key} className="snapshot-alert-card">
                    <div className="snapshot-alert-head">
                      <AlertTriangle size={16} />
                      <div>
                        <strong>{group.label}</strong>
                        <p>{integer.format(group.count)} units</p>
                      </div>
                    </div>
                    <ul>
                      {group.items.slice(0, 2).map((item) => (
                        <li key={`${group.key}-${item.unitId}`}>
                          <span>
                            {item.developmentName} • Unit {item.unitNumber}
                          </span>
                          <em>{item.nextAction}</em>
                        </li>
                      ))}
                      {!group.items.length ? <li className="empty">No items currently.</li> : null}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <section className="snapshot-section">
              <h2>Recent Movement</h2>
              <div className="snapshot-card">
                <ul className="snapshot-recent-list">
                  {snapshot.recentMovement.map((item) => (
                    <li key={`${item.unitId}-${item.updatedAt}`}>
                      <div>
                        <strong>
                          {item.developmentName} • Unit {item.unitNumber}
                        </strong>
                        <p>
                          {item.stage} • {item.buyerName}
                        </p>
                      </div>
                      <span>
                        <Clock3 size={12} />
                        {formatSnapshotTimestamp(item.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        ) : null}

        <footer className="snapshot-footer">
          <span className="snapshot-footer-tag">
            <CheckCircle2 size={14} /> Read-only executive view
          </span>
          <Link to="/dashboard">Open Workspace</Link>
        </footer>
      </main>
    </div>
  )
}

export default ExecutiveSnapshot
