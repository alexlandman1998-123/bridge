import SharedLegalJourney from './SharedLegalJourney'

// Reuse the shared legal projection, with no duplicate checklist or local status.
// Developers observe the attorney's work; this component grants no task controls.
export default function DeveloperConveyancingJourney({ result, loading = false }) {
  return <section className="space-y-4" data-developer-conveyancing>
    {loading && result?.status !== 'ready' ? <p role="status" className="rounded-xl border border-borderDefault bg-white p-4 text-sm text-textMuted">Loading legal journey…</p>
      : <SharedLegalJourney result={result} showConversation={false} horizontal />}
  </section>
}
