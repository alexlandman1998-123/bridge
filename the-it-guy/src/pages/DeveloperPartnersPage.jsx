import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Landmark,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Send,
  ShieldCheck,
  X,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  acceptDeveloperPartnerRelationship,
  activateDeveloperPartnerAgreement,
  createDeveloperPartnerInvite,
  fetchDeveloperPartnerInviteOptions,
  fetchDeveloperPartnersWorkspace,
  generateDeveloperPartnerAgreement,
  sendDeveloperPartnerInvitation,
  setDeveloperPartnerDefault,
  waiveDeveloperPartnerAgreement,
} from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const TABS = [
  { key: 'directory', label: 'Partner Directory' },
  { key: 'pending', label: 'Pending Invites' },
  { key: 'agreements', label: 'Agreements' },
  { key: 'defaults', label: 'Defaults & Routing Rules' },
]

const PARTNER_TYPES = [
  { key: 'all', label: 'All partners' },
  { key: 'agency', label: 'Agencies' },
  { key: 'transfer_attorney', label: 'Transfer Attorneys' },
  { key: 'bond_originator', label: 'Bond Originators' },
]

const INVITE_PARTNER_TYPES = PARTNER_TYPES.filter((item) => item.key !== 'all')

const PARTNER_ORGANISATION_TYPE_MAP = {
  agency: new Set(['agency', 'agency_network', 'estate_agency', 'agent']),
  transfer_attorney: new Set(['attorney', 'attorney_firm', 'conveyancer']),
  bond_originator: new Set(['bond_originator', 'bond']),
}

const TYPE_META = {
  agency: {
    label: 'Agency / Selling Agent',
    shortLabel: 'Agency',
    Icon: Users,
    className: 'border-[#dbeafe] bg-[#f3f7ff] text-[#1f4b7a]',
  },
  transfer_attorney: {
    label: 'Transfer Attorney',
    shortLabel: 'Attorney',
    Icon: Scale,
    className: 'border-[#eadffc] bg-[#f8f4ff] text-[#5b3c8f]',
  },
  bond_originator: {
    label: 'Bond Originator',
    shortLabel: 'Bond',
    Icon: Landmark,
    className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]',
  },
}

