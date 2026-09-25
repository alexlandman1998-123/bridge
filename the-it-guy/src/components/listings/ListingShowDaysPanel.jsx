import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Clock3, Copy, ExternalLink, Loader2, MapPin, Plus, UserRound } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
import {
  canPersistMarketingEvents,
  createMarketingEvent,
  listMarketingEvents,
} from '../../services/marketingEventRepository'
import {
  buildListingShowDayPayload,
  buildListingShowDayRsvpPath,
  validateListingShowDayDraft,
} from '../../services/listings/listingShowDayModel'

function initialValues(listing = {}) {
  return {
    title: listing.title ? `Show Day · ${listing.title}` : 'Show Day',
    date: '',
    startTime: '10:00',
    endTime: '14:00',
    hostName: listing.agentName || '',
    hostUserId: listing.agentId || '',
    visibility: 'public',
    registrationMessage: '',
  }
}

function formatEventDate(event = {}) {
  if (!event.startsAt) return event.date || 'Date to be confirmed'
  const date = new Date(event.startsAt)
  if (Number.isNaN(date.valueOf())) return event.date || 'Date to be confirmed'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export default function ListingShowDaysPanel({ organisationId = '', listing = {}, publicListingReady = false }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(() => initialValues(listing))
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [createdEvent, setCreatedEvent] = useState(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (!organisationId || !listing.id || !canPersistMarketingEvents(organisationId)) {
      setEvents([])
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const rows = await listMarketingEvents(organisationId, 'showDays')
      setEvents(rows.filter((event) => String(event.listingId || '') === String(listing.id)))
    } catch (refreshError) {
      setLoadError(refreshError?.message || 'Show days could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [listing.id, organisationId])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!open) setValues(initialValues(listing))
  }, [listing, open])

  const rsvpPath = useMemo(() => buildListingShowDayRsvpPath(createdEvent), [createdEvent])
  const rsvpUrl = rsvpPath && typeof window !== 'undefined' ? `${window.location.origin}${rsvpPath}` : ''
  const detailPath = createdEvent?.id ? `/marketing?section=show-days&view=detail&id=${encodeURIComponent(createdEvent.id)}` : ''

  function openCreate() {
    setValues(initialValues(listing))
    setCreatedEvent(null)
    setError('')
    setNotice('')
    setOpen(true)
  }

  function closeCreate() {
    if (saving) return
    setOpen(false)
    setCreatedEvent(null)
    setError('')
    setNotice('')
  }

  function update(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  async function save(publish) {
    setError('')
    setNotice('')
    const errors = validateListingShowDayDraft(values, { listing, publicListingReady, publish })
    if (errors.length) {
      setError(errors.join(' '))
      return
    }
    if (!canPersistMarketingEvents(organisationId)) {
      setError('Shared show days are unavailable until this organisation is connected to Supabase.')
      return
    }
    setSaving(publish ? 'publish' : 'draft')
    try {
      const event = await createMarketingEvent(
        organisationId,
        'showDays',
        buildListingShowDayPayload(listing, values, { publish }),
      )
      setCreatedEvent(event)
      setNotice(publish
        ? 'Show day published. The RSVP link is ready to share.'
        : 'Draft saved. Open it from Marketing → Events → Show Days when you are ready to publish.')
      await refresh()
    } catch (saveError) {
      setError(saveError?.message || 'The show day could not be saved.')
    } finally {
      setSaving('')
    }
  }

  async function copyRsvpLink() {
    if (!rsvpUrl) return
    try {
      await navigator.clipboard.writeText(rsvpUrl)
      setNotice('RSVP link copied.')
    } catch {
      setError('The RSVP link could not be copied. Open it and copy the address from your browser.')
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
        <div className="flex flex-col gap-3 border-b border-[#edf2f7] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#142132]">Show Days</h3>
            <p className="mt-1 text-sm text-[#607387]">Create a listing-linked event and share its RSVP page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/marketing?section=show-days" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] transition hover:border-[#b7c8db] hover:bg-[#f7fbff]">
              View all show days
              <ExternalLink size={14} />
            </Link>
            <Button type="button" size="sm" onClick={openCreate} disabled={!listing.id || !organisationId}>
              <Plus size={15} />
              Create show day
            </Button>
          </div>
        </div>
        {loadError ? <p role="alert" className="border-b border-[#f1c6c2] bg-[#fff5f5] px-5 py-3 text-sm font-semibold text-[#a13b35]">{loadError}</p> : null}
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-5 text-sm font-semibold text-[#607387]"><Loader2 size={16} className="animate-spin" /> Loading show days…</div>
        ) : events.length ? (
          <div className="divide-y divide-[#edf2f7]">
            {events.slice(0, 3).map((event) => (
              <div key={event.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#142132]">{event.title}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#607387]"><MapPin size={12} /> {event.address || listing.address}</p>
                </div>
                <div className="text-xs font-medium text-[#607387]">
                  <p className="inline-flex items-center gap-1"><CalendarDays size={12} /> {formatEventDate(event)}</p>
                  <p className="mt-1 inline-flex items-center gap-1"><Clock3 size={12} /> {event.time || 'Time to be confirmed'}</p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbfd] px-2.5 py-1 text-[0.68rem] font-semibold text-[#47627c]">{event.status}</span>
                  <Link to={`/marketing?section=show-days&view=detail&id=${encodeURIComponent(event.id)}`} className="text-xs font-semibold text-[#1f4f78] hover:underline">Open</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-5 text-sm text-[#607387]">No show days have been created for this listing yet.</div>
        )}
      </section>

      <Modal
        open={open}
        onClose={closeCreate}
        title="Create show day"
        subtitle="Property details and media come directly from this listing."
        className="max-w-4xl"
        footer={createdEvent ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeCreate}>Close</Button>
            {detailPath ? <Link to={detailPath} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-4 text-sm font-semibold text-[#35546c]">Open in Show Days <ExternalLink size={14} /></Link> : null}
            {rsvpPath && String(createdEvent.status || '').toLowerCase() === 'upcoming' ? <a href={rsvpPath} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#123955] px-4 text-sm font-semibold text-white">Preview RSVP page <ExternalLink size={14} /></a> : null}
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeCreate} disabled={Boolean(saving)}>Cancel</Button>
            <Button type="button" variant="secondary" onClick={() => void save(false)} disabled={Boolean(saving)}>{saving === 'draft' ? <Loader2 size={15} className="animate-spin" /> : null}Save draft</Button>
            <Button type="button" onClick={() => void save(true)} disabled={Boolean(saving) || !publicListingReady}>{saving === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}Publish and create RSVP</Button>
          </div>
        )}
      >
        {createdEvent ? (
          <div className="grid gap-4">
            <div className="rounded-[16px] border border-[#cfe7d7] bg-[#eef9f2] p-4 text-sm text-[#257044]">
              <p className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 size={17} /> {notice}</p>
            </div>
            {rsvpUrl && String(createdEvent.status || '').toLowerCase() === 'upcoming' ? (
              <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8294aa]">Shareable RSVP link</p>
                <p className="mt-2 break-all text-sm font-semibold text-[#243d56]">{rsvpUrl}</p>
                <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => void copyRsvpLink()}><Copy size={14} />Copy RSVP link</Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-5">
            <section className="overflow-hidden rounded-[16px] border border-[#dce6f2] bg-[#fbfdff]">
              <div className="grid gap-4 p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                <div className="h-28 overflow-hidden rounded-[12px] bg-[#eaf0f5]">
                  {listing.image ? <img src={listing.image} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs font-semibold text-[#8294aa]">No listing image</div>}
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[#142132]">{listing.title || 'Untitled listing'}</p>
                  <p className="mt-2 inline-flex items-start gap-2 text-sm text-[#607387]"><MapPin size={15} className="mt-0.5 shrink-0" /> {listing.address || 'Address to be confirmed'}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#35546c]"><UserRound size={15} /> {listing.agentName || 'Host agent not assigned'}</p>
                  {listing.images?.length > 1 ? <p className="mt-2 text-xs font-semibold text-[#607387]">{listing.images.length} listing images linked to this event</p> : null}
                </div>
              </div>
              {listing.images?.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto border-t border-[#e4ebf2] px-4 py-3">
                  {listing.images.slice(0, 8).map((image, index) => <img key={image} src={image} alt={`Listing media ${index + 1}`} className="h-14 w-20 shrink-0 rounded-[9px] object-cover" />)}
                </div>
              ) : null}
            </section>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 sm:col-span-2"><span className="text-sm font-semibold text-[#2d445e]">Event title</span><Field value={values.title} onChange={update('title')} /></label>
              <label className="grid gap-2"><span className="text-sm font-semibold text-[#2d445e]">Date</span><Field type="date" min={new Date().toISOString().slice(0, 10)} value={values.date} onChange={update('date')} /></label>
              <label className="grid gap-2"><span className="text-sm font-semibold text-[#2d445e]">Host agent</span><Field value={values.hostName} onChange={update('hostName')} placeholder="Host agent" /></label>
              <label className="grid gap-2"><span className="text-sm font-semibold text-[#2d445e]">Start time</span><Field type="time" value={values.startTime} onChange={update('startTime')} /></label>
              <label className="grid gap-2"><span className="text-sm font-semibold text-[#2d445e]">End time</span><Field type="time" value={values.endTime} onChange={update('endTime')} /></label>
              <label className="grid gap-2 sm:col-span-2"><span className="text-sm font-semibold text-[#2d445e]">RSVP message</span><Field as="textarea" rows={3} maxLength={300} value={values.registrationMessage} onChange={update('registrationMessage')} placeholder="Add parking instructions, access details, or a welcome message." /></label>
            </div>
            {!publicListingReady ? <p className="rounded-[14px] border border-[#f1dfb8] bg-[#fff8e8] px-4 py-3 text-sm font-semibold text-[#8a641d]">You can save a draft now. Publish the property on at least one channel before activating the public RSVP link.</p> : null}
            {error ? <p role="alert" className="rounded-[14px] border border-[#f1c6c2] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#a13b35]">{error}</p> : null}
          </div>
        )}
      </Modal>
    </>
  )
}
