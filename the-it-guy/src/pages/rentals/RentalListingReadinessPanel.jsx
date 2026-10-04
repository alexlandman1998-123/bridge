import { buildRentalChecklistIssues, getRentalPortalReadiness } from '../../services/rentals/rentalListingReadinessPresentation'

function FixButton({ action, onFix, disabled }) {
  return action ? <button type="button" disabled={disabled} onClick={() => onFix(action)} className="mt-2 rounded-lg border border-[#dbe6f2] bg-white px-3 py-2 text-xs font-semibold text-[#1f4f78] disabled:opacity-50">{action.label}</button> : null
}

export default function RentalListingReadinessPanel({ detail, property24Preview, privatePropertyPreview, property24Error, privatePropertyError, checkingProperty24, checkingPrivateProperty, onFix, busy = false }) {
  const checklist = buildRentalChecklistIssues(detail)
  return <section className="space-y-4" aria-label="Rental publishing requirements">
    <section className="rounded-xl border border-[#dbe6f2] bg-white p-4">
      <h2 className="text-base font-semibold text-[#18324b]">Listing checklist</h2>
      <p className="mt-1 text-sm text-[#607387]">{checklist.length ? `${checklist.length} checklist item${checklist.length === 1 ? '' : 's'} to review.` : 'All local checklist items are complete.'} Portal acceptance is checked separately below.</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">{checklist.map(item => <li key={item.key} className="rounded-lg border border-[#edf2f7] p-3"><h3 className="text-sm font-semibold">{item.label}</h3><p className="mt-1 text-sm text-[#607387]">{item.detail}</p>{item.missing.length ? item.missing.map(field => <div key={field.label}><span className="mr-2 text-xs">{field.label}</span><FixButton action={{...field.action,label:`Edit ${field.label.toLowerCase()}`}} onFix={onFix} disabled={busy} /></div>) : <FixButton action={item.action} onFix={onFix} disabled={busy} />}</li>)}</ul>
    </section>
    <div className="grid gap-4 lg:grid-cols-2">{[['property24','Property24',property24Preview,property24Error,checkingProperty24],['private_property','Private Property',privatePropertyPreview,privatePropertyError,checkingPrivateProperty]].map(([channel,label,preview,error,checking]) => {
      const result = getRentalPortalReadiness(channel,preview,{error,checking})
      return <section key={channel} aria-label={`${label} requirements`} className="rounded-xl border border-[#dbe6f2] bg-white p-4">
        <h2 className="text-base font-semibold text-[#18324b]">{label} requirements</h2><p className="mt-2 font-semibold" role="status">{result.state}</p><p className="mt-1 text-sm text-[#607387]" role={error ? 'alert' : undefined}>{result.detail}</p>
        <FixButton action={{kind:'check',channel,label:`Check ${label} requirements`}} onFix={onFix} disabled={busy || checking} />
        {preview && channel === 'property24' ? <p className="mt-2 text-xs text-[#607387]">Photos prepared: {result.imagesLoaded}. Photos that failed: {result.imagesFailed}.</p> : null}
        <ul className="mt-3 space-y-3">{result.issues.map(issue => <li key={issue.key} className="rounded-lg border border-[#f1dfb8] bg-[#fffaf0] p-3"><p className="text-xs font-semibold text-[#8a5b13]">{issue.category} · Required for {label}</p><h3 className="mt-1 text-sm font-semibold">{issue.label}</h3><p className="mt-1 text-sm text-[#607387]">{issue.detail}</p><FixButton action={issue.action} onFix={onFix} disabled={busy} /></li>)}</ul>
        {result.warnings.length ? <section className="mt-3"><h3 className="text-sm font-semibold">Recommendations</h3><p className="text-xs text-[#607387]">These do not block this portal’s readiness check.</p><ul className="mt-2 space-y-2">{result.warnings.map(issue => <li key={issue.key}><p className="text-sm">{issue.label}</p><FixButton action={issue.action} onFix={onFix} disabled={busy} /></li>)}</ul></section> : null}
      </section>
    })}</div>
  </section>
}
