import { useEffect, useRef, useState } from 'react'
import {
  Building2,
  Check,
  ChevronRight,
  Palette,
  RefreshCw,
  Route,
  UserRound,
} from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import {
  loadCampaignSetup,
  saveCampaignSetup,
} from '../../services/campaignSetupService'
import {
  buildCampaignSetupSources,
  changedSetupSources,
  prefillCampaignSetup,
  cleanSetupPreferences,
  setupList,
  validateCampaignSetup,
  setupCaption,
  CAMPAIGN_TONES,
  CAMPAIGN_LANGUAGES,
  CAMPAIGN_SERVICES,
  CAMPAIGN_STRENGTHS,
  CAMPAIGN_OFFERS,
} from '../../services/campaignSetupModel'
import './CampaignSetup.css'

const languageNames = {
  'en-ZA': 'English',
  'af-ZA': 'Afrikaans',
  'zu-ZA': 'isiZulu',
  'xh-ZA': 'isiXhosa',
  'st-ZA': 'Sesotho',
  'tn-ZA': 'Setswana',
  'nso-ZA': 'Sepedi',
  'ts-ZA': 'itsonga',
  'ss-ZA': 'siSwati',
  've-ZA': 'Tshivenda',
  'nr-ZA': 'isiNdebele',
}
const fieldNames = {
  agencyName: 'Agency name',
  logoUrl: 'Logo',
  primaryColor: 'Primary colour',
  secondaryColor: 'Secondary colour',
  accentColor: 'Accent colour',
  agencyEmail: 'Agency email',
  agencyPhone: 'Agency phone',
  website: 'Website',
  about: 'Agency introduction',
  services: 'Services',
  serviceAreas: 'Service areas',
  strengths: 'Specialties',
  language: 'Account language',
  buyerUrl: 'Buyer enquiry link',
  sellerUrl: 'Seller enquiry link',
  name: 'Name',
  title: 'Title',
  email: 'Email',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  photoUrl: 'Portrait',
  bio: 'Biography',
  specialties: 'Specialties',
  languages: 'Languages',
}
const display = (value) =>
  Array.isArray(value) ? value.join(', ') : value || ''

function SavedField({
  label,
  value,
  onChange,
  source,
  type = 'text',
  multiline = false,
}) {
  const [editing, setEditing] = useState(!display(value))
  return (
    <div className="cs-field">
      {editing ? (
        <label>
          <span>{label}</span>
          {multiline ? (
            <textarea
              value={display(value)}
              onChange={(event) => onChange(event.target.value)}
              rows={3}
              maxLength={2000}
            />
          ) : (
            <input
              type={type}
              value={display(value)}
              onChange={(event) => onChange(event.target.value)}
              maxLength={2048}
            />
          )}
        </label>
      ) : (
        <div className="cs-saved-field">
          <div>
            <span>{label}</span>
            <strong>{display(value)}</strong>
          </div>
          <button
            type="button"
            className="mc-text-button"
            aria-label={`Change ${label}`}
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        </div>
      )}
      {source && <small>{source}</small>}
    </div>
  )
}

function Choices({ label, options, value, onChange, max }) {
  const selected = setupList(value)
  const choices = [...new Set([...options, ...selected])]
  return (
    <fieldset className="cs-choices">
      <legend>{label}</legend>
      <div>
        {choices.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              disabled={
                max && selected.length >= max && !selected.includes(option)
              }
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option),
                )
              }
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Sample({ agency, agent }) {
  const colour = /^#[0-9a-f]{6}$/i.test(agency.primaryColor || '')
    ? agency.primaryColor
    : '#274C69'
  const rgb = [1, 3, 5].map((start) =>
    parseInt(colour.slice(start, start + 2), 16),
  )
  const foreground =
    rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 160
      ? '#17242e'
      : '#ffffff'
  return (
    <aside className="cs-sample" aria-label="Sample campaign appearance">
      <span className="cs-eyebrow">Sample appearance</span>
      <div
        className="cs-sample-art"
        style={{ backgroundColor: colour, color: foreground }}
      >
        {/^https:\/\//i.test(agency.logoUrl || '') ? (
          <img
            src={agency.logoUrl}
            alt="Agency logo"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <Building2 size={28} aria-hidden="true" />
        )}
        <span>{agency.agencyName || 'Your agency'}</span>
        <strong>
          {agency.serviceAreas?.[0] || 'Your neighbourhood'}, in focus.
        </strong>
      </div>
      <p className="cs-caption">{setupCaption(agency, agent)}</p>
      <small>
        Illustrative copy for reviewing your preferences. Nothing is sent or
        published.
      </small>
    </aside>
  )
}

