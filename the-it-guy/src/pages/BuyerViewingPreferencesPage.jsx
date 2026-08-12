import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Home, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { invokeEdgeFunction } from '../lib/supabaseClient'

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function PropertyImage({ property }) {
  const imageUrl = normalizeText(property?.imageUrl || property?.image_url || property?.image || property?.thumbnailUrl)
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={normalizeText(property?.title) || 'Selected property'}
        className="h-44 w-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-44 w-full items-center justify-center bg-[#EDF4F1] text-[#0F3A2E]">
      <Home className="h-10 w-10" aria-hidden="true" />
    </div>
  )
}

function buildInitialResponses(properties = []) {
  return Object.fromEntries(
    properties.map((property) => [normalizeText(property?.id), true]).filter(([id]) => id),
  )
}

function getSellerAvailabilityText(property = {}) {
  return normalizeText(property?.sellerViewingAvailability || property?.seller_viewing_availability) ||
    normalizeText(property?.sellerViewingAvailabilityWindows || property?.seller_viewing_availability_windows)
}

function BuyerViewingPreferencesPage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [propertyResponses, setPropertyResponses] = useState({})
  const [availabilityWindows, setAvailabilityWindows] = useState(['', '', ''])
  const [attendeeNotes, setAttendeeNotes] = useState('')
  const [responseNotes, setResponseNotes] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setErrorMessage('')
    invokeEdgeFunction('buyer-viewing-preferences', {
      body: { action: 'resolve', token },
    })
      .then(({ data, error }) => {
        if (!active) return
        if (error) throw error
        const nextSession = data?.session || null
        setSession(nextSession)
        setPropertyResponses(buildInitialResponses(Array.isArray(nextSession?.properties) ? nextSession.properties : []))
      })
      .catch((error) => {
        if (active) setErrorMessage(error?.message || 'This viewing link is unavailable.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const properties = useMemo(() => (Array.isArray(session?.properties) ? session.properties : []), [session?.properties])
  const isClosed = ['submitted', 'expired', 'revoked'].includes(normalizeText(session?.status).toLowerCase())
  const confirmedCount = useMemo(() => (
    Object.values(propertyResponses).filter(Boolean).length
  ), [propertyResponses])

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    const windows = availabilityWindows.map(normalizeText).filter(Boolean)
    const responses = properties
      .map((property) => ({
        propertyId: normalizeText(property?.id),
        wantsToView: propertyResponses[normalizeText(property?.id)] === true,
      }))
      .filter((item) => item.propertyId)

    if (!responses.some((item) => item.wantsToView)) {
      setErrorMessage('Choose at least one property you would like to view.')
      return
    }
    if (windows.length !== 3) {
      setErrorMessage('Please add three preferred viewing times.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await invokeEdgeFunction('buyer-viewing-preferences', {
        body: {
          action: 'submit',
          token,
          propertyResponses: responses,
          availabilityWindows: windows,
          attendeeNotes,
          responseNotes,
        },
      })
      if (error) throw error
      setSession(data?.session || session)
      setSuccessMessage('Your viewing preferences have been sent to the agent.')
    } catch (error) {
      setErrorMessage(error?.message || 'We could not send your viewing preferences.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F8F5] px-5 py-8 text-[#142132]">
        <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
          <div className="flex items-center gap-3 rounded-[8px] border border-[#DDE7DF] bg-white px-5 py-4 text-sm font-semibold text-[#375466] shadow-sm">
            <Clock3 className="h-5 w-5 animate-pulse text-[#0F7A5A]" aria-hidden="true" />
            Loading viewing options
          </div>
        </div>
      </main>
    )
  }

  if (errorMessage && !session) {
    return (
      <main className="min-h-screen bg-[#F7F8F5] px-5 py-8 text-[#142132]">
        <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
          <section className="w-full rounded-[8px] border border-[#F1C9C9] bg-white p-7 shadow-sm">
            <AlertTriangle className="mb-4 h-9 w-9 text-[#B42318]" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-[#142132]">Viewing link unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-[#526678]">{errorMessage}</p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F7F8F5] px-5 py-8 text-[#142132]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 rounded-[8px] bg-[#081735] px-6 py-6 text-white shadow-sm sm:px-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#D8B15F]">{normalizeText(session?.organisationName) || 'Produktive Real Estate'}</p>
          <h1 className="mt-4 text-3xl font-bold tracking-normal sm:text-4xl">Choose 3 Viewing Times</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#E5ECF7]">
            {normalizeText(session?.agentName) || 'Your agent'} will review your options and coordinate the best time with the seller.
          </p>
        </header>

        {isClosed ? (
          <section className="rounded-[8px] border border-[#DDE7DF] bg-white p-7 shadow-sm">
            <CheckCircle2 className="mb-4 h-9 w-9 text-[#0F7A5A]" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-[#142132]">
              {session?.status === 'submitted' ? 'Preferences received' : 'This link is closed'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#526678]">
              {session?.status === 'submitted'
                ? 'The agent has your viewing preferences and will coordinate the next step.'
                : `This viewing preference link ${session?.status === 'expired' ? 'expired' : 'is no longer active'}.`}
            </p>
            {session?.agentEmail ? (
              <p className="mt-5 rounded-[8px] bg-[#F4F7FA] px-4 py-3 text-sm font-semibold text-[#375466]">{session.agentEmail}</p>
            ) : null}
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="grid gap-4">
              {properties.map((property, index) => {
                const propertyId = normalizeText(property?.id)
                const wantsToView = propertyResponses[propertyId] === true
                return (
                  <article key={propertyId || `${index}`} className="overflow-hidden rounded-[8px] border border-[#DDE7DF] bg-white shadow-sm">
                    <PropertyImage property={property} />
                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#718398]">Option {index + 1}</p>
                          <h2 className="mt-1 text-xl font-bold text-[#142132]">{normalizeText(property?.title) || 'Selected property'}</h2>
                          <div className="mt-3 grid gap-1 text-sm font-semibold text-[#526678]">
                            {property?.price ? <span>{property.price}</span> : null}
                            {property?.area ? <span>{property.area}</span> : null}
                            {property?.match ? <span>{property.match} match</span> : null}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 overflow-hidden rounded-[8px] border border-[#DDE7DF] text-sm font-bold">
                          <button
                            type="button"
                            onClick={() => setPropertyResponses((previous) => ({ ...previous, [propertyId]: true }))}
                            className={`px-4 py-3 ${wantsToView ? 'bg-[#0F7A5A] text-white' : 'bg-white text-[#375466]'}`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setPropertyResponses((previous) => ({ ...previous, [propertyId]: false }))}
                            className={`px-4 py-3 ${!wantsToView ? 'bg-[#0F7A5A] text-white' : 'bg-white text-[#375466]'}`}
                          >
                            No
                          </button>
                        </div>
                      </div>
                      {property?.link ? (
                        <a href={property.link} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0F2F4F]">
                          View property details
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ) : null}
                      {getSellerAvailabilityText(property) ? (
                        <div className="mt-4 rounded-[8px] border border-[#DDE7DF] bg-[#F4F7FA] px-4 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Owner indicated availability</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#375466]">{getSellerAvailabilityText(property)}</p>
                          {property?.sellerViewingNoticePeriod ? (
                            <p className="mt-2 text-xs font-bold text-[#718398]">Notice: {property.sellerViewingNoticePeriod}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </section>

            <aside className="h-fit rounded-[8px] border border-[#DDE7DF] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-[#142132]">Your 3 Times</h2>
                <span className="rounded-full bg-[#EDF4F1] px-3 py-1 text-xs font-bold text-[#0F7A5A]">{confirmedCount} selected</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#526678]">
                Add three options so your agent has enough flexibility to confirm access quickly.
              </p>
              <div className="mt-4 grid gap-3">
                {availabilityWindows.map((value, index) => (
                  <label key={index} className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Time option {index + 1}</span>
                    <input
                      value={value}
                      onChange={(event) => setAvailabilityWindows((previous) => previous.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                      placeholder={index === 0 ? 'e.g. Thu 13 Aug, 14:00-16:00' : index === 1 ? 'e.g. Fri 14 Aug, 09:00-11:00' : 'e.g. Sat 15 Aug, after 10:00'}
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    />
                  </label>
                ))}
                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Joining you</span>
                  <input
                    value={attendeeNotes}
                    onChange={(event) => setAttendeeNotes(event.target.value)}
                    placeholder="e.g. My partner will join"
                    className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Notes</span>
                  <textarea
                    value={responseNotes}
                    onChange={(event) => setResponseNotes(event.target.value)}
                    rows={4}
                    placeholder="Anything the agent should know"
                    className="rounded-[8px] border border-[#DDE7DF] px-3 py-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                  />
                </label>
              </div>
              {errorMessage ? (
                <p className="mt-4 rounded-[8px] border border-[#F1C9C9] bg-[#FFF7F7] px-3 py-2 text-sm font-semibold text-[#B42318]">{errorMessage}</p>
              ) : null}
              {successMessage ? (
                <p className="mt-4 rounded-[8px] border border-[#CBE7D7] bg-[#F1FBF5] px-3 py-2 text-sm font-semibold text-[#0F7A5A]">{successMessage}</p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#0F7A5A] px-4 text-sm font-bold text-white transition hover:bg-[#0C654B] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Sending' : 'Send 3 viewing times'}
              </button>
              {session?.expiresAt ? (
                <p className="mt-4 text-center text-xs font-semibold text-[#718398]">Link expires {formatDate(session.expiresAt)}</p>
              ) : null}
            </aside>
          </form>
        )}
      </div>
    </main>
  )
}

export default BuyerViewingPreferencesPage
