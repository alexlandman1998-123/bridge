import { useState } from 'react'
import { ArrowRight, Building2, CheckCircle2, Link2, ShieldAlert } from 'lucide-react'

const FIELD_CLASS = 'mt-1.5 min-h-10 w-full rounded-[11px] border border-[#dce5eb] bg-white px-3 text-sm font-medium text-[#2d4353] outline-none transition focus:border-[#5ba98c] focus:ring-2 focus:ring-[#dff3eb] disabled:cursor-not-allowed disabled:bg-[#f4f6f8]'
const ORGANISATION_TYPES = [
  { value: 'agency', label: 'Estate agency' },
  { value: 'attorney_firm', label: 'Attorney firm' },
  { value: 'bond_originator', label: 'Bond originator' },
  { value: 'developer', label: 'Developer' },
  { value: 'service_provider', label: 'Service provider' },
]
const BLOCKER_LABELS = {
  already_converted: 'This lead has already been converted.',
  lead_not_qualified: 'Move the lead to Qualified or a later active stage first.',
  duplicate_review_required: 'Complete the duplicate review before conversion.',
}

function createDraft(context = {}) {
  return {
    mode: context.matchingOrganizations?.length ? 'link' : 'create',
    existingOrganisationId: context.matchingOrganizations?.[0]?.id || '',
    name: context.defaults?.name || '',
    organizationType: context.defaults?.organizationType || 'agency',
    email: context.defaults?.email || '',
    phone: context.defaults?.phone || '',
    website: '',
    confirmed: false,
  }
}

