import { useMemo, useState } from 'react'
import {
  downloadAppointmentICS,
  downloadAppointmentICSFromAppointment,
  getGoogleCalendarLink,
  getOutlookCalendarLink,
} from '../../services/appointmentCalendarInviteService'

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function hasAppointmentIdentity(appointment = {}) {
  return Boolean(toText(appointment?.appointmentId || appointment?.appointment_id || appointment?.id))
}

function AppointmentCalendarActions({
  appointment = {},
  compact = false,
  className = '',
  hideGoogleLink = false,
  hideOutlookLink = false,
  onError = null,
  preferServerGeneration = false,
}) {
  const [downloading, setDownloading] = useState(false)

  const googleLink = useMemo(() => {
    try {
      return hideGoogleLink ? '' : getGoogleCalendarLink(appointment)
    } catch {
      return ''
    }
  }, [appointment, hideGoogleLink])

  const outlookLink = useMemo(() => {
    try {
      return hideOutlookLink ? '' : getOutlookCalendarLink(appointment)
    } catch {
      return ''
    }
  }, [appointment, hideOutlookLink])

  async function handleDownload() {
    try {
      setDownloading(true)
      const appointmentId = toText(appointment?.appointmentId || appointment?.appointment_id || appointment?.id)
      if (preferServerGeneration && appointmentId) {
        await downloadAppointmentICS(appointmentId)
      } else {
        downloadAppointmentICSFromAppointment(appointment)
      }
    } catch (error) {
      onError?.(error)
    } finally {
      setDownloading(false)
    }
  }

  const buttonClass = compact
    ? 'inline-flex min-h-[30px] items-center justify-center rounded-[8px] border border-[#d5e1ee] bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]'
    : 'inline-flex min-h-[34px] items-center justify-center rounded-[10px] border border-[#d5e1ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]'

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      <button
        type="button"
        onClick={() => {
          void handleDownload()
        }}
        disabled={downloading}
        className={buttonClass}
      >
        {downloading ? 'Generating…' : 'Download ICS'}
      </button>

      {googleLink ? (
        <a
          href={googleLink}
          target="_blank"
          rel="noreferrer"
          className={buttonClass}
        >
          Google Calendar
        </a>
      ) : null}

      {outlookLink ? (
        <a
          href={outlookLink}
          target="_blank"
          rel="noreferrer"
          className={buttonClass}
        >
          Outlook
        </a>
      ) : null}

      {!hasAppointmentIdentity(appointment) && !googleLink && !outlookLink ? (
        <span className="text-[0.75rem] text-[#7b8ca2]">Calendar invite unavailable</span>
      ) : null}
    </div>
  )
}

export default AppointmentCalendarActions
