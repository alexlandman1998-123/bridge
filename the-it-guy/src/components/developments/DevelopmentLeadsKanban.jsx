import { ArrowUpRight, Columns3, EyeOff, GripVertical, List, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { DevelopmentLeadAgent, DevelopmentLeadPropertyImage, DevelopmentLeadSource } from './DevelopmentLeadVisuals.jsx'
import DevelopmentLeadContactDemo from './DevelopmentLeadContactDemo.jsx'

export function DevelopmentLeadViewSwitch({ value, onChange }) {
  return <div className="inline-flex rounded-[14px] border border-[#dbe4ee] bg-[#f6f9fc] p-0.5" role="group" aria-label="Lead view">
    {[['list', 'List'], ['kanban', 'Kanban']].map(([id, label]) => (
      <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)} className={`inline-flex min-h-[40px] items-center gap-2 rounded-[12px] px-4 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f7a45] ${value === id ? 'bg-white text-[#163247] shadow-sm' : 'text-[#51667f] hover:text-[#163247]'}`}>
        {id === 'list' ? <List size={15} aria-hidden="true" /> : <Columns3 size={15} aria-hidden="true" />}{label}
      </button>
    ))}
  </div>
}

// Cards receive the same permission-filtered presentation as the list. A view
// switch is read-only; an explicit drag/drop or Move to action requests a move.
export default function DevelopmentLeadsKanban({ columns = [], cards = [], onOpen, onMove, movingId = '' }) {
  const [draggingId, setDraggingId] = useState('')
  const [dropKey, setDropKey] = useState('')
  const canMove = card => Boolean(onMove && card.canMove && !movingId)
  function requestMove(id, key) {
    const card = cards.find(item => item.id === id)
    if (card && canMove(card) && card.columnKey !== key && columns.some(column => column.key === key)) onMove(id, key)
    setDraggingId('')
    setDropKey('')
  }
  const grouped = columns.map(column => ({ ...column, cards: cards.filter(card => card.columnKey === column.key) }))
  return <div className="mt-5 max-w-full overflow-x-auto pb-3" role="region" aria-label="Development leads kanban" tabIndex={0}>
    <div className="flex w-max min-w-full items-start gap-6">
      {grouped.map(column => <section key={column.key} aria-label={`${column.label} leads`} onDragOver={event => { if (!draggingId || movingId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropKey(column.key) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropKey('') }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('application/x-arch9-development-lead'); if (id && id === draggingId) requestMove(id, column.key) }} className={`min-h-[220px] w-[340px] shrink-0 rounded-[18px] border p-4 transition-colors sm:w-[380px] ${dropKey === column.key ? 'border-[#48a77a] bg-[#edf8f1] ring-2 ring-[#cae8d5]' : 'border-[#e3ebf4] bg-[#f8fafc]'}`}>
        <header className="mb-4 flex items-center justify-between gap-3 px-1">
          <h3 className="text-sm font-semibold text-[#35546c]">{column.label}</h3>
          <span className="text-xs font-semibold text-[#7b8ca2]" aria-label={`${column.cards.length} in ${column.label}`}>{column.cards.length}</span>
        </header>
        <div className="space-y-5">
          {column.cards.map(card => <article key={card.id} aria-label={card.name} aria-busy={movingId === card.id} draggable={canMove(card)} onDragStart={event => { if (!canMove(card) || event.target.closest('button,select,a')) { event.preventDefault(); return }; setDraggingId(card.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-arch9-development-lead', card.id); event.dataTransfer.setData('text/plain', card.id) }} onDragEnd={() => { setDraggingId(''); setDropKey('') }} className={`rounded-[16px] border border-[#e3ebf4] bg-white p-5 shadow-sm ${canMove(card) ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingId === card.id ? 'opacity-50' : ''}`}>
            {card.canMove && onMove ? <div className="mb-3 flex items-center justify-between gap-2 text-[#8a9bae]"><GripVertical size={15} aria-hidden="true" />{movingId === card.id ? <span className="inline-flex items-center gap-1.5 text-xs"><LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Saving…</span> : <span className="text-[11px]">Drag to move</span>}</div> : null}
            <div className="flex items-start gap-4">
              <DevelopmentLeadPropertyImage src={card.imageUrl} fallbackSrc={card.fallbackImageUrl} name={card.name} />
              <div className="min-w-0 break-words"><h4 className="text-sm font-semibold text-[#142132]">{card.name}</h4><p className="mt-1 text-xs text-[#6b7d93]">{card.contactLine}</p></div>
            </div>
            <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${card.stage.className}`}>{card.stage.label}</span>
            <div className="mt-4"><DevelopmentLeadSource source={card.source} brand={card.brand} /></div>
            <div className="mt-3"><DevelopmentLeadAgent agent={card.agent} /></div>
            <p className="mt-3 text-xs text-[#6b7d93]">Last activity · {card.lastActivity}</p>
            {card.canMove && onMove ? <label className="mt-3 block"><span className="sr-only">Move {card.name} to stage</span><select aria-label={`Move ${card.name} to stage`} value="" disabled={Boolean(movingId)} onChange={event => requestMove(card.id, event.target.value)} className="min-h-10 w-full rounded-[10px] border border-[#e3ebf4] bg-[#fbfcfe] px-2.5 text-xs text-[#51667f] focus:outline-none focus:ring-2 focus:ring-[#238355]"><option value="">Move to…</option>{columns.filter(item => item.key !== card.columnKey).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : null}
            <div className="mt-4 border-t border-[#edf2f7] pt-3">
              {card.canOpen ? <div className="flex flex-col items-start gap-2"><button type="button" onClick={() => onOpen(card.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-[#edf9f1] px-3 text-xs font-semibold text-[#1f7a43] hover:bg-[#dcf3e4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f7a45]">Open developer lead<ArrowUpRight size={13} aria-hidden="true" /></button><DevelopmentLeadContactDemo /></div> : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748b]"><EyeOff size={13} aria-hidden="true" />{card.accessLabel}</span>}
            </div>
          </article>)}
          {!column.cards.length ? <p className="rounded-[12px] border border-dashed border-[#d8e2ee] px-3 py-6 text-center text-xs text-[#7b8ca2]">No leads in this stage</p> : null}
        </div>
      </section>)}
    </div>
  </div>
}
