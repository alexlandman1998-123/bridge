import { getDocumentUploadPolicy } from '../../lib/documentUploadPolicy.js'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckSquare, FileText, GraduationCap, Mail, MapPin, Phone, Plus, RefreshCw, Search, TrendingUp, Users } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContextBase'
import { recordRecruitmentContact, rejectRecruitmentApplication, saveRecruitmentDocumentExceptions, activateRecruitmentAgent, getRecruitmentAgentAccessLink, saveRecruitmentOnboarding, uploadRecruitmentOnboardingDocument, downloadRecruitmentOnboardingDocument, recordRecruitmentContractDelivery, recordRecruitmentContractSignature, downloadRecruitmentSignedContract, prepareRecruitmentContract, downloadRecruitmentContract, approveRecruitmentApplication, getRecruitmentLead, listRecruitmentLeads, openRecruitmentDocument, saveRecruitmentLead, saveRecruitmentReview, startRecruitmentReview, uploadRecruitmentDocument } from '../../services/recruitmentService'
import { activityLabel, intakeChannelLabel, recruitmentSources, recruitmentOutcomes, documentTypes, isClosedRecruitmentLead, recruitmentReadiness, recruitmentStages, stageLabel } from './recruitmentModel'

import RecruitmentJoiningDialog from './RecruitmentJoiningDialog'
import RecruitmentIntakeLinks from './RecruitmentIntakeLinks'
import CopyRecruitmentIntakeLink from './CopyRecruitmentIntakeLink'
import RecruitmentJourney from './RecruitmentJourney'
import Modal from '../../components/ui/Modal'
import RecruitmentNextAction from './RecruitmentNextAction'
import RecruitmentDocumentPack from './RecruitmentDocumentPack'
import { recruitmentEntryContext, recruitmentReturnTo } from './recruitmentEntryModel'
import RecruitmentJoiningDetails from './RecruitmentJoiningDetails'
import { applicationRequirements, applicationSummary } from './recruitmentApplicationModel'

import RecruitmentActivationPanel from './RecruitmentActivationPanel'
import { emptyActivationDraft } from './recruitmentActivationModel'
import RecruitmentOnboardingPanel, { RecruitmentOnboardingDocuments } from './RecruitmentOnboardingPanel'
import { recruitmentOnboardingDraft } from './recruitmentOnboardingModel'
import RecruitmentSigningPanel from './RecruitmentSigningPanel'
import { emptyDeliveryDraft, emptySignatureDraft } from './recruitmentSigningModel'
import RecruitmentContractPanel from './RecruitmentContractPanel'
import RecruitmentApprovalPanel from './RecruitmentApprovalPanel'
import { emptyApprovalDraft } from './recruitmentApprovalModel'
import RecruitmentReviewPanel from './RecruitmentReviewPanel'
import { documentReviewLabel, recruitmentReviewDraft, reopenRecruitmentStage } from './recruitmentReviewModel'
const documentUploadPolicy = getDocumentUploadPolicy({ surface: 'recruitment_document' })


const card = 'rounded-[24px] border border-[#dbe7f2] bg-white p-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)]'
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#405b75] disabled:opacity-50'
const primary = `${button} !border-[#0f2743] !bg-[#0f2743] !text-white`
const input = 'mt-2 block min-h-11 w-full rounded-[12px] border border-[#dbe6f1] bg-white px-3 py-2 text-sm text-[#142132]'
const date = (value) => value ? new Date(value).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : '—'
const icons = [CheckSquare, TrendingUp, GraduationCap, MapPin, FileText]

function Field({ label, value, onChange, type = 'text', multiline = false, required = false, readOnly = false }) {
  return <label className="block text-sm font-semibold text-[#405b75]">{label}{multiline ? <textarea className={input} rows={4} value={value || ''} onChange={(event) => onChange(event.target.value)} /> : <input className={input} type={type} required={required} readOnly={readOnly} maxLength={label === 'Name' ? 120 : 254} value={value || ''} onChange={(event) => onChange(event.target.value)} />}</label>
}


