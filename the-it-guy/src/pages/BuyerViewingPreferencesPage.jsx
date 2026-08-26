import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, Home, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  BUYER_INTAKE_QUALIFICATION_FIELDS,
  buildBuyerQualificationIntake,
} from '../services/buyerIntakeModel.js'

const BUYER_MOVE_TIMEFRAME_OPTIONS = ['', 'Immediately', '1-3 months', '3-6 months', '6+ months', 'Just browsing']
const BUYER_FINANCE_TYPE_OPTIONS = ['', 'Bond', 'Cash', 'Cash + bond', 'Not sure']
const BUYER_SUBJECT_TO_FINANCE_OPTIONS = ['', 'Yes', 'No', 'Unsure']
const BUYER_PRE_APPROVAL_OPTIONS = ['', 'Not started', 'Pre-approved', 'Submitted', 'Needs bond originator', 'Cash buyer']
const BUYER_PROPERTY_TO_SELL_OPTIONS = ['', 'No', 'Yes', 'Unsure']
const BUYER_QUALIFICATION_FORM_DEFAULTS = Object.fromEntries(
  BUYER_INTAKE_QUALIFICATION_FIELDS.map(({ key }) => [key, '']),
)

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getTodayInputValue() {
  return new Date().toLocaleDateString('en-CA')
}

function buildEmptyAvailabilityWindows() {
  return Array.from({ length: 3 }, () => ({ date: '', startTime: '', endTime: '' }))
}

function formatAvailabilityWindowLabel({ date = '', startTime = '', endTime = '' } = {}) {
  if (!date || !startTime || !endTime) return ''
  const [year, month, day] = date.split('-').map(Number)
  const displayDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : null
  const dateLabel = displayDate && !Number.isNaN(displayDate.getTime())
    ? displayDate.toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    : date
  return `${dateLabel}, ${startTime}-${endTime}`
}

function buildAvailabilitySlot({ date = '', startTime = '', endTime = '' } = {}) {
  const label = formatAvailabilityWindowLabel({ date, startTime, endTime })
  return {
    date,
    startTime,
    endTime,
    startAt: date && startTime ? `${date}T${startTime}:00` : '',
    endAt: date && endTime ? `${date}T${endTime}:00` : '',
    label,
  }
}

function isAvailabilityWindowComplete(window = {}) {
  return Boolean(window.date && window.startTime && window.endTime)
}

