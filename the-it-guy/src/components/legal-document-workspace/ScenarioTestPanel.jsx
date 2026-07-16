import { ArrowRight, CheckCircle2, FlaskConical, Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'

export function ScenarioTestPanel({
  results,
  selectedKey,
  previewPath,
  dirty,
  onSelect,
}) {
  const active = results.find((result) => result.key === selectedKey) || results[0]
  if (!active) return null
  const fullPreviewPath = `${previewPath}?scenario=${encodeURIComponent(active.key)}`

  return (
    <section className="rounded-[18px] border border-[#dce5ed] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]" aria-labelledby="scenario-test-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#c9ddd2] bg-[#f2faf5] text-[#16804d]">
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="scenario-test-title" className="text-lg font-semibold text-[#102033]">Test a situation</h2>
            <p className="mt-1 text-sm leading-6 text-[#6f8194]">See which conditional blocks Bridge will include before opening the full document preview.</p>
          </div>
        </div>
        <Link
          to={fullPreviewPath}
          aria-disabled={dirty}
          onClick={(event) => { if (dirty) event.preventDefault() }}
          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold ${dirty ? 'cursor-not-allowed border-[#dce4df] bg-[#f4f7f5] text-[#829087]' : 'border-[#b8d5c4] bg-[#f4fbf6] text-[#176f43] transition hover:border-[#82b696]'}`}
        >
          {dirty ? 'Save before previewing' : 'Open full preview'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sample situations">
        {results.map((result) => {
          const selected = result.key === active.key
          return (
            <button
              key={result.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(result.key)}
              className={`rounded-[12px] border px-3 py-3 text-left transition ${selected ? 'border-[#83bd99] bg-[#eff9f3] shadow-[inset_3px_0_0_#16804d]' : 'border-[#dce5ed] bg-[#fbfcfd] hover:border-[#b9cbd8] hover:bg-white'}`}
            >
              <strong className={`block text-sm font-semibold ${selected ? 'text-[#176f43]' : 'text-[#30455b]'}`}>{result.label}</strong>
              <span className="mt-1 block text-[11px] leading-5 text-[#75879a]">{result.conditionalIncludedCount} conditional block{result.conditionalIncludedCount === 1 ? '' : 's'} included</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-[12px] border border-[#d8e7dd] bg-[#f5fbf7] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#246f47]">
            <Layers3 className="h-4 w-4" aria-hidden="true" />
            {active.includedCount} total blocks
          </div>
          <p className="mt-2 text-xs leading-5 text-[#64806e]">{active.conditionalExcludedCount} conditional block{active.conditionalExcludedCount === 1 ? '' : 's'} excluded for this situation.</p>
        </div>
        <div className="rounded-[12px] border border-[#e0e7ed] bg-[#fbfcfd] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#788a9d]">Conditional wording included</h3>
          {active.includedConditionalBlocks.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {active.includedConditionalBlocks.map((block) => (
                <li key={block.id} className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe3d6] bg-white px-2.5 py-1 text-xs font-semibold text-[#397457]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {block.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[#7c8da0]">No conditional blocks match this sample situation.</p>
          )}
        </div>
      </div>
    </section>
  )
}
