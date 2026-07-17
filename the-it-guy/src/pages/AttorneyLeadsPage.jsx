import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  ExternalLink,
  Filter,
  Globe2,
  Link2,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Drawer from '../components/ui/Drawer'
import DataTable, { DataTableInner } from '../components/ui/DataTable'
import { useOrganisation } from '../context/OrganisationContext'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyLeadRoleAccess } from '../core/leads/attorneyLeadContract'
import { sendAttorneyQuoteEmail } from '../services/attorneyQuoteEmailService'
import {
  addAttorneyLeadActivity,
  assignAttorneyLead,
  convertAttorneyLeadToMatter,
  createAttorneyQuotePublicLink,
  createAttorneyLead,
  ensureAttorneyPublicIntakeLink,
  getAttorneyLeadsLaunchReadiness,
  getAttorneyLeadSlaSettings,
  getAttorneyPublicIntakeLink,
  listAttorneyLeadActivities,
  listAttorneyLeadAssignees,
  listAttorneyLeadQuotes,
  listAttorneyLeadQuotePublicLinks,
  listAttorneyLeads,
  setAttorneyLeadFollowUp,
  setAttorneyPublicIntakeLinkStatus,
  createAttorneyLeadQuote,
  revokeAttorneyQuotePublicLink,
  transitionAttorneyLeadQuote,
  updateAttorneyLeadSlaSettings,
  updateAttorneyLeadLifecycle,
} from '../services/attorneyLeadsService'

const STAGE_OPTIONS = Object.freeze([
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['qualified', 'Qualified'],
  ['quote_sent', 'Quote Sent'],
  ['follow_up', 'Follow-Up'],
  ['won', 'Won'],
  ['lost', 'Lost'],
])

const SERVICE_OPTIONS = Object.freeze([
  ['transfer_quote', 'Transfer Quote'],
  ['property_transfer', 'Property Transfer'],
  ['bond_registration', 'Bond Registration'],
  ['bond_cancellation', 'Bond Cancellation'],
  ['property_legal_advice', 'Property Legal Advice'],
  ['general_enquiry', 'General Enquiry'],
])

