import { homeSeekersPackageNote, recruitmentProfileSummary } from './recruitmentProfileModel'

export default function RecruitmentContactReceipt({ lead }) {
  const capture = lead.contact_capture_json
  if (capture?.version !== 'recruitment-contact-v1') return null
  return <section className="rounded-2xl border border-[#dbe7f2] bg-white p-5" aria-label="Website recruitment contact">
    <h2 className="text-base font-semibold text-[#142132]">Recruitment contact received</h2>
    <p className="mt-2 text-sm text-[#60758b]">{capture.firstName} {capture.lastName} agreed to recruitment contact. The contact enquiry is saved separately from the full application.</p>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-[#60758b]">Email verification</dt><dd className="font-semibold text-[#142132]">{lead.email_verification_status === 'verified' ? 'Email verified' : 'Email verification pending'}</dd></div>
      <div><dt className="text-[#60758b]">Application</dt><dd className="font-semibold text-[#142132]">{lead.application_submitted_at ? 'Application submitted' : lead.applicant_draft_json?.version === 'recruitment-profile-v1' ? lead.applicant_draft_json.complete ? 'Questionnaire saved — not submitted' : 'Questionnaire in progress — not submitted' : 'Application not yet submitted'}</dd></div>
    </dl>
    {lead.application_json?.questionnaireVersion === 'recruitment-profile-v1' && <p className="mt-3 text-xs text-[#60758b]">Processing consent and the accuracy declaration were confirmed when this application was submitted{lead.application_submitted_at ? ` on ${new Date(lead.application_submitted_at).toLocaleString('en-ZA')}` : ''}.</p>}
    {lead.applicant_draft_json?.version === 'recruitment-profile-v1' && <details className="mt-4 rounded-xl border border-[#dbe7f2] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#142132]">Saved applicant questionnaire</summary>
      <p className="mt-2 text-xs text-[#60758b]">{lead.application_submitted_at ? 'Applicant answers saved before application submission.' : 'Draft answers supplied by the applicant. The full application has not been submitted.'}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{recruitmentProfileSummary(lead.applicant_draft_json.answers).map(([label,value])=><div key={label}><dt className="text-[#60758b]">{label}</dt><dd className="break-words font-semibold text-[#142132]">{value}</dd></div>)}</dl>
      {lead.applicant_draft_json.answers?.packagePreference && <p className="mt-3 text-xs text-[#60758b]">{homeSeekersPackageNote}</p>}
    </details>}

  </section>
}
