import { useEffect, useRef, useState } from 'react'
import {
  Home,
  ArrowLeft,
  ArrowRight,
  Save,
  RefreshCw,
  Image,
} from 'lucide-react'
import {
  loadJustListedChoices,
  loadJustListedSource,
  loadPropertyShowDays,
} from '../../services/justListedCampaignService'
import {
  PROPERTY_CAMPAIGNS,
  cleanPropertyBuilder,
  propertyItems,
} from '../../services/listingCampaignContract'
import {
  projectPropertySource,
  propertyCampaignCopy,
  propertyCampaignGaps,
  propertyCampaignPayload,
} from '../../services/listingCampaignModel'
import { checkedPropertyPack } from '../../services/propertyCampaignPackModel'
import './JustListedCampaignBuilder.css'

const initialSettings = {
  eventId: '',
  date: '',
  startTime: '',
  endTime: '',
  feature: '',
  priceConfirmed: false,
  publicationConfirmed: false,
  revealTitle: false,
  revealPrice: false,
  revealFacts: false,
  revealPhotos: false,
}
export default function ListingCampaignBuilder({
  template,
  campaign,
  organisationId,
  userId,
  onSave,
  onCancel,
  onSetup,
}) {
  const family = campaign?.listing_builder?.template || template,
    config = PROPERTY_CAMPAIGNS[family]
  const [draftId] = useState(() => crypto.randomUUID())
  const [choices, setChoices] = useState(null),
    [currents, setCurrents] = useState([]),
    [events, setEvents] = useState([])
  const [builder, setBuilder] = useState(null),
    [content, setContent] = useState({}),
    [selected, setSelected] = useState([])
  const [step, setStep] = useState(1),
    [channel, setChannel] = useState('social'),
    [search, setSearch] = useState('')
  const [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [eventWarning, setEventWarning] = useState('')
  const request = useRef(0)
  useEffect(() => {
    const token = ++request.current
    async function load() {
      try {
        const data = await loadJustListedChoices(organisationId, userId, family)
        if (request.current !== token) return
        setChoices(data)
        if (family === 'show-day') {
          try {
            const savedEvents = await loadPropertyShowDays(organisationId)
            if (request.current === token) setEvents(savedEvents)
          } catch {
            if (request.current === token)
              setEventWarning(
                'Saved show days could not be loaded. Enter campaign timing below, or retry by reopening this builder.',
              )
          }
        }
        if (campaign) {
          const saved = cleanPropertyBuilder(campaign.listing_builder)
          const fresh = await Promise.all(
            propertyItems(saved).map((item) =>
              loadJustListedSource(
                organisationId,
                userId,
                item.listingId,
                data,
                family,
              ),
            ),
          )
          if (request.current !== token) return
          setBuilder(saved)
          setCurrents(fresh)
          setContent(campaign.channel_content)
          setSelected(propertyItems(saved).map((item) => item.listingId))
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
  }, [organisationId, userId, family, campaign])
  function assemble(items, settings) {
    return {
      version: 2,
      template: family,
      ...items[0],
      additionalListings: items.slice(1),
      settings,
    }
  }
  async function choose(ids) {
    const token = ++request.current
    setBusy(true)
    setError('')
    try {
      const fresh = await Promise.all(
        ids.map((id) =>
          loadJustListedSource(organisationId, userId, id, choices, family),
        ),
      )
      if (request.current !== token) return
      const event = events.find(
        (item) =>
          item.listingId === ids[0] &&
          Date.parse(`${item.date}T${item.endTime}:00+02:00`) > Date.now(),
      )
      const settings = {
        ...initialSettings,
        ...(event
          ? {
              eventId: event.id,
              date: event.date,
              startTime: event.startTime,
              endTime: event.endTime,
            }
          : {}),
        feature: (fresh[0].source.facts?.split(' · ')[0] || '').slice(0, 600),
      }
      const next = assemble(
        fresh.map((item) => ({
          listingId: item.listingId,
          agentId: item.agentId,
          source: projectPropertySource(family, item, settings),
        })),
        settings,
      )
      setBuilder(next)
      setCurrents(fresh)
      setContent(propertyCampaignCopy(next))
      setSelected(ids)
      setStep(2)
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setBusy(false)
    }
  }
  function changeSettings(patch) {
    const settings = { ...builder.settings, ...patch }
    const items =
      family === 'coming-soon'
        ? currents.map((item, index) => ({
            ...propertyItems(builder)[index],
            source: {
              ...projectPropertySource(family, item, settings),
              ...Object.fromEntries(
                ['agentName', 'destination', 'language'].map((key) => [
                  key,
                  propertyItems(builder)[index].source[key],
                ]),
              ),
            },
          }))
        : propertyItems(builder)
    const next = assemble(items, settings)
    setBuilder(next)
    setContent(propertyCampaignCopy(next))
    setError('')
  }
  function changeContact(index, key, value) {
    const items = propertyItems(builder).map((item, i) =>
      i === index
        ? { ...item, source: { ...item.source, [key]: value } }
        : item,
    )
    const next = assemble(items, builder.settings)
    setBuilder(next)
    setContent(propertyCampaignCopy(next))
  }
  async function refresh() {
    const token = ++request.current
    setBusy(true)
    setError('')
    try {
      const fresh = await Promise.all(
        propertyItems(builder).map((item) =>
          loadJustListedSource(
            organisationId,
            userId,
            item.listingId,
            choices,
            family,
          ),
        ),
      )
      let settings = {
        ...builder.settings,
        publicationConfirmed: false,
        priceConfirmed: false,
      }
      if (family === 'show-day' && settings.eventId) {
        const savedEvents = await loadPropertyShowDays(organisationId),
          event = savedEvents.find((item) => item.id === settings.eventId)
        if (!event)
          throw new Error(
            'This public show day is no longer available. Clear the saved event and enter current campaign timing.',
          )
        settings = {
          ...settings,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
        }
        if (request.current === token) setEvents(savedEvents)
      }
      if (request.current !== token) return
      const next = assemble(
        fresh.map((item) => ({
          listingId: item.listingId,
          agentId: item.agentId,
          source: projectPropertySource(family, item, settings),
        })),
        settings,
      )
      setBuilder(next)
      setCurrents(fresh)
      setContent(propertyCampaignCopy(next))
      setStep(2)
    } catch (err) {
      if (request.current === token) setError(err.message)
    } finally {
      if (request.current === token) setBusy(false)
    }
  }
  const gaps = builder ? propertyCampaignGaps(builder) : []
  function preview() {
    try {
      checkedPropertyPack(
        { status: 'draft', listing_builder: builder, channel_content: content },
        currents,
        events.find((item) => item.id === builder.settings.eventId),
      )
      setError('')
      setStep(3)
    } catch (err) {
      setError(err.message)
    }
  }
  async function save() {
    const token = ++request.current
    setSaving(true)
    setError('')
    try {
      const fresh = await Promise.all(
        propertyItems(builder).map((item) =>
          loadJustListedSource(
            organisationId,
            userId,
            item.listingId,
            choices,
            family,
          ),
        ),
      )
      const savedEvents = builder.settings.eventId
        ? await loadPropertyShowDays(organisationId)
        : []
      if (request.current !== token) return
      setCurrents(fresh)
      checkedPropertyPack(
        { status: 'draft', listing_builder: builder, channel_content: content },
        fresh,
        savedEvents.find((item) => item.id === builder.settings.eventId),
      )
      await onSave({
        ...propertyCampaignPayload(builder, content),
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
  if (!config) return <p role="alert">This campaign type is unavailable.</p>
  return (
    <section
      className="jl-builder plc-builder"
      aria-label={`${config.title} campaign builder`}
      aria-busy={busy || saving}
    >
      <fieldset className="jl-fields" disabled={busy || saving}>
        <header className="jl-heading">
          <span className="jl-icon">
            <Home size={24} />
          </span>
          <div>
            <p>PROPERTY CAMPAIGN</p>
            <h1>{config.title}</h1>
            <p>
              We’ll reuse your agency, assigned agents and permitted listing
              details.
            </p>
          </div>
        </header>
        <ol className="jl-steps" aria-label="Campaign steps">
          {['Choose properties', 'Confirm essentials', 'Preview & save'].map(
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
        {busy && <p role="status">Loading saved property details…</p>}
        {error && (
          <p className="mc-error" role="alert">
            {error}
          </p>
        )}
        {choices && !choices.agency && (
          <div className="jl-notice">
            <h2>Confirm agency preferences first</h2>
            <button className="mc-button" onClick={onSetup}>
              Open Campaign Setup
            </button>
          </div>
        )}
        {!busy && choices?.agency && step === 1 && (
          <>
            <h2>
              {family === 'property-collection'
                ? 'Choose three to six properties'
                : 'Which property is this campaign for?'}
            </h2>
            <p>
              {family === 'coming-soon'
                ? 'Only properties that have not launched are shown.'
                : family === 'just-sold'
                  ? 'Only listings marked sold are shown.'
                  : 'Sale listings available to you in this agency.'}
            </p>
            <label className="jl-search">
              Find a listing
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Headline, area or reference"
              />
            </label>
            <div className="jl-listings">
              {choices.listings
                .filter((item) =>
                  `${item.title} ${item.area} ${item.reference}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((item) =>
                  family === 'property-collection' ? (
                    <label className="jl-listing" key={item.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        disabled={
                          !selected.includes(item.id) && selected.length === 6
                        }
                        onChange={() =>
                          setSelected((previous) =>
                            previous.includes(item.id)
                              ? previous.filter((id) => id !== item.id)
                              : [...previous, item.id],
                          )
                        }
                      />
                      <strong>{item.title}</strong>
                      <span>{item.area}</span>
                    </label>
                  ) : (
                    <button
                      className="jl-listing"
                      key={item.id}
                      onClick={() => choose([item.id])}
                    >
                      <Home size={22} />
                      <strong>{item.title}</strong>
                      <span>{item.area}</span>
                      <span>
                        Use this listing <ArrowRight size={16} />
                      </span>
                    </button>
                  ),
                )}
            </div>
            {!choices.listings.length && (
              <p>No eligible listings are available for this campaign.</p>
            )}
            {family === 'property-collection' && (
              <button
                className="mc-button mc-primary"
                disabled={selected.length < 3}
                onClick={() => choose(selected)}
              >
                Continue with {selected.length} properties
              </button>
            )}
          </>
        )}
        {!busy && builder && step === 2 && (
          <>
            <h2>Confirm the campaign details</h2>
            <p>
              Only campaign-specific details need attention. Changing these
              details rebuilds the wording.
            </p>
            <div className="jl-notice">
              <button className="mc-button" onClick={refresh}>
                <RefreshCw size={16} />
                Refresh listing details and rebuild wording
              </button>
              <p>
                Refreshing replaces wording edits and requires permission or
                price confirmations again.
              </p>
            </div>
            {family === 'show-day' && (
              <>
                <p>
                  All times are South African time. This campaign does not
                  create or change a show-day event.
                </p>
                {eventWarning && <p role="status">{eventWarning}</p>}
                <label>
                  Saved public show day
                  <select
                    value={builder.settings.eventId}
                    onChange={(event) => {
                      const saved = events.find(
                        (item) => item.id === event.target.value,
                      )
                      changeSettings(
                        saved
                          ? {
                              eventId: saved.id,
                              date: saved.date,
                              startTime: saved.startTime,
                              endTime: saved.endTime,
                            }
                          : { eventId: '' },
                      )
                    }}
                  >
                    <option value="">Enter campaign timing</option>
                    {events
                      .filter((event) => event.listingId === builder.listingId)
                      .map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.title} · {event.date} {event.startTime}
                        </option>
                      ))}
                  </select>
                </label>
                {[
                  ['date', 'Show day date', 'date'],
                  ['startTime', 'Start time', 'time'],
                  ['endTime', 'End time', 'time'],
                ].map(([key, label, type]) => (
                  <label key={key}>
                    {label}
                    <input
                      type={type}
                      value={builder.settings[key]}
                      onChange={(event) =>
                        changeSettings({
                          [key]: event.target.value,
                          eventId: '',
                        })
                      }
                    />
                  </label>
                ))}
              </>
            )}
            {family === 'property-spotlight' && (
              <label>
                Standout feature (from your saved facts, editable)
                <input
                  maxLength={600}
                  value={builder.settings.feature}
                  onChange={(event) =>
                    changeSettings({ feature: event.target.value })
                  }
                />
              </label>
            )}
            {family === 'price-reduced' && (
              <label>
                <input
                  type="checkbox"
                  checked={builder.settings.priceConfirmed}
                  onChange={(event) =>
                    changeSettings({ priceConfirmed: event.target.checked })
                  }
                />
                The current listing asking price is a confirmed reduced price.
                No previous price or discount will be claimed.
              </label>
            )}
            {family === 'coming-soon' && (
              <div className="jl-notice">
                <h3>Choose what may be revealed</h3>
                <p>
                  The public area and enquiry contact are used by default.
                  Unchecked details are excluded from saved drafts, previews and
                  downloads.
                </p>
                {[
                  ['revealTitle', 'Reveal the listing headline'],
                  ['revealPrice', 'Reveal the asking price'],
                  ['revealFacts', 'Reveal the listing facts and description'],
                  ['revealPhotos', 'Use the listing photos'],
                ].map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={builder.settings[key]}
                      onChange={(event) =>
                        changeSettings({ [key]: event.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {['coming-soon', 'just-sold'].includes(family) && (
              <label>
                <input
                  type="checkbox"
                  checked={builder.settings.publicationConfirmed}
                  onChange={(event) =>
                    changeSettings({
                      publicationConfirmed: event.target.checked,
                    })
                  }
                />
                {family === 'just-sold'
                  ? 'These public area details and listing photos are approved for a sold campaign. No sale price, buyer or seller details will be included.'
                  : 'I confirm permission to use the selected teaser details and photos.'}
              </label>
            )}
            <div className="jl-listings">
              {propertyItems(builder).map((item, index) => {
                const source = item.source,
                  photo = currents[index]?.images?.find(
                    (image) => image.id === source.imageId,
                  )
                return (
                  <article className="jl-mini-preview" key={item.listingId}>
                    {photo ? (
                      <img src={photo.url} alt={source.title} />
                    ) : (
                      <div className="jl-no-image">
                        <Image size={28} />
                        {family === 'coming-soon' &&
                        !builder.settings.revealPhotos
                          ? 'Area-only teaser — no listing photos'
                          : 'No saved cover photo'}
                      </div>
                    )}
                    <div>
                      <h3>{source.title}</h3>
                      <p>{source.location}</p>
                      {source.price && <strong>{source.price}</strong>}
                      <p>{source.facts}</p>
                      <p>
                        {source.agentName} · {source.agencyName}
                      </p>
                      <p>{source.destination}</p>
                      {!currents[index]?.source.agentName && (
                        <label>
                          Public agent name
                          <input
                            value={source.agentName}
                            maxLength={120}
                            onChange={(event) =>
                              changeContact(
                                index,
                                'agentName',
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      )}
                      {!currents[index]?.source.destination && (
                        <label>
                          Public enquiry contact
                          <input
                            value={source.destination}
                            maxLength={240}
                            onChange={(event) =>
                              changeContact(
                                index,
                                'destination',
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      )}
                      {!['en-ZA', 'af-ZA'].includes(
                        currents[index]?.source.language,
                      ) && (
                        <label>
                          Campaign language
                          <select
                            value={source.language}
                            onChange={(event) =>
                              changeContact(
                                index,
                                'language',
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Choose</option>
                            <option value="en-ZA">English</option>
                            <option value="af-ZA">Afrikaans</option>
                          </select>
                        </label>
                      )}
                      <a
                        href={`/agent/listings/${item.listingId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open listing
                      </a>
                    </div>
                  </article>
                )
              })}
            </div>
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
        {!busy && builder && step === 3 && (
          <>
            <h2>Your campaign draft is ready to review</h2>
            <div
              className="jl-channel-tabs"
              role="group"
              aria-label="Preview channel"
            >
              {[
                ['social', 'Social post'],
                ['email', 'Email'],
                ['whatsapp', 'WhatsApp'],
              ].map(([key, label]) => (
                <button
                  className="mc-button"
                  aria-pressed={channel === key}
                  key={key}
                  onClick={() => setChannel(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <article className="jl-copy-preview">
              <div>
                <h3>{content[channel]?.title}</h3>
                <p className="jl-copy">{content[channel]?.body}</p>
              </div>
            </article>
            <details className="jl-wording">
              <summary>Edit wording</summary>
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
            <p>
              After saving, open Assets & drafts for your downloadable pack and
              channel drafts.
            </p>
          </>
        )}
        <footer className="jl-actions">
          <button
            className="mc-button"
            onClick={step > 1 ? () => setStep(step - 1) : onCancel}
          >
            <ArrowLeft size={16} />
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          {builder && step === 2 && (
            <button
              className="mc-button mc-primary"
              disabled={gaps.length > 0}
              onClick={preview}
            >
              Confirm and preview <ArrowRight size={16} />
            </button>
          )}
          {builder && step === 3 && (
            <button className="mc-button mc-primary" onClick={save}>
              <Save size={16} />
              {saving ? 'Saving draft…' : 'Save campaign draft'}
            </button>
          )}
        </footer>
      </fieldset>
    </section>
  )
}
