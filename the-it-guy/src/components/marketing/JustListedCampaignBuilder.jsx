import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Home,
  Image,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  Share2,
} from 'lucide-react'
import {
  loadJustListedChoices,
  loadJustListedSource,
} from '../../services/justListedCampaignService'
import {
  JUST_LISTED_SOURCE_FIELDS,
  cleanListingBuilder,
  justListedCopy,
  justListedGaps,
  justListedPayload,
} from '../../services/justListedCampaignModel'
import { MarketingAnchor } from './MarketingNavigation.jsx'
import CampaignContactReview from './CampaignContactReview'
import { assertCampaignContacts, contactProvenanceReview, createContactProvenance, confirmCampaignContacts, PROPERTY_CONTACT_FIELDS, withContactOverride } from '../../services/campaignContactProvenance'
import './JustListedCampaignBuilder.css'

const channels = {
  social: ['Social post', Share2],
  email: ['Email', Mail],
  whatsapp: ['WhatsApp', MessageCircle],
}

export default function JustListedCampaignBuilder({
  organisationId,
  userId,
  campaign,
  onSave,
  onCancel,
  onSetup,
}) {
  const [draftId] = useState(() => crypto.randomUUID())
  const [choices, setChoices] = useState(null)
  const [builder, setBuilder] = useState(null)
  const [current, setCurrent] = useState(null)
  const [content, setContent] = useState({})
  const [step, setStep] = useState(1)
  const [channel, setChannel] = useState('social')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const request = useRef(0)
  useEffect(() => {
    const token = ++request.current
    async function load() {
      try {
        const data = await loadJustListedChoices(organisationId, userId)
        if (request.current !== token) return
        setChoices(data)
        if (campaign) {
          const saved = cleanListingBuilder(campaign.listing_builder)
          const fresh = await loadJustListedSource(
            organisationId,
            userId,
            saved.listingId,
            data,
          )
          if (request.current !== token) return
          setBuilder(saved)
          setCurrent(fresh)
          setContent(campaign.channel_content || justListedCopy(saved.source))
          setStep(2)
        }
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
  }, [organisationId, userId, campaign])

  async function selectListing(id) {
    const token = ++request.current
    setBusy(true)
    setError('')
    try {
      const data = await loadJustListedSource(
        organisationId,
        userId,
        id,
        choices,
      )
      if (request.current !== token) return
      setCurrent(data)
      setBuilder({
        version: 1,
        template: 'new-listing',
        listingId: id,
        agentId: data.agentId,
        source: data.source,
        contactProvenance: createContactProvenance(data.source),
      })
      setContent(justListedCopy(data.source))
      setStep(2)
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setBusy(false)
    }
  }
  const source = builder?.source
  const privacyChanged = Boolean(
    source &&
      current &&
      (source.location !== current.source.location ||
        builder.agentId !== current.agentId),
  )
  const changed = Boolean(
    source &&
      current &&
      JUST_LISTED_SOURCE_FIELDS.some(
        (key) => !PROPERTY_CONTACT_FIELDS.includes(key) && (source[key] || '') !== (current.source[key] || ''),
      ) || (builder && current && !contactProvenanceReview(builder, current.source, undefined, { requireConfirmed: false }).ready),
  )
  const coverUrl = source?.imageId
    ? current?.images?.find((image) => image.id === source.imageId)?.url ||
      (source.imageId === current?.source.imageId ? current?.coverUrl : '')
    : current?.coverUrl
  const contacts = builder ? contactProvenanceReview(builder, null, undefined, { requireConfirmed: false }) : null
  const gaps = source ? [...justListedGaps(source), ...(contacts?.ready ? [] : [contacts.message])] : []
  const previewBody = content[channel]?.body || ''
  const displayedBody = previewBody.startsWith(`${content[channel]?.title}\n\n`)
    ? previewBody.slice(content[channel].title.length + 2)
    : previewBody
  function changeSource(key, value, enabled = true) {
    const next = PROPERTY_CONTACT_FIELDS.includes(key) ? withContactOverride(builder, key, value, PROPERTY_CONTACT_FIELDS, enabled) : { ...builder, source: { ...source, [key]: value } }
    setBuilder(next)
    setContent(justListedCopy(next.source))
  }
  async function refreshSource() {
    const token = ++request.current
    setBusy(true)
    setError('')
    try {
      const data = await loadJustListedSource(
        organisationId,
        userId,
        builder.listingId,
        choices,
      )
      if (request.current !== token) return
      setCurrent(data)
      setBuilder({ ...builder, source: data.source, agentId: data.agentId, contactProvenance: createContactProvenance(data.source) })
      setContent(justListedCopy(data.source))
      setStep(2)
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setBusy(false)
    }
  }
  async function save() {
    const token = ++request.current
    setSaving(true)
    setError('')
    try {
      const fresh = await loadJustListedSource(
        organisationId,
        userId,
        builder.listingId,
        choices,
      )
      if (request.current !== token) return
      setCurrent(fresh)
      assertCampaignContacts(builder, fresh.source)
      if (
        fresh.source.location !== source.location ||
        fresh.agentId !== builder.agentId
      )
        throw new Error(
          'The public location or assigned agent changed. Refresh the listing details and review the draft.',
        )
      await onSave({
        ...justListedPayload(builder, content),
        ...(!campaign ? { id: draftId } : {}),
        ...(campaign?.planned_budget !== undefined
          ? {
              planned_budget: campaign.planned_budget,
              budget_currency: campaign.budget_currency,
            }
          : {}),
      })
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setSaving(false)
    }
  }
  return (
    <section
      className="jl-builder"
      aria-label="Just Listed campaign builder"
      aria-busy={busy || saving}
    >
      <fieldset className="jl-fields" disabled={saving}>
        <header className="jl-heading">
          <span className="jl-icon">
            <Home size={24} />
          </span>
          <div>
            <p>JUST LISTED</p>
            <h1>
              {campaign
                ? 'Review your campaign draft'
                : 'A new listing. A ready-to-review campaign.'}
            </h1>
            <p>We’ll reuse your listing, agency and assigned agent details.</p>
          </div>
        </header>
        <ol className="jl-steps" aria-label="Campaign steps">
          {['Choose listing', 'Confirm essentials', 'Preview & save'].map(
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
        {error && (
          <p className="mc-error" role="alert">
            {error}
          </p>
        )}
        {busy && <p role="status">Loading saved campaign details…</p>}
        {!busy && !choices && (
          <button className="mc-button" onClick={onCancel}>
            Back to campaigns
          </button>
        )}
        {!busy && choices && !choices.agency && (
          <div className="jl-notice">
            <h2>Confirm your agency preferences first</h2>
            <p>Campaign Setup reuses the details your agency already has.</p>
            <button className="mc-button mc-primary" onClick={onSetup}>
              Open Campaign Setup
            </button>
          </div>
        )}
        {!busy && choices?.agency && step === 1 && (
          <div>
            <h2>Which property are we introducing?</h2>
            <p>Sale listings available to you in this agency.</p>
            <label className="jl-search">
              Find a listing
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search headline, area or reference"
              />
            </label>
            <div className="jl-listings">
              {choices.listings
                .filter((row) =>
                  `${row.title} ${row.area} ${row.reference}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((row) => (
                  <button
                    key={row.id}
                    className="jl-listing"
                    onClick={() => selectListing(row.id)}
                  >
                    <Home size={24} />
                    <strong>{row.title}</strong>
                    <span>
                      {row.area || 'Area missing'}
                      {row.reference ? ` · ${row.reference}` : ''}
                    </span>
                    <span>
                      Use this listing <ArrowRight size={16} />
                    </span>
                  </button>
                ))}
            </div>
            {!choices.listings.length && (
              <p>
                No sale listings are available. Add a listing or ask your
                administrator to check its assignment.
              </p>
            )}
          </div>
        )}
        {!busy && source && step > 1 && (
          <>
            {(changed || privacyChanged) && (
              <div className="jl-notice" role="status">
                <strong>
                  {privacyChanged
                    ? 'Public location or assigned agent needs review.'
                    : 'This draft differs from the current source details.'}
                </strong>
                <p>
                  Refresh replaces the draft wording, including your edits, with
                  current listing and setup details.
                </p>
                <button
                  className="mc-button"
                  disabled={saving}
                  onClick={refreshSource}
                >
                  <RefreshCw size={16} /> Refresh and rebuild wording
                </button>
              </div>
            )}
            {step === 2 && (
              <div className="jl-confirm">
                <div>
                  <h2>We’ve filled in the essentials</h2>
                  <p>
                    Review these public details. Continue confirms them for this
                    draft.
                  </p>
                  <dl>
                    <dt>Listing</dt>
                    <dd>{source.title || 'Headline missing'}</dd>
                    <dt>Public location</dt>
                    <dd>{source.location || 'Area missing'}</dd>
                    <dt>Asking price</dt>
                    <dd>{source.price || 'Price missing'}</dd>
                    <dt>Agency</dt>
                    <dd>{source.agencyName} · From Campaign Setup</dd>
                    <dt>Assigned agent</dt>
                    <dd>{source.agentName || 'Public name missing'}</dd>
                    <dt>Enquiries</dt>
                    <dd>{source.destination || 'Public contact missing'}</dd>
                    <dt>Content style</dt>
                    <dd>
                      {{ 'en-ZA': 'English', 'af-ZA': 'Afrikaans' }[
                        source.language
                      ] || source.language}{' '}
                      · {source.tone || 'Agency default'}
                    </dd>
                  </dl>
                  <CampaignContactReview builder={builder} content={content} onRefresh={refreshSource} nameLabel="Assigned agent’s public name" destinationLabel="Public enquiry email or phone" onOverride={changeSource} />
                  {!['en-ZA', 'af-ZA'].includes(current.source.language) && (
                    <label>
                      Language for this draft
                      <select
                        value={source.language}
                        onChange={(event) =>
                          changeSource('language', event.target.value)
                        }
                      >
                        <option value="">Choose language</option>
                        <option value="en-ZA">English</option>
                        <option value="af-ZA">Afrikaans</option>
                      </select>
                    </label>
                  )}
                  {gaps.length > 0 && (
                    <div className="jl-notice">
                      <strong>A few details need attention</strong>
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
                  <p className="jl-note">
                    Changes here affect this campaign only. Property facts are
                    maintained in your listing editor.{' '}
                    <MarketingAnchor
                      href={`/agent/listings/${builder.listingId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open listing
                    </MarketingAnchor>
                  </p>
                </div>
                <div className="jl-mini-preview">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={source.title || 'Selected listing'}
                    />
                  ) : (
                    <div className="jl-no-image">
                      <Image size={32} />
                      <span>Add a cover photo in the listing editor</span>
                    </div>
                  )}
                  <div>
                    <span className="jl-pill">JUST LISTED</span>
                    <h3>{source.title}</h3>
                    <p>{source.location}</p>
                    <strong>{source.price}</strong>
                    <p>{source.facts}</p>
                  </div>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <h2>Your campaign draft is ready to review</h2>
                <p>
                  Prepared from saved facts. Review the copy before using it.
                </p>
                <div
                  className="jl-channel-tabs"
                  role="group"
                  aria-label="Preview channel"
                >
                  {Object.entries(channels).map(([key, config]) => {
                    const [label, Icon] = config
                    return (
                      <button
                        className="mc-button"
                        key={key}
                        aria-pressed={channel === key}
                        onClick={() => setChannel(key)}
                      >
                        <Icon size={17} />
                        {label}
                      </button>
                    )
                  })}
                </div>
                <article
                  className="jl-copy-preview"
                  style={{
                    borderTop: /^#[0-9a-f]{6}$/i.test(source.primaryColor)
                      ? `5px solid ${source.primaryColor}`
                      : undefined,
                  }}
                >
                  {coverUrl && <img src={coverUrl} alt={source.title} />}
                  <div>
                    {current.logoUrl && (
                      <img
                        className="jl-agency-logo"
                        src={current.logoUrl}
                        alt={`${source.agencyName} logo`}
                      />
                    )}
                    <p className="jl-pill">{source.agencyName} · DRAFT</p>
                    <h3>{content[channel]?.title}</h3>
                    <p className="jl-copy">{displayedBody}</p>
                  </div>
                </article>
                <details className="jl-wording">
                  <summary>
                    Edit {channels[channel][0].toLowerCase()} wording
                  </summary>
                  <label>
                    Headline
                    <input
                      maxLength={240}
                      value={content[channel]?.title || ''}
                      onChange={(event) =>
                        setContent({
                          ...content,
                          [channel]: {
                            ...content[channel],
                            title: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Message
                    <textarea
                      rows={10}
                      maxLength={12000}
                      value={content[channel]?.body || ''}
                      onChange={(event) =>
                        setContent({
                          ...content,
                          [channel]: {
                            ...content[channel],
                            body: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </details>
                <p className="jl-note">
                  <CheckCircle2 size={16} /> Includes editable social, email and
                  WhatsApp copy. Save your draft to return to it later.
                </p>
              </div>
            )}
          </>
        )}
        <footer className="jl-actions">
          <button
            className="mc-button"
            disabled={saving || busy}
            onClick={step > 1 ? () => setStep(step - 1) : onCancel}
          >
            <ArrowLeft size={16} />
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          {!busy && source && step === 2 && (
            <button
              className="mc-button mc-primary"
              disabled={gaps.length > 0 || privacyChanged}
              onClick={() => {
                setError('')
                setBuilder(confirmCampaignContacts(builder))
                setStep(3)
              }}
            >
              Confirm and preview <ArrowRight size={16} />
            </button>
          )}
          {!busy && source && step === 3 && (
            <button
              className="mc-button mc-primary"
              disabled={saving || privacyChanged || gaps.length > 0}
              onClick={save}
            >
              <Save size={16} />
              {saving ? 'Saving draft…' : 'Save campaign draft'}
            </button>
          )}
        </footer>
      </fieldset>
    </section>
  )
}