export function LeadConversionPanel({ context, loading, error, converting, onConvert }) {
  const [draft, setDraft] = useState(() => createDraft(context))
  const [validationError, setValidationError] = useState('')

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    setValidationError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (draft.mode === 'create' && !draft.name.trim()) {
      setValidationError('Enter the organisation name.')
      return
    }
    if (draft.mode === 'link' && !draft.existingOrganisationId) {
      setValidationError('Select the organisation to link.')
      return
    }
    if (!draft.confirmed) {
      setValidationError('Confirm the commercial handoff before converting the lead.')
      return
    }
    await onConvert({
      mode: draft.mode,
      existingOrganisationId: draft.mode === 'link' ? draft.existingOrganisationId : null,
      organisation: draft.mode === 'create' ? {
        name: draft.name.trim(),
        organizationType: draft.organizationType,
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        website: draft.website.trim(),
      } : {},
    })
  }

  if (loading) {
    return <section className="rounded-[20px] border border-[#dfe7ee] bg-white p-5 text-sm font-medium text-[#6d7e8c]">Checking onboarding readiness…</section>
  }

  if (error) {
    return <section role="alert" className="rounded-[20px] border border-[#efcbc8] bg-[#fff8f7] p-5 text-sm font-semibold text-[#922e28]">{error}</section>
  }

  if (!context) return null

  if (context.convertedOrganization) {
    return (
      <section className="rounded-[20px] border border-[#bfe3d2] bg-[#f4fbf7] p-5" aria-label="Lead conversion">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d9f2e6] text-[#176149]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#4c7868]">Onboarding handoff complete</p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.025em] text-[#153c31]">{context.convertedOrganization.name}</h2>
            <p className="mt-1 text-sm font-medium text-[#547166]">Organisation status: <span className="capitalize">{context.convertedOrganization.status}</span></p>
            <p className="mt-2 break-all font-mono text-[0.68rem] text-[#6b837a]">{context.convertedOrganization.id}</p>
          </div>
        </div>
      </section>
    )
  }

  if (!context.eligible) {
    return (
      <section className="rounded-[20px] border border-[#ead9bd] bg-[#fffaf1] p-5" aria-label="Lead conversion blockers">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#9a681f]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-[#62471d]">Not ready for onboarding</h2>
            <ul className="mt-2 space-y-1.5 text-sm font-medium leading-5 text-[#80653b]">
              {context.blockers.map((blocker) => <li key={blocker}>{BLOCKER_LABELS[blocker] || blocker.replace(/_/g, ' ')}</li>)}
            </ul>
          </div>
        </div>
      </section>
    )
  }

  const hasMatches = context.matchingOrganizations.length > 0

  return (
    <section className="rounded-[20px] border border-[#d6e5df] bg-white p-5 shadow-[0_18px_42px_rgba(23,42,58,0.045)]" aria-label="Convert lead to onboarding">
      <div className="flex items-start gap-3 border-b border-[#e9eef3] pb-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e7f4ef] text-[#176149]"><Building2 className="h-4 w-4" aria-hidden="true" /></span>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#607b71]">Commercial handoff</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-[#172f29]">Convert to onboarding</h2>
          <p className="mt-1 text-sm font-medium leading-5 text-[#6c7e78]">Creates a pending workspace without making the Arch9 operator its owner.</p>
        </div>
      </div>

      <form className="mt-4" onSubmit={handleSubmit}>
        <fieldset disabled={converting}>
          <legend className="text-xs font-semibold text-[#5f7383]">Handoff method</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={`flex cursor-pointer items-center gap-2 rounded-[11px] border px-3 py-2.5 text-xs font-semibold ${draft.mode === 'create' ? 'border-[#71b49b] bg-[#f1faf6] text-[#176149]' : 'border-[#dce5eb] text-[#5d7180]'}`}>
              <input type="radio" name="conversion-mode" value="create" checked={draft.mode === 'create'} onChange={() => updateDraft('mode', 'create')} className="accent-[#176149]" />Create new
            </label>
            <label className={`flex items-center gap-2 rounded-[11px] border px-3 py-2.5 text-xs font-semibold ${draft.mode === 'link' ? 'border-[#71b49b] bg-[#f1faf6] text-[#176149]' : 'border-[#dce5eb] text-[#5d7180]'} ${hasMatches ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}>
              <input type="radio" name="conversion-mode" value="link" checked={draft.mode === 'link'} disabled={!hasMatches} onChange={() => updateDraft('mode', 'link')} className="accent-[#176149]" />Link existing
            </label>
          </div>

          {draft.mode === 'link' ? (
            <label className="mt-3 block text-xs font-semibold text-[#5f7383]">Existing organisation
              <select value={draft.existingOrganisationId} onChange={(event) => updateDraft('existingOrganisationId', event.target.value)} className={FIELD_CLASS}>
                <option value="">Select organisation</option>
                {context.matchingOrganizations.map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.name} · {organisation.status}</option>)}
              </select>
              <span className="mt-1.5 flex items-center gap-1.5 text-[0.68rem] font-medium text-[#788994]"><Link2 className="h-3 w-3" aria-hidden="true" />Matches are based on company name or contact email.</span>
            </label>
          ) : (
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-semibold text-[#5f7383]">Organisation name<input value={draft.name} maxLength={200} onChange={(event) => updateDraft('name', event.target.value)} className={FIELD_CLASS} /></label>
              <label className="text-xs font-semibold text-[#5f7383]">Organisation type<select value={draft.organizationType} onChange={(event) => updateDraft('organizationType', event.target.value)} className={FIELD_CLASS}>{ORGANISATION_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="text-xs font-semibold text-[#5f7383]">Business email<input type="email" value={draft.email} maxLength={254} onChange={(event) => updateDraft('email', event.target.value)} className={FIELD_CLASS} /></label>
              <label className="text-xs font-semibold text-[#5f7383]">Phone<input value={draft.phone} maxLength={50} onChange={(event) => updateDraft('phone', event.target.value)} className={FIELD_CLASS} /></label>
              <label className="text-xs font-semibold text-[#5f7383]">Website <span className="font-normal text-[#8996a0]">(optional)</span><input type="url" value={draft.website} maxLength={500} onChange={(event) => updateDraft('website', event.target.value)} className={FIELD_CLASS} /></label>
            </div>
          )}

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-[#dfe7e3] bg-[#f8fbf9] p-3 text-xs font-medium leading-5 text-[#536d63]">
            <input type="checkbox" checked={draft.confirmed} onChange={(event) => updateDraft('confirmed', event.target.checked)} className="mt-0.5 accent-[#176149]" />I confirm this lead is approved for onboarding. The lead will be marked Won and this action will be audited.
          </label>
        </fieldset>
        {validationError ? <p role="alert" className="mt-3 text-xs font-semibold text-[#992f29]">{validationError}</p> : null}
        <button type="submit" disabled={converting} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-[#126149] px-4 text-sm font-semibold text-white transition hover:bg-[#0d513d] disabled:cursor-not-allowed disabled:opacity-60">
          {converting ? 'Converting lead…' : 'Confirm onboarding handoff'}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