function SetupForm({
  kind,
  record,
  source,
  labels,
  shared,
  agent,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(() => prefillCampaignSetup(record, source, kind))
  const [step, setStep] = useState(
    kind === 'agency' ? record?.last_step || 1 : 1,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const p = cleanSetupPreferences(draft, kind)
  const change = (key, value, section) =>
    setDraft((previous) => ({
      ...previous,
      [key]: value,
      [kind === 'agent' ? 'detailsConfirmed' : `${section}Confirmed`]: false,
    }))
  const field = (key, label, section = 'agency', options = {}) => (
    <SavedField
      key={key}
      label={label}
      value={draft[key]}
      onChange={(value) => change(key, value, section)}
      {...options}
    />
  )
  async function persist({
    complete = false,
    later = false,
    next = step,
  } = {}) {
    const updated = {
      ...draft,
      ...(kind === 'agency' && !later
        ? { [`${['agency', 'style', 'routing'][step - 1]}Confirmed`]: true }
        : {}),
    }
    const errors = validateCampaignSetup(updated, { kind, complete })
    if (
      !later &&
      kind === 'agency' &&
      step === 1 &&
      (!p.agencyName || !p.services.length || !p.serviceAreas.length)
    )
      errors.push(
        'Confirm the agency name, services and at least one service area.',
      )
    if (!later && kind === 'agency' && step === 2 && (!p.language || !p.tone))
      errors.push('Choose your campaign language and tone.')
    if (errors.length) {
      setError([...new Set(errors)].join(' '))
      return
    }
    setError('')
    setBusy(true)
    try {
      await onSave({
        kind,
        preferences: updated,
        source,
        record,
        complete,
        step: next,
        later,
      })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const adopted = (key, section = 'agency') => {
    if (
      !display(source[key]) ||
      JSON.stringify(p[key]) === JSON.stringify(source[key])
    )
      return null
    return (
      <button
        className="mc-text-button cs-adopt"
        type="button"
        onClick={() => change(key, source[key], section)}
      >
        Use latest saved {fieldNames[key]?.toLowerCase() || key}
      </button>
    )
  }
  return (
    <div className="cs-form-wrap">
      {kind === 'agency' && (
        <ol className="cs-steps" aria-label="Campaign setup steps">
          {['Your agency', 'Content style', 'Enquiries'].map((label, index) => (
            <li
              key={label}
              aria-current={step === index + 1 ? 'step' : undefined}
            >
              <span>
                {step > index + 1 ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>
      )}
      <div className="cs-layout">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            persist({
              complete: kind === 'agent' || step === 3,
              next: Math.min(3, step + 1),
            })
          }}
        >
          <fieldset className="cs-form-fields" disabled={busy}>
            {kind === 'agency' && step === 1 && (
              <>
                <h3>Here’s what we know about your agency</h3>
                <p>
                  Confirm these details once. Changes here apply to campaign
                  preferences only.
                </p>
                <small className="cs-source">{labels.agency}</small>
                {field('agencyName', 'Public agency name')}
                {adopted('agencyName')}
                {field('logoUrl', 'Logo link (optional)', 'agency', {
                  type: 'url',
                })}
                {adopted('logoUrl')}
                <details className="cs-details">
                  <summary>Brand colours</summary>
                  {field('primaryColor', 'Primary colour')}
                  {adopted('primaryColor')}
                  {field('secondaryColor', 'Secondary colour')}
                  {field('accentColor', 'Accent colour')}
                </details>
                {p.services.length ? (
                  <details className="cs-details">
                    <summary>
                      Services: {p.services.join(', ')} · Change
                    </summary>
                    <Choices
                      label="Agency services"
                      options={CAMPAIGN_SERVICES}
                      value={draft.services}
                      onChange={(v) => change('services', v, 'agency')}
                    />
                  </details>
                ) : (
                  <Choices
                    label="Agency services"
                    options={CAMPAIGN_SERVICES}
                    value={draft.services}
                    onChange={(v) => change('services', v, 'agency')}
                  />
                )}
                {field('serviceAreas', 'Service areas', 'agency', {
                  source: labels.serviceAreas,
                })}
                {adopted('serviceAreas')}
                <details className="cs-details">
                  <summary>Contact details & introduction</summary>
                  {field('agencyEmail', 'Agency email', 'agency', {
                    type: 'email',
                  })}
                  {adopted('agencyEmail')}
                  {field('agencyPhone', 'Agency phone')}
                  {field('website', 'Website (optional)', 'agency', {
                    type: 'url',
                  })}
                  {field('about', 'Agency introduction (optional)', 'agency', {
                    multiline: true,
                  })}
                  {adopted('about')}
                </details>
              </>
            )}
            {kind === 'agency' && step === 2 && (
              <>
                <h3>How should your campaigns sound?</h3>
                <p>
                  Choose your defaults. Individual campaigns can use a different
                  style.
                </p>
                <label className="cs-field">
                  <span>Campaign language</span>
                  <select aria-label="Campaign language"
                    value={draft.language || ''}
                    onChange={(event) =>
                      change('language', event.target.value, 'style')
                    }
                  >
                    <option value="">Choose a language</option>
                    {CAMPAIGN_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {languageNames[code]}
                      </option>
                    ))}
                  </select>
                  <small>{labels.language}</small>
                </label>
                <fieldset className="cs-tones">
                  <legend>Campaign tone</legend>
                  {CAMPAIGN_TONES.map((tone, i) => (
                    <label key={tone}>
                      <input
                        type="radio"
                        name="campaign-tone"
                        value={tone}
                        checked={draft.tone === tone}
                        onChange={() => change('tone', tone, 'style')}
                      />
                      <span>
                        <strong>{tone}</strong>
                        <small>
                          {
                            [
                              'Let’s find your next chapter.',
                              'Clear advice for your next property move.',
                              'A considered approach to your next move.',
                            ][i]
                          }
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <Choices
                  label="Agency strengths (up to three, optional)"
                  max={3}
                  options={CAMPAIGN_STRENGTHS}
                  value={draft.strengths}
                  onChange={(v) => change('strengths', v, 'style')}
                />
                <small>
                  Choose strengths you can support. Saved specialties are
                  suggestions for your confirmation.
                </small>
                <Choices
                  label="Offers you provide (optional)"
                  options={CAMPAIGN_OFFERS}
                  value={draft.offers}
                  onChange={(v) => change('offers', v, 'style')}
                />
                <small>
                  Select a complimentary valuation only if your agency offers
                  it.
                </small>
                {field(
                  'avoid',
                  'Anything to avoid saying? (optional)',
                  'style',
                  { multiline: true },
                )}
              </>
            )}
            {kind === 'agency' && step === 3 && (
              <>
                <h3>Where should enquiries go?</h3>
                <p>
                  Use existing contacts and links. You can change these for a
                  campaign.
                </p>
                {['buyer', 'seller'].map((prefix) => (
                  <div className="cs-route" key={prefix}>
                    <label className="cs-field">
                      <span>
                        {prefix === 'buyer'
                          ? 'Buyer enquiries'
                          : 'Seller enquiries'}
                      </span>
                      <select
                        value={draft[`${prefix}Destination`] || ''}
                        onChange={(event) =>
                          change(
                            `${prefix}Destination`,
                            event.target.value,
                            'routing',
                          )
                        }
                      >
                        <option value="">Choose a destination</option>
                        <option value="agent">Campaign agent</option>
                        <option value="agency">Agency contact details</option>
                        <option value="link">An enquiry link</option>
                      </select>
                    </label>
                    {draft[`${prefix}Destination`] === 'link' && (
                      <>
                        {field(
                          `${prefix}Url`,
                          `${prefix === 'buyer' ? 'Buyer' : 'Seller'} enquiry link`,
                          'routing',
                          {
                            type: 'url',
                            source:
                              'Existing active intake links are suggested when available.',
                          },
                        )}
                        {adopted(`${prefix}Url`, 'routing')}
                      </>
                    )}
                    {draft[`${prefix}Destination`] === 'agency' && (
                      <>
                        {field(
                          'agencyEmail',
                          'Agency contact email',
                          'routing',
                          { type: 'email' },
                        )}
                        {field(
                          'agencyPhone',
                          'Agency contact phone',
                          'routing',
                        )}
                      </>
                    )}
                    {draft[`${prefix}Destination`] === 'agent' && (
                      <small>
                        For a property campaign, use its assigned agent.
                        Otherwise use the campaign creator’s confirmed contact
                        details.
                      </small>
                    )}
                  </div>
                ))}
                <details className="cs-details">
                  <summary>Add a review link (optional)</summary>
                  {field('reviewUrl', 'Review link', 'routing', {
                    type: 'url',
                  })}
                  <small>
                    You can add this when you first create a review campaign.
                  </small>
                </details>
                <p className="cs-source">
                  Email and WhatsApp sending connections stay in their existing
                  channel settings.
                </p>
              </>
            )}
            {kind === 'agent' && (
              <>
                <h3>Confirm your public campaign details</h3>
                <p>
                  {shared
                    ? `Your agency’s ${languageNames[shared.language] || shared.language} content preferences are already set. You only need to confirm your own details.`
                    : 'Your administrator can confirm the shared agency preferences. You can prepare your personal details now.'}
                </p>
                <small className="cs-source">{labels.agent}</small>
                {field('name', 'Public name')}
                {adopted('name')}
                {field('email', 'Public email', 'agency', { type: 'email' })}
                {adopted('email')}
                {field('phone', 'Public phone')}
                {adopted('phone')}
                <details className="cs-details">
                  <summary>Portrait, WhatsApp & profile details</summary>
                  {field('title', 'Professional title (optional)')}
                  {field('photoUrl', 'Portrait link (optional)', 'agency', {
                    type: 'url',
                  })}
                  {field('whatsapp', 'Confirmed WhatsApp number (optional)')}
                  {field('bio', 'Biography (optional)', 'agency', {
                    multiline: true,
                  })}
                  {field('serviceAreas', 'Your service areas (optional)')}
                  {field('specialties', 'Your specialties (optional)')}
                  {field('languages', 'Languages you speak (optional)')}
                </details>
                <label className="cs-confirm">
                  <input
                    type="checkbox"
                    checked={draft.detailsConfirmed === true}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        detailsConfirmed: event.target.checked,
                      }))
                    }
                  />
                  These are the public details I want to use in my campaigns.
                </label>
              </>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="mc-error">
              {error}
            </p>
          )}
          <div className="cs-actions">
            {kind === 'agency' && step > 1 && (
              <button
                type="button"
                className="mc-button"
                disabled={busy}
                onClick={() => {
                  setStep((previous) => previous - 1)
                  setError('')
                }}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="mc-text-button"
              disabled={busy}
              onClick={() => persist({ later: true })}
            >
              Save and finish later
            </button>
            <button
              type="submit"
              className="mc-button mc-primary"
              disabled={busy}
            >
              {busy
                ? 'Saving…'
                : kind === 'agent'
                  ? 'Confirm my details'
                  : step === 3
                    ? 'Save agency preferences'
                    : 'Confirm and continue'}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="mc-text-button cs-close"
            disabled={busy}
            onClick={onClose}
          >
            Close setup without saving this step
          </button>
        </form>
        <Sample
          agency={kind === 'agency' ? p : shared || {}}
          agent={kind === 'agent' ? p : agent}
        />
      </div>
    </div>
  )
}

export default function CampaignSetup({
  organisationId,
  userId,
  canManage,
  hidden = false,
}) {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(null)
  const [mode, setMode] = useState(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const requests = useRef(0)
  useEffect(() => {
    let current = true
    const request = ++requests.current
    setState({ loading: true, data: null, error: '' })
    loadCampaignSetup(organisationId, { userId })
      .then((data) => {
        if (current) setState({ loading: false, data, error: '' })
      })
      .catch((error) => {
        if (current)
          setState({ loading: false, data: null, error: error.message })
      })
    return () => {
      current = false
      requests.current = request + 1
    }
  }, [organisationId, userId, reload])
  const data = state.data
  const sources = buildCampaignSetupSources({
    organisationId,
    organisationContext,
    workspace: workspace.currentWorkspace,
    profile: workspace.profile?.id && workspace.profile.id !== userId ? {} : workspace.profile,
    sources: data?.sources,
  })
  const shared = data?.agency?.confirmed_preferences ? prefillCampaignSetup({
    preferences: data.agency.confirmed_preferences,
    source_snapshot: data.agency.confirmed_source_snapshot,
  }, sources.agency) : null
  const selectedMode =
    mode ||
    (canManage && (!data?.agency || data.agency.status === 'draft')
      ? 'agency'
      : 'agent')
  const record = selectedMode === 'agency' ? data?.agency : data?.agent
  const expanded =
    open ??
    (data &&
      ((canManage && data.agency?.status !== 'complete') ||
        data.agent?.status !== 'complete'))
  const changes = canManage && !data?.warnings.length
    ? changedSetupSources(data?.agency, sources.agency).filter((key) => key !== 'language' && (key !== 'serviceAreas' || sources.labels.serviceAreas === 'Saved agency service areas'))
    : []
  const personalChanges = !data?.warnings.length
    ? changedSetupSources(data?.agent, sources.agent)
    : []
  const ready = shared && data?.agent?.status === 'complete'
  async function save(input) {
    const request = requests.current
    setSaving(true)
    let saved
    try {
      saved = await saveCampaignSetup(organisationId, { ...input, userId })
    } finally {
      if (request === requests.current) setSaving(false)
    }
    if (request !== requests.current) return
    setState((previous) => ({
      ...previous,
      data: {
        ...previous.data,
        [input.kind === 'agency' ? 'agency' : 'agent']: saved,
      },
    }))
    if (input.later) {
      setOpen(false)
      setNotice('Draft saved. You can resume setup here.')
    } else if (input.complete) {
      setNotice(
        input.kind === 'agency'
          ? 'Agency preferences saved for your team.'
          : 'Your public campaign details are confirmed.',
      )
      if (input.kind === 'agency' && data?.agent?.status !== 'complete') {
        setMode('agent')
        setOpen(true)
      } else setOpen(false)
    }
  }
  function edit(kind) {
    setMode(kind)
    setOpen(true)
    setNotice('')
  }
  return (
    <section hidden={hidden} className="cs-panel" aria-label="Campaign setup">
      <header className="cs-header">
        <div className="cs-header-copy">
          <span className="cs-header-icon" aria-hidden="true">
            <Palette size={19} strokeWidth={1.6} />
          </span>
          <div>
            <h2>Campaign setup</h2>
            <p>
              {state.loading
                ? 'Loading your preferences…'
                : state.error
                  ? 'Agency branding, content style and contact details.'
                  : ready
                    ? 'Your agency preferences and public contact details are saved.'
                    : canManage
                      ? 'Confirm your agency details and marketing preferences.'
                      : shared
                        ? 'Agency preferences are ready. Confirm your public details.'
                        : 'Set your public details. An administrator can confirm agency preferences.'}
            </p>
          </div>
        </div>
        <div className="cs-header-actions">
          <span className={`cs-setup-status${ready ? ' cs-setup-ready' : ''}`}>
            {state.loading
              ? 'Loading'
              : state.error
                ? /not enabled|storage.*not|migration/i.test(state.error)
                  ? 'Not enabled'
                  : 'Unavailable'
                : ready
                  ? 'Ready'
                  : 'Setup needed'}
          </span>
          {!state.loading && !state.error && !expanded && (
            <div className="cs-actions">
              {canManage && (
                <button
                  disabled={saving}
                  className="mc-button"
                  type="button"
                  onClick={() => edit('agency')}
                >
                  {data?.agency ? 'Review agency setup' : 'Set up agency'}
                </button>
              )}
              <button
                disabled={saving}
                className="mc-button"
                type="button"
                onClick={() => edit('agent')}
              >
                <UserRound size={16} aria-hidden="true" />
                My campaign details
              </button>
            </div>
          )}
          {state.error && (
            <button
              className="mc-text-button cs-retry"
              type="button"
              aria-label="Retry campaign setup"
              onClick={() => setReload((previous) => previous + 1)}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      </header>
      {state.error && (
        <details className="cs-connection-details">
          <summary>Connection details</summary>
          <p>{state.error}</p>
        </details>
      )}
      {notice && (
        <p role="status" className="cs-notice">
          {notice}
        </p>
      )}
      {data?.warnings.length > 0 && (
        <p className="cs-notice">
          Some saved details could not be loaded: {data.warnings.join(', ')}.
          Your saved campaign preferences are retained. Retry setup to check
          those sources again.
        </p>
      )}
      {(changes.length > 0 || personalChanges.length > 0) && (
        <p className="cs-notice">
          Saved profile details have changed:{' '}
          {[...new Set([...changes, ...personalChanges])]
            .map((key) => fieldNames[key] || key)
            .join(', ')}
          . Review the relevant setup section; campaign preferences have been
          kept.
        </p>
      )}
      {shared && !expanded && (
        <div className="cs-inherited">
          <Route size={16} aria-hidden="true" />
          <span>
            {shared.agencyName} ·{' '}
            {languageNames[shared.language] || shared.language} · {shared.tone}
          </span>
        </div>
      )}
      {data && (
        <details className="cs-details">
          <summary>Reload saved setup</summary>
          <p>Reloading replaces any unsaved changes in this setup form.</p>
          <button
            className="mc-button"
            disabled={saving}
            type="button"
            onClick={() => {
              setReload((previous) => previous + 1)
              setOpen(null)
              setNotice('')
            }}
          >
            Reload and replace unsaved edits
          </button>
        </details>
      )}
      {expanded && data && (
        <SetupForm
          key={`${selectedMode}:${record?.revision || 0}`}
          kind={selectedMode}
          record={record}
          source={sources[selectedMode]}
          labels={sources.labels}
          shared={shared}
          agent={sources.agent}
          onSave={save}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}
