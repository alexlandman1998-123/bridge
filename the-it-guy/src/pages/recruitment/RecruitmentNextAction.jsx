import RecruitmentInvitationDelivery from './RecruitmentInvitationDelivery'
import { homeSeekersRecruitmentOrganisationId, recruitmentDocumentsComplete } from './recruitmentDocumentsModel'
const button = 'rounded-xl border border-[#dbe4ee] bg-white px-4 py-3 text-sm font-semibold text-[#405b75] transition-colors hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--recruitment-accent-ink,#176842)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#dbe4ee] disabled:bg-[#edf2f5] disabled:text-[#51667f] disabled:opacity-100 disabled:hover:bg-[#edf2f5]'
const primary = `${button} recruitment-ci-primary-button`
export default function RecruitmentNextAction({ lead, organisationId, busy, dirty, onContact, onOpen, onStartReview, onContinueReview }) {
  const disabled = busy || dirty
  const portal = lead.organisation_id === homeSeekersRecruitmentOrganisationId
  const stage = lead.status, closed = ['closed_lost', 'legacy_joined', 'agent_activated'].includes(stage)
  return <section aria-label="Next best action" className="rounded-[18px] border recruitment-ci-next-action p-5 shadow-[0_6px_20px_rgba(23,107,75,0.04)] sm:p-6">
    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] recruitment-ci-accent-text">Next best action</h3>
    {closed ? <p className="mt-4 text-sm text-[#20364c]">{stage === 'closed_lost' ? 'This application is closed. Reopen the lead if recruitment should continue.' : stage === 'agent_activated' ? 'Agent activated. Their agency profile is available.' : 'Historical joining record.'}</p> : <div className="mt-4 space-y-4 text-sm text-[#20364c] [&>p]:text-[#20364c]">
      {stage === 'lead_received' && <><p>Record outreach while the applicant completes and verifies the form.</p><button type="button" className={primary} disabled={disabled || !!lead.contacted_at} onClick={onContact}>{lead.contacted_at ? 'Contact recorded' : 'Contacted lead'}</button>{lead.contacted_at && <p>Contacted {new Date(lead.contacted_at).toLocaleString('en-ZA')}.</p>}</>}
      {['application_submitted', 'documents_uploaded'].includes(stage) && <>
        <p>{stage === 'documents_uploaded' ? 'Check the document pack before starting the application review.' : 'The verified application is submitted. Ask the applicant to log in and upload documents.'}</p>
        {stage === 'application_submitted' && <RecruitmentInvitationDelivery organisationId={organisationId} leadId={lead.id} kind="documents_reminder" referenceId={lead.id} disabled={disabled} actionLabel="Send reminder to log in and upload documents" actionClassName={primary} compact />}
        {stage === 'documents_uploaded' && <>
          <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={disabled} onClick={() => onOpen('documents')}>Upload manually</button><button type="button" className={primary} disabled={disabled || !recruitmentDocumentsComplete(lead)} onClick={onStartReview}>Start application review</button></div>
          {!recruitmentDocumentsComplete(lead) && <p className="text-[#20364c]">Each required document needs a file or a saved exception before review.</p>}
        </>}
      </>}
      {stage === 'under_review' && <><p>Work through Documents, Application checks and Outcome in the guided review below.</p><button type="button" className={primary} disabled={busy} onClick={onContinueReview || (() => onOpen('application'))}>Continue review</button></>}
      {stage === 'application_approved' && <><p>{portal ? 'Upload the contract to share it in My Profile and notify the applicant.' : 'Prepare the contract PDF, then record delivery to the applicant.'}</p><button type="button" className={primary} disabled={disabled} onClick={() => onOpen('contract')}>Upload contract</button><RecruitmentInvitationDelivery organisationId={organisationId} leadId={lead.id} kind="approval" referenceId={lead.id} disabled={disabled} actionLabel="Retry approval email" /></>}
      {stage === 'contract_sent' && <><p>{lead.contract_returns_json?.length ? 'The applicant has returned a signed copy. Download it and verify the signatures.' : portal ? 'The contract is shared. Await the signed copy in My Profile, then verify it here.' : 'Record the returned signed contract and verify its signatures.'}</p><button type="button" className={primary} disabled={disabled} onClick={() => onOpen('signed')}>{lead.contract_returns_json?.length ? 'Review signed contract' : 'View contract'}</button></>}
      {['contract_signed', 'onboarding_complete'].includes(stage) && <><p>Complete the joining checks, confirm accepted agency access and activate the agent.</p><button type="button" className={primary} disabled={disabled} onClick={() => onOpen('activation')}>Mark as activated</button></>}
    </div>}
    {dirty && <p className="mt-4 text-xs text-[#405b75]">Save or clear your edits before changing the journey.</p>}
  </section>
}