const STATUS_META = {
  invited: { label: 'Invited', className: 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]' },
  accepted: { label: 'Accepted', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]' },
  agreement_pending: { label: 'Agreement pending', className: 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]' },
  agreement_active: { label: 'Agreement active', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' },
  suspended: { label: 'Suspended', className: 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]' },
  archived: { label: 'Archived', className: 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]' },
}

const AGREEMENT_STATUS_META = {
  draft: { label: 'Draft', className: 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]' },
  generated: { label: 'Generated', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]' },
  sent_for_signature: { label: 'Sent for signature', className: 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]' },
  signed: { label: 'Signed', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' },
  active: { label: 'Active', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' },
  expired: { label: 'Expired', className: 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]' },
  terminated: { label: 'Terminated', className: 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]' },
  waived: { label: 'Waived', className: 'border-[#eadffc] bg-[#f8f4ff] text-[#5b3c8f]' },
  not_started: { label: 'Not started', className: 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]' },
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value).toLowerCase())
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function getScopeLabel(relationship = {}) {
  const scopeType = normalizeLower(relationship.scopeType)
  const scopeJson = relationship.scopeJson && typeof relationship.scopeJson === 'object' ? relationship.scopeJson : {}
  const ids = [
    ...(Array.isArray(scopeJson.developmentIds) ? scopeJson.developmentIds : []),
    ...(Array.isArray(scopeJson.phaseIds) ? scopeJson.phaseIds : []),
    ...(Array.isArray(scopeJson.unitIds) ? scopeJson.unitIds : []),
  ].filter(Boolean)

  if (scopeType === 'specific_developments') return ids.length ? `${ids.length} developments` : 'Specific developments'
  if (scopeType === 'specific_phases') return ids.length ? `${ids.length} phases` : 'Specific phases'
  if (scopeType === 'specific_units') return ids.length ? `${ids.length} units` : 'Specific units'
  return 'All developments'
}

function organisationMatchesPartnerType(organisation = {}, partnerType = 'agency') {
  const allowedTypes = PARTNER_ORGANISATION_TYPE_MAP[partnerType]
  if (!allowedTypes) return true
  const organisationType = normalizeLower(organisation.type)
  if (!organisationType) return true
  return allowedTypes.has(organisationType)
}

function StatusBadge({ status, variant = 'relationship' }) {
  const meta = variant === 'agreement'
    ? AGREEMENT_STATUS_META[status] || AGREEMENT_STATUS_META.not_started
    : STATUS_META[status] || STATUS_META.invited
  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || TYPE_META.agency
  const Icon = meta.Icon
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${meta.className}`}>
      <Icon size={13} />
      {meta.shortLabel}
    </span>
  )
}

function MetricCard({ label, value, subtext, icon: Icon }) {
  return (
    <div className="rounded-[8px] border border-[#dde7f2] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{label}</p>
          <strong className="mt-2 block text-2xl font-semibold text-[#10243a]">{value}</strong>
        </div>
        {Icon ? (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#eef8f2] text-[#0f8f4c]">
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      {subtext ? <p className="mt-2 text-sm leading-5 text-[#60758d]">{subtext}</p> : null}
    </div>
  )
}

function PartnerAvatar({ relationship }) {
  const meta = TYPE_META[relationship.partnerType] || TYPE_META.agency
  const Icon = meta.Icon
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[#dce6f1] bg-white text-[#0f2742]">
      <Icon size={19} />
    </div>
  )
}

function EmptyState({ title, copy }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#cfdbea] bg-white p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eef8f2] text-[#0f8f4c]">
        <ShieldCheck size={21} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-[#10243a]">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">{copy}</p>
    </div>
  )
}

function RowActionButton({ children, onClick, disabled = false, variant = 'secondary' }) {
  const className = variant === 'primary'
    ? 'border-[#0f2742] bg-[#0f2742] text-white hover:bg-[#173a5e]'
    : variant === 'success'
      ? 'border-[#cfeedd] bg-[#f1fbf6] text-[#17613d] hover:bg-[#e7f7ee]'
      : 'border-[#d8e2ef] bg-white text-[#10243a] hover:bg-[#f8fafc]'
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center justify-center rounded-[8px] border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function PartnerRow({ relationship, busyKey = '', onAccept, onGenerateAgreement, onSendInvite, onWaiveAgreement }) {
  const hasOpenAgreement = Boolean(relationship.activeAgreement)
  const canAccept = relationship.status === 'invited'
  const canGenerate = ['accepted', 'agreement_pending'].includes(relationship.status) && !hasOpenAgreement
  const canWaive = ['accepted', 'agreement_pending'].includes(relationship.status) && relationship.agreementStatus !== 'waived'

  return (
    <div className="grid gap-4 border-b border-[#e5edf6] px-4 py-4 last:border-b-0 xl:grid-cols-[minmax(260px,1.2fr)_150px_150px_190px_120px_minmax(180px,auto)] xl:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <PartnerAvatar relationship={relationship} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#10243a]">{relationship.partnerName}</p>
          <p className="truncate text-xs text-[#60758d]">
            {relationship.partnerInvitationEmail || relationship.partnerOrganisation?.type || relationship.partnerTypeLabel}
          </p>
        </div>
      </div>
      <div>
        <TypeBadge type={relationship.partnerType} />
      </div>
      <p className="text-sm font-medium text-[#324a63]">{getScopeLabel(relationship)}</p>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={relationship.status} />
        <StatusBadge status={relationship.agreementStatus} variant="agreement" />
      </div>
      <p className="text-sm text-[#60758d]">{formatDate(relationship.updatedAt || relationship.invitedAt)}</p>
      <div className="flex flex-wrap gap-2 xl:justify-end">
        {canAccept ? (
          <RowActionButton
            disabled={busyKey === `send:${relationship.id}`}
            onClick={() => onSendInvite?.(relationship)}
          >
            {busyKey === `send:${relationship.id}` ? 'Sending...' : (
              <span className="inline-flex items-center gap-1.5">
                <Send size={13} />
                Send Invite
              </span>
            )}
          </RowActionButton>
        ) : null}
        {canAccept ? (
          <RowActionButton
            variant="success"
            disabled={busyKey === `accept:${relationship.id}`}
            onClick={() => onAccept?.(relationship)}
          >
            {busyKey === `accept:${relationship.id}` ? 'Accepting...' : 'Accept'}
          </RowActionButton>
        ) : null}
        {canGenerate ? (
          <RowActionButton
            variant="primary"
            disabled={busyKey === `generate:${relationship.id}`}
            onClick={() => onGenerateAgreement?.(relationship)}
          >
            {busyKey === `generate:${relationship.id}` ? 'Generating...' : 'Generate Agreement'}
          </RowActionButton>
        ) : null}
        {canWaive ? (
          <RowActionButton
            disabled={busyKey === `waive:${relationship.id}`}
            onClick={() => onWaiveAgreement?.(relationship)}
          >
            {busyKey === `waive:${relationship.id}` ? 'Waiving...' : 'Waive'}
          </RowActionButton>
        ) : null}
      </div>
    </div>
  )
}

function AgreementRow({ agreement, relationship, busyKey = '', onActivate }) {
  const canActivate = !['active', 'signed', 'waived', 'expired', 'terminated'].includes(agreement.status)

  return (
    <div className="grid gap-4 border-b border-[#e5edf6] px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(220px,1fr)_190px_140px_140px_minmax(120px,auto)] lg:items-center">
      <div>
        <p className="text-sm font-semibold text-[#10243a]">{agreement.agreementLabel}</p>
        <p className="text-xs text-[#60758d]">{relationship?.partnerName || 'Partner relationship'}</p>
      </div>
      <StatusBadge status={agreement.status} variant="agreement" />
      <p className="text-sm text-[#60758d]">{agreement.effectiveDate ? formatDate(agreement.effectiveDate) : 'Not effective'}</p>
      <p className="text-sm text-[#60758d]">{agreement.expiryDate ? formatDate(agreement.expiryDate) : 'No expiry'}</p>
      <div className="flex justify-start lg:justify-end">
        {canActivate ? (
          <RowActionButton
            variant="success"
            disabled={busyKey === `activate:${agreement.id}`}
            onClick={() => onActivate?.(agreement)}
          >
            {busyKey === `activate:${agreement.id}` ? 'Activating...' : 'Activate'}
          </RowActionButton>
        ) : null}
      </div>
    </div>
  )
}

function DefaultsPanel({ relationships, defaults = [], busyKey = '', onSetDefault }) {
  const activeByType = useMemo(() => {
    return ['agency', 'transfer_attorney', 'bond_originator'].map((type) => ({
      type,
      items: relationships.filter((relationship) => relationship.partnerType === type && (
        relationship.status === 'agreement_active' ||
        relationship.agreementStatus === 'active' ||
        relationship.agreementStatus === 'signed'
      )),
    }))
  }, [relationships])

  const defaultByType = useMemo(() => {
    return defaults.reduce((accumulator, item) => {
      if (item?.isPreferredDefault && item?.partnerType) {
        accumulator[item.partnerType] = item
      }
      return accumulator
    }, {})
  }, [defaults])

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {activeByType.map(({ type, items }) => {
        const meta = TYPE_META[type] || TYPE_META.agency
        const Icon = meta.Icon
        const currentDefault = defaultByType[type] || null
        return (
          <div key={type} className="rounded-[8px] border border-[#dde7f2] bg-white p-4">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${meta.className}`}>
                <Icon size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[#10243a]">{meta.label}</h3>
                <p className="text-xs text-[#60758d]">{formatNumber(items.length)} ready for defaults</p>
              </div>
            </div>
            <div className="mt-4 rounded-[8px] border border-[#e5edf6] bg-[#fbfcfe] px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Current Default</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#10243a]">
                {currentDefault?.companyName || 'Not set'}
              </p>
              {currentDefault?.scopeType ? (
                <p className="mt-1 text-xs text-[#60758d]">{getScopeLabel({ scopeType: currentDefault.scopeType, scopeJson: currentDefault.scopeJson })}</p>
              ) : null}
            </div>
            <div className="mt-4 space-y-2">
              {items.length ? items.slice(0, 4).map((relationship) => (
                <div key={relationship.id} className="rounded-[8px] border border-[#e5edf6] bg-[#f8fafc] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#10243a]">{relationship.partnerName}</p>
                      <p className="text-xs text-[#60758d]">{getScopeLabel(relationship)}</p>
                    </div>
                    {currentDefault?.relationshipId === relationship.id ? (
                      <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-[#cfeedd] bg-[#f1fbf6] px-2.5 text-xs font-semibold text-[#17613d]">
                        Default
                      </span>
                    ) : (
                      <RowActionButton
                        disabled={busyKey === `default:${relationship.id}`}
                        onClick={() => onSetDefault?.(relationship)}
                      >
                        {busyKey === `default:${relationship.id}` ? 'Saving...' : 'Set'}
                      </RowActionButton>
                    )}
                  </div>
                </div>
              )) : (
                <div className="rounded-[8px] border border-dashed border-[#d6e1ee] bg-[#fbfcfe] px-3 py-4 text-sm text-[#60758d]">
                  No active agreement yet.
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AddDeveloperPartnerModal({ open, workspaceId, onClose, onCreated }) {
  const [partnerType, setPartnerType] = useState('agency')
  const [targetMode, setTargetMode] = useState('existing')
  const [partnerOrganisationId, setPartnerOrganisationId] = useState('')
  const [partnerDisplayName, setPartnerDisplayName] = useState('')
  const [partnerInvitationEmail, setPartnerInvitationEmail] = useState('')
  const [scopeType, setScopeType] = useState('all_developments')
  const [selectedDevelopmentIds, setSelectedDevelopmentIds] = useState([])
  const [directorySearch, setDirectorySearch] = useState('')
  const [options, setOptions] = useState({ organisations: [], developments: [] })
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const resetForm = useCallback(() => {
    setPartnerType('agency')
    setTargetMode('existing')
    setPartnerOrganisationId('')
    setPartnerDisplayName('')
    setPartnerInvitationEmail('')
    setScopeType('all_developments')
    setSelectedDevelopmentIds([])
    setDirectorySearch('')
    setError('')
  }, [])

  useEffect(() => {
    if (!open || !workspaceId) return
    let active = true
    setLoadingOptions(true)
    setError('')
    fetchDeveloperPartnerInviteOptions({ organisationId: workspaceId })
      .then((nextOptions) => {
        if (!active) return
        setOptions(nextOptions)
      })
      .catch((loadError) => {
        if (!active) return
        console.error('[DeveloperPartnersPage] failed to load invite options', loadError)
        setError(loadError?.message || 'Unable to load partner options right now.')
      })
      .finally(() => {
        if (active) setLoadingOptions(false)
      })
    return () => {
      active = false
    }
  }, [open, workspaceId])

  useEffect(() => {
    if (!open) return
    setPartnerOrganisationId('')
    setDirectorySearch('')
  }, [open, partnerType])

  const filteredOrganisations = useMemo(() => {
    const query = normalizeLower(directorySearch)
    return (options.organisations || [])
      .filter((organisation) => organisationMatchesPartnerType(organisation, partnerType))
      .filter((organisation) => {
        if (!query) return true
        return [organisation.displayName, organisation.name, organisation.legalName, organisation.type]
          .some((value) => normalizeLower(value).includes(query))
      })
      .slice(0, 8)
  }, [directorySearch, options.organisations, partnerType])

  const selectedOrganisation = useMemo(() => {
    return (options.organisations || []).find((organisation) => organisation.id === partnerOrganisationId) || null
  }, [options.organisations, partnerOrganisationId])

  const canSubmit = useMemo(() => {
    if (!workspaceId || saving) return false
    if (targetMode === 'existing') return Boolean(partnerOrganisationId)
    return Boolean(normalizeText(partnerDisplayName)) && isValidEmail(partnerInvitationEmail)
  }, [partnerDisplayName, partnerInvitationEmail, partnerOrganisationId, saving, targetMode, workspaceId])

  function toggleDevelopment(developmentId) {
    setSelectedDevelopmentIds((current) => (
      current.includes(developmentId)
        ? current.filter((item) => item !== developmentId)
        : [...current, developmentId]
    ))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const created = await createDeveloperPartnerInvite({
        developerOrganisationId: workspaceId,
        partnerType,
        partnerOrganisationId: targetMode === 'existing' ? partnerOrganisationId : null,
        partnerDisplayName: targetMode === 'existing' ? selectedOrganisation?.displayName : partnerDisplayName,
        partnerInvitationEmail: targetMode === 'invite' ? partnerInvitationEmail : null,
        sendEmail: targetMode === 'invite',
        scopeType,
        scopeJson: scopeType === 'specific_developments'
          ? { developmentIds: selectedDevelopmentIds }
          : {},
      })
      resetForm()
      onCreated?.(created)
    } catch (saveError) {
      console.error('[DeveloperPartnersPage] failed to create partner invite', saveError)
      setError(saveError?.message || 'Unable to create the partner invite right now.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#08182d]/45 px-4 py-4 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[min(760px,calc(100dvh-32px))] w-full max-w-3xl flex-col overflow-hidden rounded-[8px] border border-[#d8e2ef] bg-white shadow-[0_24px_70px_rgba(8,24,45,0.24)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e5edf6] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#08182d]">Add Partner</h2>
            <p className="mt-1 text-sm text-[#60758d]">Create the partner relationship and define where it applies.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#d8e2ef] bg-white text-[#52677f] transition hover:bg-[#f8fafc] hover:text-[#10243a]"
            onClick={() => {
              resetForm()
              onClose?.()
            }}
            aria-label="Close add partner"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {error ? (
            <div className="mb-4 flex items-start gap-3 rounded-[8px] border border-[#f8d7da] bg-[#fff5f6] px-4 py-3 text-sm text-[#8d2831]">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-5">
            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Partner Type</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {INVITE_PARTNER_TYPES.map((item) => {
                  const meta = TYPE_META[item.key] || TYPE_META.agency
                  const Icon = meta.Icon
                  const active = partnerType === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`flex min-h-[72px] items-center gap-3 rounded-[8px] border px-3 text-left transition ${
                        active ? 'border-[#0f8f4c] bg-[#f1fbf6] shadow-[0_8px_22px_rgba(15,143,76,0.10)]' : 'border-[#d8e2ef] bg-white hover:bg-[#f8fafc]'
                      }`}
                      onClick={() => setPartnerType(item.key)}
                    >
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${meta.className}`}>
                        <Icon size={17} />
                      </span>
                      <span className="text-sm font-semibold text-[#10243a]">{TYPE_META[item.key]?.label || item.label}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Partner</p>
              <div className="mt-3 inline-flex rounded-[8px] border border-[#d8e2ef] bg-[#f8fafc] p-1">
                {[
                  { key: 'existing', label: 'Existing organisation' },
                  { key: 'invite', label: 'Invite new' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`h-9 rounded-[7px] px-3 text-sm font-semibold transition ${
                      targetMode === item.key ? 'bg-[#0f2742] text-white shadow-sm' : 'text-[#52677f] hover:text-[#10243a]'
                    }`}
                    onClick={() => {
                      setTargetMode(item.key)
                      setError('')
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {targetMode === 'existing' ? (
                <div className="mt-3">
                  <label className="relative block">
                    <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b8]" />
                    <input
                      value={directorySearch}
                      onChange={(event) => setDirectorySearch(event.target.value)}
                      className="h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white pl-10 pr-3 text-sm text-[#10243a] outline-none transition placeholder:text-[#8aa0b8] focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                      placeholder="Search organisation"
                    />
                  </label>
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-[8px] border border-[#e5edf6]">
                    {loadingOptions ? (
                      <div className="space-y-2 p-3">
                        {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-[8px] bg-[#eef3f8]" />)}
                      </div>
                    ) : filteredOrganisations.length ? (
                      filteredOrganisations.map((organisation) => {
                        const selected = organisation.id === partnerOrganisationId
                        return (
                          <button
                            key={organisation.id}
                            type="button"
                            className={`flex w-full items-center justify-between gap-3 border-b border-[#e5edf6] px-4 py-3 text-left last:border-b-0 transition ${
                              selected ? 'bg-[#f1fbf6]' : 'bg-white hover:bg-[#f8fafc]'
                            }`}
                            onClick={() => setPartnerOrganisationId(organisation.id)}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[#10243a]">{organisation.displayName}</span>
                              <span className="block truncate text-xs text-[#60758d]">{organisation.type || 'Organisation'}</span>
                            </span>
                            {selected ? <CheckCircle2 size={18} className="shrink-0 text-[#0f8f4c]" /> : null}
                          </button>
                        )
                      })
                    ) : (
                      <div className="px-4 py-6 text-sm text-[#60758d]">No matching organisations found.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-[#10243a]">Organisation name</span>
                    <input
                      value={partnerDisplayName}
                      onChange={(event) => setPartnerDisplayName(event.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white px-3 text-sm text-[#10243a] outline-none transition placeholder:text-[#8aa0b8] focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                      placeholder="e.g. Smith & Partners"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-[#10243a]">Invite email</span>
                    <input
                      type="email"
                      value={partnerInvitationEmail}
                      onChange={(event) => setPartnerInvitationEmail(event.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white px-3 text-sm text-[#10243a] outline-none transition placeholder:text-[#8aa0b8] focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                      placeholder="partner@example.com"
                    />
                  </label>
                </div>
              )}
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Scope</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  { key: 'all_developments', label: 'All developments' },
                  { key: 'specific_developments', label: 'Specific developments' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`rounded-[8px] border px-4 py-3 text-left text-sm font-semibold transition ${
                      scopeType === item.key ? 'border-[#0f8f4c] bg-[#f1fbf6] text-[#17613d]' : 'border-[#d8e2ef] bg-white text-[#10243a] hover:bg-[#f8fafc]'
                    }`}
                    onClick={() => setScopeType(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {scopeType === 'specific_developments' ? (
                <div className="mt-3 rounded-[8px] border border-[#e5edf6]">
                  {options.developments.length ? options.developments.map((development) => {
                    const selected = selectedDevelopmentIds.includes(development.id)
                    return (
                      <label
                        key={development.id}
                        className="flex cursor-pointer items-center justify-between gap-3 border-b border-[#e5edf6] px-4 py-3 last:border-b-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#10243a]">{development.name}</span>
                          <span className="block truncate text-xs text-[#60758d]">{development.location || development.status || 'Development'}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleDevelopment(development.id)}
                          className="h-4 w-4 rounded border-[#cbd7e6] text-[#0f8f4c] focus:ring-[#0f8f4c]"
                        />
                      </label>
                    )
                  }) : (
                    <div className="px-4 py-6 text-sm text-[#60758d]">No developments are available for this workspace.</div>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e5edf6] bg-[#fbfcfe] px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-[8px] border border-[#d8e2ef] bg-white px-4 text-sm font-semibold text-[#10243a] transition hover:bg-[#f8fafc]"
            onClick={() => {
              resetForm()
              onClose?.()
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#0f2742] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit || (scopeType === 'specific_developments' && !selectedDevelopmentIds.length)}
          >
            {saving ? 'Creating...' : 'Create Invite'}
          </button>
        </div>
      </form>
    </div>
  )
}

function DeveloperPartnersPage() {
  const { currentWorkspace, workspace } = useWorkspace()
  const workspaceId = normalizeText(currentWorkspace?.id || workspace?.id)
  const [activeTab, setActiveTab] = useState('directory')
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionBusyKey, setActionBusyKey] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [snapshot, setSnapshot] = useState({
    schemaReady: true,
    relationships: [],
    agreements: [],
    terms: [],
    defaults: [],
    metrics: {
      total: 0,
      active: 0,
      pendingInvites: 0,
      agreementPending: 0,
      activeAgreements: 0,
      byPartnerType: { agency: 0, transfer_attorney: 0, bond_originator: 0 },
    },
  })

  const loadWorkspace = useCallback(async () => {
    if (!isSupabaseConfigured || !workspaceId || workspaceId === 'all') {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const nextSnapshot = await fetchDeveloperPartnersWorkspace({ organisationId: workspaceId })
      setSnapshot(nextSnapshot)
    } catch (loadError) {
      console.error('[DeveloperPartnersPage] failed to load partner workspace', loadError)
      setError(loadError?.message || 'Unable to load developer partners right now.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const runRelationshipAction = useCallback(async (busyKey, action, nextTab = null) => {
    setActionBusyKey(busyKey)
    setError('')
    setNotice('')
    try {
      await action()
      if (nextTab) setActiveTab(nextTab)
      await loadWorkspace()
    } catch (actionError) {
      console.error('[DeveloperPartnersPage] partner action failed', actionError)
      setError(actionError?.message || 'Unable to update this partner relationship right now.')
    } finally {
      setActionBusyKey('')
    }
  }, [loadWorkspace])

  const handleAcceptRelationship = useCallback((relationship) => {
    void runRelationshipAction(
      `accept:${relationship.id}`,
      () => acceptDeveloperPartnerRelationship(relationship.id),
      'directory',
    )
  }, [runRelationshipAction])

  const handleSendInvite = useCallback((relationship) => {
    void runRelationshipAction(
      `send:${relationship.id}`,
      async () => {
        const result = await sendDeveloperPartnerInvitation(relationship.id)
        let copied = false
        if (result?.invitationUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(result.invitationUrl)
            copied = true
          } catch (copyError) {
            console.warn('[DeveloperPartnersPage] invite link copy failed', copyError)
          }
        }
        const emailSent = Boolean(result?.emailResult?.ok || result?.emailResult?.sent)
        const missingEmail = result?.emailResult?.reason === 'missing_email'
        setNotice(
          emailSent
            ? `Invite sent${copied ? ' and link copied.' : '.'}`
            : missingEmail
              ? `Invite link created${copied ? ' and copied.' : '.'} Add an email address to send it automatically.`
              : `Invite link created${copied ? ' and copied.' : '.'} Email delivery needs attention.`,
        )
      },
      'pending',
    )
  }, [runRelationshipAction])

  const handleGenerateAgreement = useCallback((relationship) => {
    void runRelationshipAction(
      `generate:${relationship.id}`,
      () => generateDeveloperPartnerAgreement(relationship.id),
      'agreements',
    )
  }, [runRelationshipAction])

  const handleWaiveAgreement = useCallback((relationship) => {
    void runRelationshipAction(
      `waive:${relationship.id}`,
      () => waiveDeveloperPartnerAgreement(relationship.id),
      'defaults',
    )
  }, [runRelationshipAction])

  const handleActivateAgreement = useCallback((agreement) => {
    void runRelationshipAction(
      `activate:${agreement.id}`,
      () => activateDeveloperPartnerAgreement(agreement.id),
      'defaults',
    )
  }, [runRelationshipAction])

  const handleSetDefault = useCallback((relationship) => {
    void runRelationshipAction(
      `default:${relationship.id}`,
      async () => {
        await setDeveloperPartnerDefault(relationship.id)
        setNotice(`${relationship.partnerName} is now the default ${relationship.partnerTypeLabel}.`)
      },
      'defaults',
    )
  }, [runRelationshipAction])

  const relationshipsById = useMemo(() => {
    return new Map(snapshot.relationships.map((relationship) => [relationship.id, relationship]))
  }, [snapshot.relationships])

  const filteredRelationships = useMemo(() => {
    const query = normalizeLower(searchTerm)
    return snapshot.relationships.filter((relationship) => {
      if (typeFilter !== 'all' && relationship.partnerType !== typeFilter) return false
      if (!query) return true
      return [
        relationship.partnerName,
        relationship.partnerInvitationEmail,
        relationship.partnerTypeLabel,
        relationship.status,
        getScopeLabel(relationship),
      ].some((value) => normalizeLower(value).includes(query))
    })
  }, [searchTerm, snapshot.relationships, typeFilter])

  const visibleRelationships = useMemo(() => {
    if (activeTab === 'pending') return filteredRelationships.filter((relationship) => relationship.status === 'invited')
    if (activeTab === 'agreements') {
      const relationshipIds = new Set(snapshot.agreements.map((agreement) => agreement.relationshipId))
      return filteredRelationships.filter((relationship) => relationshipIds.has(relationship.id))
    }
    return filteredRelationships
  }, [activeTab, filteredRelationships, snapshot.agreements])

  const visibleAgreements = useMemo(() => {
    if (activeTab !== 'agreements') return []
    const query = normalizeLower(searchTerm)
    return snapshot.agreements.filter((agreement) => {
      const relationship = relationshipsById.get(agreement.relationshipId)
      if (typeFilter !== 'all' && relationship?.partnerType !== typeFilter) return false
      if (!query) return true
      return [
        agreement.agreementLabel,
        agreement.status,
        relationship?.partnerName,
        relationship?.partnerTypeLabel,
      ].some((value) => normalizeLower(value).includes(query))
    })
  }, [activeTab, relationshipsById, searchTerm, snapshot.agreements, typeFilter])

  const headerCounts = snapshot.metrics.byPartnerType || {}

  return (
    <div className="min-h-full bg-[#f6f8fb] px-4 py-5 text-[#10243a] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0f8f4c]">Developer</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-[#08182d]">Partners</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758d]">
              Manage partner relationships, agreement readiness and default assignment eligibility.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#d8e2ef] bg-white px-4 text-sm font-semibold text-[#10243a] shadow-sm transition hover:bg-[#f8fafc]"
              onClick={loadWorkspace}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#0f2742] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isSupabaseConfigured || !workspaceId || workspaceId === 'all'}
              onClick={() => setInviteOpen(true)}
            >
              <Plus size={16} />
              Add Partner
            </button>
          </div>
        </header>

        {!isSupabaseConfigured ? (
          <div className="rounded-[8px] border border-[#f0dfb8] bg-[#fff9ec] px-4 py-3 text-sm text-[#8a5a12]">
            Supabase is not configured in this environment.
          </div>
        ) : null}

        {!snapshot.schemaReady ? (
          <div className="flex items-start gap-3 rounded-[8px] border border-[#f0dfb8] bg-[#fff9ec] px-4 py-3 text-sm text-[#8a5a12]">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>The developer partner relationship tables are not available to this workspace yet.</span>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-[8px] border border-[#f8d7da] bg-[#fff5f6] px-4 py-3 text-sm text-[#8d2831]">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {notice ? (
          <div className="flex items-start gap-3 rounded-[8px] border border-[#cfeedd] bg-[#f1fbf6] px-4 py-3 text-sm text-[#17613d]">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total Partners" value={formatNumber(snapshot.metrics.total)} subtext="Relationship records" icon={Building2} />
          <MetricCard label="Active" value={formatNumber(snapshot.metrics.active)} subtext="Accepted or active" icon={CheckCircle2} />
          <MetricCard label="Pending Invites" value={formatNumber(snapshot.metrics.pendingInvites)} subtext="Awaiting response" icon={Clock3} />
          <MetricCard label="Active Agreements" value={formatNumber(snapshot.metrics.activeAgreements)} subtext="Signed or active" icon={FileText} />
          <MetricCard label="Agreements Pending" value={formatNumber(snapshot.metrics.agreementPending)} subtext="Need mandate/SLA action" icon={ShieldCheck} />
        </section>

        <section className="rounded-[8px] border border-[#dde7f2] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-3 border-b border-[#e5edf6] p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex overflow-x-auto rounded-[8px] border border-[#d8e2ef] bg-[#f8fafc] p-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`h-10 shrink-0 rounded-[7px] px-3 text-sm font-semibold transition ${
                    activeTab === tab.key ? 'bg-[#0f2742] text-white shadow-sm' : 'text-[#52677f] hover:text-[#10243a]'
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block sm:w-[320px]">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b8]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white pl-10 pr-3 text-sm text-[#10243a] outline-none transition placeholder:text-[#8aa0b8] focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                  placeholder="Search partner, email, scope..."
                />
              </label>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="h-11 rounded-[8px] border border-[#d8e2ef] bg-white px-3 text-sm font-semibold text-[#10243a] outline-none transition focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
              >
                {PARTNER_TYPES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 border-b border-[#e5edf6] bg-[#fbfcfe] p-4 md:grid-cols-3">
            <div className="rounded-[8px] border border-[#e5edf6] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Agencies</p>
              <p className="mt-1 text-lg font-semibold text-[#10243a]">{formatNumber(headerCounts.agency)}</p>
            </div>
            <div className="rounded-[8px] border border-[#e5edf6] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Transfer Attorneys</p>
              <p className="mt-1 text-lg font-semibold text-[#10243a]">{formatNumber(headerCounts.transfer_attorney)}</p>
            </div>
            <div className="rounded-[8px] border border-[#e5edf6] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Bond Originators</p>
              <p className="mt-1 text-lg font-semibold text-[#10243a]">{formatNumber(headerCounts.bond_originator)}</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-[8px] bg-[#eef3f8]" />
              ))}
            </div>
          ) : activeTab === 'defaults' ? (
            <div className="p-4">
              <DefaultsPanel
                relationships={snapshot.relationships}
                defaults={snapshot.defaults}
                busyKey={actionBusyKey}
                onSetDefault={handleSetDefault}
              />
            </div>
          ) : activeTab === 'agreements' ? (
            visibleAgreements.length ? (
              <div>
                {visibleAgreements.map((agreement) => (
                  <AgreementRow
                    key={agreement.id}
                    agreement={agreement}
                    relationship={relationshipsById.get(agreement.relationshipId)}
                    busyKey={actionBusyKey}
                    onActivate={handleActivateAgreement}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState
                  title="No agreements found"
                  copy="Accepted partners will appear here once a mandate or SLA has been generated."
                />
              </div>
            )
          ) : visibleRelationships.length ? (
            <div>
              {visibleRelationships.map((relationship) => (
                <PartnerRow
                  key={relationship.id}
                  relationship={relationship}
                  busyKey={actionBusyKey}
                  onAccept={handleAcceptRelationship}
                  onSendInvite={handleSendInvite}
                  onGenerateAgreement={handleGenerateAgreement}
                  onWaiveAgreement={handleWaiveAgreement}
                />
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title={activeTab === 'pending' ? 'No pending invites' : 'No partner relationships found'}
                copy="Partner relationships will show here after invitations are created and accepted."
              />
            </div>
          )}
        </section>
      </div>
      <AddDeveloperPartnerModal
        open={inviteOpen}
        workspaceId={workspaceId}
        onClose={() => setInviteOpen(false)}
        onCreated={(created) => {
          setInviteOpen(false)
          setActiveTab('pending')
          if (created?.invitationDelivery) {
            const emailSent = Boolean(created.invitationDelivery.emailResult?.ok || created.invitationDelivery.emailResult?.sent)
            setNotice(emailSent ? 'Partner invite created and email sent.' : 'Partner invite created. Email delivery needs attention.')
          } else {
            setNotice('Partner invite created.')
          }
          void loadWorkspace()
        }}
      />
    </div>
  )
}

export default DeveloperPartnersPage