function isAvailabilityWindowRangeValid(window = {}) {
  if (!isAvailabilityWindowComplete(window)) return false
  return window.endTime > window.startTime
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

function buildBuyerQualificationFormFromResponse(response = {}) {
  const intake = response?.buyerIntake || response?.buyer_intake || {}
  const answers = intake?.qualification?.answers || intake?.qualificationAnswers || response?.qualificationAnswers || response?.qualification_answers || {}
  return {
    ...BUYER_QUALIFICATION_FORM_DEFAULTS,
    ...Object.fromEntries(
      BUYER_INTAKE_QUALIFICATION_FIELDS.map(({ key }) => [key, normalizeText(answers[key])]),
    ),
  }
}

function BuyerViewingPreferencesPage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [qualificationForm, setQualificationForm] = useState(BUYER_QUALIFICATION_FORM_DEFAULTS)
  const [propertyResponses, setPropertyResponses] = useState({})
  const [availabilityWindows, setAvailabilityWindows] = useState(buildEmptyAvailabilityWindows)
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
        setQualificationForm(buildBuyerQualificationFormFromResponse(nextSession?.response || {}))
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
  const qualificationAnsweredCount = useMemo(() => (
    BUYER_INTAKE_QUALIFICATION_FIELDS.filter(({ key }) => normalizeText(qualificationForm[key])).length
  ), [qualificationForm])
  const selectedTimeCount = useMemo(() => (
    availabilityWindows.filter(isAvailabilityWindowComplete).length
  ), [availabilityWindows])

  function updateAvailabilityWindow(index, patch) {
    setAvailabilityWindows((previous) => previous.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )))
  }

  function updateQualificationField(key, value) {
    setQualificationForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    const availabilitySlots = availabilityWindows.map(buildAvailabilitySlot)
    const windows = availabilitySlots.map((slot) => normalizeText(slot.label)).filter(Boolean)
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
    if (availabilitySlots.some((slot) => !isAvailabilityWindowComplete(slot))) {
      setErrorMessage('Please select a date, start time, and end time for all three options.')
      return
    }
    if (availabilityWindows.some((window) => !isAvailabilityWindowRangeValid(window))) {
      setErrorMessage('Each viewing option needs an end time after the start time.')
      return
    }

    setSubmitting(true)
    try {
      const now = new Date().toISOString()
      const buyerIntake = buildBuyerQualificationIntake(qualificationForm, {
        existingIntake: session?.response?.buyerIntake || session?.response?.buyer_intake || {},
        capturedAt: normalizeText(session?.response?.buyerIntake?.capturedAt || session?.response?.buyer_intake?.capturedAt || session?.submittedAt) || now,
        updatedAt: now,
        qualifiedAt: '',
      })
      const { data, error } = await invokeEdgeFunction('buyer-viewing-preferences', {
        body: {
          action: 'submit',
          token,
          buyerIntake,
          qualificationAnswers: buyerIntake.qualification?.answers || qualificationForm,
          propertyResponses: responses,
          availabilityWindows: windows,
          availabilitySlots,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg',
          attendeeNotes,
          responseNotes,
        },
      })
      if (error) throw error
      setSession(data?.session || session)
      setSuccessMessage('Your details and viewing times have been sent to the agent.')
    } catch (error) {
      setErrorMessage(error?.message || 'We could not send your details and viewing times.')
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
            Loading your intake
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
          <div className="flex items-center gap-4">
            {normalizeText(session?.organisationLogoLightUrl || session?.organisationLogoUrl || session?.organisationLogoDarkUrl || session?.organisationLogoIconUrl) ? (
              <img
                src={normalizeText(session?.organisationLogoLightUrl || session?.organisationLogoUrl || session?.organisationLogoDarkUrl || session?.organisationLogoIconUrl)}
                alt={`${normalizeText(session?.organisationName) || 'Agency'} logo`}
                className="max-h-12 max-w-[220px] object-contain"
              />
            ) : (
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#D8B15F]">{normalizeText(session?.organisationName) || 'Produktive Real Estate'}</p>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-normal text-white sm:text-4xl">Share a few details, then choose 3 viewing times</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#E5ECF7]">
            {normalizeText(session?.agentName) || 'Your agent'} will review your details and coordinate the best time with the seller.
          </p>
        </header>

        {isClosed ? (
          <section className="rounded-[8px] border border-[#DDE7DF] bg-white p-7 shadow-sm">
            <CheckCircle2 className="mb-4 h-9 w-9 text-[#0F7A5A]" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-[#142132]">
              {session?.status === 'submitted' ? 'Details received' : 'This link is closed'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#526678]">
              {session?.status === 'submitted'
                ? 'The agent has your details and viewing times and will coordinate the next step.'
                : `This viewing preference link ${session?.status === 'expired' ? 'expired' : 'is no longer active'}.`}
            </p>
            {session?.agentEmail ? (
              <p className="mt-5 rounded-[8px] bg-[#F4F7FA] px-4 py-3 text-sm font-semibold text-[#375466]">{session.agentEmail}</p>
            ) : null}
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="grid gap-4">
              <article className="overflow-hidden rounded-[8px] border border-[#DDE7DF] bg-white shadow-sm">
                <div className="border-b border-[#E4ECE6] bg-[#F7FBF8] px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#718398]">Quick buyer details</p>
                  <h2 className="mt-1 text-xl font-bold text-[#142132]">Help us serve you better</h2>
                  <p className="mt-2 text-sm leading-6 text-[#526678]">
                    If you have five minutes, answer as much as you can. These questions help us qualify the lead before we lock in the viewing.
                  </p>
                  <p className="mt-3 inline-flex rounded-full bg-[#EDF4F1] px-3 py-1 text-xs font-bold text-[#0F7A5A]">
                    Optional but helpful · {qualificationAnsweredCount}/{BUYER_INTAKE_QUALIFICATION_FIELDS.length} captured
                  </p>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Budget</span>
                    <input
                      value={qualificationForm.budget}
                      onChange={(event) => updateQualificationField('budget', event.target.value)}
                      placeholder="R 2 500 000"
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Preferred areas</span>
                    <input
                      value={qualificationForm.areaInterest}
                      onChange={(event) => updateQualificationField('areaInterest', event.target.value)}
                      placeholder="Atlantic Seaboard, Durbanville..."
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Move timeframe</span>
                    <select
                      value={qualificationForm.moveTimeframe}
                      onChange={(event) => updateQualificationField('moveTimeframe', event.target.value)}
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] bg-white px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    >
                      {BUYER_MOVE_TIMEFRAME_OPTIONS.map((option) => (
                        <option key={option || 'empty-timeframe'} value={option}>{option || 'Select timeframe'}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Cash or bond</span>
                    <select
                      value={qualificationForm.financeType}
                      onChange={(event) => updateQualificationField('financeType', event.target.value)}
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] bg-white px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    >
                      {BUYER_FINANCE_TYPE_OPTIONS.map((option) => (
                        <option key={option || 'empty-finance'} value={option}>{option || 'Select finance type'}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Subject to finance</span>
                    <select
                      value={qualificationForm.subjectToFinance}
                      onChange={(event) => updateQualificationField('subjectToFinance', event.target.value)}
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] bg-white px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    >
                      {BUYER_SUBJECT_TO_FINANCE_OPTIONS.map((option) => (
                        <option key={option || 'empty-subject'} value={option}>{option || 'Select answer'}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Deposit available</span>
                    <input
                      value={qualificationForm.depositAvailable}
                      onChange={(event) => updateQualificationField('depositAvailable', event.target.value)}
                      placeholder="R 400 000"
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Pre-approval status</span>
                    <select
                      value={qualificationForm.preApprovalStatus}
                      onChange={(event) => updateQualificationField('preApprovalStatus', event.target.value)}
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] bg-white px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    >
                      {BUYER_PRE_APPROVAL_OPTIONS.map((option) => (
                        <option key={option || 'empty-preapproval'} value={option}>{option || 'Select status'}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Need to sell first</span>
                    <select
                      value={qualificationForm.propertyToSell}
                      onChange={(event) => updateQualificationField('propertyToSell', event.target.value)}
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] bg-white px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    >
                      {BUYER_PROPERTY_TO_SELL_OPTIONS.map((option) => (
                        <option key={option || 'empty-property'} value={option}>{option || 'Select answer'}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Property need</span>
                    <input
                      value={qualificationForm.propertyNeed}
                      onChange={(event) => updateQualificationField('propertyNeed', event.target.value)}
                      placeholder="Bedrooms, must-haves, deal breakers"
                      className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    />
                  </label>
                  <label className="grid gap-2 md:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Call notes</span>
                    <textarea
                      value={qualificationForm.additionalNotes}
                      onChange={(event) => updateQualificationField('additionalNotes', event.target.value)}
                      rows={4}
                      placeholder="Any extra details that help us serve you better"
                      className="rounded-[8px] border border-[#DDE7DF] px-3 py-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                    />
                  </label>
                </div>
              </article>

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
                <span className="rounded-full bg-[#EDF4F1] px-3 py-1 text-xs font-bold text-[#0F7A5A]">{selectedTimeCount}/3 ready</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#526678]">
                Select three date and time windows so your agent can match them against the viewing calendar.
              </p>
              <div className="mt-4 grid gap-3">
                {availabilityWindows.map((value, index) => (
                  <div key={index} className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#718398]">Time option {index + 1}</span>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_104px_104px]">
                      <input
                        type="date"
                        value={value.date}
                        min={getTodayInputValue()}
                        onChange={(event) => updateAvailabilityWindow(index, { date: event.target.value })}
                        className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                        aria-label={`Time option ${index + 1} date`}
                        required
                      />
                      <input
                        type="time"
                        value={value.startTime}
                        onChange={(event) => updateAvailabilityWindow(index, { startTime: event.target.value })}
                        className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                        aria-label={`Time option ${index + 1} start time`}
                        required
                      />
                      <input
                        type="time"
                        value={value.endTime}
                        onChange={(event) => updateAvailabilityWindow(index, { endTime: event.target.value })}
                        className="min-h-11 rounded-[8px] border border-[#DDE7DF] px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
                        aria-label={`Time option ${index + 1} end time`}
                        required
                      />
                    </div>
                    {formatAvailabilityWindowLabel(value) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#526678]">
                        <CalendarDays className="h-3.5 w-3.5 text-[#0F7A5A]" aria-hidden="true" />
                        {formatAvailabilityWindowLabel(value)}
                      </span>
                    ) : null}
                  </div>
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
                {submitting ? 'Sending' : 'Send details and 3 viewing times'}
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
