import { CalendarDays, Clock3 } from 'lucide-react'

const EMPTY_MESSAGES = {
  not_requested: 'No preferred viewing times have been shared yet.',
  requested: 'The viewing request is prepared. Delivery has not been confirmed.',
  awaiting_response: 'Waiting for the buyer to share their preferred times.',
  booked: 'A viewing is booked. Check Appointments for the confirmed details.',
  delivery_failed: 'The request could not be sent.',
  delivery_suppressed: 'The request was not delivered to the buyer.',
  expired: 'The viewing request has expired.',
  submitted: 'The buyer responded without sharing preferred times.',
}

export default function BuyerViewingRequestCard({ summary, propertyNames = [], buyerNotes = '' }) {
  const hasTimes = summary.proposedTimes.length > 0
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#d8e7e0] bg-white shadow-[0_12px_34px_rgba(31,54,78,0.045)]" data-testid="buyer-viewing-request-status">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6efe9] bg-[#f6faf8] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border border-[#d7e9df] bg-white text-[#257451]" aria-hidden="true"><CalendarDays className="h-5 w-5" /></span>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#6f887a]">Viewing request</p>
            <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-[#102033]">Preferred viewing times</h3>
          </div>
        </div>
        <span className="rounded-full border border-[#dce8e1] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#527160]">{summary.status === 'submitted' ? 'Times received' : summary.badge}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {hasTimes ? (
          <>
            <p className="text-sm leading-6 text-[#60758b]">{summary.hasEarlierResponse ? 'Times from the buyer’s previous response:' : 'The buyer would like to view at:'}</p>
            <ol className="mt-4 space-y-2.5">
              {summary.proposedTimes.map((time, index) => (
                <li key={`${index}-${time}`} className="flex items-start gap-3 rounded-[14px] border border-[#e0ebe5] bg-[#f8fbf9] px-4 py-3">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#398162]" aria-hidden="true" />
                  <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#183d2b]">{time}</p>
                </li>
              ))}
            </ol>
            {propertyNames.length ? <p className="mt-4 text-xs leading-5 text-[#60758b]">For {propertyNames.join(', ')}</p> : null}
            {buyerNotes ? <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-[#cce1d4] pl-3 text-sm leading-6 text-[#526a61]">{buyerNotes}</p> : null}
            <p className="mt-4 text-xs leading-5 text-[#789082]">{summary.hasEarlierResponse ? 'A newer request is awaiting a response.' : summary.status === 'booked' ? 'Check Appointments for the confirmed details.' : 'Buyer preferences — the appointment still needs to be confirmed.'}</p>
          </>
        ) : (
          <div className="flex flex-1 items-center rounded-[14px] border border-dashed border-[#dce7e0] bg-[#fbfdfc] px-4 py-6">
            <p className="text-sm leading-6 text-[#60758b]">{summary.isLoading ? 'Checking the buyer’s preferred times…' : EMPTY_MESSAGES[summary.status] || EMPTY_MESSAGES.not_requested}</p>
          </div>
        )}
        {summary.error ? <p className="mt-3 text-xs leading-5 text-[#a43f2c]" role="status">Couldn’t refresh viewing preferences. Please reload this page.</p> : null}

      </div>
    </section>
  )
}
