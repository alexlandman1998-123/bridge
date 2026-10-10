import { BriefcaseBusiness, GraduationCap, MapPin, NotebookPen, Save, UserRound } from 'lucide-react'
import RecruitmentJoiningDetails from './RecruitmentJoiningDetails'
import { applicationSummary } from './recruitmentApplicationModel'
import { profileFields } from './recruitmentProfileModel'
import { intakeChannelLabel, recruitmentSources, stageLabel } from './recruitmentModel'

const personalLabels = new Set([
  ...Object.entries(profileFields).filter(([key, field]) => field.page < 2 || ['streetAddress', 'city', 'province', 'postalCode'].includes(key)).map(([, field]) => field.label),
  'Full name', 'Email', 'Mobile', 'Areas',
])
const joiningLabels = new Set(['Expected start date', 'Preferred start date', 'Home Seekers package preference', 'Current commission kept'])
const agencyLabels = new Set(['How did you find out about us?'])

function DetailField({ label, value, onChange, type = 'text', multiline = false, required = false, readOnly = false }) {
  return <label className="recruitment-details__field">
    <span>{label}</span>
    {multiline
      ? <textarea rows={3} value={value || ''} onChange={(event) => onChange(event.target.value)} />
      : <input type={type} required={required} readOnly={readOnly} maxLength={label === 'Name' ? 120 : 254} value={value || ''} onChange={onChange ? (event) => onChange(event.target.value) : undefined} />}
  </label>
}

function SubmittedSummary({ rows }) {
  return <dl className="recruitment-details__submitted-summary">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not supplied'}</dd></div>)}</dl>
}

function DetailsSection({ title, description, number, icon, children }) {
  return <section className="recruitment-details__card" aria-label={title}>
    <header className="recruitment-details__card-heading">
      <span className="recruitment-details__icon">{icon}</span>
      <div><p className="recruitment-details__eyebrow">Section {number}</p><h3>{title}</h3></div>
      <p className="recruitment-details__description">{description}</p>
    </header>
    <div className="recruitment-details__card-body">{children}</div>
  </section>
}

