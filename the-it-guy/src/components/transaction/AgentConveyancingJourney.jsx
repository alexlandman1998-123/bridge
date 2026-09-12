import SharedLegalJourney from './SharedLegalJourney'

// Observe the persisted journey; never reconstruct tasks from a fallback template.
export default function AgentConveyancingJourney({ result, loading = false, onOpenActivity }) {
  return <section className="space-y-4" data-agent-conveyancing>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-textStrong">Conveyancing</h2>
      <button type="button" onClick={onOpenActivity} className="rounded-lg border border-borderDefault bg-white px-4 py-2 text-sm font-semibold text-textStrong focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">View updates</button>
    </header>
    {loading && result?.status !== 'ready'
      ? <p role="status" className="rounded-xl border border-borderDefault bg-white p-4 text-sm text-textMuted">Loading legal journey…</p>
      : <SharedLegalJourney result={result} showConversation={false} />}
  </section>
}
