import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Download,
  FileCheck2,
  FileText,
  Home,
  KeyRound,
  MessageSquare,
  ShieldCheck,
  Upload,
  Users,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ProgressTimeline from '../components/ProgressTimeline'
import Button from '../components/ui/Button'
import { fetchUnitDetail } from '../lib/api'
import {
  MAIN_PROCESS_STAGES,
  MAIN_STAGE_LABELS,
  getClientStageExplainer,
  getMainStageFromDetailedStage,
  getMainStageIndex,
} from '../lib/stages'

const PREVIEW_UNIT_ID = 'mock-unit-junoah-12'

const PROCESS_LABELS = {
  finance: 'Finance Workflow',
  attorney: 'Transfer Workflow',
}

const OWNER_LABELS = {
  bond_originator: 'Bond Originator',
  attorney: 'Attorney / Conveyancer',
  internal: 'Bridge Team',
  developer: 'Developer',
  client: 'Client',
}

const STEP_STATUS_META = {
  completed: {
    label: 'Completed',
    tone: 'border-[#cfe7d8] bg-[#effaf3] text-[#22824d]',
    iconTone: 'border-[#cfe7d8] bg-[#effaf3] text-[#22824d]',
  },
  in_progress: {
    label: 'In progress',
    tone: 'border-[#d6e5f4] bg-[#eef5fb] text-[#35546c]',
    iconTone: 'border-[#d6e5f4] bg-[#eef5fb] text-[#35546c]',
  },
  blocked: {
    label: 'Blocked',
    tone: 'border-[#f4dcc8] bg-[#fff7ed] text-[#b54708]',
    iconTone: 'border-[#f4dcc8] bg-[#fff7ed] text-[#b54708]',
  },
  not_started: {
    label: 'Pending',
    tone: 'border-[#dde4ee] bg-[#f8fafc] text-[#6b7d93]',
    iconTone: 'border-[#dde4ee] bg-[#f8fafc] text-[#8aa0b8]',
  },
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) {
    return 'R0'
  }

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value, fallback = 'Not scheduled yet') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value, fallback = 'No recent update') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toTitleCase(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function resolveSection(pathname) {
  if (pathname.startsWith('/buyer-information')) return 'buyer_information'
  if (pathname.startsWith('/transactions')) return 'progress'
  if (pathname.startsWith('/documents')) return 'documents'
  if (pathname.startsWith('/handover')) return 'handover'
  if (pathname.startsWith('/snags')) return 'snags'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'overview'
}

function getDocumentGroup(item = {}) {
  const label = String(item.label || '').toLowerCase()
  const description = String(item.description || '').toLowerCase()
  const key = String(item.key || '').toLowerCase()
  const combined = `${label} ${description} ${key}`

  if (
    combined.includes('otp') ||
    combined.includes('offer') ||
    combined.includes('reservation') ||
    combined.includes('instruction') ||
    combined.includes('information sheet') ||
    combined.includes('sale')
  ) {
    return 'sales'
  }

  if (
    combined.includes('passport') ||
    combined.includes('identity') ||
    combined.includes('fica') ||
    combined.includes('address') ||
    combined.includes('bank') ||
    combined.includes('fund') ||
    combined.includes('tax') ||
    combined.includes('income')
  ) {
    return 'fica'
  }

  return 'additional'
}

function buildOutstandingItems(detail, nextStageLabel) {
  const items = []
  const missingDocs = Number(detail?.documentSummary?.missingCount || 0)
  const openSnags = (detail?.clientIssues || []).filter((item) => item.status !== 'resolved').length
  const handoverStatus = String(detail?.handover?.status || 'pending').toLowerCase()

  if (missingDocs > 0) {
    items.push({
      title: `${missingDocs} document${missingDocs === 1 ? '' : 's'} still needed`,
      description: 'Upload the remaining requested items so the legal and finance teams can keep the matter moving.',
      tone: 'amber',
    })
  }

  if (handoverStatus && handoverStatus !== 'completed') {
    items.push({
      title: 'Handover is still pending',
      description: 'The handover date and final key collection details will appear here once your team schedules them.',
      tone: 'slate',
    })
  }

  if (openSnags > 0) {
    items.push({
      title: `${openSnags} snag${openSnags === 1 ? '' : 's'} still open`,
      description: 'Your snag log is active. The developer team will update each item as it is resolved.',
      tone: 'amber',
    })
  }

  if (!items.length) {
    items.push({
      title: `Next milestone: ${nextStageLabel}`,
      description: 'Everything currently looks on track. We will only ask for action when something is required from you.',
      tone: 'green',
    })
  }

  return items
}

function getCurrentProcess(mainStage, subprocesses = []) {
  if (mainStage === 'FIN') {
    return subprocesses.find((item) => item.process_type === 'finance') || null
  }

  if (mainStage === 'ATTY' || mainStage === 'XFER' || mainStage === 'REG') {
    return subprocesses.find((item) => item.process_type === 'attorney') || null
  }

  return subprocesses[0] || null
}

function summarizeProcess(process) {
  const summary = process?.summary || {}
  return {
    total: Number(summary.totalSteps || process?.steps?.length || 0),
    completed: Number(summary.completedSteps || 0),
    active: Number(summary.activeSteps || 0),
  }
}

function TeamMemberCard({ label, value, meta }) {
  return (
    <article className="rounded-[18px] border border-[#dde4ee] bg-white px-5 py-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
      <strong className="mt-2 block text-[1.02rem] font-semibold text-[#142132]">{value || 'Not assigned yet'}</strong>
      {meta ? <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{meta}</p> : null}
    </article>
  )
}

function formatBuyerInformationLabel(key) {
  const labelMap = {
    purchaser_type: 'Purchaser Type',
    purchase_finance_type: 'Finance Type',
    purchase_price: 'Purchase Price',
    cash_amount: 'Cash Amount',
    bond_amount: 'Bond Amount',
    deposit_amount: 'Deposit Amount',
    reservation_required: 'Reservation Required',
    reservation_amount: 'Reservation Amount',
    reservation_status: 'Reservation Status',
    reservation_paid_date: 'Reservation Paid Date',
    first_name: 'First Name',
    last_name: 'Last Name',
    id_number: 'ID Number',
    passport_number: 'Passport Number',
    date_of_birth: 'Date of Birth',
    marital_status: 'Marital Status',
    email: 'Email Address',
    phone: 'Phone Number',
    employer_name: 'Employer Name',
    job_title: 'Job Title',
    monthly_income: 'Monthly Income',
    spouse_full_name: 'Spouse Full Name',
    spouse_id_number: 'Spouse ID Number',
    company_name: 'Company Name',
    company_registration_number: 'Company Registration Number',
    trust_name: 'Trust Name',
    trust_registration_number: 'Trust Registration Number',
    address_line_1: 'Address Line 1',
    address_line_2: 'Address Line 2',
    suburb: 'Suburb',
    city: 'City',
    province: 'Province',
    postal_code: 'Postal Code',
    country: 'Country',
    source_of_funds: 'Source Of Funds',
    tax_number: 'Tax Number',
  }

  return (
    labelMap[key] ||
    String(key || '')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase())
  )
}