export default function RecruitmentAgentDetails({ lead, draft, organisationId, onChange, onDetailChange, onSubmit, disabled, busy, dirty, isNew, children }) {
  const submitted = Boolean(lead.application_submitted_at)
  const rows = submitted ? applicationSummary(lead.application_json, true) : []
  const personal = rows.filter(([label]) => personalLabels.has(label))
  const professional = rows.filter(([label]) => !personalLabels.has(label) && !joiningLabels.has(label) && !agencyLabels.has(label))
  const joining = rows.filter(([label]) => joiningLabels.has(label))
  const agency = rows.filter(([label]) => agencyLabels.has(label))
  const values = new Map(rows)
  const address = ['Street address', 'City / town', 'Province', 'Postal code'].map((label) => values.get(label)).filter(Boolean).join(', ')
  const details = draft.details_json || {}
  const professionalHighlights = [
    ['Experience', values.get('Years of experience') || values.get('Experience')],
    ['FFC / licence', values.get('License status') || values.get('FFC status')],
    ['Qualifications', values.get('Qualification route')],
  ]

  return <div className="recruitment-details">
    <header className="recruitment-details__intro">
      <div><h2>Agent Details</h2><p>Personal information, professional background and the plan for joining.</p></div>
      {submitted && <div className="recruitment-details__submission"><span>Submitted application</span><p>{new Date(lead.application_submitted_at).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })} · {intakeChannelLabel(lead.application_json?.channel)}</p></div>}
    </header>
    <form onSubmit={onSubmit}>
      <fieldset disabled={disabled} className="recruitment-details__sections">
        <DetailsSection title="Personal & contact" description="Contact details and the applicant’s address." number="01" icon={<UserRound size={20} />}>
          <div className="recruitment-details__personal-layout">
            <div className="recruitment-details__field-grid">
              <DetailField label="Name" required value={draft.name} onChange={(value) => onChange('name', value)} />
              <DetailField label="Email" type="email" readOnly={Boolean(lead.activation_json?.email || lead.joining_invite_id)} value={draft.email} onChange={(value) => onChange('email', value)} />
              <DetailField label="Phone" type="tel" value={draft.phone} onChange={(value) => onChange('phone', value)} />
              <DetailField label="Preferred area" value={draft.area} onChange={(value) => onChange('area', value)} />
            </div>
            <div className="recruitment-details__address"><MapPin size={18} /><div><h4>Address</h4><p>{address || 'Not supplied in the application'}</p><span>Submitted by the applicant</span></div></div>
          </div>
          {personal.length > 0 && <details className="recruitment-details__disclosure"><summary>View submitted personal details</summary><SubmittedSummary rows={personal} /></details>}
        </DetailsSection>

        <DetailsSection title="Professional profile" description="Applicant declarations and staff findings." number="02" icon={<GraduationCap size={20} />}>
          <dl className="recruitment-details__highlights">{professionalHighlights.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not supplied'}</dd>{label === 'FFC / licence' && values.get('FFC number') && <p>FFC {values.get('FFC number')}</p>}</div>)}</dl>
          {professional.length > 0 && <details className="recruitment-details__disclosure"><summary>View submitted professional details</summary><p className="recruitment-details__hint">Self-declared by the applicant; verify during application review.</p><SubmittedSummary rows={professional} /></details>}
          {!isNew && <div className="recruitment-details__staff-findings"><p className="recruitment-details__eyebrow">Staff findings</p><div className="recruitment-details__field-grid">
            <DetailField multiline label="Experience & track record" value={details.experience} onChange={(value) => onDetailChange('experience', value)} />
            <DetailField multiline label="Qualifications & registration" value={details.qualifications} onChange={(value) => onDetailChange('qualifications', value)} />
          </div></div>}
        </DetailsSection>

        <DetailsSection title="Joining setup" description="Branch, role, commission and planned start date." number="03" icon={<BriefcaseBusiness size={20} />}>
          {joining.length > 0 && <div className="recruitment-details__preferences"><p className="recruitment-details__eyebrow">Applicant preferences</p><SubmittedSummary rows={joining} /></div>}
          <RecruitmentJoiningDetails embedded lead={lead} draft={draft} organisationId={organisationId} onChange={(value) => onChange('joining_json', value)} />
        </DetailsSection>

        <DetailsSection title="Agency notes" description="Lead source and internal recruitment notes." number="04" icon={<NotebookPen size={20} />}>
          <div className="recruitment-details__field-grid">
            <label className="recruitment-details__field"><span>Source</span><select value={draft.source} onChange={(event) => onChange('source', event.target.value)}>{[...new Set([...recruitmentSources, draft.source])].map((source) => <option key={source}>{source}</option>)}</select></label>
            <DetailField label="Stage" value={stageLabel(draft.status)} readOnly />
            {draft.source === 'Referral' && <DetailField label="Referred by" value={details.referredBy} onChange={(value) => onDetailChange('referredBy', value)} />}
          </div>
          {agency.length > 0 && <SubmittedSummary rows={agency} />}
          <div className="recruitment-details__notes"><DetailField multiline label="Recruitment notes" value={details.notes} onChange={(value) => onDetailChange('notes', value)} /></div>
        </DetailsSection>
      </fieldset>
      <footer className="recruitment-details__save-bar">
        <div><p>{dirty ? 'Unsaved changes' : isNew ? 'New agent lead' : 'Saved details'}</p><span>Save contact details, staff findings and joining choices together.</span></div>
        <button type="submit" disabled={disabled} className="recruitment-ci-primary-button recruitment-ci-focus"><Save size={16} />{busy ? 'Saving…' : isNew ? 'Create Agent Lead' : 'Save Agent Details'}</button>
      </footer>
    </form>
    {children && <details className="recruitment-details__disclosure recruitment-details__invitations"><summary>Application invitation</summary>{children}</details>}
  </div>
}
