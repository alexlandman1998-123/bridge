import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Megaphone,
  KeyRound,
  Star,
  UsersRound,
  RefreshCw,
  Save,
  Sparkles,
  Target,
} from 'lucide-react'
import { loadGeneralCampaignContext } from '../../services/generalCampaignService'
import { saveMarketingCampaign } from '../../services/marketingCampaignService'
import { SHOW_CAMPAIGN_WORKSPACE } from '../../lib/featureFlags'
import AiBusinessCampaignAssistant from './AiBusinessCampaignAssistant'
import CampaignContactReview from './CampaignContactReview'
import { createContactProvenance, confirmCampaignContacts, GENERAL_CONTACT_FIELDS, withContactOverride } from '../../services/campaignContactProvenance'
import { businessGoalForTemplate } from './campaignBusinessGoals'
import {
  GENERAL_CAMPAIGNS,
  checkedGeneralPack,
  cleanGeneralBuilder,
  generalCampaignCopy,
  generalCampaignGaps,
  generalCampaignPayload,
  generalDefaults,
  generalTemplate,
  generalChannels,
} from '../../services/generalCampaignModel'
import './JustListedCampaignBuilder.css'
import './GeneralCampaignBuilder.css'

export default function GeneralCampaignBuilder({
  template,
  businessGoalId,
  campaign,
  organisationId,
  userId,
  onSave,
  onCancel,
  onSetup,
}) {
  const family = campaign?.campaign_builder?.template || template,
    config = GENERAL_CAMPAIGNS[family],
    meta = generalTemplate(family)
  const CampaignIcon =
    {
      'key-handover': KeyRound,
      'review-request': Star,
      'referral-request': UsersRound,
    }[family] || Megaphone
  const [draftId] = useState(() => crypto.randomUUID())
  const savedCampaign = useRef(campaign || null)
  const saving = useRef(null)
  const [savedNotice, setSavedNotice] = useState('')
  const [audienceDescription, setAudienceDescription] = useState(campaign?.audience || meta?.audience || '')
  const businessGoal = businessGoalForTemplate(family, businessGoalId)
  const [context, setContext] = useState(null),
    [builder, setBuilder] = useState(null),
    [content, setContent] = useState({})
  const [step, setStep] = useState(1),
    [channel, setChannel] = useState(() => generalChannels(family)[0]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('')
  const request = useRef(0)
  useEffect(() => {
    const token = ++request.current
    async function load() {
      try {
        const current = await loadGeneralCampaignContext(
          organisationId,
          userId,
          family,
          campaign?.campaign_builder?.agentId || userId,
          ...(family === 'key-handover'
            ? [campaign?.campaign_builder?.details || {}]
            : []),
        )
        if (request.current !== token) return
        setContext(current)
        const saved = campaign
          ? cleanGeneralBuilder(campaign.campaign_builder)
          : {
              version: 1,
              template: family,
              agentId: current.agentId,
              source: current.source,
              contactProvenance: createContactProvenance(current.source, GENERAL_CONTACT_FIELDS),
              details: current.defaults,
              reviewed: false,
              permission: false,
            }
        setBuilder(saved)
        setContent(campaign?.channel_content || generalCampaignCopy(saved))
        savedCampaign.current = campaign || null
        setAudienceDescription(campaign?.audience || meta?.audience || '')
        setStep(campaign ? 2 : 1)
      } catch (err) {
        if (request.current === token) setError(err.message)
      } finally {
        if (request.current === token) setBusy(false)
      }
    }
    load()
    return () => {
      request.current += 1
    }
  }, [organisationId, userId, family, campaign, meta?.audience])
  function change(patch) {
    const next = { ...builder, ...patch, reviewed: false }
    if (next.contactProvenance) next.contactProvenance = { ...next.contactProvenance, confirmed: false }
    if (config.permission && patch.details) next.permission = false
    if (
      patch.source &&
      patch.source.language !== builder.source.language &&
      typeof builder.details.checklist === 'string' &&
      builder.details.checklist ===
        generalDefaults(family, { language: builder.source.language }, {})
          .checklist
    ) {
      next.details = {
        ...builder.details,
        checklist: generalDefaults(
          family,
          { language: patch.source.language },
          {},
        ).checklist,
      }
    }
    setBuilder(next)
    setContent(generalCampaignCopy(next))
    setSavedNotice('')
    setError('')
  }
  async function refresh() {
    const token = ++request.current
    setBusy(true)
    setError('')
    try {
      const current = await loadGeneralCampaignContext(
        organisationId,
        userId,
        family,
        builder.agentId,
        ...(family === 'key-handover' ? [builder.details] : []),
      )
      if (request.current !== token) return
      const next = {
        ...builder,
        source: current.source,
        contactProvenance: createContactProvenance(current.source, GENERAL_CONTACT_FIELDS),
        details: {
          ...builder.details,
          ...(family === 'review-request' &&
          builder.details.reviewUrl === builder.source.reviewUrl
            ? { reviewUrl: current.defaults.reviewUrl }
            : {}),
          ...(family === 'key-handover' && current.transaction?.area
            ? { area: current.transaction.area }
            : {}),
        },
        reviewed: false,
        permission: false,
      }
      setContext(current)
      setBuilder(next)
      setContent(generalCampaignCopy(next))
      setSavedNotice('')
      setStep(2)
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setBusy(false)
    }
  }
  async function chooseTransaction(transactionId) {
    const token = ++request.current
    const details = {
      ...builder.details,
      transactionId,
      publicName: '',
      imageId: '',
    }
    setBusy(true)
    setError('')
    try {
      const current = await loadGeneralCampaignContext(
        organisationId,
        userId,
        family,
        builder.agentId,
        details,
      )
      if (request.current !== token) return
      setContext(current)
      change({ details: { ...details, area: current.transaction?.area || '' } })
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setBusy(false)
    }
  }
  function preview() {
    try {
      checkedGeneralPack(
        {
          status: 'draft',
          campaign_builder: builder,
          channel_content: content,
        },
        context,
      )
      setError('')
      setStep(3)
    } catch (err) {
      setError(err.message)
    }
  }
  function payload() {
    const value = generalCampaignPayload(builder, content)
    const retained = savedCampaign.current || campaign
    return {
      ...value,
      id: retained?.id || draftId,
      audience: audienceDescription.trim(),
      ...(retained?.planned_budget !== undefined ? { planned_budget: retained.planned_budget, budget_currency: retained.budget_currency } : {}),
    }
  }
  async function checkedPayload(token) {
    const current = await loadGeneralCampaignContext(
      organisationId,
      userId,
      family,
      builder.agentId,
      ...(family === 'key-handover' ? [builder.details] : []),
    )
    if (request.current !== token) throw new Error('Your workspace changed. Reopen the campaign before continuing.')
    checkedGeneralPack({ status: 'draft', campaign_builder: builder, channel_content: content }, current)
    return payload()
  }
  async function persistForAssistant() {
    if (saving.current) return saving.current
    const token = ++request.current
    setBusy(true); setError('')
    const operation = (async () => {
      const form = await checkedPayload(token)
      const row = await saveMarketingCampaign(organisationId, form, savedCampaign.current)
      if (request.current !== token) throw new Error('The campaign was saved in your previous workspace. Reopen it before continuing.')
      savedCampaign.current = row
      setSavedNotice('Campaign draft saved. AI works from this reviewed version; nothing has been sent.')
      return row
    })()
    saving.current = operation
    try { return await operation } finally { saving.current = null; if (request.current === token) setBusy(false) }
  }
  async function save(tab) {
    const token = ++request.current
    setBusy(true)
    setError('')
    try {
      const form = await checkedPayload(token)
      const options = { ...(tab === 'audience' ? { tab } : {}), ...(savedCampaign.current ? { persistedCampaign: savedCampaign.current } : {}) }
      if (Object.keys(options).length) await onSave(form, options)
      else await onSave(form)
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setBusy(false)
    }
  }
  if (!config) return <p role="alert">This campaign type is unavailable.</p>
  const gaps = builder ? generalCampaignGaps(builder) : []
  return (
    <section
      className="jl-builder plc-builder gc-builder"
      aria-label={`${meta.title} campaign builder`}
      aria-busy={busy}
    >
      <fieldset className="jl-fields" disabled={busy}>
        <header className="jl-heading">
          <span className="jl-icon">
            {builder?.source.logoUrl ? <img className="gc-brand-logo" src={builder.source.logoUrl} alt={`${builder.source.agencyName} logo`} onError={(event) => { event.currentTarget.hidden = true }} /> : <CampaignIcon size={28} aria-hidden="true" />}
          </span>
          <div>
            <p className="gc-eyebrow">{businessGoal?.shortTitle || 'Promote your business'} · Business campaign</p>
            <h1>{meta.title}</h1>
            <p>{businessGoal?.outcome || meta.description}</p>
          </div>
        </header>
        <div className="gc-business-path" aria-label="Campaign workflow">{['Brand & offer', 'Content pack', 'CRM audience', 'Review & delivery', 'Enquiries & follow-up'].map((label, index) => <span key={label} className={index < 2 ? 'gc-path-current' : ''}><span>{index + 1}</span>{label}</span>)}</div>
        <ol className="jl-steps" aria-label="Campaign steps">
          {['Use saved details', 'Confirm essentials', 'Preview & save'].map(
            (label, index) => (
              <li
                key={label}
                aria-current={step === index + 1 ? 'step' : undefined}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ),
          )}
        </ol>
        {busy && <p role="status">Loading confirmed campaign details…</p>}
        {error && (
          <p className="mc-error" role="alert">
            {error}
          </p>
        )}
        {!builder && !busy && (
          <button className="mc-button" onClick={onSetup}>
            Review Campaign Setup
          </button>
        )}
        {builder && (
          <>
            <section className="gc-brief-summary" aria-label="Your campaign brief"><div><span className="gc-eyebrow"><Target size={13} aria-hidden="true" />Business goal</span><strong>{meta.objective}</strong></div><div><span className="gc-eyebrow">Your identity</span><strong>{builder.source.agentName || 'Confirm your agent name'} · {builder.source.agencyName || 'Confirm your agency'}</strong><small>{builder.details.area || 'Choose your campaign area'} · {builder.source.language === 'af-ZA' ? 'Afrikaans' : 'English'}</small></div><div><span className="gc-eyebrow">Prepared together</span><strong>{generalChannels(family).map((key) => key === 'social' ? 'Social' : key === 'email' ? 'Email' : 'WhatsApp').join(' · ')}</strong><small>{meta.plannedAssets?.length || 'Branded'} campaign outputs · reviewed before use</small></div></section>
            {savedNotice && <p className="gc-saved-notice" role="status">{savedNotice}</p>}
            {step === 1 && (
              <>
                <h2>Your campaign starts with what’s already saved</h2>
                <div className="jl-mini-preview">
                  <div className="jl-preview-body">
                    <CheckCircle2 size={22} />
                    <h3>{builder.source.agencyName}</h3>
                    <p>
                      {builder.source.agentName}
                      {builder.source.agentTitle
                        ? ` · ${builder.source.agentTitle}`
                        : ''}
                    </p>
                    <p>
                      {builder.source.serviceAreas ||
                        'Add the campaign area in the next step.'}
                    </p>
                    <p>
                      {builder.source.destination ||
                        'Add a missing public enquiry contact in the next step.'}
                    </p>
                    <p>
                      Source: confirmed Campaign Setup. Creating a campaign does
                      not select recipients or send messages.
                    </p>
                  </div>
                </div>
                <p>
                  {config.fields.length
                    ? 'Review the suggested content and add any missing campaign facts.'
                    : 'Your public details are ready to review. No listing or client selection is needed.'}
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <h2>Confirm the campaign details</h2>
                <p>
                  Changing details rebuilds the suggested wording. Only approved
                  public information belongs here.
                </p>
                <div className="jl-notice">
                  <button className="mc-button" onClick={refresh}>
                    <RefreshCw size={16} /> Refresh saved details and rebuild
                    wording
                  </button>
                  <p>
                    Refreshing replaces wording edits and requires confirmation
                    again. It keeps your campaign-specific material.
                  </p>
                </div>
                {family === 'key-handover' && (
                  <>
                    <label>
                      Completed transaction
                      <select
                        value={builder.details.transactionId || ''}
                        onChange={(e) => chooseTransaction(e.target.value)}
                      >
                        <option value="">Choose a completed transaction</option>
                        {builder.details.transactionId &&
                          !context.transaction && (
                            <option value={builder.details.transactionId}>
                              Previously selected transaction unavailable —
                              choose again
                            </option>
                          )}
                        {(context.transactions || []).map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.reference} ·{' '}
                            {row.area || 'Confirm public area'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="jl-note">
                      Only permitted completed transactions appear. Confirm that
                      the keys have actually been handed over. Client names,
                      addresses and prices are never filled in.
                    </p>
                    {context.transaction && (
                      <label>
                        Celebration picture
                        <select
                          value={builder.details.imageId || ''}
                          onChange={(e) =>
                            change({
                              details: {
                                ...builder.details,
                                imageId: e.target.value,
                              },
                            })
                          }
                        >
                          <option value="">Agency branding (no photo)</option>
                          {builder.details.imageId &&
                            !context.images?.some(
                              (image) => image.id === builder.details.imageId,
                            ) && (
                              <option value={builder.details.imageId}>
                                Previously selected photo unavailable — choose
                                again
                              </option>
                            )}
                          {(context.images || []).map((image, index) => (
                            <option key={image.id} value={image.id}>
                              Listing photo {index + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {builder.details.imageId &&
                      context.images?.find(
                        (image) => image.id === builder.details.imageId,
                      ) && (
                        <div className="jl-mini-preview">
                          <img
                            src={
                              context.images.find(
                                (image) => image.id === builder.details.imageId,
                              ).url
                            }
                            alt="Selected listing photo for the approved celebration"
                          />
                        </div>
                      )}
                    {context.notice && (
                      <p className="jl-note">{context.notice}</p>
                    )}
                    {!context.transactions?.length && (
                      <p className="jl-notice">
                        No permitted completed transactions are available yet.
                      </p>
                    )}
                  </>
                )}
                {family === 'review-request' && (
                  <p className="jl-note">
                    Your saved review link is suggested below. Invite honest
                    feedback by email or WhatsApp; select recipients in the
                    channel tools after saving.
                  </p>
                )}
                <label>
                  Campaign area
                  <input
                    readOnly={
                      family === 'key-handover' &&
                      Boolean(context.transaction?.area)
                    }
                    list="gc-service-areas"
                    maxLength={120}
                    value={builder.details.area || ''}
                    onChange={(e) =>
                      change({
                        details: { ...builder.details, area: e.target.value },
                      })
                    }
                  />
                  <datalist id="gc-service-areas">
                    {context.areas.map((area) => (
                      <option key={area} value={area} />
                    ))}
                  </datalist>
                </label>
                <p className="jl-note">
                  {family === 'key-handover'
                    ? 'Uses the completed transaction’s public area. Add only a public area if it is missing.'
                    : 'Suggested from your saved service areas; editable for this campaign.'}
                </p>
                <CampaignContactReview builder={builder} content={content} general onRefresh={refresh} onOverride={(key, value, enabled) => { const next = withContactOverride(builder, key, value, GENERAL_CONTACT_FIELDS, enabled); change({ source: next.source, contactProvenance: next.contactProvenance }) }} />
                {!['en-ZA', 'af-ZA'].includes(context.source.language) && (
                  <label>
                    Campaign language
                    <select
                      value={builder.source.language}
                      onChange={(e) =>
                        change({
                          source: {
                            ...builder.source,
                            language: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Choose a language</option>
                      <option value="en-ZA">English</option>
                      <option value="af-ZA">Afrikaans</option>
                    </select>
                  </label>
                )}
                {config.fields
                  .filter((field) => !field.hidden)
                  .map(({ key, label, max, options, type }) => (
                    <label key={key}>
                      {label}
                      {options ? (
                        <select
                          value={builder.details[key] || ''}
                          onChange={(e) =>
                            change({
                              details: {
                                ...builder.details,
                                [key]: e.target.value,
                              },
                            })
                          }
                        >
                          {options.map(([value, title]) => (
                            <option key={value} value={value}>
                              {title}
                            </option>
                          ))}
                        </select>
                      ) : type === 'url' || type === 'text' ? (
                        <input
                          type={type}
                          maxLength={max}
                          value={builder.details[key] || ''}
                          onChange={(e) =>
                            change({
                              details: {
                                ...builder.details,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                      ) : key === 'briefExpires' || key === 'reportDate' ? (
                        <input
                          type="date"
                          value={builder.details[key] || ''}
                          onChange={(e) =>
                            change({
                              details: {
                                ...builder.details,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                      ) : (
                        <textarea
                          rows={
                            key === 'attribution' || key === 'period' ? 2 : 5
                          }
                          maxLength={max}
                          value={builder.details[key] || ''}
                          onChange={(e) =>
                            change({
                              details: {
                                ...builder.details,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
                {family === 'first-time-buyer' && (
                  <p className="jl-note">
                    The checklist downloads as a text file and is included in
                    the delivery message. Review it for your agency before
                    sharing.
                  </p>
                )}
                {family === 'buyer-demand' && (
                  <p className="jl-note">
                    Use a public summary only. The search is confirmed by you
                    and will stop exporting after its expiry date; it is not
                    automatically verified against a private buyer record.
                  </p>
                )}
                {family === 'market-update' && (
                  <p className="jl-note">
                    Supply sourced facts and your reporting period. No prices,
                    trends or market figures are invented. The report source and
                    publication date appear in the pack.
                  </p>
                )}
                {config.portrait && (
                  <div className="jl-mini-preview">
                    {builder.source.photoUrl ? (
                      <img
                        src={context.source.photoUrl}
                        alt={`${builder.source.agentName} — saved public portrait`}
                      />
                    ) : (
                      <p>Add a portrait in Campaign Setup.</p>
                    )}
                  </div>
                )}
                {config.permission && (
                  <label>
                    <input
                      type="checkbox"
                      checked={builder.permission}
                      onChange={(e) => change({ permission: e.target.checked })}
                    />
                    {config.permission}
                  </label>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={builder.reviewed}
                    onChange={(e) =>
                      setBuilder({ ...(builder.contactProvenance ? confirmCampaignContacts(builder, GENERAL_CONTACT_FIELDS, e.target.checked) : builder), reviewed: e.target.checked })
                    }
                  />
                  I have reviewed these public details and campaign-specific
                  facts.
                </label>
                {gaps.length > 0 && (
                  <div className="jl-notice">
                    <ul>
                      {gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                    <button className="mc-text-button" onClick={onSetup}>
                      Review Campaign Setup
                    </button>
                  </div>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h2>Your campaign preview</h2>
                <section className="gc-audience-review" aria-labelledby="gc-audience-heading"><div><UsersRound size={21} aria-hidden="true" /><h3 id="gc-audience-heading">Who should this campaign reach?</h3></div><label>Intended audience<textarea rows={2} maxLength={600} value={audienceDescription} onChange={(event) => { setAudienceDescription(event.target.value); setSavedNotice('') }} /></label><p>This is your audience brief. After saving, choose a live CRM audience and review channel eligibility. No recipients are selected by this description.</p><dl><div><dt>Response destination</dt><dd>{family === 'review-request' ? builder.details.reviewUrl : builder.source.destination}</dd></div><div><dt>Next step</dt><dd>Choose your audience, prepare the channel draft, then review before sending or publishing.</dd></div></dl></section>
                {SHOW_CAMPAIGN_WORKSPACE && <AiBusinessCampaignAssistant organisationId={organisationId} builder={builder} content={content} persist={persistForAssistant} onApply={(nextContent) => { setContent(nextContent); setSavedNotice('AI wording applied. Review your channel copy and save the updated campaign.') }} />}
                <article className="jl-mini-preview">
                  {config.portrait && (
                    <img
                      src={context.source.photoUrl}
                      alt={`${builder.source.agentName} — public portrait`}
                    />
                  )}
                  <div className="jl-preview-body">
                    <strong>{builder.source.agencyName}</strong>
                    <h3>{content[generalChannels(family)[0]]?.title}</h3>
                    <p>{builder.details.area}</p>
                    <p>
                      {builder.source.agentName} · {builder.source.destination}
                    </p>
                  </div>
                </article>
                <p>
                  {builder.source.agencyName} · {builder.source.agentName} ·{' '}
                  {builder.details.area}
                </p>
                <nav className="mc-tabs" aria-label="Channel wording">
                  {generalChannels(family).map((key) => (
                    <button
                      key={key}
                      aria-pressed={channel === key}
                      onClick={() => setChannel(key)}
                    >
                      {key === 'social'
                        ? 'Social'
                        : key === 'email'
                          ? 'Email'
                          : 'WhatsApp'}
                    </button>
                  ))}
                </nav>
                <label>
                  Headline
                  <input
                    maxLength={240}
                    value={content[channel]?.title || ''}
                    onChange={(e) => {
                      setSavedNotice('')
                      setContent({
                        ...content,
                        [channel]: {
                          ...content[channel],
                          title: e.target.value,
                        },
                      })
                    }}
                  />
                </label>
                <label>
                  Message
                  <textarea
                    rows={12}
                    maxLength={12000}
                    value={content[channel]?.body || ''}
                    onChange={(e) => {
                      setSavedNotice('')
                      setContent({
                        ...content,
                        [channel]: {
                          ...content[channel],
                          body: e.target.value,
                        },
                      })
                    }}
                  />
                </label>
                <p className="jl-note">
                  Your saved campaign keeps this brief and its channel copy together. Prepare branded PNGs, stories and channel drafts in Assets & drafts. Choose a live CRM audience, then review the sender, permissions and actual send time in each channel.
                </p>
                <div className="gc-after-save"><h3>Your campaign continues from here</h3><div><span><UsersRound size={18} aria-hidden="true" /><strong>Choose your audience</strong><small>Review matching contacts and channel permission.</small></span><span><Sparkles size={18} aria-hidden="true" /><strong>Prepare your assets & drafts</strong><small>Download branded artwork or open the Email / WhatsApp editor.</small></span><span><CheckCircle2 size={18} aria-hidden="true" /><strong>Review, publish & follow up</strong><small>Use the supported channel flow and keep recorded enquiries with the campaign.</small></span></div><p>Publish a reviewed Facebook text or link post from Channel activity, or download artwork for manual sharing. A planned date does not schedule a send.</p></div>
              </>
            )}
          </>
        )}
        <footer className="jl-actions">
          <button
            className="mc-button"
            onClick={() => (step > 1 ? setStep(step - 1) : onCancel({ persistedCampaign: savedCampaign.current }))}
          >
            <ArrowLeft size={16} />
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          {builder &&
            (step === 1 ? (
              <button
                className="mc-button mc-primary"
                onClick={() => setStep(2)}
              >
                Continue with saved details <ArrowRight size={16} />
              </button>
            ) : step === 2 ? (
              <button
                className="mc-button mc-primary"
                disabled={gaps.length > 0}
                onClick={preview}
              >
                Confirm and preview <ArrowRight size={16} />
              </button>
            ) : (
              <div className="gc-save-actions"><button className="mc-button" onClick={() => save()}><Save size={16} />Save campaign draft</button><button className="mc-button mc-primary" onClick={() => save('audience')}>Save & choose audience<ArrowRight size={16} /></button></div>
            ))}
        </footer>
      </fieldset>
    </section>
  )
}
