import { CheckCircle2, CircleAlert, FileText } from 'lucide-react'
import {
  describeLegalDocumentCondition,
  formatLegalDocumentFieldLabel,
} from '../../core/documents/legalDocumentWorkspacePresentation'

function getPreviewLines(content = '') {
  return String(content || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\|?\s*:?-{3,}/.test(line))
    .map((line) => line.replace(/^#{1,6}\s*/, '').replace(/^\|\s*|\s*\|$/g, '').replace(/\s*\|\s*/g, ' · '))
    .slice(0, 5)
}

function renderLineWithFields(line = '', lineKey = '') {
  return line.split(/(\{\{\s*[^{}]+?\s*\}\})/g).filter(Boolean).map((part, index) => {
    const tokenMatch = part.match(/^\{\{\s*([^{}]+?)\s*\}\}$/)
    if (tokenMatch) {
      return (
        <span key={`${lineKey}-field-${tokenMatch[1]}-${index}`} className="mx-0.5 inline-flex rounded-[5px] border border-[#c5e1d0] bg-[#eff8f2] px-1.5 py-0.5 font-medium text-[#26764c]" title={tokenMatch[1]}>
          {formatLegalDocumentFieldLabel(tokenMatch[1])}
        </span>
      )
    }
    return <span key={`${lineKey}-text-${index}`}>{part}</span>
  })
}

export function DocumentCanvas({ activeGroup, selectedBlockId, editable, onSelectBlock, onChangeBlock }) {
  const blocks = activeGroup?.blocks || []
  return (
    <section className="min-w-0 rounded-[18px] border border-[#dce5ed] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]" aria-labelledby="document-canvas-title">
      <div className="border-b border-[#e3e9ef] px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7c8ea2]">Document area</p>
        <h2 id="document-canvas-title" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[#102033]">{activeGroup?.label || 'Document'}</h2>
        <p className="mt-2 text-sm leading-6 text-[#687b90]">{activeGroup?.description || 'Select an area to inspect its wording.'}</p>
      </div>

      <div className="max-h-[calc(100vh-290px)] min-h-[560px] space-y-4 overflow-y-auto bg-[#f7f9fb] p-4 sm:p-5">
        {blocks.length ? blocks.map((block, index) => {
          const selected = block.id === selectedBlockId
          const lines = getPreviewLines(block.content)
          const conditionDescription = describeLegalDocumentCondition(block.condition)
          const conditionalLabel = block.classification.conditional && conditionDescription === 'Always included'
            ? 'When situation matches'
            : conditionDescription
          return (
            <article
              key={block.id}
              className={`rounded-[14px] border bg-white transition ${selected
                ? 'border-[#8fc7a5] shadow-[inset_3px_0_0_#16804d,0_9px_22px_rgba(15,127,79,0.07)]'
                : 'border-[#dfe6ed] hover:border-[#bdd3c5]'}`}
            >
              <button
                type="button"
                onClick={() => onSelectBlock(block.id)}
                className="flex w-full items-start justify-between gap-4 px-4 pb-3 pt-4 text-left sm:px-5"
                aria-pressed={selected}
              >
                <span className="min-w-0">
                  <span className="text-xs font-semibold text-[#728398]">{activeGroup.key === 'conditions' ? `Clause ${index + 1}` : `${index + 1}`}</span>
                  <strong className="ml-2 text-sm font-semibold text-[#1f3147]">{block.label}</strong>
                </span>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${block.classification.conditional
                  ? 'border-[#cbe3d4] bg-[#f1faf4] text-[#27764c]'
                  : 'border-[#dce4eb] bg-[#f8fafc] text-[#63768a]'}`}
                >
                  {block.classification.conditional ? <CircleAlert className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                  {conditionalLabel}
                </span>
              </button>
              {selected && editable ? (
                <div className="border-t border-[#dfe9e3] bg-[#fbfefc] px-4 py-4 sm:px-5">
                  <label htmlFor={`block-wording-${block.id}`} className="text-xs font-semibold text-[#3f5f4d]">Legal wording</label>
                  <textarea
                    id={`block-wording-${block.id}`}
                    value={block.content}
                    onChange={(event) => onChangeBlock(block.id, { content: event.target.value })}
                    className="mt-2 min-h-[260px] w-full resize-y rounded-[11px] border border-[#b9d6c4] bg-white px-4 py-3 font-serif text-[15px] leading-7 text-[#273b50] outline-none transition focus:border-[#16804d] focus:ring-2 focus:ring-[#16804d]/15"
                    spellCheck
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#75889b]">
                    <span>Use double braces for data fields, for example {'{{buyer.full_name}}'}.</span>
                    <span>{block.content.length.toLocaleString()} characters</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 border-t border-[#edf1f4] px-4 py-4 text-sm leading-7 text-[#40556c] sm:px-5">
                  {lines.length ? lines.map((line, lineIndex) => (
                    <p key={`${block.id}-line-${lineIndex}`}>{renderLineWithFields(line, `${block.id}-${lineIndex}`)}</p>
                  )) : (
                    <p className="italic text-[#8a99aa]">No wording has been added to this block yet.</p>
                  )}
                  {String(block.content || '').split(/\n+/).filter((line) => line.trim()).length > lines.length ? (
                    <p className="text-xs font-semibold text-[#7890a3]">Additional wording continues in this block.</p>
                  ) : null}
                </div>
              )}
            </article>
          )
        }) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[14px] border border-dashed border-[#d6e1e9] bg-white px-6 text-center">
            <FileText className="h-8 w-8 text-[#9aabba]" aria-hidden="true" />
            <h3 className="mt-3 text-base font-semibold text-[#30445a]">No blocks in this area</h3>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#74869a]">This area will appear when matching document wording is configured.</p>
          </div>
        )}
      </div>
    </section>
  )
}