const SOURCE_OPTIONS = Object.freeze([
  ['manual', 'Manual'],
  ['referral', 'Referral'],
  ['email', 'Email'],
  ['website', 'Website'],
  ['whatsapp', 'WhatsApp'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['linkedin', 'LinkedIn'],
  ['qr', 'QR Code'],
  ['other', 'Other'],
])

const STAGE_TONES = Object.freeze({
  new: 'bg-sky-50 text-sky-700',
  contacted: 'bg-indigo-50 text-indigo-700',
  qualified: 'bg-violet-50 text-violet-700',
  quote_sent: 'bg-amber-50 text-amber-700',
  follow_up: 'bg-orange-50 text-orange-700',
  won: 'bg-emerald-50 text-emerald-700',
  lost: 'bg-slate-100 text-slate-600',
})

const EMPTY_MANUAL_FORM = Object.freeze({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  serviceType: 'transfer_quote',
  sourceChannel: 'manual',
  campaignCode: '',
  propertyAddress: '',
  propertyValue: '',
  partyRole: 'unknown',
  message: '',
  priority: 'Medium',
})

function optionLabel(options, value, fallback = '—') {
  return options.find(([key]) => key === value)?.[1] || fallback
}

function formatDate(value, includeTime = false) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

function formatDateTimeLocal(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function leadName(lead) {
  return [lead?.contact?.firstName, lead?.contact?.lastName].filter(Boolean).join(' ') || 'Unnamed Lead'
}

function isFollowUpDue(value, graceMinutes = 0) {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() + (graceMinutes * 60 * 1000) <= Date.now()
}

function isFirstContactOverdue(lead, slaHours = 24, now = Date.now()) {
  if (!lead || lead.status !== 'open' || lead.stage !== 'new' || lead.lastContactedAt) return false
  const createdAt = new Date(lead.createdAt || '').getTime()
  return Number.isFinite(createdAt) && createdAt <= now - (slaHours * 60 * 60 * 1000)
}

function getLeadNextAction(lead) {
  if (lead?.convertedTransactionId) return 'Open the active Matter and continue the legal workflow.'
  if (lead?.stage === 'new') return 'Make first contact and record the outcome.'
  if (lead?.stage === 'contacted') return 'Qualify the enquiry and confirm the client brief.'
  if (lead?.stage === 'qualified') return 'Prepare and send the first fee quote.'
  if (lead?.stage === 'quote_sent') return 'Follow up on the outstanding quote decision.'
  if (lead?.stage === 'follow_up') return 'Complete the scheduled follow-up and record the response.'
  if (lead?.stage === 'won') return 'Convert this won Lead into an active Matter.'
  if (lead?.stage === 'lost') return 'Review the loss reason before closing the opportunity.'
  return 'Review the Lead and choose the next action.'
}

function scrollLeadWorkspaceTo(sectionId) {
  if (typeof document === 'undefined') return
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function defaultMatterTypeForLead(lead) {
  if (lead?.detail?.serviceType === 'bond_registration') return 'bond'
  if (lead?.detail?.serviceType === 'bond_cancellation') return 'cancellation'
  return 'transfer'
}

function defaultClientRoleForMatter(lead, matterType) {
  if (['buyer', 'seller'].includes(lead?.detail?.partyRole)) return lead.detail.partyRole
  if (matterType === 'bond') return 'borrower'
  if (matterType === 'cancellation') return 'owner'
  return 'buyer'
}

function canOwnConvertedMatter(assignee, matterType) {
  const leadership = ['owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner']
  if (leadership.includes(assignee?.role) || ['attorney', 'conveyancer'].includes(assignee?.role)) return true
  if (matterType === 'bond') return assignee?.role === 'bond_attorney'
  return assignee?.role === 'transfer_attorney'
}

function Field({ label, children, required = false }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      <span>{label}{required ? <span className="ml-1 text-red-500">*</span> : null}</span>
      {children}
    </label>
  )
}

const inputClass = 'min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#27655f] focus:ring-4 focus:ring-emerald-50'

function StagePill({ stage }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE_TONES[stage] || STAGE_TONES.new}`}>
      {optionLabel(STAGE_OPTIONS, stage, 'New')}
    </span>
  )
}

function KpiCard({ icon, label, value, helper, tone }) {
  const KpiIcon = icon
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <KpiIcon size={18} aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function ManualLeadDrawer({ open, saving, error, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_MANUAL_FORM)

  useEffect(() => {
    if (!open) return
    Promise.resolve().then(() => setForm(EMPTY_MANUAL_FORM))
  }, [open])

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  return (
    <Drawer
      open={open}
      onClose={saving ? undefined : onClose}
      title="Capture a Lead"
      subtitle="For calls, walk-ins, emails and referrals."
      widthClassName="max-w-[620px]"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="ui-button ui-button-primary" onClick={() => onSave(form)} disabled={saving}>
            {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
            {saving ? 'Creating…' : 'Create Lead'}
          </button>
        </div>
      )}
    >
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input className={inputClass} value={form.firstName} onChange={(event) => update('firstName', event.target.value)} autoComplete="given-name" />
          </Field>
          <Field label="Surname">
            <input className={inputClass} value={form.lastName} onChange={(event) => update('lastName', event.target.value)} autoComplete="family-name" />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" />
          </Field>
          <Field label="Mobile number">
            <input className={inputClass} type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-slate-500">Provide at least an email address or mobile number.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service required" required>
            <select className={inputClass} value={form.serviceType} onChange={(event) => update('serviceType', event.target.value)}>
              {SERVICE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select className={inputClass} value={form.sourceChannel} onChange={(event) => update('sourceChannel', event.target.value)}>
              {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputClass} value={form.priority} onChange={(event) => update('priority', event.target.value)}>
              {['Low', 'Medium', 'High', 'Urgent'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="Campaign code">
            <input className={inputClass} value={form.campaignCode} onChange={(event) => update('campaignCode', event.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <Field label="Property address">
          <input className={inputClass} value={form.propertyAddress} onChange={(event) => update('propertyAddress', event.target.value)} placeholder="Optional" />
        </Field>
        {form.serviceType === 'transfer_quote' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property value">
              <input className={inputClass} type="number" min="0" value={form.propertyValue} onChange={(event) => update('propertyValue', event.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Buyer or seller">
              <select className={inputClass} value={form.partyRole} onChange={(event) => update('partyRole', event.target.value)}>
                <option value="unknown">Not specified</option>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
        ) : null}
        <Field label="Enquiry notes">
          <textarea className={`${inputClass} min-h-28 py-3`} value={form.message} onChange={(event) => update('message', event.target.value)} placeholder="Capture the enquiry and any useful context." />
        </Field>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  )
}

function PublicLinkDrawer({ open, link, readiness, readinessLoading, canManage, busy, copied, error, onClose, onCreate, onCopy, onToggle, onRefreshReadiness }) {
  const publicUrl = link?.slug && typeof window !== 'undefined' ? `${window.location.origin}/journey/${link.slug}` : ''
  const readinessTone = readiness?.status === 'ready'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : readiness?.status === 'attention'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-rose-200 bg-rose-50 text-rose-800'
  return (
    <Drawer open={open} onClose={onClose} title="Public Journey Link" subtitle="The firm’s canonical public enquiry page.">
      <div className="grid gap-5">
        {link ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${link.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                  {link.status === 'active' ? 'Active' : 'Disabled'}
                </span>
                <span className="text-xs text-slate-500">One link for the firm</span>
              </div>
              <p className="mt-4 break-all text-sm font-medium text-slate-800">{publicUrl}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="ui-button ui-button-primary" onClick={() => onCopy(publicUrl)} disabled={busy}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <a className="ui-button ui-button-secondary" href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Preview
              </a>
            </div>
            {canManage ? (
              <button type="button" className="ui-button ui-button-secondary" onClick={() => onToggle(link.status === 'active' ? 'disabled' : 'active')} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Globe2 size={16} />}
                {link.status === 'active' ? 'Disable public link' : 'Enable public link'}
              </button>
            ) : null}
          </>
        ) : canManage ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
            <Link2 className="mx-auto text-slate-400" size={28} />
            <h4 className="mt-3 text-base font-semibold text-slate-900">Create the firm’s public link</h4>
            <p className="mt-2 text-sm leading-6 text-slate-500">A durable organisation-level URL will be generated from the firm name.</p>
            <button type="button" className="ui-button ui-button-primary mt-5" onClick={onCreate} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Create link
            </button>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">A firm administrator must create the public link before it can be shared.</p>
        )}
        <section className={`rounded-2xl border p-4 ${readinessTone}`} aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">Launch readiness</p>
              <p className="mt-1 text-sm font-semibold">
                {readinessLoading ? 'Checking…' : readiness?.status === 'ready' ? 'Ready to share' : readiness?.status === 'attention' ? 'Ready with follow-ups' : 'Action required'}
              </p>
            </div>
            <button type="button" className="rounded-lg p-2 transition hover:bg-white/60" onClick={onRefreshReadiness} disabled={readinessLoading} aria-label="Refresh launch readiness">
              <RefreshCw className={readinessLoading ? 'animate-spin' : ''} size={15} />
            </button>
          </div>
          {readiness ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-white/60 p-2"><strong className="block text-base">{readiness.operations.qualifiedOwnerCount}</strong>Owners</div>
                <div className="rounded-xl bg-white/60 p-2"><strong className="block text-base">{readiness.operations.publicSubmissions30d}</strong>30-day enquiries</div>
                <div className="rounded-xl bg-white/60 p-2"><strong className="block text-base">{readiness.operations.dueFollowUps}</strong>Due</div>
                <div className="rounded-xl bg-white/60 p-2"><strong className="block text-base">{readiness.runtime?.healthy && readiness.runtime?.intakeActive ? 'Online' : 'Offline'}</strong>Public runtime</div>
              </div>
              {[...readiness.blockers, ...readiness.warnings].length ? (
                <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5">
                  {[...readiness.blockers, ...readiness.warnings].map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : <p className="mt-3 text-xs leading-5">Journey, public runtime, services, ownership and operational checks passed.</p>}
            </>
          ) : null}
        </section>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div> : null}
        <div className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">
          Use this URL in social profiles, emails, WhatsApp and QR codes. Do not create separate permanent links for individual employees.
        </div>
      </div>
    </Drawer>
  )
}

const BUSINESS_DAY_OPTIONS = Object.freeze([
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun'],
])

function LeadSlaSettingsDrawer({ open, settings, canManage, saving, error, onClose, onSave }) {
  const [form, setForm] = useState(settings)

  useEffect(() => {
    if (open && settings) Promise.resolve().then(() => setForm(settings))
  }, [open, settings])

  if (!form) return null

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function toggleBusinessDay(day) {
    setForm((previous) => ({
      ...previous,
      businessDays: previous.businessDays.includes(day)
        ? previous.businessDays.filter((value) => value !== day)
        : [...previous.businessDays, day].sort((left, right) => left - right),
    }))
  }

  return (
    <Drawer
      open={open}
      onClose={saving ? undefined : onClose}
      title="Lead SLA & Escalation"
      subtitle="Firm-wide response rules for Attorney Leads."
      widthClassName="max-w-[620px]"
      footer={canManage ? (
        <div className="flex w-full justify-end gap-2">
          <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="ui-button ui-button-primary" onClick={() => onSave(form)} disabled={saving}>
            {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}
            {saving ? 'Saving…' : 'Save policy'}
          </button>
        </div>
      ) : null}
    >
      <div className="grid gap-5">
        {!canManage ? <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Firm leadership manages this policy.</div> : null}
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
          <span><strong className="block text-sm text-slate-900">Internal reminders</strong><span className="mt-1 block text-xs text-slate-500">Create deduplicated alerts for due and overdue Leads.</span></span>
          <input type="checkbox" checked={form.remindersEnabled} onChange={(event) => update('remindersEnabled', event.target.checked)} disabled={!canManage} className="h-5 w-5 accent-emerald-700" />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First-contact SLA">
            <div className="flex items-center gap-2"><input className={`${inputClass} min-w-0 w-full`} type="number" min="1" max="168" value={form.firstContactSlaHours} onChange={(event) => update('firstContactSlaHours', event.target.value)} disabled={!canManage} /><span className="text-xs text-slate-500">hours</span></div>
          </Field>
          <Field label="Follow-up grace">
            <div className="flex items-center gap-2"><input className={`${inputClass} min-w-0 w-full`} type="number" min="0" max="1440" value={form.followUpGraceMinutes} onChange={(event) => update('followUpGraceMinutes', event.target.value)} disabled={!canManage} /><span className="text-xs text-slate-500">min</span></div>
          </Field>
          <Field label="Escalate after">
            <div className="flex items-center gap-2"><input className={`${inputClass} min-w-0 w-full`} type="number" min="1" max="168" value={form.escalationAfterHours} onChange={(event) => update('escalationAfterHours', event.target.value)} disabled={!canManage || !form.escalationEnabled} /><span className="text-xs text-slate-500">hours</span></div>
          </Field>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
          <span><strong className="block text-sm text-slate-900">Leadership escalation</strong><span className="mt-1 block text-xs text-slate-500">Escalate uncontacted Leads after the SLA plus the delay above.</span></span>
          <input type="checkbox" checked={form.escalationEnabled} onChange={(event) => update('escalationEnabled', event.target.checked)} disabled={!canManage} className="h-5 w-5 accent-emerald-700" />
        </label>
        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-4">
            <div><h4 className="text-sm font-semibold text-slate-900">Business hours</h4><p className="mt-1 text-xs leading-5 text-slate-500">Quiet hours defer reminders until the next configured operating window.</p></div>
            <input type="checkbox" checked={form.quietHoursEnabled} onChange={(event) => update('quietHoursEnabled', event.target.checked)} disabled={!canManage} className="mt-1 h-5 w-5 accent-emerald-700" aria-label="Enable quiet hours" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {BUSINESS_DAY_OPTIONS.map(([day, label]) => (
              <button key={day} type="button" aria-pressed={form.businessDays.includes(day)} onClick={() => toggleBusinessDay(day)} disabled={!canManage} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${form.businessDays.includes(day) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500'}`}>{label}</button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Start"><input className={inputClass} type="time" value={form.businessHoursStart} onChange={(event) => update('businessHoursStart', event.target.value)} disabled={!canManage} /></Field>
            <Field label="End"><input className={inputClass} type="time" value={form.businessHoursEnd} onChange={(event) => update('businessHoursEnd', event.target.value)} disabled={!canManage} /></Field>
            <Field label="Timezone"><input className={inputClass} value={form.timezoneName} onChange={(event) => update('timezoneName', event.target.value)} disabled={!canManage} /></Field>
          </div>
        </section>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  )
}