function formatBuyerInformationValue(value) {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (item && typeof item === 'object') {
          return Object.values(item).filter(Boolean).join(' • ')
        }
        return String(item || '').trim()
      })
      .filter(Boolean)

    return items.join(', ')
  }

  if (typeof value === 'object') {
    return Object.values(value).filter(Boolean).join(' • ')
  }

  return String(value).trim()
}

function buildBuyerInformationFields(formData = {}) {
  return Object.entries(formData)
    .filter(([, value]) => {
      if (value === null || value === undefined) return false
      if (typeof value === 'string' && !value.trim()) return false
      if (Array.isArray(value) && !value.length) return false
      if (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return false
      return true
    })
    .map(([key, value]) => ({
      key,
      label: formatBuyerInformationLabel(key),
      value: formatBuyerInformationValue(value),
    }))
    .filter((item) => item.value)
}

function ProcessCard({ process, expanded, onToggle }) {
  const summary = summarizeProcess(process)

  return (
    <article className="rounded-[20px] border border-[#dde4ee] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
      <button type="button" className="flex w-full items-start justify-between gap-4 text-left" onClick={onToggle}>
        <div>
          <h4 className="text-[1.02rem] font-semibold tracking-[-0.03em] text-[#142132]">
            {PROCESS_LABELS[process.process_type] || toTitleCase(process.process_type)}
          </h4>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
            Owner: {OWNER_LABELS[process.owner_type] || 'Bridge Team'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-2.5 py-1 text-[0.68rem] font-semibold text-[#66758b]">
            {summary.completed}/{summary.total} completed
          </span>
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-2.5 py-1 text-[0.68rem] font-semibold text-[#66758b]">
            {summary.active} active
          </span>
          {expanded ? <ChevronUp size={16} className="text-[#8aa0b8]" /> : <ChevronDown size={16} className="text-[#8aa0b8]" />}
        </div>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-[minmax(0,1.1fr)_110px_96px] gap-3 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">
            <span>Step</span>
            <span>Status</span>
            <span>Date</span>
          </div>
          {(process.steps || []).map((step) => {
            const statusMeta = STEP_STATUS_META[step.status] || STEP_STATUS_META.not_started
            return (
              <div key={step.id || step.step_key} className="grid grid-cols-[minmax(0,1.1fr)_110px_96px] items-center gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${statusMeta.iconTone}`}>
                    {step.status === 'completed' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                  </span>
                  <div className="min-w-0">
                    <strong className="block text-sm font-semibold text-[#142132]">{step.step_label}</strong>
                    {step.comment ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6b7d93]">{step.comment}</p> : null}
                  </div>
                </div>
                <span className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${statusMeta.tone}`}>
                  {statusMeta.label}
                </span>
                <span className="text-sm font-medium text-[#61778f]">{formatDate(step.completed_at, '—')}</span>
              </div>
            )
          })}
        </div>
      ) : null}
    </article>
  )
}

function ClientModulePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedProcess, setExpandedProcess] = useState('finance')

  const activeSection = useMemo(() => resolveSection(location.pathname), [location.pathname])

  const loadPreview = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const payload = await fetchUnitDetail(PREVIEW_UNIT_ID)
      if (!payload) {
        throw new Error('Client preview matter could not be loaded.')
      }
      setDetail(payload)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load the client preview module.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  const stage = detail?.stage || detail?.transaction?.stage || detail?.unit?.status || 'Available'
  const mainStage = detail?.mainStage || getMainStageFromDetailedStage(stage)
  const stageExplainer = getClientStageExplainer(mainStage)
  const currentStageIndex = getMainStageIndex(mainStage)
  const nextMainStage = MAIN_PROCESS_STAGES[Math.min(currentStageIndex + 1, MAIN_PROCESS_STAGES.length - 1)]
  const nextStageLabel = MAIN_STAGE_LABELS[nextMainStage] || 'Next stage'
  const outstandingItems = useMemo(() => buildOutstandingItems(detail, nextStageLabel), [detail, nextStageLabel])
  const latestUpdates = useMemo(() => (detail?.transactionDiscussion || []).slice(0, 4), [detail?.transactionDiscussion])
  const currentProcess = useMemo(
    () => getCurrentProcess(mainStage, detail?.transactionSubprocesses || []),
    [detail?.transactionSubprocesses, mainStage],
  )
  const groupedRequiredDocuments = useMemo(() => {
    const items = detail?.requiredDocumentChecklist || []
    return items.reduce(
      (groups, item) => {
        groups[getDocumentGroup(item)].push(item)
        return groups
      },
      { sales: [], fica: [], additional: [] },
    )
  }, [detail?.requiredDocumentChecklist])

  const uploadedDocuments = detail?.documents || []
  const handoverDocuments = uploadedDocuments.filter((item) => {
    const bucket = String(item.category || '').toLowerCase()
    return bucket.includes('handover') || bucket.includes('manual') || bucket.includes('warranty')
  })
  const unresolvedSnags = (detail?.clientIssues || []).filter((item) => item.status !== 'resolved')
  const propertyTitle = `${detail?.development?.name || 'Development'} • Unit ${detail?.unit?.unit_number || '—'}`
  const propertyLocation = detail?.development?.location || detail?.unit?.phase || 'Location pending'
  const purchasePrice = formatCurrency(detail?.transaction?.purchase_price || detail?.transaction?.sales_price || detail?.unit?.price)
  const purchaserTypeLabel = toTitleCase(detail?.transaction?.purchaser_type || 'individual')
  const financeTypeLabel = toTitleCase(detail?.transaction?.finance_type || 'cash')
  const lastUpdatedLabel = formatDateTime(detail?.transaction?.updated_at || detail?.transaction?.created_at)
  const buyerInformationFields = useMemo(
    () => buildBuyerInformationFields(detail?.onboardingFormData?.formData || {}),
    [detail?.onboardingFormData?.formData],
  )

  if (loading) {
    return (
      <section className="space-y-5">
        <LoadingSkeleton lines={16} className="rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]" />
      </section>
    )
  }

  if (error) {
    return (
      <section className="space-y-5">
        <div className="rounded-[20px] border border-[#f1d2cc] bg-[#fef3f2] px-6 py-5 text-sm text-[#b42318]">{error}</div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      {activeSection !== 'buyer_information' && activeSection !== 'progress' ? (
      <section className="rounded-[28px] border border-[#dbe5ef] bg-[linear-gradient(135deg,#ffffff_0%,#f5f8fc_72%,#edf3f9_100%)] px-6 py-5 shadow-[0_16px_36px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[760px]">
            <h1 className="text-[1.95rem] font-semibold tracking-[-0.05em] text-[#142132] sm:text-[2.05rem]">
              Welcome to your transaction workspace
            </h1>
            <p className="mt-2 max-w-[640px] text-[0.96rem] leading-7 text-[#61778f]">
              Everything you need for this purchase now lives in one place: progress, documents, handover updates, and any follow-up items your team needs from you.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <article className="min-w-[240px] flex-1 rounded-[18px] border border-[#dbe5ef] bg-white/88 px-4 py-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Property</span>
                <strong className="mt-1.5 block text-[0.98rem] font-semibold tracking-[-0.03em] text-[#142132]">{propertyTitle}</strong>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{propertyLocation}</p>
              </article>
              <article className="min-w-[220px] flex-1 rounded-[18px] border border-[#dbe5ef] bg-white/88 px-4 py-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current stage</span>
                <strong className="mt-1.5 block text-[0.98rem] font-semibold tracking-[-0.03em] text-[#142132]">{stageExplainer.clientLabel}</strong>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Next: {nextStageLabel}</p>
              </article>
            </div>
          </div>

          <div className="w-full rounded-[22px] border border-[#dbe5ef] bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] lg:max-w-[320px]">
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Next milestone</span>
            <strong className="mt-2 block text-[1.05rem] font-semibold tracking-[-0.04em] text-[#142132]">{nextStageLabel}</strong>
            <p className="mt-2 text-sm leading-6 text-[#61778f]">
              {stageExplainer.shortExplainer}
            </p>
            <div className="mt-4 flex items-center justify-between rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
              <div>
                <span className="block text-[0.65rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Last updated</span>
                <strong className="mt-1 block text-sm font-semibold text-[#142132]">{lastUpdatedLabel}</strong>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#d9e6d4] bg-[#f2f8f0] px-3 py-1 text-[0.68rem] font-semibold text-[#44644d]">
                {mainStage}
              </span>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {activeSection !== 'buyer_information' && activeSection !== 'progress' ? (
      <section className="rounded-[26px] border border-[#d7e2ee] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Transaction progress</h2>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                A high-level view of where your transaction sits now and what comes next.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Now</span>
                <strong className="mt-2 block text-sm font-semibold text-[#142132]">{stageExplainer.clientLabel}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Next</span>
                <strong className="mt-2 block text-sm font-semibold text-[#142132]">{nextStageLabel}</strong>
              </article>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dfe7f1] bg-[#fbfdff] p-4">
            <ProgressTimeline
              stages={MAIN_PROCESS_STAGES}
              currentStage={mainStage}
              stageLabelMap={MAIN_STAGE_LABELS}
              compact={false}
            />
          </div>
        </div>
      </section>
      ) : null}

      {activeSection === 'overview' ? (
        <>
          <section>
            <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Property & purchase structure</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">A tighter snapshot of the purchase, funding setup, and who this matter belongs to.</p>
                </div>
                <Home className="text-[#8aa0b8]" size={18} />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                <article className="rounded-[20px] border border-[#e3ebf4] bg-[linear-gradient(135deg,#fbfdff_0%,#f4f8fc_100%)] px-5 py-5">
                  <div className="flex flex-col gap-4 border-b border-[#e3ebf4] pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1 text-[0.67rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">
                        Property reference
                      </span>
                      <div>
                        <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{propertyTitle}</h4>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{propertyLocation}</p>
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#d9e6d4] bg-[#f3f8f1] px-4 py-3">
                      <span className="block text-[0.65rem] uppercase tracking-[0.12em] text-[#6f8a76]">Current stage</span>
                      <strong className="mt-1.5 block text-sm font-semibold text-[#1f3a2a]">{stageExplainer.clientLabel}</strong>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      ['Purchaser', detail?.buyer?.name || 'Client'],
                      ['Purchase price', purchasePrice],
                      ['Last updated', lastUpdatedLabel],
                      ['Next milestone', nextStageLabel],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[16px] border border-[#e3ebf4] bg-white/75 px-4 py-3.5">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
                        <strong className="mt-1.5 block text-sm font-semibold leading-6 text-[#142132]">{value}</strong>
                      </div>
                    ))}
                  </div>
                </article>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Purchaser type', purchaserTypeLabel, 'Used to shape the legal and compliance pack.'],
                    ['Finance type', financeTypeLabel, 'Determines how the finance lane is structured.'],
                    ['Bond originator', detail?.transaction?.bond_originator || 'Not assigned yet', 'The finance team supporting the bond process.'],
                    ['Reservation', detail?.transaction?.reservation_required ? 'Required' : 'Not required', 'Shows whether a reservation payment is part of this sale.'],
                  ].map(([label, value, meta]) => (
                    <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-1.5 block text-sm font-semibold leading-6 text-[#142132]">{value}</strong>
                      <p className="mt-2 text-[0.82rem] leading-5 text-[#6b7d93]">{meta}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Outstanding items</h3>
              <div className="mt-4 space-y-3">
                {outstandingItems.map((item) => (
                  <article key={item.title} className={`rounded-[18px] border px-5 py-4 ${
                    item.tone === 'amber'
                      ? 'border-[#f0d8b4] bg-[#fff8ee]'
                      : item.tone === 'green'
                        ? 'border-[#d6ece0] bg-[#f5fcf7]'
                        : 'border-[#dde4ee] bg-[#fbfdff]'
                  }`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className={item.tone === 'amber' ? 'text-[#b7791f]' : 'text-[#6d829a]'} />
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">{item.title}</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Latest updates</h3>
              <div className="mt-4 space-y-3">
                {latestUpdates.length ? (
                  latestUpdates.map((comment) => (
                    <article key={comment.id || `${comment.author_name}-${comment.created_at}`} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{comment.author_name || 'Bridge Team'}</strong>
                          <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">
                            {toTitleCase(comment.author_role || 'operational')}
                          </span>
                        </div>
                        <time className="text-xs font-medium text-[#8aa0b8]">{formatDateTime(comment.created_at)}</time>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[#51657b]">{comment.comment_text || 'No update text available.'}</p>
                    </article>
                  ))
                ) : (
                  <article className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-5 py-6 text-sm text-[#6b7d93]">
                    No shared transaction updates yet.
                  </article>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Handover status</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">The next practical move-in milestone will appear here as it is scheduled.</p>
                </div>
                <KeyRound className="text-[#8aa0b8]" size={18} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Status</span>
                  <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{toTitleCase(detail?.handover?.status || 'pending')}</strong>
                </article>
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Estimated handover</span>
                  <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{formatDate(detail?.handover?.handoverDate)}</strong>
                </article>
              </div>
            </article>

            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag summary</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">If snag reporting is active, your open items and latest resolutions will be tracked here.</p>
                </div>
                <Wrench className="text-[#8aa0b8]" size={18} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Open snags</span>
                  <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{unresolvedSnags.length}</strong>
                </article>
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Latest snag update</span>
                  <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">
                    {unresolvedSnags[0] ? formatDateTime(unresolvedSnags[0].updated_at || unresolvedSnags[0].created_at) : 'No snag activity yet'}
                  </strong>
                </article>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {activeSection === 'buyer_information' ? (
        <div className="space-y-5">
          {buyerInformationFields.length ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {buyerInformationFields.map((item) => (
                  <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-5 py-4">
                    <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{item.label}</span>
                    <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{item.value}</strong>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-[24px] border border-dashed border-[#d8e2ee] bg-white px-6 py-10 text-sm text-[#6b7d93] shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
              No onboarding information has been captured for this transaction yet.
            </section>
          )}
        </div>
      ) : null}

      {activeSection === 'progress' ? (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4">
              <div className="max-w-[700px]">
                <h3 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">Transaction progress</h3>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">A clear view of where your purchase sits now, what comes next, and which team is driving the current step.</p>
              </div>

              <div className="rounded-[22px] border border-[#dfe7f1] bg-[#fbfdff] p-4">
                <ProgressTimeline
                  stages={MAIN_PROCESS_STAGES}
                  currentStage={mainStage}
                  stageLabelMap={MAIN_STAGE_LABELS}
                  compact={false}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                <div className="rounded-[18px] border border-[#d6e5f4] bg-[linear-gradient(135deg,#f3f8fc_0%,#eef5fb_100%)] px-5 py-5">
                  <span className="inline-flex items-center rounded-full border border-[#cfe0ef] bg-white/85 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#35546c]">
                    Current stage
                  </span>
                  <strong className="mt-3 block text-[1.24rem] font-semibold leading-[1.2] tracking-[-0.04em] text-[#142132]">
                    {stageExplainer.clientLabel}
                  </strong>
                  <p className="mt-3 max-w-[520px] text-sm leading-6 text-[#51657b]">{stageExplainer.shortExplainer}</p>
                </div>
                <div className="grid gap-2">
                  <article className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                    <span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#7b8ca2]">What happens next</span>
                    <strong className="mt-1.5 block text-sm font-semibold leading-6 text-[#142132]">{nextStageLabel}</strong>
                  </article>
                  <article className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                    <span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Your action</span>
                    <strong className="mt-1.5 block text-sm font-semibold leading-6 text-[#142132]">
                      {stageExplainer.actionText || 'No immediate action is required right now.'}
                    </strong>
                  </article>
                </div>
              </div>
            </article>

            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Comments & updates</h3>
                <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-[0.68rem] font-semibold text-[#66758b]">
                  {latestUpdates.length} recent
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {latestUpdates.length ? (
                  latestUpdates.map((comment) => (
                    <article key={comment.id || `${comment.author_name}-${comment.created_at}`} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{comment.author_name || 'Bridge Team'}</strong>
                          <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">
                            {toTitleCase(comment.author_role || 'operational')}
                          </span>
                        </div>
                        <time className="text-xs font-medium text-[#8aa0b8]">{formatDateTime(comment.created_at)}</time>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#51657b]">{comment.comment_text || 'No update text available.'}</p>
                    </article>
                  ))
                ) : (
                  <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
                    No shared updates yet.
                  </article>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
            <div className="space-y-4">
              {(detail?.transactionSubprocesses || [])
                .filter((item) => item.process_type === 'finance' || item.process_type === 'attorney')
                .map((process) => (
                  <ProcessCard
                    key={process.id || process.process_type}
                    process={process}
                    expanded={expandedProcess === process.process_type}
                    onToggle={() => setExpandedProcess((previous) => (previous === process.process_type ? '' : process.process_type))}
                  />
                ))}
            </div>

            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                {PROCESS_LABELS[currentProcess?.process_type] || 'Current workflow lane'}
              </span>
              <h3 className="mt-3 text-[1.2rem] font-semibold tracking-[-0.04em] text-[#142132]">
                {currentProcess?.process_type === 'finance' ? 'Funding is being worked through now' : 'The legal transfer process is now being prepared'}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#51657b]">{stageExplainer.learnMore}</p>
              <div className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                <span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Next milestone</span>
                <strong className="mt-2 block text-base font-semibold tracking-[-0.03em] text-[#142132]">{nextStageLabel}</strong>
                <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                  The matter moves here once the current lane is complete and the team has everything they need for the next step.
                </p>
              </div>
            </article>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="grid gap-4 lg:grid-cols-[0.78fr_1.22fr]">
              <div>
                <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Current focus</span>
                  <strong className="mt-2 block text-base font-semibold tracking-[-0.03em] text-[#142132]">{stageExplainer.clientLabel}</strong>
                </div>
              </div>
              <div>
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">What is happening right now</h3>
                <p className="mt-2 text-sm leading-7 text-[#51657b]">
                  {stageExplainer.shortExplainer} {stageExplainer.learnMore}
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'documents' ? (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h3>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Everything your team has published and everything still requested from you, grouped cleanly by purpose.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Published', uploadedDocuments.filter((item) => String(item.uploaded_by_role || '').toLowerCase() !== 'client').length],
                  ['Requested', (detail?.requiredDocumentChecklist || []).length],
                  ['Uploaded', uploadedDocuments.filter((item) => String(item.uploaded_by_role || '').toLowerCase() === 'client').length],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[16px] border border-[#dde4ee] bg-[#fbfdff] px-4 py-3">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {groupedRequiredDocuments.additional.length ? (
            <section className="rounded-[22px] border border-[#eed8b5] bg-[#fffaf2] px-6 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 text-[#b7791f]" size={18} />
                <div>
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#b7791f]">New request</span>
                  <h4 className="mt-2 text-[1.02rem] font-semibold tracking-[-0.03em] text-[#142132]">Additional documents have been requested</h4>
                  <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                    Your transaction team has added extra document requests. Open the cards below to review what is needed and prepare the latest files.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {[
            {
              key: 'sales',
              title: 'Sales documents',
              description: 'Documents published by the developer, sales team, or attorneys for this purchase.',
              items: uploadedDocuments.filter((item) => String(item.uploaded_by_role || '').toLowerCase() !== 'client'),
              published: true,
            },
            {
              key: 'fica',
              title: 'FICA documentation',
              description: 'Compliance documents your team still needs from you.',
              items: groupedRequiredDocuments.fica,
              published: false,
            },
            {
              key: 'additional',
              title: 'Additional requested documents',
              description: 'Extra requests added by agents, bond originators, or attorneys as the matter progresses.',
              items: groupedRequiredDocuments.additional,
              published: false,
            },
          ].map((section) => (
            <section key={section.key} className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">{section.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                  {section.items.length} items
                </span>
              </div>

              {section.items.length ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.items.map((item) => {
                    const isPublished = section.published
                    const uploaded = !isPublished && item.complete
                    const downloadUrl = isPublished ? item.url : item.uploadedDocumentUrl || ''

                    return (
                      <article key={item.id || item.key} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-5 py-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold leading-7 text-[#142132]">
                              {isPublished ? item.name || 'Untitled document' : item.label}
                            </strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                              {isPublished ? item.category || 'Published document' : item.description || 'Requested supporting document'}
                            </p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${
                            isPublished
                              ? 'border-[#d6e5f4] bg-[#eef5fb] text-[#35546c]'
                              : uploaded
                                ? 'border-[#cfe7d8] bg-[#effaf3] text-[#22824d]'
                                : 'border-[#dde4ee] bg-[#f8fafc] text-[#66758b]'
                          }`}>
                            {isPublished ? 'Published' : uploaded ? 'Uploaded' : 'Required'}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {downloadUrl ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c]"
                              onClick={() => window.open(downloadUrl, '_blank', 'noopener,noreferrer')}
                            >
                              <Download size={14} />
                              Download
                            </button>
                          ) : null}
                          {!isPublished ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c]"
                            >
                              <Upload size={14} />
                              Upload
                            </button>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-5 py-6 text-sm text-[#6b7d93]">
                  Nothing to show here yet.
                </div>
              )}
            </section>
          ))}
        </div>
      ) : null}

      {activeSection === 'handover' ? (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Handover</h3>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Practical move-in and key collection information will be tracked here once your team confirms timing.</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-4 py-2 text-sm font-semibold text-[#35546c]">
                Estimated handover: {formatDate(detail?.handover?.handoverDate)}
              </span>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <h3 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">Handover status</h3>
              <div className="mt-5 space-y-3">
                {[
                  ['Status', toTitleCase(detail?.handover?.status || 'pending')],
                  ['Inspection complete', detail?.handover?.inspectionCompleted ? 'Yes' : 'No'],
                  ['Keys handed over', detail?.handover?.keysHandedOver ? 'Yes' : 'No'],
                  ['Manuals shared', detail?.handover?.manualsHandedOver ? 'Yes' : 'No'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{value}</strong>
                  </div>
                ))}
              </div>
            </article>

            <div className="space-y-5">
              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <h3 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">Meter readings</h3>
                <div className="mt-5 space-y-3">
                  {[
                    ['Electricity', detail?.handover?.electricityMeterReading || 'Not captured yet'],
                    ['Water', detail?.handover?.waterMeterReading || 'Not captured yet'],
                    ['Gas', detail?.handover?.gasMeterReading || 'Not captured yet'],
                  ].map(([label, value]) => (
                    <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-5 py-4">
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{value}</strong>
                    </article>
                  ))}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <h3 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">Warranties & handover documents</h3>
                {handoverDocuments.length ? (
                  <div className="mt-5 space-y-3">
                    {handoverDocuments.map((document) => (
                      <div key={document.id} className="flex items-center justify-between gap-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-5 py-4">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Handover document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Shared by your transaction team'}</p>
                        </div>
                        {document.url ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c]"
                            onClick={() => window.open(document.url, '_blank', 'noopener,noreferrer')}
                          >
                            <Download size={14} />
                            Download
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-5 py-6 text-sm text-[#6b7d93]">
                    Warranty packs and handover guides will appear here once they are ready.
                  </div>
                )}
              </article>
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'snags' ? (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Snags</h3>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Track any snag items, see what is still open, and follow completion updates from the developer team.</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-4 py-2 text-sm font-semibold text-[#35546c]">
                {unresolvedSnags.length} open
              </span>
            </div>
          </section>

          {(detail?.developmentSettings?.snag_tracking_enabled ?? true) ? (
            unresolvedSnags.length || detail?.clientIssues?.length ? (
              <div className="grid gap-4">
                {(detail?.clientIssues || []).map((issue) => (
                  <article key={issue.id} className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <strong className="block text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{issue.category || 'Snag item'}</strong>
                        <p className="mt-2 text-sm leading-7 text-[#51657b]">{issue.description || 'No additional detail provided.'}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        String(issue.status || '').toLowerCase() === 'resolved'
                          ? 'border-[#cfe7d8] bg-[#effaf3] text-[#22824d]'
                          : 'border-[#f0d8b4] bg-[#fff8ee] text-[#b7791f]'
                      }`}>
                        {toTitleCase(issue.status || 'open')}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Location</span>
                        <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{issue.location || 'Unit inspection'}</strong>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Priority</span>
                        <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{issue.priority || 'Standard'}</strong>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Submitted</span>
                        <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{formatDate(issue.created_at)}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="rounded-[24px] border border-dashed border-[#d8e2ee] bg-white px-6 py-10 text-sm text-[#6b7d93] shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                No snag items have been logged yet.
              </section>
            )
          ) : (
            <section className="rounded-[24px] border border-dashed border-[#d8e2ee] bg-white px-6 py-10 text-sm text-[#6b7d93] shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
              Snag reporting is not active for this transaction.
            </section>
          )}
        </div>
      ) : null}

      {activeSection === 'settings' ? (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Settings</h3>
            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">A simple read-only view of how your workspace is currently configured.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TeamMemberCard label="Portal access" value="Enabled" meta="Your client workspace is active." />
              <TeamMemberCard label="Document updates" value="Notifications on" meta="Your team will notify you when more documents are needed." />
              <TeamMemberCard label="Snag reporting" value={(detail?.developmentSettings?.snag_tracking_enabled ?? true) ? 'Enabled' : 'Not active'} meta="Only used when relevant to your purchase." />
              <TeamMemberCard label="Support" value="Bridge Team" meta="Questions can be routed through the transaction updates feed." />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

export default ClientModulePage
