import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, FileCheck2, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import RecruitmentApplicantAccess from './RecruitmentApplicantAccess'
import RecruitmentApplicantDocuments from './RecruitmentApplicantDocuments'
import RecruitmentApplicantPhoto from './RecruitmentApplicantPhoto'
import { profileFields, profilePages, recruitmentProfileSummary } from './recruitmentProfileModel'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { useAuthSession } from '../../context/AuthSessionContext'
import './RecruitmentSignupModal.css'
import './RecruitmentProfileQuestionnaire.css'
import useHomeSeekersBranding from './useHomeSeekersBranding'
import './RecruitmentApplicantSetupPage.css'

const endpoint = '/api/recruitment/applicant-profile'
const logo = '/brand/homeseekers/home-seekers-horizontal-black.svg'
const stages = { lead_received: 'Application started', application_submitted: 'Application received', documents_uploaded: 'Documents received', under_review: 'Under review', application_approved: 'Application approved', contract_sent: 'Contract sent', contract_signed: 'Contract signed', onboarding_complete: 'Contract signed', agent_activated: 'Agent activated', closed_lost: 'Application closed' }
function HomeSeekersLogo({ home = false }) {
  const image = <img src={logo} width="168" height="56" alt="Home Seekers" />
  return home ? <a className="applicant-setup__brand" href="https://homeseeker.co.za" aria-label="Home Seekers home">{image}</a> : <div className="applicant-setup__brand">{image}</div>
}
function SubmittedApplication({ applicant }) {
  const answers = applicant.submittedApplication?.answers
  const summary = answers ? new Map(recruitmentProfileSummary(answers)) : null
  const groups = answers ? profilePages.map((label, page) => ({ label, fields: Object.values(profileFields).filter(field => field.page === page && summary.has(field.label)).map(field => [field.label, summary.get(field.label)]) }))
    : [{ label: 'Contact information', fields: [['First name', applicant.contact?.firstName], ['Surname', applicant.contact?.lastName], ['Email address', applicant.contact?.email], ['Phone number', applicant.contact?.phone]] }]
  return <details className="applicant-setup__submitted applicant-setup__card">
    <summary><div><p className="applicant-setup__eyebrow">Your application</p><h2>Your submitted application</h2><p>{applicant.applicationSubmittedAt ? `Submitted ${new Date(applicant.applicationSubmittedAt).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric' })}` : 'The details you shared when applying.'}</p></div><span className="applicant-setup__expand"><span>View details</span><ChevronDown size={20} aria-hidden="true" /></span></summary>
    <div className="applicant-setup__submitted-content">{groups.filter(group => group.fields.length).map(group => <section key={group.label}><h3>{group.label}</h3><dl>{group.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></section>)}</div>
  </details>
}
export default function RecruitmentApplicantSetupPage() {
  const location = useLocation()
  const { session, authLoading, logout } = useAuthSession()
  const [applicant, setApplicant] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [reload, setReload] = useState(0), [email, setEmail] = useState(''), [accessMode, setAccessMode] = useState('signin')
  useHomeSeekersBranding()
  useEffect(() => {
    if (authLoading) return undefined
    let active = true
    recruitmentSignupRequest(session?.access_token ? 'open_account' : 'resume', {}, { endpoint, accessToken: session?.access_token }).then(result => { if (active) { setApplicant(result.applicant || null); setError('') } })
      .catch(failure => { if (active) setError(failure.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload, session?.access_token, authLoading])
  function expired() { setEmail(applicant?.contact?.email || ''); setAccessMode('email'); setApplicant(null) }
  async function signOut() {
    setBusy(true); setError('')
    try { await recruitmentSignupRequest('sign_out', {}, { endpoint }); if (session) await logout(); setApplicant(null); setEmail('') }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  if (location.pathname !== '/applicant/my-profile') return <Navigate to="/applicant/my-profile" replace />
  if (loading || !applicant) return <div className="applicant-setup applicant-setup--access recruitment-signup">
    <aside className="applicant-setup__story"><HomeSeekersLogo home /><div className="applicant-setup__story-copy"><p className="applicant-setup__eyebrow">Your next chapter</p><h2>A place to<br />call <em>your own.</em></h2><p>Your Home Seekers journey starts with you. Bring your experience. We’ll bring the support.</p><div className="applicant-setup__story-steps"><span><Check size={16} aria-hidden="true" />Apply</span><span><FileCheck2 size={16} aria-hidden="true" />Upload documents</span><span><UserRound size={16} aria-hidden="true" />Get ready</span></div></div><p className="applicant-setup__story-footer">Your business. Our backing.</p></aside>
    <div className="applicant-setup__access-main"><header><HomeSeekersLogo home /><span>Agent applications</span></header><main className="applicant-setup__login"><p className="applicant-setup__eyebrow">Welcome to Home Seekers</p><h1>My Profile</h1><p>Your application, your details and your next step. All in one place.</p>
      {loading ? <div className="applicant-setup__loading" role="status"><span />Opening My Profile…</div> : <>
        {error && <div className="applicant-setup__notice applicant-setup__notice--error" role="alert"><p>{error}</p><button className="recruitment-signup__secondary" type="button" onClick={() => { setLoading(true); setReload(value => value + 1) }}>Retry</button></div>}
        <RecruitmentApplicantAccess mode={accessMode} email={email} endpoint={endpoint} onVerified={setApplicant} onBusy={setBusy} onMode={setAccessMode} parentBusy={busy} codeOnly setup />
        <div className="applicant-setup__login-note"><ShieldCheck size={18} aria-hidden="true" /><p>Use the email address from your Join Us application. Your details stay private.</p></div><p className="applicant-setup__apply-link">Haven’t applied yet? <a href="https://homeseeker.co.za/join">Join Home Seekers <ArrowRight size={14} aria-hidden="true" /></a></p>
      </>}
    </main><footer>© {new Date().getFullYear()} Home Seekers</footer></div>
  </div>
  const closed = applicant.stage === 'closed_lost', approved = applicant.documentsEditable === false && !closed
  const documentsReady = applicant.documentsComplete === true
  const uploadedCount = (applicant.documents || []).filter(file => typeof file.path === 'string' && file.path.trim()).length
  return <div className="applicant-setup applicant-setup--profile recruitment-signup"><a className="applicant-setup__skip" href="#applicant-content">Skip to My Profile</a>
    <aside className="applicant-setup__sidebar"><HomeSeekersLogo /><nav aria-label="Main navigation"><Link to="/applicant/my-profile" aria-current="page"><UserRound size={19} aria-hidden="true" />My Profile<ArrowRight size={16} aria-hidden="true" /></Link></nav><div className="applicant-setup__sidebar-note"><LockKeyhole size={19} aria-hidden="true" /><p>Everything starts here.<span>Your full agent workspace opens once you’re activated.</span></p></div></aside>
    <div className="applicant-setup__workspace"><header><span><span className="applicant-setup__header-mark" />Agent application</span><button type="button" className="applicant-setup__signout" disabled={busy} onClick={signOut}><LogOut size={16} aria-hidden="true" />Sign out</button></header><main id="applicant-content" tabIndex={0} aria-label="My Profile content">
      <section className="applicant-setup__welcome" aria-labelledby="applicant-welcome-title"><div><p className="applicant-setup__eyebrow">Home Seekers · Agent setup</p><h1 id="applicant-welcome-title">My Profile<span>Welcome, {applicant.contact?.firstName}.</span></h1><p>{closed ? 'Your application is closed. Contact the recruitment team if you have a question.' : approved ? 'Your documents are with our team. We’ll guide you through your next step.' : documentsReady ? 'Your document pack is ready for our team to review. We’ll be in touch about the next step.' : 'You’ve taken the first step. Let’s get the details ready for our team.'}</p>{applicant.applicationSubmitted && !documentsReady && !approved && !closed && <a className="applicant-setup__primary" href="#applicant-documents">Add your documents <ArrowRight size={17} aria-hidden="true" /></a>}</div>
        <div className="applicant-setup__application-status"><span className="applicant-setup__status"><span />{stages[applicant.stage] || 'Application received'}</span><div className="applicant-setup__milestones"><span>{applicant.applicationSubmitted ? <Check size={15} aria-hidden="true" /> : <UserRound size={15} aria-hidden="true" />}{applicant.applicationSubmitted ? 'Application submitted' : 'Application started'}</span><span>{documentsReady ? <Check size={15} aria-hidden="true" /> : <FileCheck2 size={15} aria-hidden="true" />}{documentsReady ? 'Documents ready' : `${uploadedCount} ${uploadedCount === 1 ? 'document' : 'documents'} uploaded`}</span><span><LockKeyhole size={15} aria-hidden="true" />Activation by our team</span></div></div>
      </section>
      {error && <p role="alert" className="applicant-setup__notice applicant-setup__notice--error">{error}</p>}
      {!applicant.applicationSubmitted ? <section className="applicant-setup__card applicant-setup__incomplete"><h2>Complete your application first</h2><p>Your contact details are saved. Submit your completed Join Us form before uploading documents.</p><a className="applicant-setup__primary" href="https://homeseeker.co.za/join">Continue your application <ArrowRight size={17} aria-hidden="true" /></a></section> : <>
        <div className="applicant-setup__grid"><div className="applicant-setup__profile-column"><RecruitmentApplicantPhoto applicant={applicant} endpoint={endpoint} disabled={busy} onSaved={setApplicant} onBusy={setBusy} onSessionExpired={expired} /><aside className="applicant-setup__privacy"><ShieldCheck size={21} aria-hidden="true" /><div><h3>You’re in good hands.</h3><p>Only you and the Home Seekers recruitment team can access your application documents.</p></div></aside></div><div id="applicant-documents" className="applicant-setup__documents applicant-setup__card"><RecruitmentApplicantDocuments presentation="setup" applicant={applicant} endpoint={endpoint} disabled={busy} homeSeekers onSaved={setApplicant} onBusy={setBusy} onSessionExpired={expired} /></div></div>
        <SubmittedApplication applicant={applicant} />
      </>}
      <footer className="applicant-setup__footer"><span>Home Seekers</span><span>Your business. Our backing.</span></footer>
    </main></div>
  </div>
}