function defaultQuoteExpiry() {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value || 0))
}

function isActiveQuoteLink(link, quote) {
  const expiresAt = new Date(link?.expiresAt || '').getTime()
  return quote?.status === 'sent' && link?.quoteId === quote?.id && link?.status === 'active' && Number.isFinite(expiresAt) && expiresAt > Date.now()
}

function LeadQuotesSection({ leadId, quotes, quoteLinks, loading, canEdit, locked, saving, onCreate, onTransition, onShare, onRevokeLink, onEmail }) {
  const [professionalFee, setProfessionalFee] = useState('')
  const [vatAmount, setVatAmount] = useState('')
  const [disbursements, setDisbursements] = useState('')
  const [validUntil, setValidUntil] = useState(defaultQuoteExpiry())
  const [internalNote, setInternalNote] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [sharedQuoteId, setSharedQuoteId] = useState('')
  const [sharedUrl, setSharedUrl] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [emailedQuoteId, setEmailedQuoteId] = useState('')
  const [emailNotice, setEmailNotice] = useState('')

  useEffect(() => {
    Promise.resolve().then(() => {
      setProfessionalFee('')
      setVatAmount('')
      setDisbursements('')
      setValidUntil(defaultQuoteExpiry())
      setInternalNote('')
      setDeclineReason('')
      setSharedQuoteId('')
      setSharedUrl('')
      setLinkCopied(false)
      setEmailedQuoteId('')
      setEmailNotice('')
    })
  }, [leadId])

  const draftTotal = Number(professionalFee || 0) + Number(vatAmount || 0) + Number(disbursements || 0)

  async function createQuote() {
    const created = await onCreate({ professionalFee, vatAmount, disbursements, validUntil, internalNote })
    if (created) {
      setProfessionalFee('')
      setVatAmount('')
      setDisbursements('')
      setValidUntil(defaultQuoteExpiry())
      setInternalNote('')
    }
  }

  async function shareQuote(quoteId) {
    const created = await onShare(quoteId)
    if (!created?.token) return
    const url = `${window.location.origin}/quote/${created.token}`
    setSharedQuoteId(quoteId)
    setSharedUrl(url)
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
    } catch {
      setLinkCopied(false)
    }
  }

  async function copySharedLink() {
    try {
      await navigator.clipboard.writeText(sharedUrl)
      setLinkCopied(true)
    } catch {
      setLinkCopied(false)
    }
  }

  async function emailQuote(quoteId) {
    const result = await onEmail(quoteId)
    if (!result?.sent) return
    setEmailedQuoteId(quoteId)
    setEmailNotice(result.recipientEmail ? `Quote emailed to ${result.recipientEmail}.` : 'Quote email sent.')
  }

  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h4 className="font-semibold text-slate-900">Quotes</h4><p className="mt-1 text-xs leading-5 text-slate-500">Versioned fee proposals. Acceptance marks the Lead Won but does not create a Matter.</p></div>
        <ReceiptText className="text-slate-400" size={19} />
      </div>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading quotes…</p> : null}
      {!loading && quotes.length ? (
        <div className="mt-4 grid gap-3">
          {quotes.map((quote) => (
            <article key={quote.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-900">{quote.quoteNumber} · v{quote.versionNumber}</p><p className="mt-1 text-xs text-slate-500">Valid until {formatDate(quote.validUntil)}</p></div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{quote.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                <span>Fees <strong className="block text-slate-900">{formatMoney(quote.professionalFee)}</strong></span>
                <span>VAT <strong className="block text-slate-900">{formatMoney(quote.vatAmount)}</strong></span>
                <span>Disbursements <strong className="block text-slate-900">{formatMoney(quote.disbursements)}</strong></span>
                <span>Total <strong className="block text-slate-900">{formatMoney(quote.totalAmount)}</strong></span>
              </div>
              {quote.decisionReason ? <p className="mt-2 text-xs text-slate-600">Decision: {quote.decisionReason}</p> : null}
              {quoteLinks.some((link) => isActiveQuoteLink(link, quote)) ? <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Secure client link active</p> : null}
              {quoteLinks.find((link) => link.quoteId === quote.id && link.lastEmailStatus) ? <p className={`mt-2 text-xs font-semibold ${quoteLinks.find((link) => link.quoteId === quote.id && link.lastEmailStatus).lastEmailStatus === 'sent' ? 'text-emerald-700' : 'text-rose-700'}`}>Email {quoteLinks.find((link) => link.quoteId === quote.id && link.lastEmailStatus).lastEmailStatus} · {formatDate(quoteLinks.find((link) => link.quoteId === quote.id && link.lastEmailStatus).lastEmailedAt || quoteLinks.find((link) => link.quoteId === quote.id && link.lastEmailStatus).createdAt)}</p> : null}
              {emailedQuoteId === quote.id && emailNotice ? <p className="mt-2 rounded-xl bg-emerald-50 p-2 text-xs font-semibold text-emerald-700" role="status">{emailNotice}</p> : null}
              {sharedQuoteId === quote.id && sharedUrl ? <div className="mt-2 rounded-xl border border-emerald-200 bg-white p-2"><p className="break-all text-xs text-slate-600">{sharedUrl}</p><button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" onClick={copySharedLink}><Copy size={13} /> {linkCopied ? 'Copied' : 'Copy link'}</button></div> : null}
              {canEdit && !locked && quote.status === 'draft' ? <button type="button" className="ui-button ui-button-secondary mt-3" disabled={saving} onClick={() => onTransition(quote.id, 'sent', '')}>Mark as sent</button> : null}
              {canEdit && !locked && quote.status === 'sent' ? (
                <div className="mt-3 grid gap-2">
                  <input className={inputClass} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Decline reason (required only when declining)" aria-label={`Decline reason for ${quote.quoteNumber}`} />
                  <div className="flex flex-wrap gap-2"><button type="button" className="ui-button ui-button-primary" disabled={saving} onClick={() => onTransition(quote.id, 'accepted', '')}>Accept quote</button><button type="button" className="ui-button ui-button-secondary" disabled={saving || !declineReason.trim()} onClick={() => onTransition(quote.id, 'declined', declineReason)}>Decline quote</button><button type="button" className="ui-button ui-button-secondary" disabled={saving} onClick={() => emailQuote(quote.id)}><Mail size={16} /> {quoteLinks.some((link) => link.quoteId === quote.id && link.lastEmailStatus === 'sent') ? 'Resend email' : 'Email client'}</button><button type="button" className="ui-button ui-button-secondary" disabled={saving} onClick={() => shareQuote(quote.id)}><Link2 size={16} /> {quoteLinks.some((link) => isActiveQuoteLink(link, quote)) ? 'Reissue client link' : 'Create client link'}</button>{quoteLinks.find((link) => isActiveQuoteLink(link, quote)) ? <button type="button" className="ui-button ui-button-ghost" disabled={saving} onClick={() => onRevokeLink(quoteLinks.find((link) => isActiveQuoteLink(link, quote)).id)}>Revoke link</button> : null}</div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {!loading && !quotes.length ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No quotes have been drafted.</p> : null}
      {canEdit && !locked ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-slate-900">Draft a new version</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Professional fee"><input className={inputClass} type="number" min="0" step="0.01" value={professionalFee} onChange={(event) => setProfessionalFee(event.target.value)} /></Field>
            <Field label="VAT"><input className={inputClass} type="number" min="0" step="0.01" value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} /></Field>
            <Field label="Disbursements"><input className={inputClass} type="number" min="0" step="0.01" value={disbursements} onChange={(event) => setDisbursements(event.target.value)} /></Field>
            <Field label="Valid until"><input className={inputClass} type="date" min={new Date().toISOString().slice(0, 10)} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Internal note"><input className={inputClass} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="Optional context" /></Field></div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-700">Draft total: {formatMoney(draftTotal)}</span><button type="button" className="ui-button ui-button-secondary" disabled={saving || draftTotal <= 0 || !validUntil} onClick={createQuote}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Create draft</button></div>
        </div>
      ) : null}
    </section>
  )
}

function LeadDetailDrawer({
  lead,
  activities,
  activitiesLoading,
  assignees,
  canAssign,
  canEdit,
  saving,
  assignmentSaving,
  activitySaving,
  followUpSaving,
  conversionSaving,
  quotes,
  quoteLinks,
  quotesLoading,
  quoteSaving,
  error,
  onClose,
  onStageSave,
  onAssignmentSave,
  onActivitySave,
  onFollowUpSave,
  onConvert,
  onQuoteCreate,
  onQuoteTransition,
  onQuoteShare,
  onQuoteLinkRevoke,
  onQuoteEmail,
}) {
  const [stage, setStage] = useState(lead?.stage || 'new')
  const [lostReason, setLostReason] = useState(lead?.lostReason || '')
  const [assignedUserId, setAssignedUserId] = useState(lead?.assignedUserId || '')
  const [assignmentReason, setAssignmentReason] = useState('')
  const [activityType, setActivityType] = useState('note')
  const [activityNote, setActivityNote] = useState('')
  const [activityOutcome, setActivityOutcome] = useState('')
  const [followUpAt, setFollowUpAt] = useState(formatDateTimeLocal(lead?.nextFollowUpAt))
  const [followUpNote, setFollowUpNote] = useState('')
  const [matterType, setMatterType] = useState(defaultMatterTypeForLead(lead))
  const [clientRole, setClientRole] = useState(defaultClientRoleForMatter(lead, defaultMatterTypeForLead(lead)))
  const [conversionAssigneeId, setConversionAssigneeId] = useState(lead?.assignedUserId || '')
  const [conversionPropertyAddress, setConversionPropertyAddress] = useState(lead?.detail?.propertyAddress || '')
  const [conversionPropertyValue, setConversionPropertyValue] = useState(lead?.detail?.propertyValue || '')
  const [conversionFinanceType, setConversionFinanceType] = useState('cash')
  const [conversionNote, setConversionNote] = useState('')
  const [conversionConfirmed, setConversionConfirmed] = useState(false)

  useEffect(() => {
    if (!lead) return
    Promise.resolve().then(() => {
      setStage(lead.stage || 'new')
      setLostReason(lead.lostReason || '')
      setAssignedUserId(lead.assignedUserId || '')
      setAssignmentReason('')
      setActivityType('note')
      setActivityNote('')
      setActivityOutcome('')
      setFollowUpAt(formatDateTimeLocal(lead.nextFollowUpAt))
      setFollowUpNote('')
      const nextMatterType = defaultMatterTypeForLead(lead)
      setMatterType(nextMatterType)
      setClientRole(defaultClientRoleForMatter(lead, nextMatterType))
      setConversionAssigneeId(lead.assignedUserId || '')
      setConversionPropertyAddress(lead.detail?.propertyAddress || '')
      setConversionPropertyValue(lead.detail?.propertyValue || '')
      setConversionFinanceType(nextMatterType === 'bond' ? 'bond' : 'cash')
      setConversionNote('')
      setConversionConfirmed(false)
    })
  }, [lead])

  if (!lead) return null
  const contact = lead.contact || {}
  const detail = lead.detail || {}
  const conversionReady = ['qualified', 'quote_sent', 'follow_up', 'won'].includes(lead.stage)
  const conversionAssignees = assignees.filter((assignee) => canOwnConvertedMatter(assignee, matterType))
  const currentStageIndex = STAGE_OPTIONS.findIndex(([value]) => value === lead.stage)
  const assignedTeamMember = assignees.find((assignee) => assignee.userId === lead.assignedUserId)
  const leadOwnerLabel = assignedTeamMember?.name || (lead.assignedUserId ? 'Assigned team member' : 'Unassigned queue')
  const latestActivity = activities[0]

  return (
    <Drawer
      open={Boolean(lead)}
      onClose={onClose}
      title={leadName(lead)}
      subtitle={`${optionLabel(SERVICE_OPTIONS, detail.serviceType, 'General Enquiry')} · ${formatDate(lead.createdAt)}`}
      widthClassName="max-w-[1180px]"
      className="[&_.ui-drawer-body]:bg-[#f6f9fc]"
      footer={(
        <div className="flex w-full justify-end">
          <button type="button" className="ui-button ui-button-primary" onClick={() => onStageSave(stage, lostReason)} disabled={!canEdit || Boolean(lead.convertedTransactionId) || saving || (stage === lead.stage && lostReason === lead.lostReason)}>
            {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} Save status
          </button>
        </div>
      )}
    >
      <div className="grid gap-5">
        <section className="overflow-hidden rounded-[24px] border border-[#dce7f2] bg-white shadow-[0_10px_30px_rgba(31,54,78,0.05)]" aria-label="Lead workspace summary">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)] lg:p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StagePill stage={lead.stage} />
                <span className="rounded-full bg-[#eef5fb] px-2.5 py-1 text-xs font-semibold text-[#315b7a]">
                  {optionLabel(SOURCE_OPTIONS, lead.sourceChannel, 'Other')}
                </span>
                {lead.nextFollowUpAt ? (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isFollowUpDue(lead.nextFollowUpAt) ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                    Follow-up {formatDate(lead.nextFollowUpAt, true)}
                  </span>
                ) : null}
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Next best action</p>
              <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">{getLeadNextAction(lead)}</h4>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758b]">
                Keep every call, email, quote and follow-up on this Lead so the firm has one continuous history from enquiry to Matter.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {contact.phone ? <a className="ui-button ui-button-primary" href={`tel:${contact.phone}`}><Phone size={16} /> Call Lead</a> : null}
                {contact.email ? <a className="ui-button ui-button-secondary" href={`mailto:${contact.email}`}><Mail size={16} /> Email Lead</a> : null}
                {canEdit ? <button type="button" className="ui-button ui-button-secondary" onClick={() => scrollLeadWorkspaceTo('attorney-lead-record-activity')}><Plus size={16} /> Log activity</button> : null}
                {canEdit ? <button type="button" className="ui-button ui-button-secondary" onClick={() => scrollLeadWorkspaceTo('attorney-lead-follow-up')}><CalendarClock size={16} /> Set follow-up</button> : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Owner', leadOwnerLabel],
                ['Service', optionLabel(SERVICE_OPTIONS, detail.serviceType, 'General Enquiry')],
                ['Activities', activitiesLoading ? 'Loading…' : String(activities.length)],
                ['Latest update', latestActivity ? formatDate(latestActivity.date, true) : 'No activity yet'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8aa0b7]">{label}</p>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#20364c]" title={value}>{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-[#e4edf6] bg-[#fbfdff] px-5 py-4 lg:px-6">
            <div className="flex min-w-max items-center gap-2 overflow-x-auto pb-1" aria-label="Lead lifecycle">
              {STAGE_OPTIONS.map(([value, label], index) => {
                const isCurrent = value === lead.stage
                const isComplete = currentStageIndex >= 0 && index < currentStageIndex && value !== 'lost' && !(lead.stage === 'lost' && value === 'won')
                return (
                  <div key={value} className="flex items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-bold ${isCurrent ? 'border-[#2f7b9e] bg-[#2f7b9e] text-white shadow-[0_0_0_4px_rgba(47,123,158,0.12)]' : isComplete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#d5e0eb] bg-white text-[#8aa0b7]'}`}>
                      {isComplete ? <Check size={14} /> : index + 1}
                    </span>
                    <span className={`text-xs font-semibold ${isCurrent ? 'text-[#183b56]' : 'text-[#71869c]'}`}>{label}</span>
                    {index < STAGE_OPTIONS.length - 1 ? <span className="mx-1 h-px w-5 bg-[#dbe5ef]" /> : null}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <nav className="flex gap-2 overflow-x-auto rounded-[18px] border border-[#dce7f2] bg-white p-2 shadow-sm" aria-label="Lead workspace sections">
          {[
            ['attorney-lead-status', 'Overview'],
            canEdit ? ['attorney-lead-follow-up', 'Follow-up'] : null,
            ['attorney-lead-quotes', `Quotes (${quotes.length})`],
            ['attorney-lead-activity', `Activity (${activities.length})`],
            lead.convertedTransactionId || canAssign ? ['attorney-lead-conversion', lead.convertedTransactionId ? 'Matter' : 'Convert'] : null,
          ].filter(Boolean).map(([sectionId, label]) => (
            <button key={sectionId} type="button" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#4d647b] transition hover:bg-[#eef5fb] hover:text-[#183b56]" onClick={() => scrollLeadWorkspaceTo(sectionId)}>
              {label}<ArrowUpRight size={14} />
            </button>
          ))}
        </nav>

        <section id="attorney-lead-status" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-slate-900">Lead status</h4>
            <StagePill stage={lead.stage} />
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="Pipeline stage">
              <select className={inputClass} value={stage} onChange={(event) => setStage(event.target.value)} disabled={!canEdit || Boolean(lead.convertedTransactionId)}>
                {STAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            {stage === 'lost' ? (
              <Field label="Lost reason" required>
                <textarea className={`${inputClass} min-h-24 py-3`} value={lostReason} onChange={(event) => setLostReason(event.target.value)} placeholder="Why was this opportunity lost?" disabled={!canEdit} />
              </Field>
            ) : null}
          </div>
        </section>

        {canAssign && !lead.convertedTransactionId ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="font-semibold text-slate-900">Lead assignment</h4>
            <div className="mt-4 grid gap-3">
              <Field label="Assigned team member">
                <select className={inputClass} value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
                  <option value="">Unassigned queue</option>
                  {assignees.map((assignee) => <option key={assignee.userId} value={assignee.userId}>{assignee.name}{assignee.role ? ` · ${assignee.role.replaceAll('_', ' ')}` : ''}</option>)}
                </select>
              </Field>
              {lead.assignedUserId && assignedUserId !== lead.assignedUserId ? (
                <Field label="Reassignment reason" required>
                  <input className={inputClass} value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} placeholder="Why is ownership changing?" />
                </Field>
              ) : null}
              <div><button type="button" className="ui-button ui-button-secondary" disabled={assignmentSaving || assignedUserId === lead.assignedUserId} onClick={() => onAssignmentSave(assignedUserId, assignmentReason)}>{assignmentSaving ? <LoaderCircle className="animate-spin" size={16} /> : <UserRound size={16} />} Save assignment</button></div>
            </div>
          </section>
        ) : null}

        {canEdit ? (
          <section id="attorney-lead-follow-up" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="font-semibold text-slate-900">Next follow-up</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Date and time">
                <input className={inputClass} type="datetime-local" value={followUpAt} min={formatDateTimeLocal(new Date())} onChange={(event) => setFollowUpAt(event.target.value)} />
              </Field>
              <Field label="Follow-up note">
                <input className={inputClass} value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} placeholder="Optional context" />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="ui-button ui-button-secondary" disabled={followUpSaving || !followUpAt} onClick={() => onFollowUpSave(followUpAt, followUpNote)}>{followUpSaving ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarClock size={16} />} Schedule follow-up</button>
              {lead.nextFollowUpAt ? <button type="button" className="ui-button ui-button-ghost" disabled={followUpSaving} onClick={() => onFollowUpSave(null, followUpNote)}>Clear follow-up</button> : null}
            </div>
          </section>
        ) : null}

        <div id="attorney-lead-quotes" className="scroll-mt-4">
          <LeadQuotesSection leadId={lead.id} quotes={quotes} quoteLinks={quoteLinks} loading={quotesLoading} canEdit={canEdit} locked={Boolean(lead.convertedTransactionId) || lead.status !== 'open'} saving={quoteSaving} onCreate={onQuoteCreate} onTransition={onQuoteTransition} onShare={onQuoteShare} onRevokeLink={onQuoteLinkRevoke} onEmail={onQuoteEmail} />
        </div>

        <div id="attorney-lead-conversion" className="scroll-mt-4">
        {lead.convertedTransactionId ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h4 className="font-semibold text-emerald-900">Matter created</h4>
            <p className="mt-1 text-sm text-emerald-800">This Lead has been converted and its Matter lineage is locked.</p>
            <a className="ui-button ui-button-secondary mt-3" href={`/transactions/${encodeURIComponent(lead.convertedTransactionId)}`}><ExternalLink size={16} /> Open Matter</a>
          </section>
        ) : canAssign ? (
          <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <h4 className="font-semibold text-slate-900">Convert to Matter</h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">Creates a firm-originated active Matter directly. It will not enter Incoming Matters.</p>
            {!conversionReady ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Qualify this Lead before conversion.</p> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Matter type" required>
                <select className={inputClass} value={matterType} onChange={(event) => { const nextType = event.target.value; setMatterType(nextType); setClientRole(defaultClientRoleForMatter(lead, nextType)); setConversionFinanceType(nextType === 'bond' ? 'bond' : 'cash'); setConversionAssigneeId((current) => canOwnConvertedMatter(assignees.find((assignee) => assignee.userId === current), nextType) ? current : '') }} disabled={!conversionReady}>
                  <option value="transfer">Transfer</option><option value="bond">Bond Registration</option><option value="cancellation">Bond Cancellation</option>
                </select>
              </Field>
              <Field label="Client role" required>
                <select className={inputClass} value={clientRole} onChange={(event) => setClientRole(event.target.value)} disabled={!conversionReady}>
                  {matterType === 'transfer' ? <><option value="buyer">Buyer</option><option value="seller">Seller</option></> : null}
                  {matterType === 'bond' ? <><option value="borrower">Borrower</option><option value="buyer">Buyer</option><option value="owner">Owner</option></> : null}
                  {matterType === 'cancellation' ? <><option value="owner">Owner</option><option value="seller">Seller</option></> : null}
                </select>
              </Field>
              <Field label="Matter owner" required>
                <select className={inputClass} value={conversionAssigneeId} onChange={(event) => setConversionAssigneeId(event.target.value)} disabled={!conversionReady}>
                  <option value="">Choose an Attorney</option>
                  {conversionAssignees.map((assignee) => <option key={assignee.userId} value={assignee.userId}>{assignee.name}</option>)}
                </select>
              </Field>
              {matterType === 'transfer' ? (
                <Field label="Finance type">
                  <select className={inputClass} value={conversionFinanceType} onChange={(event) => setConversionFinanceType(event.target.value)} disabled={!conversionReady}>
                    <option value="cash">Cash</option><option value="bond">Bond</option><option value="combination">Combination</option><option value="hybrid">Hybrid</option>
                  </select>
                </Field>
              ) : <div />}
              <div className="sm:col-span-2"><Field label="Property address" required><input className={inputClass} value={conversionPropertyAddress} onChange={(event) => setConversionPropertyAddress(event.target.value)} disabled={!conversionReady} /></Field></div>
              <Field label="Matter value"><input className={inputClass} type="number" min="0" max="9999999999.99" step="0.01" value={conversionPropertyValue} onChange={(event) => setConversionPropertyValue(event.target.value)} disabled={!conversionReady} /></Field>
              <Field label="Conversion note"><input className={inputClass} value={conversionNote} onChange={(event) => setConversionNote(event.target.value)} placeholder="Optional internal context" disabled={!conversionReady} /></Field>
            </div>
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={conversionConfirmed} onChange={(event) => setConversionConfirmed(event.target.checked)} disabled={!conversionReady} />
              <span>I confirm that this qualified Lead should become an active firm Matter.</span>
            </label>
            <button type="button" className="ui-button ui-button-primary mt-3" disabled={!conversionReady || !conversionConfirmed || !conversionAssigneeId || !conversionPropertyAddress.trim() || conversionSaving} onClick={() => onConvert({ matterType, clientRole, assignedUserId: conversionAssigneeId, propertyAddress: conversionPropertyAddress, propertyValue: conversionPropertyValue, financeType: conversionFinanceType, conversionNote })}>
              {conversionSaving ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} {conversionSaving ? 'Creating Matter…' : 'Convert to Matter'}
            </button>
          </section>
        ) : null}
        </div>

        {canEdit ? (
          <section id="attorney-lead-record-activity" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="font-semibold text-slate-900">Record activity</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Activity type">
                <select className={inputClass} value={activityType} onChange={(event) => setActivityType(event.target.value)}>
                  <option value="note">Internal note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="whatsapp">WhatsApp</option>
                </select>
              </Field>
              <Field label="Outcome">
                <input className={inputClass} value={activityOutcome} onChange={(event) => setActivityOutcome(event.target.value)} placeholder="Optional" />
              </Field>
            </div>
            <div className="mt-3"><Field label="Activity notes" required><textarea className={`${inputClass} min-h-24 py-3`} value={activityNote} onChange={(event) => setActivityNote(event.target.value)} placeholder="What happened and what is next?" /></Field></div>
            <div className="mt-3"><button type="button" className="ui-button ui-button-secondary" disabled={activitySaving || !activityNote.trim()} onClick={async () => { const saved = await onActivitySave(activityType, activityNote, activityOutcome); if (saved) { setActivityNote(''); setActivityOutcome('') } }}>{activitySaving ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Add activity</button></div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="font-semibold text-slate-900">Contact details</h4>
          <div className="mt-3 grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
            <p className="flex items-center gap-2"><Mail size={15} /> {contact.email || 'No email provided'}</p>
            <p className="flex items-center gap-2"><Phone size={15} /> {contact.phone || 'No mobile provided'}</p>
            <p className="flex items-center gap-2"><UserRound size={15} /> {detail.partyRole && detail.partyRole !== 'unknown' ? optionLabel([['buyer', 'Buyer'], ['seller', 'Seller'], ['other', 'Other']], detail.partyRole) : 'Role not specified'}</p>
            <p className="flex items-center gap-2"><ClipboardList size={15} /> {optionLabel(SOURCE_OPTIONS, lead.sourceChannel, 'Other')}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="font-semibold text-slate-900">Enquiry</h4>
          <dl className="mt-3 grid gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Property</dt><dd className="mt-1 text-slate-700">{detail.propertyAddress || 'Not provided'}</dd></div>
            {detail.propertyValue ? <div className="rounded-xl border border-slate-200 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Property value</dt><dd className="mt-1 text-slate-700">{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(detail.propertyValue)}</dd></div> : null}
            <div className="rounded-xl border border-slate-200 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Message</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">{detail.message || lead.notes || 'No message provided.'}</dd></div>
            {lead.campaignCode ? <div className="rounded-xl border border-slate-200 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Campaign</dt><dd className="mt-1 text-slate-700">{lead.campaignCode}</dd></div> : null}
          </dl>
        </section>

        <section id="attorney-lead-activity" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="font-semibold text-slate-900">Activity history</h4>
          {activitiesLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading activity…</p>
          ) : activities.length ? (
            <div className="mt-3 grid gap-3">
              {activities.map((activity) => (
                <article key={activity.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{activity.type}</p><time className="text-xs text-slate-400">{formatDate(activity.date, true)}</time></div>
                  {activity.note ? <p className="mt-1 text-sm leading-5 text-slate-600">{activity.note}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No activity has been recorded yet.</p>
          )}
        </section>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  )
}

export default function AttorneyLeadsPage() {
  const workspaceContext = useWorkspace()
  const { organisation } = useOrganisation()
  const permissions = useAttorneyPermissions()
  const organisationId = organisation?.organisationId || organisation?.partnerOrganisationId || organisation?.id || workspaceContext.workspace?.id || ''
  const [leads, setLeads] = useState([])
  const [publicLink, setPublicLink] = useState(null)
  const [launchReadiness, setLaunchReadiness] = useState(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [leadSlaSettings, setLeadSlaSettings] = useState(null)
  const [slaOpen, setSlaOpen] = useState(false)
  const [slaSaving, setSlaSaving] = useState(false)
  const [slaError, setSlaError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [attentionFilter, setAttentionFilter] = useState('all')
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [activities, setActivities] = useState([])
  const [quotes, setQuotes] = useState([])
  const [quoteLinks, setQuoteLinks] = useState([])
  const [assignees, setAssignees] = useState([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [quoteSaving, setQuoteSaving] = useState(false)
  const [stageSaving, setStageSaving] = useState(false)
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [activitySaving, setActivitySaving] = useState(false)
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const [conversionSaving, setConversionSaving] = useState(false)
  const [detailError, setDetailError] = useState('')
  const leadRoleAccess = getAttorneyLeadRoleAccess(permissions.role)
  const canEditLeads = Boolean(leadRoleAccess?.edit)
  const canAssignLeads = Boolean(leadRoleAccess?.assign)

  const loadWorkspace = useCallback(async () => {
    if (!organisationId) return
    setLoading(true)
    setError('')
    try {
      const [nextLeads, nextLink, nextReadiness, nextSlaSettings] = await Promise.all([
        listAttorneyLeads({ organisationId }),
        getAttorneyPublicIntakeLink({ organisationId }),
        getAttorneyLeadsLaunchReadiness({ organisationId }),
        getAttorneyLeadSlaSettings({ organisationId }),
      ])
      setLeads(nextLeads)
      setPublicLink(nextLink)
      setLaunchReadiness(nextReadiness)
      setLeadSlaSettings(nextSlaSettings)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load Attorney Leads.')
    } finally {
      setLoading(false)
    }
  }, [organisationId])

  useEffect(() => {
    Promise.resolve().then(() => loadWorkspace())
  }, [loadWorkspace])

  useEffect(() => {
    if (!selectedLead?.id || !organisationId) return
    let active = true
    Promise.resolve().then(async () => {
      if (!active) return
      setActivities([])
      setQuotes([])
      setQuoteLinks([])
      setActivitiesLoading(true)
      setQuotesLoading(true)
      setDetailError('')
      try {
        const [rows, nextAssignees, nextQuotes, nextQuoteLinks] = await Promise.all([
          listAttorneyLeadActivities({ organisationId, leadId: selectedLead.id }),
          canAssignLeads ? listAttorneyLeadAssignees({ organisationId, leadId: selectedLead.id }) : Promise.resolve([]),
          listAttorneyLeadQuotes({ organisationId, leadId: selectedLead.id }),
          listAttorneyLeadQuotePublicLinks({ organisationId, leadId: selectedLead.id }),
        ])
        if (active) {
          setActivities(rows)
          setAssignees(nextAssignees)
          setQuotes(nextQuotes)
          setQuoteLinks(nextQuoteLinks)
        }
      } catch (loadError) {
        if (active) setDetailError(loadError?.message || 'Unable to load activity.')
      } finally {
        if (active) setActivitiesLoading(false)
        if (active) setQuotesLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [canAssignLeads, organisationId, selectedLead?.id])

  const refreshLeadDetail = useCallback(async (leadId) => {
    const [nextLeads, nextActivities, nextAssignees, nextQuotes, nextQuoteLinks] = await Promise.all([
      listAttorneyLeads({ organisationId }),
      listAttorneyLeadActivities({ organisationId, leadId }),
      canAssignLeads ? listAttorneyLeadAssignees({ organisationId, leadId }) : Promise.resolve([]),
      listAttorneyLeadQuotes({ organisationId, leadId }),
      listAttorneyLeadQuotePublicLinks({ organisationId, leadId }),
    ])
    setLeads(nextLeads)
    setActivities(nextActivities)
    setAssignees(nextAssignees)
    setQuotes(nextQuotes)
    setQuoteLinks(nextQuoteLinks)
    setSelectedLead(nextLeads.find((lead) => lead.id === leadId) || null)
  }, [canAssignLeads, organisationId])

  const firstContactSlaHours = leadSlaSettings?.firstContactSlaHours || 24
  const followUpGraceMinutes = leadSlaSettings?.followUpGraceMinutes ?? 15

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase()
    return leads.filter((lead) => {
      if (stageFilter !== 'all' && lead.stage !== stageFilter) return false
      if (serviceFilter !== 'all' && lead.detail.serviceType !== serviceFilter) return false
      if (sourceFilter !== 'all' && lead.sourceChannel !== sourceFilter) return false
      if (attentionFilter === 'follow_up_due' && !isFollowUpDue(lead.nextFollowUpAt, followUpGraceMinutes)) return false
      if (attentionFilter === 'first_contact_overdue' && !isFirstContactOverdue(lead, firstContactSlaHours)) return false
      if (!query) return true
      return [leadName(lead), lead.contact.email, lead.contact.phone, lead.detail.propertyAddress, lead.campaignCode]
        .some((value) => String(value || '').toLowerCase().includes(query))
    })
  }, [attentionFilter, firstContactSlaHours, followUpGraceMinutes, leads, search, serviceFilter, sourceFilter, stageFilter])

  const kpis = useMemo(() => ({
    new: leads.filter((lead) => lead.stage === 'new').length,
    open: leads.filter((lead) => lead.status === 'open').length,
    followUps: leads.filter((lead) => lead.status === 'open' && isFollowUpDue(lead.nextFollowUpAt, followUpGraceMinutes)).length,
    firstContactOverdue: leads.filter((lead) => isFirstContactOverdue(lead, firstContactSlaHours)).length,
    won: leads.filter((lead) => lead.stage === 'won').length,
  }), [firstContactSlaHours, followUpGraceMinutes, leads])

  async function handleManualCreate(values) {
    setManualSaving(true)
    setManualError('')
    try {
      await createAttorneyLead({ organisationId, values })
      setManualOpen(false)
      await loadWorkspace()
    } catch (createError) {
      setManualError(createError?.message || 'Unable to create Attorney Lead.')
    } finally {
      setManualSaving(false)
    }
  }

  async function handleStageSave(stage, lostReason) {
    if (!selectedLead) return
    setStageSaving(true)
    setDetailError('')
    try {
      await updateAttorneyLeadLifecycle({ organisationId, leadId: selectedLead.id, stage, lostReason })
      await refreshLeadDetail(selectedLead.id)
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to update Lead status.')
    } finally {
      setStageSaving(false)
    }
  }

  async function handleAssignmentSave(assignedUserId, reason) {
    if (!selectedLead) return
    setAssignmentSaving(true)
    setDetailError('')
    try {
      await assignAttorneyLead({ organisationId, leadId: selectedLead.id, assignedUserId, reason })
      await refreshLeadDetail(selectedLead.id)
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to update Lead assignment.')
    } finally {
      setAssignmentSaving(false)
    }
  }

  async function handleActivitySave(activityType, note, outcome) {
    if (!selectedLead) return
    setActivitySaving(true)
    setDetailError('')
    try {
      await addAttorneyLeadActivity({ organisationId, leadId: selectedLead.id, activityType, note, outcome })
      await refreshLeadDetail(selectedLead.id)
      return true
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to add Lead activity.')
      return false
    } finally {
      setActivitySaving(false)
    }
  }

  async function handleFollowUpSave(nextFollowUpAt, note) {
    if (!selectedLead) return
    setFollowUpSaving(true)
    setDetailError('')
    try {
      await setAttorneyLeadFollowUp({ organisationId, leadId: selectedLead.id, nextFollowUpAt, note })
      await refreshLeadDetail(selectedLead.id)
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to update Lead follow-up.')
    } finally {
      setFollowUpSaving(false)
    }
  }

  async function handleConvert(values) {
    if (!selectedLead) return
    setConversionSaving(true)
    setDetailError('')
    try {
      await convertAttorneyLeadToMatter({ organisationId, leadId: selectedLead.id, values })
      await refreshLeadDetail(selectedLead.id)
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to convert Lead to Matter.')
    } finally {
      setConversionSaving(false)
    }
  }

  async function handleQuoteCreate(values) {
    if (!selectedLead) return false
    setQuoteSaving(true)
    setDetailError('')
    try {
      await createAttorneyLeadQuote({ organisationId, leadId: selectedLead.id, values })
      await refreshLeadDetail(selectedLead.id)
      return true
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to create Attorney Lead quote.')
      return false
    } finally {
      setQuoteSaving(false)
    }
  }

  async function handleQuoteTransition(quoteId, status, reason) {
    if (!selectedLead) return
    setQuoteSaving(true)
    setDetailError('')
    try {
      await transitionAttorneyLeadQuote({ organisationId, quoteId, status, reason })
      await refreshLeadDetail(selectedLead.id)
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to update Attorney Lead quote.')
    } finally {
      setQuoteSaving(false)
    }
  }

  async function handleQuoteShare(quoteId) {
    if (!selectedLead) return null
    setQuoteSaving(true)
    setDetailError('')
    try {
      const created = await createAttorneyQuotePublicLink({ organisationId, quoteId })
      await refreshLeadDetail(selectedLead.id)
      return created
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to create the secure client quote link.')
      return null
    } finally {
      setQuoteSaving(false)
    }
  }

  async function handleQuoteLinkRevoke(linkId) {
    if (!selectedLead) return
    setQuoteSaving(true)
    setDetailError('')
    try {
      await revokeAttorneyQuotePublicLink({ organisationId, linkId })
      await refreshLeadDetail(selectedLead.id)
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to revoke the secure client quote link.')
    } finally {
      setQuoteSaving(false)
    }
  }

  async function handleQuoteEmail(quoteId) {
    if (!selectedLead) return null
    setQuoteSaving(true)
    setDetailError('')
    try {
      const result = await sendAttorneyQuoteEmail({ organisationId, quoteId })
      await refreshLeadDetail(selectedLead.id)
      return result
    } catch (saveError) {
      setDetailError(saveError?.message || 'Unable to send the secure Attorney quote email.')
      return null
    } finally {
      setQuoteSaving(false)
    }
  }

  async function handleCreateLink() {
    setLinkBusy(true)
    setLinkError('')
    try {
      setPublicLink(await ensureAttorneyPublicIntakeLink({ organisationId }))
      setLaunchReadiness(await getAttorneyLeadsLaunchReadiness({ organisationId }))
    } catch (createError) {
      setLinkError(createError?.message || 'Unable to create the public link.')
    } finally {
      setLinkBusy(false)
    }
  }

  async function handleToggleLink(status) {
    setLinkBusy(true)
    setLinkError('')
    try {
      setPublicLink(await setAttorneyPublicIntakeLinkStatus({ linkId: publicLink.id, status }))
      setLaunchReadiness(await getAttorneyLeadsLaunchReadiness({ organisationId }))
    } catch (updateError) {
      setLinkError(updateError?.message || 'Unable to update the public link.')
    } finally {
      setLinkBusy(false)
    }
  }

  async function handleCopyLink(url) {
    setLinkError('')
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1800)
    } catch {
      setLinkError('Copying was blocked by the browser. Select and copy the URL manually.')
    }
  }

  async function refreshLaunchReadiness() {
    setReadinessLoading(true)
    setLinkError('')
    try {
      setLaunchReadiness(await getAttorneyLeadsLaunchReadiness({ organisationId }))
    } catch (readinessError) {
      setLinkError(readinessError?.message || 'Unable to refresh launch readiness.')
    } finally {
      setReadinessLoading(false)
    }
  }

  async function handleSlaSave(values) {
    setSlaSaving(true)
    setSlaError('')
    try {
      setLeadSlaSettings(await updateAttorneyLeadSlaSettings({ organisationId, values }))
      setSlaOpen(false)
    } catch (saveError) {
      setSlaError(saveError?.message || 'Unable to update the Attorney Lead SLA policy.')
    } finally {
      setSlaSaving(false)
    }
  }

  return (
    <section className="w-full px-3 py-4 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="flex flex-wrap justify-end gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-button ui-button-secondary" onClick={() => { setSlaError(''); setSlaOpen(true) }}><SlidersHorizontal size={16} /> SLA policy</button>
            <button type="button" className="ui-button ui-button-secondary" onClick={() => setLinkOpen(true)}><Link2 size={16} /> Public link</button>
            <button type="button" className="ui-button ui-button-primary" onClick={() => { setManualError(''); setManualOpen(true) }}><Plus size={16} /> New Lead</button>
          </div>
        </header>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={UsersRound} label="New Leads" value={kpis.new} helper="Awaiting first contact" tone="bg-sky-50 text-sky-700" />
          <KpiCard icon={ClipboardList} label="Open Pipeline" value={kpis.open} helper="Active opportunities" tone="bg-violet-50 text-violet-700" />
          <KpiCard icon={CalendarClock} label="Follow-Ups Due" value={kpis.followUps} helper="Due now or overdue" tone="bg-amber-50 text-amber-700" />
          <KpiCard icon={Phone} label="First Contact SLA" value={kpis.firstContactOverdue} helper={`New for more than ${firstContactSlaHours} hours`} tone="bg-rose-50 text-rose-700" />
          <KpiCard icon={CircleDollarSign} label="Won" value={kpis.won} helper="Converted opportunities" tone="bg-emerald-50 text-emerald-700" />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(145px,180px))_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input className={`${inputClass} w-full pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone or property" aria-label="Search Leads" />
            </label>
            <select className={inputClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} aria-label="Filter by stage">
              <option value="all">All stages</option>{STAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className={inputClass} value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} aria-label="Filter by service">
              <option value="all">All services</option>{SERVICE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className={inputClass} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Filter by source">
              <option value="all">All sources</option>{SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className={inputClass} value={attentionFilter} onChange={(event) => setAttentionFilter(event.target.value)} aria-label="Filter by attention required">
              <option value="all">All attention states</option>
              <option value="follow_up_due">Follow-up due</option>
              <option value="first_contact_overdue">First contact overdue</option>
            </select>
            <button type="button" className="ui-button ui-button-secondary" onClick={() => { setSearch(''); setStageFilter('all'); setServiceFilter('all'); setSourceFilter('all'); setAttentionFilter('all') }}><Filter size={16} /> Reset</button>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div> : null}

        <div className="mt-5">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white"><LoaderCircle className="animate-spin text-slate-400" size={26} /><span className="ml-3 text-sm text-slate-500">Loading Attorney Leads…</span></div>
          ) : filteredLeads.length ? (
            <>
              <div className="hidden md:block">
                <DataTable>
                  <DataTableInner className="min-w-[980px]">
                    <thead><tr><th>Date</th><th>Lead</th><th>Service Required</th><th>Source</th><th>Status</th><th>Assigned To</th><th>Last Contact</th><th>Next Follow-Up</th><th aria-label="Open" /></tr></thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <tr key={lead.id} className="cursor-pointer" onClick={() => { setDetailError(''); setSelectedLead(lead) }}>
                          <td>{formatDate(lead.createdAt)}</td>
                          <td><p className="font-semibold text-slate-900">{leadName(lead)}</p><p className="mt-0.5 text-xs text-slate-500">{lead.contact.email || lead.contact.phone || 'No contact method'}</p>{isFirstContactOverdue(lead, firstContactSlaHours) ? <span className="mt-1 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">First contact overdue</span> : null}</td>
                          <td>{optionLabel(SERVICE_OPTIONS, lead.detail.serviceType, 'General Enquiry')}</td>
                          <td>{optionLabel(SOURCE_OPTIONS, lead.sourceChannel, 'Other')}</td>
                          <td><StagePill stage={lead.stage} /></td>
                          <td>{assignees.find((assignee) => assignee.userId === lead.assignedUserId)?.name || (lead.assignedUserId ? 'Assigned team member' : 'Unassigned')}</td>
                          <td>{formatDate(lead.lastContactedAt)}</td>
                          <td className={isFollowUpDue(lead.nextFollowUpAt, followUpGraceMinutes) ? 'font-semibold text-orange-700' : ''}>{formatDate(lead.nextFollowUpAt)}</td>
                          <td><ChevronRight size={17} className="text-slate-400" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTableInner>
                </DataTable>
              </div>
              <div className="grid gap-3 md:hidden">
                {filteredLeads.map((lead) => (
                  <button key={lead.id} type="button" onClick={() => { setDetailError(''); setSelectedLead(lead) }} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{leadName(lead)}</p><p className="mt-1 text-xs text-slate-500">{optionLabel(SERVICE_OPTIONS, lead.detail.serviceType)}</p></div><StagePill stage={lead.stage} /></div>
                    {isFirstContactOverdue(lead, firstContactSlaHours) ? <span className="mt-3 inline-flex rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">First contact overdue</span> : null}
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{optionLabel(SOURCE_OPTIONS, lead.sourceChannel, 'Other')}</span><span>{formatDate(lead.createdAt)}</span></div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <MessageSquareText className="mx-auto text-slate-400" size={32} />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{leads.length ? 'No Leads match these filters' : 'No Leads yet'}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{leads.length ? 'Reset or adjust the filters to see more opportunities.' : 'Public submissions and manually captured enquiries will appear here.'}</p>
              {!leads.length ? <button type="button" className="ui-button ui-button-primary mt-5" onClick={() => setManualOpen(true)}><Plus size={16} /> Capture first Lead</button> : null}
            </div>
          )}
        </div>

        <button type="button" onClick={loadWorkspace} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"><RefreshCw size={14} /> Refresh Leads</button>
      </div>

      <ManualLeadDrawer open={manualOpen} saving={manualSaving} error={manualError} onClose={() => setManualOpen(false)} onSave={handleManualCreate} />
      <PublicLinkDrawer open={linkOpen} link={publicLink} readiness={launchReadiness} readinessLoading={readinessLoading} canManage={permissions.canManageFirmSettings} busy={linkBusy} copied={linkCopied} error={linkError} onClose={() => setLinkOpen(false)} onCreate={handleCreateLink} onCopy={handleCopyLink} onToggle={handleToggleLink} onRefreshReadiness={refreshLaunchReadiness} />
      <LeadSlaSettingsDrawer open={slaOpen} settings={leadSlaSettings} canManage={permissions.canManageFirmSettings} saving={slaSaving} error={slaError} onClose={() => setSlaOpen(false)} onSave={handleSlaSave} />
      <LeadDetailDrawer
        lead={selectedLead}
        activities={activities}
        activitiesLoading={activitiesLoading}
        assignees={assignees}
        canAssign={canAssignLeads}
        canEdit={canEditLeads}
        saving={stageSaving}
        assignmentSaving={assignmentSaving}
        activitySaving={activitySaving}
        followUpSaving={followUpSaving}
        conversionSaving={conversionSaving}
        quotes={quotes}
        quoteLinks={quoteLinks}
        quotesLoading={quotesLoading}
        quoteSaving={quoteSaving}
        error={detailError}
        onClose={() => setSelectedLead(null)}
        onStageSave={handleStageSave}
        onAssignmentSave={handleAssignmentSave}
        onActivitySave={handleActivitySave}
        onFollowUpSave={handleFollowUpSave}
        onConvert={handleConvert}
        onQuoteCreate={handleQuoteCreate}
        onQuoteTransition={handleQuoteTransition}
        onQuoteShare={handleQuoteShare}
        onQuoteLinkRevoke={handleQuoteLinkRevoke}
        onQuoteEmail={handleQuoteEmail}
      />
    </section>
  )
}