export function RecruitmentList({ leads, onRefresh, busy, organisationId, onCreate, joiningContext = { entryPoint: 'recruitment' }, openCreate = false, onCloseCreate }) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(openCreate)
  const closeCreate = () => { setCreating(false); onCloseCreate?.() }
  async function create(draft) {
    const result = await onCreate(draft)
    if (!result) return
    setCategory('active'); setSearch(''); setStage('all'); setPage(1)
    if (joiningContext.entryPoint === 'recruitment') closeCreate()
    return result
  }
  const [category, setCategory] = useState('active')
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('all')
  const [page, setPage] = useState(1)
  const active = leads.filter((lead) => !isClosedRecruitmentLead(lead))
  const closed = leads.filter(isClosedRecruitmentLead)
  const filtered = (category === 'active' ? active : closed).filter((lead) => (stage === 'all' || stage === lead.status) && [lead.name, lead.email, lead.phone, lead.area, lead.source].join(' ').toLowerCase().includes(search.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * 10, current * 10)
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Agent Leads', active.length], ['Lead Received', active.filter((lead) => lead.status === 'lead_received').length], ['Joined', closed.filter((lead) => ['agent_activated', 'legacy_joined'].includes(lead.status)).length], ['Closed Leads', closed.length]].map(([label, count]) => <div key={label} className={`${card} !rounded-[18px] !p-4`}><p className="text-sm text-[#60758b]">{label}</p><p className="mt-2 text-3xl font-semibold text-[#142132]">{count}</p></div>)}</div>
    {creating && <RecruitmentJoiningDialog onCreate={create} onClose={closeCreate} busy={busy} organisationId={organisationId} context={joiningContext} receipt={joiningContext.entryPoint !== 'recruitment'} />}
    <article className={`${card} !overflow-hidden !p-0`}>
      <header className="border-b border-[#edf2f7] bg-gradient-to-b from-white to-[#fbfdff] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[#142132]">Recruitment</h1><p className="mt-1 text-sm text-[#60758b]">Track and manage your agent leads.</p></div><div className="flex flex-wrap items-start gap-2"><CopyRecruitmentIntakeLink key={organisationId} organisationId={organisationId} disabled={busy} className={button} /><button className={button} onClick={onRefresh} disabled={busy}><RefreshCw size={16} /> Refresh</button><button className={primary} onClick={() => setCreating(true)} disabled={busy}><Plus size={16} /> Add Agent Lead</button></div></div>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-[#dbe4ee] bg-[#f8fbff] p-1" role="tablist" aria-label="Recruitment categories">{[['active', 'Agent Leads', active.length], ['closed', 'Closed Leads', closed.length]].map(([key, label, count]) => <button key={key} role="tab" aria-selected={category === key} className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-sm font-semibold ${category === key ? 'bg-white text-[#102236] shadow' : 'text-[#51667f]'}`} onClick={() => { setCategory(key); setStage('all'); setPage(1) }}><span>{label}</span><span className="rounded-full bg-[#edf5ff] px-3 py-1 text-xs">{count}</span></button>)}</div>
      </header>
      <div className="flex flex-wrap justify-between gap-3 border-b border-[#edf2f7] p-4"><label className="flex items-center gap-2 rounded-xl border border-[#dbe6f1] px-3"><Search size={16} className="text-[#7890a8]" /><input aria-label="Search agent leads" type="search" className="min-h-10 bg-transparent text-sm outline-none" placeholder="Search names, contacts or areas…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><select aria-label="Recruitment stage" className={button} value={stage} onChange={(event) => { setStage(event.target.value); setPage(1) }}><option value="all">All Stages</option>{[...recruitmentStages, ...recruitmentOutcomes].filter(([key]) => category === 'closed' ? isClosedRecruitmentLead({ status: key }) : !isClosedRecruitmentLead({ status: key })).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left"><thead className="bg-[#fbfdff] text-xs uppercase tracking-wide text-[#7890a8]"><tr>{['Agent', 'Contact Details', 'Area', 'Source', 'Stage', 'Updated'].map((label) => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody>{visible.map((lead) => <tr key={lead.id}
        onClick={(event) => {
          if (event.target.closest('a, button, input, select, textarea')) return
          navigate(`/agency/recruitment/${lead.id}`)
        }}
        className="cursor-pointer border-t border-[#edf2f7] text-sm transition-colors hover:bg-[#f8fbfe] focus-within:bg-[#f8fbfe]"><td className="px-5 py-4"><Link to={`/agency/recruitment/${lead.id}`} className="inline-flex items-center gap-3 font-semibold text-[#142132]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf4fa] text-[#315b7a]"><Users size={17} /></span>{lead.name}</Link></td><td className="px-5 py-4 text-[#60758b]"><p>{lead.phone || '—'}</p><p className="mt-1">{lead.email || '—'}</p></td><td className="px-5 py-4 text-[#60758b]">{lead.area || 'Not captured'}</td><td className="px-5 py-4 text-[#60758b]">{lead.source}</td><td className="px-5 py-4"><span className="whitespace-nowrap rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">{stageLabel(lead.status)}</span></td><td className="px-5 py-4 text-[#60758b]">{date(lead.updated_at)}</td></tr>)}</tbody></table></div>
      {!visible.length && <div className="p-12 text-center"><Users className="mx-auto text-[#7890a8]" size={28} /><h2 className="mt-4 font-semibold text-[#142132]">{search || stage !== 'all' ? 'No leads match these filters' : category === 'active' ? 'No agent leads yet' : 'No closed leads yet'}</h2><p className="mt-2 text-sm text-[#60758b]">{category === 'active' ? 'Add an agent lead to start the recruitment journey.' : 'Joined agents and leads no longer proceeding appear here.'}</p></div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] bg-[#fcfdff] p-4 text-sm text-[#60758b]"><span>Showing {filtered.length ? (current - 1) * 10 + 1 : 0} to {Math.min(current * 10, filtered.length)} of {filtered.length} leads</span><div className="flex gap-2"><button className={button} disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button><span className="self-center">{current} / {pages}</span><button className={button} disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button></div></footer>
    </article>
  </div>
}

export function RecruitmentWorkspace({ lead, organisationId, onSave, onUpload, onDownload, busy, isNew = false, returnTo = '/agency/recruitment', onStartReview, onSaveReview, onApprove, onPrepareContract, onDownloadContract, onRecordDelivery, onRecordSignature, onDownloadSigned, onSaveOnboarding, onCompleteOnboarding, onUploadOnboarding, onDownloadOnboarding, onActivate, onGetAgentLink, onContact, onReject, onSaveExceptions, actionError, actionNotice }) {
  const [tab, setTab] = useState(isNew ? 'details' : 'overview')
  const [dialog, setDialog] = useState(''), [rejectionReason, setRejectionReason] = useState('')
  const [draft, setDraft] = useState(lead)
  const [documentType, setDocumentType] = useState('CV')
  const [reviewDraft, setReviewDraft] = useState(() => recruitmentReviewDraft(lead))
  const [approvalDraft, setApprovalDraft] = useState(emptyApprovalDraft)
  const approvalDirty = !!approvalDraft.notes || approvalDraft.confirmed
  const [deliveryDraft, setDeliveryDraft] = useState(() => emptyDeliveryDraft(lead))
  const [signatureDraft, setSignatureDraft] = useState(() => emptySignatureDraft(lead))
  const signingDirty = JSON.stringify(deliveryDraft) !== JSON.stringify(emptyDeliveryDraft(lead)) || JSON.stringify(signatureDraft) !== JSON.stringify(emptySignatureDraft(lead))
  const [onboardingDraft, setOnboardingDraft] = useState(() => recruitmentOnboardingDraft(lead))
  const onboardingDirty = JSON.stringify(onboardingDraft) !== JSON.stringify(recruitmentOnboardingDraft(lead))
  const [activationDraft, setActivationDraft] = useState(emptyActivationDraft)
  const activationDirty = !!activationDraft.notes || activationDraft.confirmed
  const [previousLead, setPreviousLead] = useState(lead)
  if (previousLead !== lead) { setPreviousLead(lead); setActivationDraft(emptyActivationDraft()); setOnboardingDraft(recruitmentOnboardingDraft(lead)); setDeliveryDraft(emptyDeliveryDraft(lead)); setSignatureDraft(emptySignatureDraft(lead)); setApprovalDraft(emptyApprovalDraft()); setDraft(lead); setReviewDraft(recruitmentReviewDraft(lead)) }
  const readiness = recruitmentReadiness(lead)
  const contactNames = lead.application_json?.answers || lead.contact_capture_json || {}
  const nameParts = String(lead.name || '').trim().split(/\s+/)
  const structuredNameMatches = [contactNames.firstName, contactNames.lastName].filter(Boolean).join(' ').trim() === nameParts.join(' ')
  const contactName = structuredNameMatches ? contactNames.firstName : nameParts[0]
  const contactSurname = structuredNameMatches ? contactNames.lastName : nameParts.slice(1).join(' ')
  const detailsDirty = JSON.stringify(draft) !== JSON.stringify(lead)
  const reviewDirty = JSON.stringify(reviewDraft) !== JSON.stringify(recruitmentReviewDraft(lead))
  const dirty = detailsDirty || reviewDirty || approvalDirty || signingDirty || onboardingDirty || activationDirty
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }))
  const detail = (key, value) => setDraft((previous) => ({ ...previous, details_json: { ...previous.details_json, [key]: value } }))
  const save = (event) => { event.preventDefault(); onSave(draft) }
  const reviewPanel = <RecruitmentReviewPanel lead={lead} draft={reviewDraft} onChange={setReviewDraft} busy={busy} dirty={reviewDirty} detailsDirty={detailsDirty || approvalDirty || signingDirty || onboardingDirty || activationDirty} onStart={onStartReview} onSave={onSaveReview} onDownload={onDownload} />
  const approvalPanel = <RecruitmentApprovalPanel lead={lead} draft={approvalDraft} onChange={setApprovalDraft} onApprove={onApprove} busy={busy} otherDirty={detailsDirty || reviewDirty || signingDirty || onboardingDirty || activationDirty} />
  const contractPanel = <RecruitmentContractPanel lead={lead} busy={busy} dirty={dirty} onPrepare={onPrepareContract} onDownload={onDownloadContract} />
  const signingPanel = <RecruitmentSigningPanel lead={lead} deliveryDraft={deliveryDraft} signatureDraft={signatureDraft} onDeliveryChange={setDeliveryDraft} onSignatureChange={setSignatureDraft} onRecordDelivery={onRecordDelivery} onRecordSignature={onRecordSignature} onDownloadSigned={onDownloadSigned} busy={busy} otherDirty={detailsDirty || reviewDirty || approvalDirty || onboardingDirty || activationDirty} />
  const onboardingPanel = <RecruitmentOnboardingPanel lead={lead} draft={onboardingDraft} onChange={setOnboardingDraft} onSave={onSaveOnboarding} onComplete={onCompleteOnboarding} onDownload={onDownloadOnboarding} onDocuments={() => { setDialog(''); setTab('documents') }} busy={busy} dirty={onboardingDirty} otherDirty={detailsDirty || reviewDirty || approvalDirty || signingDirty || activationDirty} />
  const activationPanel = <RecruitmentActivationPanel key={`${lead.id}/${lead.activation_json?.inviteId || ''}`} lead={lead} organisationId={organisationId} draft={activationDraft} onChange={setActivationDraft} onActivate={onActivate} onGetLink={onGetAgentLink} busy={busy} otherDirty={detailsDirty || reviewDirty || approvalDirty || signingDirty || onboardingDirty} />
  return <div className="space-y-5">
    <section className={card}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#607891]" to={recruitmentReturnTo(returnTo)}><ArrowLeft size={16} /> {returnTo === '/settings/users' ? 'Back to Team & access' : returnTo === '/commercial/brokers' ? 'Back to Brokers' : returnTo === '/setup' ? 'Back to setup' : returnTo === '/agency/agents' ? 'Back to Agents' : recruitmentReturnTo(returnTo).includes('/branches/') ? 'Back to Branch staff' : 'Back to Recruitment'}</Link>{!isNew && !['agent_activated', 'legacy_joined'].includes(lead.status) && <button className={button} disabled={busy || dirty} title={dirty ? 'Save your edits before changing the lead status.' : undefined} onClick={() => onSave({ ...lead, status: isClosedRecruitmentLead(lead) ? reopenRecruitmentStage(lead) : 'closed_lost' })}>{isClosedRecruitmentLead(lead) ? 'Reopen Lead' : 'Close Lead'}</button>}</div>
      <div className="grid overflow-hidden rounded-[24px] border border-[#dbe7f2] xl:grid-cols-[1.32fr_1fr]">
        <div className="flex min-h-[330px] min-w-0 flex-col justify-between gap-12 bg-[linear-gradient(135deg,#0c2d49_0%,#071e31_100%)] p-6 text-white sm:p-8"><div><div className="flex flex-wrap gap-2"><span className="rounded-full border border-[#315b7a] px-3 py-1 text-xs font-semibold">Agent Lead</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{stageLabel(lead.status)}</span></div><h1 style={{ color: '#fff' }} className="mt-8 break-words text-3xl font-bold tracking-tight sm:text-[2.8rem]">{isNew ? 'New Agent Lead' : lead.name}</h1><p className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#dceaf2]"><MapPin size={16} />{lead.area || 'Preferred area not captured'}</p></div><div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-[#dceaf2]">{lead.phone && <a style={{ color: '#dceaf2' }} className="inline-flex items-center gap-2" href={`tel:${lead.phone}`}><Phone size={16} />{lead.phone}</a>}{lead.email && <a style={{ color: '#dceaf2' }} className="inline-flex min-w-0 items-center gap-2 break-all" href={`mailto:${lead.email}`}><Mail className="shrink-0" size={16} />{lead.email}</a>}{!lead.phone && !lead.email && <span>Contact details not captured</span>}</div></div>
        <div className="p-6 sm:p-8"><h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#30445a]">Agent Readiness</h2><div className="mt-5 grid items-start gap-5 sm:grid-cols-[130px_1fr] xl:grid-cols-1 2xl:grid-cols-[130px_1fr]"><div className="flex flex-col items-center"><div className="grid h-32 w-32 place-items-center rounded-full" style={{ background: `conic-gradient(#2c819e ${readiness.score}%, #e6edf5 0)` }}><div className="grid h-[100px] w-[100px] place-items-center rounded-full bg-white text-3xl font-bold text-[#142132]">{readiness.score}</div></div><p className="mt-3 text-sm font-semibold text-[#20364c]">{readiness.label}</p><p className="mt-1 text-xs text-[#8aa0b7]">{readiness.completed}/5 items captured</p></div><div className="divide-y divide-[#e8eef5] rounded-[16px] border border-[#e1eaf4] bg-[#fbfdff]">{readiness.items.map((item, index) => { const Icon = icons[index]; return <button key={item.key} type="button" onClick={() => setTab(item.tab)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"><span className="inline-flex items-center gap-2 text-sm font-semibold text-[#20364c]"><Icon size={16} className="shrink-0 text-[#315b7a]" />{item.label}</span><span className={`text-right text-xs font-semibold ${item.complete ? 'text-[#26724c]' : 'text-[#8aa0b7]'}`}>{item.complete ? 'Captured' : 'Not captured'}</span></button> })}</div></div></div>
      </div>
      <nav className="mt-6 grid grid-cols-3 gap-2 rounded-[20px] border border-[#dbe7f2] bg-[#fbfdff] p-2" role="tablist" aria-label="Agent lead sections">{[['overview','Overview'],['details','Agent Details'],['documents','Documents']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-12 rounded-[16px] px-2 text-sm font-semibold ${tab === key ? 'bg-white text-[#142132] shadow ring-1 ring-[#d9e6f2]' : 'text-[#607891]'}`}>{label}</button>)}</nav>
    </section>
    {dirty && <p role="status" className="text-sm text-[#60758b]">{detailsDirty ? 'You have unsaved agent details. Save them in Agent Details.' : approvalDirty ? 'You have an unsaved approval decision. Complete or clear it in Overview.' : activationDirty ? 'You have unsaved activation findings. Complete or clear them in Overview.' : onboardingDirty ? 'You have unsaved onboarding findings. Save them in Overview.' : signingDirty ? 'You have unsaved contract findings. Complete or clear them in Overview.' : 'You have unsaved review findings. Save them in Overview.'} Uploading documents and changing the lead stage are disabled until changes are saved.</p>}
    <section className={card} role="tabpanel" aria-label={tab === 'details' ? 'Agent Details' : tab === 'documents' ? 'Documents' : 'Overview'}>
      {tab === 'overview' && <><RecruitmentJourney lead={lead} /><div className="mt-6 grid items-stretch gap-5 lg:grid-cols-2">
        <RecruitmentNextAction lead={lead} organisationId={organisationId} busy={busy} dirty={dirty} onContact={onContact} onOpen={setDialog} onStartReview={onStartReview} />
        <section aria-label="Contact details" className="rounded-[18px] border border-[#dbe7f2] bg-[#fbfdff] p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-[#20364c]">Contact details</h3>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            {[['Name', contactName], ['Surname', contactSurname], ['Email', lead.email], ['Phone number', lead.phone]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[#7890a8]">{label}</dt><dd className="mt-1 break-words text-[#20364c]">{value || '—'}</dd></div>)}
          </dl>
        </section>
      </div>{!dialog && <>{reviewPanel}{approvalPanel}{contractPanel}{signingPanel}{onboardingPanel}{activationPanel}</>}{!isNew && <div className="mt-6 border-t border-[#edf2f7] pt-5"><h3 className="mt-6 font-semibold text-[#20364c]">Activity</h3><ol className="mt-3 space-y-3">{[...(lead.activity_json || [])].reverse().map((activity, index) => <li key={index} className="rounded-xl border border-[#e1eaf4] p-3 text-sm text-[#405b75]"><p className="font-semibold">{activityLabel(activity.type)}</p><p className="mt-1 text-xs text-[#7890a8]">{activity.at ? new Date(activity.at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : '—'}</p></li>)}</ol></div>}{lead.application_submitted_at && !lead.review_started_at && <div className="mt-6 border-t border-[#edf2f7] pt-5"><h3 className="font-semibold text-[#20364c]">Application requirements</h3><p className="mt-2 text-xs text-[#7890a8]">Self-declared information, awaiting staff verification.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{applicationRequirements(lead.application_json).map((item) => <div key={item.label} className="rounded-xl border border-[#e1eaf4] p-4"><h4 className="text-sm font-semibold text-[#20364c]">{item.label}</h4><p className="mt-2 text-xs text-[#60758b]">{item.note}</p></div>)}</div></div>}{lead.details_json?.notes && <div className="mt-6 border-t border-[#edf2f7] pt-5"><h3 className="font-semibold text-[#20364c]">Recruitment notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-[#60758b]">{lead.details_json.notes}</p></div>}</>}
      {tab === 'details' && <>{lead.application_submitted_at && <div className="mb-8"><h2 className="text-xl font-semibold text-[#142132]">Submitted application</h2><p className="mt-2 text-xs text-[#7890a8]">Submitted {date(lead.application_submitted_at)} · {intakeChannelLabel(lead.application_json?.channel)} · Self-declared; awaiting verification</p><dl className="mt-5 grid gap-4 md:grid-cols-2">{applicationSummary(lead.application_json, true).map(([label,value]) => <div key={label} className="rounded-xl border border-[#e1eaf4] p-3"><dt className="text-xs text-[#7890a8]">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm text-[#20364c]">{value}</dd></div>)}</dl></div>}<form onSubmit={save}><h2 className="mb-6 text-xl font-semibold text-[#142132]">Agent Details</h2><fieldset disabled={busy || reviewDirty || approvalDirty || signingDirty || onboardingDirty || activationDirty} className="grid gap-5 md:grid-cols-2"><Field label="Name" required value={draft.name} onChange={(value) => change('name', value)} /><Field label="Email" type="email" readOnly={!!lead.activation_json?.email || !!lead.joining_invite_id} value={draft.email} onChange={(value) => change('email', value)} /><Field label="Phone" type="tel" value={draft.phone} onChange={(value) => change('phone', value)} /><Field label="Preferred area" value={draft.area} onChange={(value) => change('area', value)} /><label className="text-sm font-semibold text-[#405b75]">Source<select className={input} value={draft.source} onChange={(event) => change('source', event.target.value)}>{[...new Set([...recruitmentSources, draft.source])].map((source) => <option key={source}>{source}</option>)}</select></label><label className="text-sm font-semibold text-[#405b75]">Stage<input className={input} readOnly value={stageLabel(draft.status)} /></label>{draft.source === 'Referral' && <Field label="Referred by" value={draft.details_json.referredBy} onChange={(value) => detail('referredBy', value)} />}{!isNew && <><Field multiline label="Experience & track record" value={draft.details_json.experience} onChange={(value) => detail('experience', value)} /><Field multiline label="Qualifications & registration" value={draft.details_json.qualifications} onChange={(value) => detail('qualifications', value)} /></>}<RecruitmentJoiningDetails lead={lead} draft={draft} organisationId={organisationId} onChange={(value) => change('joining_json', value)} /><div className="md:col-span-2"><Field multiline label="Recruitment notes" value={draft.details_json.notes} onChange={(value) => detail('notes', value)} /></div></fieldset><button disabled={busy || reviewDirty || approvalDirty || signingDirty || onboardingDirty || activationDirty} className={`${primary} mt-6`} type="submit">{busy ? 'Saving…' : isNew ? 'Create Agent Lead' : 'Save Agent Details'}</button></form>{!isNew && <div className="mt-6"><RecruitmentIntakeLinks title="Application invitation" organisationId={organisationId} leadId={lead.id} eligible={!busy && !dirty && lead.status === 'lead_received' && !lead.application_submitted_at} /></div>}</>}
      {tab === 'documents' && <><h2 className="text-xl font-semibold text-[#142132]">Documents</h2><p className="mt-2 text-sm text-[#60758b]">Keep the agent’s CV, identity, qualifications and registration evidence together.</p>{isNew ? <p className="mt-6 text-sm text-[#60758b]">Save the agent lead before uploading documents.</p> : <div className="mt-5 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold text-[#405b75]">Document type<select className={input} value={documentType} disabled={busy} onChange={(event) => setDocumentType(event.target.value)}>{documentTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-sm font-semibold text-[#405b75]">Upload document<input className={input} aria-label="Upload document" type="file" title={documentUploadPolicy.helpText} accept={documentUploadPolicy.accept} disabled={busy || dirty || !!lead.approved_at} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUpload(file, documentType) }} /><span className="block text-xs font-normal text-slate-500">{documentUploadPolicy.helpText}</span>
      </label>
      <span className="pb-3 text-xs text-[#7890a8]">PDF, JPG or PNG · up to 10 MB</span></div>}{lead.approved_at && <p className="mt-4 text-xs text-[#60758b]">The reviewed documents are preserved with the approval. Contracts are kept in Overview. Final joining evidence is kept in the onboarding document pack below.</p>}{!lead.documents_json.length && <p className="mt-8 rounded-2xl border border-dashed border-[#dbe7f2] p-6 text-center text-sm text-[#60758b]">No documents uploaded yet.</p>}<div className="mt-6 space-y-3">{lead.documents_json.map((document) => <div key={document.path} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dbe7f2] p-4"><div className="min-w-0"><p className="break-all font-semibold text-[#20364c]">{document.name}</p><p className="mt-1 text-xs text-[#7890a8]">{document.type} · {date(document.uploadedAt)} · {documentReviewLabel(lead, document.path)}</p></div><button className={button} disabled={busy} onClick={() => onDownload(document)}>Download</button></div>)}</div><RecruitmentOnboardingDocuments lead={lead} busy={busy} dirty={dirty} onUpload={onUploadOnboarding} onDownload={onDownloadOnboarding} /></>}
    </section>
    <Modal open={!!dialog} onClose={() => { if (!busy) setDialog('') }} title={({documents:'Required documents',application:'Application and documents',approve:'Approve application',reject:'Reject application',contract:'Prepare and record contract delivery',signed:'Upload signed contract',activation:'Activate agent'})[dialog] || 'Recruitment'}>
      {actionError && <p role="alert" className="mb-4 text-sm text-[#9f3028]">{actionError}</p>}{actionNotice && <p role="status" className="mb-4 text-sm text-[#26724c]">{actionNotice}</p>}
      {dialog === 'documents' && <RecruitmentDocumentPack key={`${lead.id}/${lead.version}`} lead={lead} busy={busy} dirty={dirty} onUpload={onUpload} onDownload={onDownload} onSaveExceptions={onSaveExceptions} />}
      {['application','approve'].includes(dialog) && <div className="space-y-5">
        <p className="text-sm text-[#60758b]">{lead.name} · {lead.email} · {lead.phone}</p>
        <dl className="grid gap-3 sm:grid-cols-2">{applicationSummary(lead.application_json, true).map(([label,value]) => <div key={label} className="rounded-xl border border-[#e1eaf4] p-3"><dt className="text-xs text-[#7890a8]">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm text-[#20364c]">{value}</dd></div>)}</dl>
        <RecruitmentDocumentPack key={`${lead.id}/${lead.version}`} lead={lead} busy={busy} dirty={dirty} onUpload={onUpload} onDownload={onDownload} onSaveExceptions={onSaveExceptions} />
        {(lead.documents_json || []).filter(file => !['CV','Identity document','Qualifications','Registration evidence'].includes(file.type)).map(file => <button className={button} key={file.path} disabled={busy} onClick={() => onDownload(file)}>Download {file.name}</button>)}
        {reviewPanel}{approvalPanel}
      </div>}
      {dialog === 'reject' && <form onSubmit={async event => { event.preventDefault(); const result = await onReject(rejectionReason); if (result) { setRejectionReason(''); setDialog('') } }}><p className="text-sm text-[#60758b]">This records the reason and closes the application.</p><label className="mt-4 block text-sm font-semibold text-[#405b75]">Rejection reason<textarea className={input} value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} minLength={5} maxLength={3000} required disabled={busy} /></label><button type="submit" className={`${primary} mt-5`} disabled={busy || dirty || rejectionReason.trim().length < 5}>Reject Application</button></form>}
      {['contract','signed'].includes(dialog) && <>{contractPanel}{signingPanel}</>}
      {dialog === 'activation' && <>{onboardingPanel}<RecruitmentOnboardingDocuments lead={lead} busy={busy} dirty={dirty} onUpload={onUploadOnboarding} onDownload={onDownloadOnboarding} />{activationPanel}</>}
    </Modal>
  </div>
}

export default function RecruitmentPage() {
  const workspace = useWorkspace()
  const organisationId = workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.raw?.organisation_id || workspace.currentMembership?.organisationId || workspace.currentMembership?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id
  const membershipRole = String(workspace.organisationMembershipRole || workspace.currentMembership?.workspaceRole || workspace.currentMembership?.workspace_role || workspace.currentMembership?.role || '').toLowerCase()
  const allowed = ['owner', 'principal', 'admin', 'super_admin'].includes(membershipRole)
  const { leadId } = useParams()
  const location = useLocation()
  const joiningContext = recruitmentEntryContext(location.state, organisationId)
  const entryError = leadId === 'new' ? joiningContext.error : ''
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])
  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const scope = `${organisationId}/${leadId || ''}/${leadId === 'new' ? joiningContext.entryPoint + '/' + (joiningContext.branchId || '') : ''}`
  const activeScope = useRef(scope)
  activeScope.current = scope
  useEffect(() => {
    let current = true
    setLead(null); setLeads([]); setError(''); setNotice(''); setBusy(false)
    if (!allowed || entryError) { setLoading(false); return }
    setLoading(true)
    const request = leadId && leadId !== 'new' ? getRecruitmentLead(organisationId, leadId) : listRecruitmentLeads(organisationId)
    request.then((result) => { if (current) { if (leadId && leadId !== 'new') setLead(result); else setLeads(result) } }).catch((error) => { if (current) setError(error.message) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [organisationId, leadId, allowed, reload, entryError])
  async function perform(action, success) {
    const requestedScope = scope
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await action()
      if (activeScope.current !== requestedScope) return
      if (result) setLead(result)
      setNotice(typeof success === 'function' ? success(result) : success)
      return result
    } catch (error) { if (activeScope.current === requestedScope) setError(error.message) }
    finally { if (activeScope.current === requestedScope) setBusy(false) }
  }
  async function createLead(draft) {
    const requestedScope = scope
    setBusy(true); setNotice('')
    try {
      const result = await saveRecruitmentLead(organisationId, draft)
      if (activeScope.current !== requestedScope) return null
      setLeads((previous) => [result, ...previous.filter((item) => item.id !== result.id)])
      setNotice('Agent lead created.')
      return result
    } finally { if (activeScope.current === requestedScope) setBusy(false) }
  }
  if (entryError) return <div className={card}><p role="alert">{entryError}</p><Link className={`${button} mt-4`} to={joiningContext.returnTo}>Return to where you started</Link></div>
  if (!allowed) return <div className={card}>Recruitment is available to organisation principals and administrators.</div>
  return <main className="min-w-0 space-y-5">{error && <div role="alert" className="rounded-2xl border border-[#f2cccc] bg-[#fff5f4] p-4 text-sm text-[#9f3028]">{error}<button className={`${button} ml-3`} onClick={() => setReload((value) => value + 1)} disabled={busy}>Reload</button></div>}{notice && <p role="status" className="rounded-xl bg-[#effaf3] p-4 text-sm text-[#26724c]">{notice}</p>}{loading ? <div className={card} role="status">Loading recruitment…</div> : leadId && leadId !== 'new' ? lead && <RecruitmentWorkspace key={scope} lead={lead} actionError={error} actionNotice={notice} onContact={() => perform(() => recordRecruitmentContact(organisationId, lead), 'Contact recorded. The application remains at Lead Received until the verified form is submitted.')} onReject={(reason) => perform(() => rejectRecruitmentApplication(organisationId, lead, reason), 'Application rejected.')} onSaveExceptions={(waivers) => perform(() => saveRecruitmentDocumentExceptions(organisationId, lead, waivers), 'Document exceptions saved.')} isNew={leadId === 'new'} returnTo={recruitmentReturnTo(location.state?.returnTo)} busy={busy} organisationId={organisationId} onActivate={(draft) => perform(() => activateRecruitmentAgent(organisationId, lead, draft), (result) => result?.status === 'agent_activated' ? 'Agent activated. Recruitment is complete.' : 'Agent access prepared. Share the link and confirm activation after the agent accepts.')} onGetAgentLink={() => getRecruitmentAgentAccessLink(organisationId, lead)} onSaveOnboarding={(draft) => perform(() => saveRecruitmentOnboarding(organisationId, lead, draft), 'Onboarding progress saved.')} onCompleteOnboarding={(draft) => perform(() => saveRecruitmentOnboarding(organisationId, lead, draft, true), 'Onboarding completed.')} onUploadOnboarding={(file, type) => perform(() => uploadRecruitmentOnboardingDocument(organisationId, lead, file, type), 'Onboarding document uploaded.')} onDownloadOnboarding={(document) => perform(() => downloadRecruitmentOnboardingDocument(organisationId, lead, document), 'Onboarding document downloaded.')} onRecordDelivery={(draft) => perform(() => recordRecruitmentContractDelivery(organisationId, lead, draft), 'Prior contract delivery recorded.')} onRecordSignature={(draft) => perform(() => recordRecruitmentContractSignature(organisationId, lead, draft), 'Signed contract verified.')} onDownloadSigned={() => perform(() => downloadRecruitmentSignedContract(organisationId, lead), 'Signed contract downloaded.')} onPrepareContract={(file) => perform(() => prepareRecruitmentContract(organisationId, lead, file), 'Contract version prepared.')} onDownloadContract={(contract) => perform(() => downloadRecruitmentContract(organisationId, lead, contract), 'Contract downloaded.')} onApprove={(draft) => perform(() => approveRecruitmentApplication(organisationId, lead, draft), 'Application approved. Approval email queued automatically.')} onStartReview={() => perform(() => startRecruitmentReview(organisationId, lead), 'Application is now Under Review.')} onSaveReview={(draft) => perform(() => saveRecruitmentReview(organisationId, lead, draft), 'Review findings saved.')} onSave={(draft) => perform(() => saveRecruitmentLead(organisationId, draft), 'Agent lead saved.')} onUpload={(file, type) => perform(() => uploadRecruitmentDocument(organisationId, lead, file, type), 'Document uploaded.')} onDownload={(document) => perform(() => openRecruitmentDocument(organisationId, lead.id, document), 'Document downloaded.')} /> : !error && <RecruitmentList key={scope} organisationId={organisationId} leads={leads} busy={busy} joiningContext={joiningContext} onCreate={createLead} openCreate={leadId === 'new'} onCloseCreate={() => { if (leadId === 'new') navigate(joiningContext.returnTo, { replace: true }) }} onRefresh={() => setReload((value) => value + 1)} />}</main>
}
