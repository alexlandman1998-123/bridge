import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { listSettingsActivity } from '../../services/settingsActivityService'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'

const CATEGORY_OPTIONS = [
  ['all', 'All activity'],
  ['account', 'Account'],
  ['workspace', 'Workspace'],
  ['team', 'Users and roles'],
  ['billing', 'Billing'],
  ['security', 'Security'],
]

function formatActivityDate(value) {
  if (!value) return 'Time unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getActivityDetail(item) {
  const metadata = item?.metadata || {}
  if (metadata.previousPlanKey || metadata.nextPlanKey) {
    return `${metadata.previousPlanKey || 'Current plan'} → ${metadata.nextPlanKey || 'Requested plan'}`
  }
  if (metadata.previousRole || metadata.role) {
    return `${metadata.previousRole || 'Previous role'} → ${metadata.role || metadata.nextRole || 'Updated role'}`
  }
  if (metadata.jobTitle) return `Job title: ${String(metadata.jobTitle).replaceAll('_', ' ')}`
  if (Array.isArray(metadata.fields) && metadata.fields.length) return `Changed: ${metadata.fields.join(', ')}`
  return item.targetLabel || 'Workspace settings'
}

export default function SettingsActivityPage() {
  const [items, setItems] = useState([])
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listSettingsActivity()
      .then((response) => {
        if (active) setItems(response.items || [])
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load settings activity.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function handleRefresh() {
    try {
      setRefreshing(true)
      setError('')
      const response = await listSettingsActivity()
      setItems(response.items || [])
    } catch (refreshError) {
      setError(refreshError.message || 'Unable to refresh settings activity.')
    } finally {
      setRefreshing(false)
    }
  }

  const visibleItems = category === 'all' ? items : items.filter((item) => item.category === category)

  if (loading) return <SettingsLoadingState label="Loading settings activity…" />

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Operations"
        title="Settings activity"
        description="A real audit trail of account, workspace, user, role, ownership, security, and billing changes."
        actions={(
          <Button type="button" variant="secondary" disabled={refreshing} onClick={handleRefresh}>
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        )}
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}

      <SettingsSectionCard
        title="Change history"
        description="Events come directly from workspace audit, organisation event, and billing event records."
        actions={(
          <label className="grid gap-1 text-xs font-semibold text-[#607387]">
            Activity type
            <Field as="select" value={category} className="min-w-[180px] py-2" onChange={(event) => setCategory(event.target.value)}>
              {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Field>
          </label>
        )}
      >
        {!visibleItems.length ? (
          <SettingsEmptyState
            title={items.length ? 'No activity matches this filter' : 'No settings activity recorded yet'}
            description={items.length ? 'Choose another activity type.' : 'Changes will appear here after a connected setting is updated.'}
          />
        ) : (
          <div className={`${settingsTableClass} overflow-x-auto`}>
            <div className="hidden min-w-[840px] grid-cols-[1.1fr_1fr_1.2fr_1.4fr] gap-4 border-b border-[#e3eaf1] bg-[#f7f9fb] px-5 py-3 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[#7b8da6] md:grid">
              <span>When</span>
              <span>Actor</span>
              <span>Action</span>
              <span>Details</span>
            </div>
            <div className="divide-y divide-[#e8edf2] md:min-w-[840px]">
              {visibleItems.map((item) => (
                <article key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.1fr_1fr_1.2fr_1.4fr] md:items-center md:gap-4">
                  <div>
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#8b9aad] md:hidden">When</span>
                    <p className="mt-1 text-sm text-[#52667d] md:mt-0">{formatActivityDate(item.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#8b9aad] md:hidden">Actor</span>
                    <p className="mt-1 text-sm font-semibold text-[#1b2a3b] md:mt-0">{item.actorName || 'System'}</p>
                  </div>
                  <div>
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#8b9aad] md:hidden">Action</span>
                    <p className="mt-1 text-sm font-semibold text-[#1b2a3b] md:mt-0">{item.actionLabel}</p>
                    <span className="mt-1 inline-flex rounded-full bg-[#eef5f1] px-2 py-0.5 text-[0.68rem] font-semibold capitalize text-[#39705a]">{item.category}</span>
                  </div>
                  <div>
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#8b9aad] md:hidden">Details</span>
                    <p className="mt-1 text-sm leading-5 text-[#607387] md:mt-0">{getActivityDetail(item)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </SettingsSectionCard>
    </div>
  )
}
