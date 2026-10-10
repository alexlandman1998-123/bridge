import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckSquare, FileText, GraduationCap, Mail, MapPin, Phone, Plus, RefreshCw, Search, TrendingUp, Users } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContextBase'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { getRecruitmentBrandStyle } from './recruitmentBranding'
import './RecruitmentPage.css'
import { recordRecruitmentContact, rejectRecruitmentApplication, saveRecruitmentDocumentExceptions, activateRecruitmentAgent, getRecruitmentAgentAccessLink, saveRecruitmentOnboarding, uploadRecruitmentOnboardingDocument, downloadRecruitmentOnboardingDocument, recordRecruitmentContractDelivery, recordRecruitmentContractSignature, downloadRecruitmentSignedContract, prepareRecruitmentContract, publishRecruitmentContract, downloadRecruitmentContract, approveRecruitmentApplication, getRecruitmentLead, listRecruitmentLeads, openRecruitmentDocument, saveRecruitmentLead, saveRecruitmentReview, startRecruitmentReview, uploadRecruitmentDocument } from '../../services/recruitmentService'
import { recruitmentOutcomes, isClosedRecruitmentLead, recruitmentReadiness, recruitmentStages, stageLabel } from './recruitmentModel'

import RecruitmentJoiningDialog from './RecruitmentJoiningDialog'
import RecruitmentIntakeLinks from './RecruitmentIntakeLinks'
import CopyRecruitmentIntakeLink from './CopyRecruitmentIntakeLink'
import RecruitmentJourney from './RecruitmentJourney'
import Modal from '../../components/ui/Modal'
import RecruitmentNextAction from './RecruitmentNextAction'
import RecruitmentDocumentPack from './RecruitmentDocumentPack'
import RecruitmentDocumentsPanel from './RecruitmentDocumentsPanel'
import { recruitmentEntryContext, recruitmentReturnTo } from './recruitmentEntryModel'
import RecruitmentAgentDetails from './RecruitmentAgentDetails'
import { applicationSummary } from './recruitmentApplicationModel'

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
import { recruitmentReviewDraft, reopenRecruitmentStage } from './recruitmentReviewModel'


