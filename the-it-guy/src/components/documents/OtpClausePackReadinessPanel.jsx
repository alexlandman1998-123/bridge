import { CheckCircle2, CircleAlert, Scale } from 'lucide-react'

export function OtpClausePackReadinessPanel({ readiness = null, onNavigate = null }) {
  if (!readiness) return null

  const missingFields = Array.isArray(readiness.missingFields) ? readiness.missingFields : []
  const conflicts = Array.isArray(readiness.conflicts) ? readiness.conflicts : []
  const attorneyReviewItems = Array.isArray(readiness.attorneyReviewItems) ? readiness.attorneyReviewItems : []
  const blocked = !readiness.canGenerate
  const specialistTemplateRequired = readiness.automatedAssemblyAllowed === false

  return (
    <section
      className={`mt-5 rounded-[18px] border px-4 py-4 ${
        blocked ? 'border-[#f1d2c9] bg-[#fff8f5]' : 'border-[#cfe8d8] bg-[#f4fbf6]'
      }`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            blocked ? 'bg-[#fee9e2] text-[#b4472f]' : 'bg-[#dff4e7] text-[#20895a]'
          }`}>
            {blocked ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6c8096]">OTP readiness</p>
            <h3 className="mt-1 text-base font-semibold text-[#142132]">
              {specialistTemplateRequired
                ? 'An attorney-approved specialist template is required'
                : blocked
                  ? 'Complete the deal-specific legal details'
                  : 'This OTP is ready to generate'}
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-[#607387]">
              {specialistTemplateRequired
                ? 'Arch9 recognises this agreement family, but will not force it through the residential resale wording.'
                : <>{readiness.readyPackCount}/{readiness.activePackCount} selected clause groups have the information they need.{blocked ? ' Choose an item below to jump to the right answer.' : ' Arch9 will assemble only the wording selected by these answers.'}</>}
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
          blocked
            ? 'border-[#efc8bd] bg-white text-[#a43b27]'
            : 'border-[#bfe2cc] bg-white text-[#20724e]'
        }`}>
          {specialistTemplateRequired ? 'Specialist route' : blocked ? `${missingFields.length + conflicts.length} to fix` : 'Draft ready'}
        </span>
      </div>

      {missingFields.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Missing OTP information">
          {missingFields.map((issue) => (
            <button
              key={`${issue.packKey || issue.sectionKey}-${issue.fieldKey}`}
              type="button"
              onClick={() => onNavigate?.(issue)}
              className="rounded-xl border border-[#edcec5] bg-white px-3 py-2.5 text-left transition hover:border-[#d79b8d] hover:bg-[#fffdfc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66ff]"
            >
              <span className="block text-xs font-semibold text-[#a43b27]">{issue.placeholderLabel}</span>
              <span className="mt-0.5 block text-[0.68rem] text-[#7e685f]">{issue.sectionLabel} · {issue.packLabel}</span>
            </button>
          ))}
        </div>
      ) : null}

      {conflicts.length ? (
        <div className="mt-3 rounded-xl border border-[#efc8bd] bg-white px-3 py-3" role="alert">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#a42a20]">Conflicting answers</p>
          <ul className="mt-1.5 grid gap-1 text-sm text-[#81261e]">
            {conflicts.map((conflict) => <li key={conflict.code}>• {conflict.message}</li>)}
          </ul>
        </div>
      ) : null}

      {attorneyReviewItems.length ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#eadfc8] bg-white px-3 py-3 text-sm text-[#76502b]">
          <Scale size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Attorney confirmation before signature</p>
            <p className="mt-0.5 text-xs leading-5">
              {attorneyReviewItems.map((item) => item.message).join(' ')} This does not prevent preparation of the draft once the required details above are complete.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
