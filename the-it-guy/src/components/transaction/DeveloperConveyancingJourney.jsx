import SharedLegalJourney from './SharedLegalJourney'

// Reuse the shared legal projection, with no duplicate checklist or local status.
// Developers observe the attorney's work; this component grants no task controls.
export default function DeveloperConveyancingJourney({ result, loading = false, onOpenActivity }) {
  return <section className="space-y-4" data-developer-conveyancing>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-textStrong">Conveyancing</h2>
      <button type="button" onClick={onOpenActivity} className="rounded-lg border border-borderDefault bg-white px-4 py-2 text-sm font-semibold text-textStrong focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">Updates &amp; conversation</button>
    </header>
    {loading ? <p role="status" className="rounded-xl border border-borderDefault bg-white p-4 text-sm text-textMuted">Loading legal journey…</p>
      : <SharedLegalJourney result={result} showConversation={false} />}
  </section>
}
