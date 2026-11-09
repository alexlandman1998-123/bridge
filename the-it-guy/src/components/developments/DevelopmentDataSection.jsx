export default function DevelopmentDataSection({ names, sections, onRetry, children }) {
  const failed = names.find(name => sections[name]?.status === 'error')
  if (failed) return <div role="alert" className="mt-4 rounded-xl border border-[#f3d2cc] bg-white p-5">
    <p>{sections[failed].error}</p>
    <button type="button" className="mt-3 underline" onClick={onRetry}>Retry loading this section</button>
  </div>
  if (names.some(name => sections[name]?.status !== 'ready')) {
    return <p role="status" className="mt-4 p-5 text-sm text-[#60758c]">Loading section data…</p>
  }
  return children
}