const card = 'rounded-[24px] border border-[#dbe7f2] bg-white p-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)]'
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#405b75] disabled:opacity-50'
const primary = `${button} recruitment-ci-primary-button`
const input = 'mt-2 block min-h-11 w-full rounded-[12px] border border-[#dbe6f1] bg-white px-3 py-2 text-sm text-[#142132]'
const date = (value) => value ? new Date(value).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : '—'
const icons = [CheckSquare, TrendingUp, GraduationCap, MapPin, FileText]

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
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-[#dbe4ee] bg-[#f8fbff] p-1" role="tablist" aria-label="Recruitment categories">{[['active', 'Agent Leads', active.length], ['closed', 'Closed Leads', closed.length]].map(([key, label, count]) => <button key={key} role="tab" aria-selected={category === key} className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-sm font-semibold ${category === key ? 'recruitment-ci-selected-tab shadow' : 'text-[#51667f]'}`} onClick={() => { setCategory(key); setStage('all'); setPage(1) }}><span>{label}</span><span className="rounded-full recruitment-ci-accent-badge px-3 py-1 text-xs">{count}</span></button>)}</div>
      </header>
      <div className="flex flex-wrap justify-between gap-3 border-b border-[#edf2f7] p-4"><label className="flex items-center gap-2 rounded-xl border border-[#dbe6f1] px-3"><Search size={16} className="text-[#7890a8]" /><input aria-label="Search agent leads" type="search" className="min-h-10 bg-transparent text-sm outline-none" placeholder="Search names, contacts or areas…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><select aria-label="Recruitment stage" className={button} value={stage} onChange={(event) => { setStage(event.target.value); setPage(1) }}><option value="all">All Stages</option>{[...recruitmentStages, ...recruitmentOutcomes].filter(([key]) => category === 'closed' ? isClosedRecruitmentLead({ status: key }) : !isClosedRecruitmentLead({ status: key })).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left"><thead className="bg-[#fbfdff] text-xs uppercase tracking-wide text-[#7890a8]"><tr>{['Agent', 'Contact Details', 'Area', 'Source', 'Stage', 'Updated'].map((label) => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody>{visible.map((lead) => <tr key={lead.id}
        onClick={(event) => {
          if (event.target.closest('a, button, input, select, textarea')) return
          navigate(`/agency/recruitment/${lead.id}`)
        }}
        className="cursor-pointer border-t border-[#edf2f7] text-sm transition-colors hover:bg-[#f8fbfe] focus-within:bg-[#f8fbfe]"><td className="px-5 py-4"><Link to={`/agency/recruitment/${lead.id}`} className="inline-flex items-center gap-3 font-semibold text-[#142132]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl recruitment-ci-accent-badge"><Users size={17} /></span>{lead.name}</Link></td><td className="px-5 py-4 text-[#60758b]"><p>{lead.phone || '—'}</p><p className="mt-1">{lead.email || '—'}</p></td><td className="px-5 py-4 text-[#60758b]">{lead.area || 'Not captured'}</td><td className="px-5 py-4 text-[#60758b]">{lead.source}</td><td className="px-5 py-4"><span className="whitespace-nowrap rounded-full border recruitment-ci-accent-badge px-3 py-1 text-xs font-semibold">{stageLabel(lead.status)}</span></td><td className="px-5 py-4 text-[#60758b]">{date(lead.updated_at)}</td></tr>)}</tbody></table></div>
      {!visible.length && <div className="p-12 text-center"><Users className="mx-auto text-[#7890a8]" size={28} /><h2 className="mt-4 font-semibold text-[#142132]">{search || stage !== 'all' ? 'No leads match these filters' : category === 'active' ? 'No agent leads yet' : 'No closed leads yet'}</h2><p className="mt-2 text-sm text-[#60758b]">{category === 'active' ? 'Add an agent lead to start the recruitment journey.' : 'Joined agents and leads no longer proceeding appear here.'}</p></div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] bg-[#fcfdff] p-4 text-sm text-[#60758b]"><span>Showing {filtered.length ? (current - 1) * 10 + 1 : 0} to {Math.min(current * 10, filtered.length)} of {filtered.length} leads</span><div className="flex gap-2"><button className={button} disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button><span className="self-center">{current} / {pages}</span><button className={button} disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button></div></footer>
    </article>
  </div>
}

export function RecruitmentWorkspace({ lead, organisationId, onSave, onUpload, onDownload, busy, isNew = false, returnTo = '/agency/recruitment', onStartReview, onSaveReview, onApprove, onPrepareContract, onPublishContract, onDownloadContract, onRecordDelivery, onRecordSignature, onDownloadSigned, onRefreshContract, onSaveOnboarding, onCompleteOnboarding, onUploadOnboarding, onDownloadOnboarding, onActivate, onGetAgentLink, onContact, onReject, onSaveExceptions, actionError, actionNotice, brandStyle }) {
  const [tab, setTab] = useState(isNew ? 'details' : 'overview')
  const reviewRef = useRef(null)
  const [dialog, setDialog] = useState(''), [rejectionReason, setRejectionReason] = useState('')
  const [draft, setDraft] = useState(lead)
  const [reviewDraft, setReviewDraft] = useState(() => recruitmentReviewDraft(lead))
  const [approvalDraft, setApprovalDraft] = useState(emptyApprovalDraft)
  const approvalDirty = approvalDraft.confirmed
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
  const openRejection = () => { setApprovalDraft(emptyApprovalDraft()); setDialog('reject') }
  const approvalPanel = <RecruitmentApprovalPanel lead={lead} draft={approvalDraft} onChange={setApprovalDraft} onApprove={onApprove} onReject={openRejection} busy={busy} otherDirty={detailsDirty || reviewDirty || signingDirty || onboardingDirty || activationDirty} />
  const preservedApproval = !lead.review_started_at && lead.approved_at ? approvalPanel : null
  const reviewPanel = <RecruitmentReviewPanel panelRef={reviewRef} lead={lead} draft={reviewDraft} onChange={setReviewDraft} busy={busy} dirty={reviewDirty} detailsDirty={detailsDirty || approvalDirty || signingDirty || onboardingDirty || activationDirty} onStart={onStartReview} onSave={onSaveReview} onDownload={onDownload} onReject={openRejection}>{approvalPanel}</RecruitmentReviewPanel>
  const contractPanel = <RecruitmentContractPanel lead={lead} busy={busy} dirty={dirty} onPrepare={onPrepareContract} onPublish={onPublishContract} onDownload={onDownloadContract} />
  const signingPanel = <RecruitmentSigningPanel lead={lead} deliveryDraft={deliveryDraft} signatureDraft={signatureDraft} onDeliveryChange={setDeliveryDraft} onSignatureChange={setSignatureDraft} onRecordDelivery={onRecordDelivery} onRecordSignature={onRecordSignature} onDownloadSigned={onDownloadSigned} onRefresh={onRefreshContract} busy={busy} otherDirty={detailsDirty || reviewDirty || approvalDirty || onboardingDirty || activationDirty} />
  const onboardingPanel = <RecruitmentOnboardingPanel lead={lead} draft={onboardingDraft} onChange={setOnboardingDraft} onSave={onSaveOnboarding} onComplete={onCompleteOnboarding} onDownload={onDownloadOnboarding} onDocuments={() => { setDialog(''); setTab('documents') }} busy={busy} dirty={onboardingDirty} otherDirty={detailsDirty || reviewDirty || approvalDirty || signingDirty || activationDirty} />
  const activationPanel = <RecruitmentActivationPanel key={`${lead.id}/${lead.activation_json?.inviteId || ''}`} lead={lead} organisationId={organisationId} draft={activationDraft} onChange={setActivationDraft} onActivate={onActivate} onGetLink={onGetAgentLink} busy={busy} otherDirty={detailsDirty || reviewDirty || approvalDirty || signingDirty || onboardingDirty} />
  return <div className="space-y-5" style={brandStyle}>
    <section className={card}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#607891]" to={recruitmentReturnTo(returnTo)}><ArrowLeft size={16} /> {returnTo === '/settings/users' ? 'Back to Team & access' : returnTo === '/commercial/brokers' ? 'Back to Brokers' : returnTo === '/setup' ? 'Back to setup' : returnTo === '/agency/agents' ? 'Back to Agents' : recruitmentReturnTo(returnTo).includes('/branches/') ? 'Back to Branch staff' : 'Back to Recruitment'}</Link>{!isNew && !['agent_activated', 'legacy_joined'].includes(lead.status) && <button className={button} disabled={busy || dirty} title={dirty ? 'Save your edits before changing the lead status.' : undefined} onClick={() => onSave({ ...lead, status: isClosedRecruitmentLead(lead) ? reopenRecruitmentStage(lead) : 'closed_lost' })}>{isClosedRecruitmentLead(lead) ? 'Reopen Lead' : 'Close Lead'}</button>}</div>
      <div className="grid overflow-hidden rounded-[24px] border border-[#dbe7f2] xl:grid-cols-[1.32fr_1fr]">
        <div className="flex min-h-[330px] min-w-0 flex-col justify-between gap-12 recruitment-ci-hero p-6 sm:p-8"><div><div className="flex flex-wrap gap-2"><span className="rounded-full border recruitment-ci-hero-label px-3 py-1 text-xs font-semibold">Agent Lead</span><span className="rounded-full recruitment-ci-hero-badge px-3 py-1 text-xs font-semibold">{stageLabel(lead.status)}</span></div><h1 className="mt-8 break-words text-3xl font-bold tracking-tight sm:text-[2.8rem]">{isNew ? 'New Agent Lead' : lead.name}</h1><p className="mt-5 flex items-center gap-2 text-sm font-semibold "><MapPin size={16} />{lead.area || 'Preferred area not captured'}</p></div><div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold ">{lead.phone && <a className="inline-flex items-center gap-2" href={`tel:${lead.phone}`}><Phone size={16} />{lead.phone}</a>}{lead.email && <a className="inline-flex min-w-0 items-center gap-2 break-all" href={`mailto:${lead.email}`}><Mail className="shrink-0" size={16} />{lead.email}</a>}{!lead.phone && !lead.email && <span>Contact details not captured</span>}</div></div>
        <div className="p-6 sm:p-8"><h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#30445a]">Agent Readiness</h2><div className="mt-5 grid items-start gap-5 sm:grid-cols-[130px_1fr] xl:grid-cols-1 2xl:grid-cols-[130px_1fr]"><div className="flex flex-col items-center"><div className="grid h-32 w-32 place-items-center rounded-full" style={{ background: `conic-gradient(var(--recruitment-accent, #176842) ${readiness.score}%, #e6edf5 0)` }}><div className="grid h-[100px] w-[100px] place-items-center rounded-full bg-white text-3xl font-bold text-[#142132]">{readiness.score}</div></div><p className="mt-3 text-sm font-semibold text-[#20364c]">{readiness.label}</p><p className="mt-1 text-xs text-[#8aa0b7]">{readiness.completed}/5 items captured</p></div><div className="divide-y divide-[#e8eef5] rounded-[16px] border border-[#e1eaf4] bg-[#fbfdff]">{readiness.items.map((item, index) => { const Icon = icons[index]; return <button key={item.key} type="button" onClick={() => setTab(item.tab)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"><span className="inline-flex items-center gap-2 text-sm font-semibold text-[#20364c]"><Icon size={16} className="shrink-0 recruitment-ci-accent-text" />{item.label}</span><span className={`text-right text-xs font-semibold ${item.complete ? 'recruitment-ci-accent-text' : 'text-[#8aa0b7]'}`}>{item.complete ? 'Captured' : 'Not captured'}</span></button> })}</div></div></div>
      </div>
      <nav className="mt-6 grid grid-cols-3 gap-2 rounded-[20px] border border-[#dbe7f2] bg-[#fbfdff] p-2" role="tablist" aria-label="Agent lead sections">{[['overview','Overview'],['details','Agent Details'],['documents','Documents']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-12 rounded-[16px] px-2 text-sm font-semibold ${tab === key ? 'recruitment-ci-selected-tab shadow ring-1 ring-[#d9e6f2]' : 'text-[#607891]'}`}>{label}</button>)}</nav>
    </section>
    {(detailsDirty || reviewDirty || signingDirty || onboardingDirty || activationDirty) && <p role="status" className="text-sm text-[#60758b]">{detailsDirty ? 'You have unsaved agent details. Save them in Agent Details.' : activationDirty ? 'You have unsaved activation findings. Complete or clear them in Overview.' : onboardingDirty ? 'You have unsaved onboarding findings. Save them in Overview.' : signingDirty ? 'You have unsaved contract findings. Complete or clear them in Overview.' : 'You have unsaved review findings. Save them in Overview.'} Uploading documents and changing the lead stage are disabled until changes are saved.</p>}
    <section className={card} role="tabpanel" aria-label={tab === 'details' ? 'Agent Details' : tab === 'documents' ? 'Documents' : 'Overview'}>
      {tab === 'overview' && <><RecruitmentJourney lead={lead} /><div className="mt-6 grid items-stretch gap-5 lg:grid-cols-2">
        <RecruitmentNextAction lead={lead} organisationId={organisationId} busy={busy} dirty={dirty} onContact={onContact} onOpen={setDialog} onStartReview={onStartReview} onContinueReview={() => reviewRef.current?.scrollIntoView({behavior:'smooth',block:'start'})} />
        <div className="min-w-0">
          <section aria-label="Contact details" className="h-full rounded-[18px] border border-[#dbe7f2] bg-[#fbfdff] p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-[#20364c]">Contact details</h3>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              {[['Name', contactName], ['Surname', contactSurname], ['Email', lead.email], ['Phone number', lead.phone]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[#7890a8]">{label}</dt><dd className="mt-1 break-words text-[#20364c]">{value || '—'}</dd></div>)}
            </dl>
          </section>
        </div>
      </div>{!dialog && <>{reviewPanel}{preservedApproval}{contractPanel}{signingPanel}{onboardingPanel}{activationPanel}</>}{lead.details_json?.notes && <div className="mt-6 border-t border-[#edf2f7] pt-5"><h3 className="font-semibold text-[#20364c]">Recruitment notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-[#60758b]">{lead.details_json.notes}</p></div>}</>}
      {tab === 'details' && <RecruitmentAgentDetails
        lead={lead} draft={draft} organisationId={organisationId} onChange={change} onDetailChange={detail} onSubmit={save}
        disabled={busy || reviewDirty || approvalDirty || signingDirty || onboardingDirty || activationDirty} busy={busy} dirty={detailsDirty} isNew={isNew}
      >{!isNew && <RecruitmentIntakeLinks title="Application invitation" organisationId={organisationId} leadId={lead.id} eligible={!busy && !dirty && lead.status === 'lead_received' && !lead.application_submitted_at} />}</RecruitmentAgentDetails>}
      {tab === 'documents' && <><RecruitmentDocumentsPanel lead={lead} organisationId={organisationId} isNew={isNew} busy={busy} dirty={dirty} onUpload={onUpload} onDownload={onDownload} /><RecruitmentOnboardingDocuments lead={lead} busy={busy} dirty={dirty} onUpload={onUploadOnboarding} onDownload={onDownloadOnboarding} /></>}
    </section>
    <Modal open={!!dialog} onClose={() => { if (!busy) setDialog('') }} title={({documents:'Required documents',application:'Application and documents',approve:'Approve application',reject:'Reject application',contract:'Share recruitment contract',signed:'Review returned contract',activation:'Activate agent'})[dialog] || 'Recruitment'}>
      <div style={brandStyle}>
      {actionError && <p role="alert" className="mb-4 text-sm text-[#9f3028]">{actionError}</p>}{actionNotice && <p role="status" className="mb-4 text-sm text-[#26724c]">{actionNotice}</p>}
      {dialog === 'documents' && <RecruitmentDocumentPack key={`${lead.id}/${lead.version}`} lead={lead} busy={busy} dirty={dirty} onUpload={onUpload} onDownload={onDownload} onSaveExceptions={onSaveExceptions} />}
      {['application','approve'].includes(dialog) && <div className="space-y-5">
        <p className="text-sm text-[#60758b]">{lead.name} · {lead.email} · {lead.phone}</p>
        <dl className="grid gap-3 sm:grid-cols-2">{applicationSummary(lead.application_json, true).map(([label,value]) => <div key={label} className="rounded-xl border border-[#e1eaf4] p-3"><dt className="text-xs text-[#7890a8]">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm text-[#20364c]">{value}</dd></div>)}</dl>
        <RecruitmentDocumentPack key={`${lead.id}/${lead.version}`} lead={lead} busy={busy} dirty={dirty} onUpload={onUpload} onDownload={onDownload} onSaveExceptions={onSaveExceptions} />
        {(lead.documents_json || []).filter(file => !['CV','Identity document','Qualifications','Registration evidence'].includes(file.type)).map(file => <button className={button} key={file.path} disabled={busy} onClick={() => onDownload(file)}>Download {file.name}</button>)}
        {reviewPanel}
        {preservedApproval}
      </div>}
      {dialog === 'reject' && <form onSubmit={async event => { event.preventDefault(); const result = await onReject(rejectionReason); if (result) { setRejectionReason(''); setDialog('') } }}><p className="text-sm text-[#60758b]">This records the reason and closes the application.</p><label className="mt-4 block text-sm font-semibold text-[#405b75]">Rejection reason<textarea className={input} value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} minLength={5} maxLength={3000} required disabled={busy} /></label><button type="submit" className={`${primary} mt-5`} disabled={busy || dirty || rejectionReason.trim().length < 5}>Reject Application</button></form>}
      {['contract','signed'].includes(dialog) && <>{contractPanel}{signingPanel}</>}
      {dialog === 'activation' && <>{onboardingPanel}<RecruitmentOnboardingDocuments lead={lead} busy={busy} dirty={dirty} onUpload={onUploadOnboarding} onDownload={onDownloadOnboarding} />{activationPanel}</>}
      </div>
    </Modal>
  </div>
}

export default function RecruitmentPage() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const brandStyle = getRecruitmentBrandStyle(organisationContext, workspace)
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
  async function perform(action, success, throwOnFailure = false) {
    const requestedScope = scope
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await action()
      if (activeScope.current !== requestedScope) return
      if (result) setLead(result)
      setNotice(typeof success === 'function' ? success(result) : success)
      return result
    } catch (error) { if (activeScope.current === requestedScope) { setError(error.message); if (throwOnFailure) throw error } }
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
  return <main className="min-w-0 space-y-5" style={brandStyle}>{error && <div role="alert" className="rounded-2xl border border-[#f2cccc] bg-[#fff5f4] p-4 text-sm text-[#9f3028]">{error}<button className={`${button} ml-3`} onClick={() => setReload((value) => value + 1)} disabled={busy}>Reload</button></div>}{notice && <p role="status" className="rounded-xl bg-[#effaf3] p-4 text-sm text-[#26724c]">{notice}</p>}{loading ? <div className={card} role="status">Loading recruitment…</div> : leadId && leadId !== 'new' ? lead && <RecruitmentWorkspace key={scope} brandStyle={brandStyle} lead={lead} actionError={error} actionNotice={notice} onContact={() => perform(() => recordRecruitmentContact(organisationId, lead), 'Contact recorded. The application remains at Lead Received until the verified form is submitted.')} onReject={(reason) => perform(() => rejectRecruitmentApplication(organisationId, lead, reason), 'Application rejected.')} onSaveExceptions={(waivers) => perform(() => saveRecruitmentDocumentExceptions(organisationId, lead, waivers), 'Document exceptions saved.')} isNew={leadId === 'new'} returnTo={recruitmentReturnTo(location.state?.returnTo)} busy={busy} organisationId={organisationId} onActivate={(draft) => perform(() => activateRecruitmentAgent(organisationId, lead, draft), (result) => result?.status === 'agent_activated' ? 'Agent activated. Recruitment is complete.' : 'Agent access prepared. Share the link and confirm activation after the agent accepts.')} onGetAgentLink={() => getRecruitmentAgentAccessLink(organisationId, lead)} onSaveOnboarding={(draft) => perform(() => saveRecruitmentOnboarding(organisationId, lead, draft), 'Onboarding progress saved.')} onCompleteOnboarding={(draft) => perform(() => saveRecruitmentOnboarding(organisationId, lead, draft, true), 'Onboarding completed.')} onUploadOnboarding={(file, type) => perform(() => uploadRecruitmentOnboardingDocument(organisationId, lead, file, type), 'Onboarding document uploaded.')} onDownloadOnboarding={(document) => perform(() => downloadRecruitmentOnboardingDocument(organisationId, lead, document), 'Onboarding document downloaded.')} onRefreshContract={() => perform(() => getRecruitmentLead(organisationId, lead.id), 'Contract status refreshed.')} onRecordDelivery={(draft) => perform(() => recordRecruitmentContractDelivery(organisationId, lead, draft), 'Prior contract delivery recorded.')} onRecordSignature={(draft) => perform(() => recordRecruitmentContractSignature(organisationId, lead, draft), 'Signed contract verified.')} onDownloadSigned={(returned) => perform(() => downloadRecruitmentSignedContract(organisationId, lead, returned), 'Signed contract downloaded.')} onPrepareContract={(file) => perform(() => prepareRecruitmentContract(organisationId, lead, file), organisationId === '2958d402-368e-43c9-b728-0098e10505f1' ? 'Contract shared in My Profile. Applicant email queued.' : 'Contract version prepared.')} onPublishContract={() => perform(() => publishRecruitmentContract(organisationId, lead), 'Contract shared in My Profile. Applicant email queued.')} onDownloadContract={(contract) => perform(() => downloadRecruitmentContract(organisationId, lead, contract), 'Contract downloaded.')} onApprove={(draft) => perform(() => approveRecruitmentApplication(organisationId, lead, draft), 'Application approved. Approval email queued automatically.')} onStartReview={() => perform(() => startRecruitmentReview(organisationId, lead), 'Application is now Under Review.')} onSaveReview={(draft) => perform(() => saveRecruitmentReview(organisationId, lead, draft), 'Review findings saved.', true)} onSave={(draft) => perform(() => saveRecruitmentLead(organisationId, draft), 'Agent lead saved.')} onUpload={(file, type) => perform(() => uploadRecruitmentDocument(organisationId, lead, file, type), 'Document uploaded.')} onDownload={(document) => perform(() => openRecruitmentDocument(organisationId, lead.id, document), 'Document downloaded.')} /> : !error && <RecruitmentList key={scope} organisationId={organisationId} leads={leads} busy={busy} joiningContext={joiningContext} onCreate={createLead} openCreate={leadId === 'new'} onCloseCreate={() => { if (leadId === 'new') navigate(joiningContext.returnTo, { replace: true }) }} onRefresh={() => setReload((value) => value + 1)} />}</main>
}
