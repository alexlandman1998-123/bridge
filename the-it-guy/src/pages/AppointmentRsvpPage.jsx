import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function actionToStatus(action = '') {
  const normalized = normalizeText(action).toLowerCase()
  if (normalized === 'accept') return 'Accepted'
  if (normalized === 'decline') return 'Declined'
  if (normalized === 'reschedule') return 'Proposed New Time'
  return ''
}

function statusCopy(status = '') {
  if (status === 'Accepted') return 'Thanks, your attendance has been confirmed.'
  if (status === 'Declined') return 'Thanks, your response has been recorded.'
  if (status === 'Proposed New Time') return 'Thanks, your alternative time request has been sent to the Bridge team.'
  return 'Choose a response for this appointment request.'
}

export default function AppointmentRsvpPage() {
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialAction = normalizeText(searchParams.get('action'))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [participant, setParticipant] = useState(null)
  const [appointment, setAppointment] = useState(null)
  const [selectedAction, setSelectedAction] = useState(initialAction)
  const [rescheduleMessage, setRescheduleMessage] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredStartTime, setPreferredStartTime] = useState('')
  const [preferredEndTime, setPreferredEndTime] = useState('')
  const [resultStatus, setResultStatus] = useState('')

  const selectedStatus = useMemo(() => actionToStatus(selectedAction), [selectedAction])
  const preferredStartIso = useMemo(() => {
    if (selectedStatus !== 'Proposed New Time' || !preferredDate || !preferredStartTime) return null
    const parsed = new Date(`${preferredDate}T${preferredStartTime}`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }, [preferredDate, preferredStartTime, selectedStatus])
  const preferredEndIso = useMemo(() => {
    if (selectedStatus !== 'Proposed New Time' || !preferredDate || !preferredEndTime) return null
    const parsed = new Date(`${preferredDate}T${preferredEndTime}`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }, [preferredDate, preferredEndTime, selectedStatus])

  useEffect(() => {
    let cancelled = false
    async function loadInvitation() {
      setLoading(true)
      setError('')
      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error('Appointment RSVP is not available in this environment.')
        }
        const rsvpResult = await supabase.rpc('get_appointment_rsvp_by_token', { p_token: token })
        if (rsvpResult.error) throw rsvpResult.error
        const row = Array.isArray(rsvpResult.data) ? rsvpResult.data[0] : null
        if (!row) throw new Error('This appointment RSVP link is invalid or has expired.')

        if (!cancelled) {
          setParticipant({
            participant_id: row.participant_id,
            appointment_id: row.appointment_id,
            name: row.participant_name,
            email: row.participant_email,
            participant_role: row.participant_role,
            rsvp_status: row.rsvp_status,
          })
          setAppointment({
            appointment_id: row.appointment_id,
            title: row.appointment_title,
            appointment_type: row.appointment_type,
            appointment_date: row.appointment_date,
            start_time: row.start_time,
            end_time: row.end_time,
            location: row.location,
            meeting_url: row.meeting_url,
            status: row.status,
          })
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Unable to load this appointment RSVP.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadInvitation()
    return () => {
      cancelled = true
    }
  }, [token])

  async function submitResponse(event) {
    event.preventDefault()
    if (!participant?.participant_id || !selectedStatus) return
    setSubmitting(true)
    setError('')
    try {
      const updatePayload = {
        rsvp_status: selectedStatus,
        proposed_new_time: preferredStartIso,
        preferred_end: preferredEndIso,
        rsvp_comment: selectedStatus === 'Proposed New Time' ? normalizeText(rescheduleMessage) || null : null,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const result = await supabase.rpc('submit_appointment_rsvp', {
        p_token: token,
        p_rsvp_status: selectedStatus,
        p_proposed_new_time: updatePayload.proposed_new_time,
        p_preferred_end: updatePayload.preferred_end,
        p_rsvp_comment: updatePayload.rsvp_comment,
      })
      if (result.error) throw result.error
      setResultStatus(selectedStatus)
      setParticipant((previous) => previous ? { ...previous, rsvp_status: selectedStatus } : previous)
    } catch (submitError) {
      setError(submitError?.message || 'Unable to record your RSVP right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f7fb] px-4 py-8 text-[#17263a]">
      <section className="mx-auto max-w-2xl rounded-[24px] border border-[#dbe6f2] bg-white p-6 shadow-[0_18px_45px_rgba(15,35,55,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6d829a]">Bridge Appointment</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#142338]">Appointment Request</h1>
        {loading ? (
          <div className="mt-6 rounded-[16px] border border-[#e0e8f2] bg-[#f8fbff] px-4 py-5 text-sm text-[#5d7289]">
            Loading appointment details...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-[16px] border border-[#f1c8c4] bg-[#fff6f5] px-4 py-5 text-sm text-[#9b2c24]">
            {error}
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-[18px] border border-[#dde7f1] bg-[#f8fbff] p-4">
              <h2 className="text-lg font-semibold text-[#172d43]">{appointment?.title || 'Bridge Appointment'}</h2>
              <div className="mt-3 grid gap-2 text-sm text-[#526b84] md:grid-cols-2">
                <p><span className="font-semibold text-[#203a52]">Date:</span> {appointment?.appointment_date || 'To be confirmed'}</p>
                <p><span className="font-semibold text-[#203a52]">Time:</span> {[appointment?.start_time, appointment?.end_time].filter(Boolean).join(' - ') || 'To be confirmed'}</p>
                <p><span className="font-semibold text-[#203a52]">Location:</span> {appointment?.meeting_url || appointment?.location || 'To be confirmed'}</p>
                <p><span className="font-semibold text-[#203a52]">Invited as:</span> {participant?.participant_role || 'Participant'}</p>
              </div>
            </div>

            {resultStatus ? (
              <div className="mt-5 rounded-[16px] border border-[#cfe6d7] bg-[#effaf2] px-4 py-4 text-sm font-semibold text-[#1f7a43]">
                {statusCopy(resultStatus)}
              </div>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={submitResponse}>
                <div className="grid gap-2 md:grid-cols-3">
                  {[
                    { key: 'accept', label: 'Accept proposed time' },
                    { key: 'decline', label: 'Decline' },
                    { key: 'reschedule', label: 'Request another time' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSelectedAction(option.key)}
                      className={`rounded-[14px] border px-4 py-3 text-sm font-semibold transition ${
                        selectedAction === option.key
                          ? 'border-[#214f75] bg-[#214f75] text-white'
                          : 'border-[#dce6f1] bg-white text-[#294862] hover:border-[#b9ccdf]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {selectedAction === 'reschedule' ? (
                  <div className="grid gap-3 rounded-[16px] border border-[#dce6f1] bg-[#fbfdff] p-4">
                    <label className="grid gap-1 text-sm font-semibold text-[#294862]">
                      Preferred date
                      <input
                        type="date"
                        value={preferredDate}
                        onChange={(event) => setPreferredDate(event.target.value)}
                        className="rounded-[12px] border border-[#d7e2ee] px-3 py-2 text-sm font-normal text-[#17263a] outline-none focus:border-[#214f75]"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold text-[#294862]">
                      Preferred start time
                      <input
                        type="time"
                        value={preferredStartTime}
                        onChange={(event) => setPreferredStartTime(event.target.value)}
                        className="rounded-[12px] border border-[#d7e2ee] px-3 py-2 text-sm font-normal text-[#17263a] outline-none focus:border-[#214f75]"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold text-[#294862]">
                      Preferred end time
                      <input
                        type="time"
                        value={preferredEndTime}
                        onChange={(event) => setPreferredEndTime(event.target.value)}
                        className="rounded-[12px] border border-[#d7e2ee] px-3 py-2 text-sm font-normal text-[#17263a] outline-none focus:border-[#214f75]"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold text-[#294862]">
                      Message
                      <textarea
                        rows={3}
                        value={rescheduleMessage}
                        onChange={(event) => setRescheduleMessage(event.target.value)}
                        className="rounded-[12px] border border-[#d7e2ee] px-3 py-2 text-sm font-normal text-[#17263a] outline-none focus:border-[#214f75]"
                        placeholder="Share a note for the scheduler."
                      />
                    </label>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={!selectedStatus || submitting || (selectedStatus === 'Proposed New Time' && !preferredStartIso)}
                  className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[#214f75] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(33,79,117,0.18)] disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Submit RSVP'}
                </button>
              </form>
            )}
          </>
        )}
        <Link to="/bridge" className="mt-6 inline-flex text-sm font-semibold text-[#214f75]">Back to Bridge</Link>
      </section>
    </main>
  )
}
