import RecruitmentInvitationDelivery from './RecruitmentInvitationDelivery'
import { recruitmentDocumentsComplete } from './recruitmentDocumentsModel'
const button = 'rounded-xl border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-[#0f2743] disabled:opacity-50'
export default function RecruitmentNextAction({ lead, organisationId, busy, dirty, onContact, onOpen, onStartReview }) {
  const disabled = busy || dirty
  const stage = lead.status, closed = ['closed_lost', 'legacy_joined', 'agent_activated'].includes(stage)
  return <section aria-label="Next best action" className="rounded-[18px] border border-[#173b55] bg-[#0f2743] p-5 shadow-[0_12px_28px_rgba(15,39,67,0.12)] sm:p-6">
    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dceaf2]">Next best action</h3>
    {closed ? <p className="mt-4 text-sm text-white">{stage === 'closed_lost' ? 'This application is closed. Reopen the lead if recruitment should continue.' : stage === 'agent_activated' ? 'Agent activated. Their agency profile is available.' : 'Historical joining record.'}</p> : <div className="mt-4 space-y-4 text-sm text-white">
      {stage === 'lead_received' && <><p>Record outreach while the applicant completes and verifies the form.</p><button type="button" className={button} disabled={disabled || !!lead.contacted_at} onClick={onContact}>{lead.contacted_at ? 'Contact recorded' : 'Contacted lead'}</button>{lead.contacted_at && <p>Contacted {new Date(lead.contacted_at).toLocaleString('en-ZA')}.</p>}</>}
      {['application_submitted', 'documents_uploaded'].includes(stage) && <>
        <p>{stage === 'documents_uploaded' ? 'Check the document pack before starting the application review.' : 'The verified application is submitted. Ask the applicant to log in and upload documents.'}</p>
        {stage === 'application_submitted' && <RecruitmentInvitationDelivery organisationId={organisationId} leadId={lead.id} kind="documents_reminder" referenceId={lead.id} disabled={disabled} actionLabel="Send reminder to log in and upload documents" />}
        <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={disabled} onClick={() => onOpen('documents')}>Upload manually</button><button type="button" className={button} disabled={disabled || !recruitmentDocumentsComplete(lead)} onClick={onStartReview}>Start application review</button></div>
        {!recruitmentDocumentsComplete(lead) && <p>Each required document needs a file or a saved exception before review.</p>}
      </>}
      {stage === 'under_review' && <><p>Review the submitted information and documents, then record the decision.</p><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => onOpen('application')}>Open Application</button><button type="button" className={button} disabled={disabled || lead.review_status !== 'ready_for_approval'} onClick={() => onOpen('approve')}>Approve</button><button type="button" className={button} disabled={disabled} onClick={() => onOpen('reject')}>Reject Application</button></div></>}
      {stage === 'application_approved' && <><p>Approval is recorded. The approval email is queued automatically; prepare and send the contract next.</p><button type="button" className={button} disabled={disabled} onClick={() => onOpen('contract')}>Mark as sent</button><RecruitmentInvitationDelivery organisationId={organisationId} leadId={lead.id} kind="approval" referenceId={lead.id} disabled={disabled} actionLabel="Retry approval email" /></>}
      {stage === 'contract_sent' && <><p>Upload the returned contract and confirm its signatures against the sent version.</p><button type="button" className={button} disabled={disabled} onClick={() => onOpen('signed')}>Upload Contract</button></>}
      {['contract_signed', 'onboarding_complete'].includes(stage) && <><p>Complete the joining checks, confirm accepted agency access and activate the agent.</p><button type="button" className={button} disabled={disabled} onClick={() => onOpen('activation')}>Mark as activated</button></>}
    </div>}
    {dirty && <p className="mt-4 text-xs text-[#dceaf2]">Save or clear your edits before changing the journey.</p>}
  </section>
}
