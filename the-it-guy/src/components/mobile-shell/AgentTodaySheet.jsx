import { ArrowLeft, ArrowRight, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const LABELS = { appointments: 'Appointments', followUps: 'Follow-ups', deals: 'Deals to move' }
const EMPTY = { appointments: 'No appointments scheduled for today or upcoming.', followUps: 'No open follow-ups.', deals: 'No deals have a recorded next action.' }

export default function AgentTodaySheet({ selection, today, onClose, onOpen, onRefresh }) {
  const dialogRef = useRef(null)
  const [item, setItem] = useState(selection.item || null)
  const category = selection.category || selection.item?.kind

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])

  function openItem(next) {
    if (next.kind === 'deals' && next.to) { onClose(); onOpen(next.to); return }
    setItem(next)
  }

  return (
    <dialog ref={dialogRef} className="agent-today-sheet" aria-labelledby="agent-today-sheet-title" onCancel={onClose} onClick={(event) => {
      if (event.target !== dialogRef.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
      <header className="agent-today-sheet-header">
        {item && selection.category && <button type="button" aria-label={`Back to ${LABELS[category].toLowerCase()}`} onClick={() => setItem(null)}><ArrowLeft size={20} aria-hidden="true" /></button>}
        <div><p>{item ? LABELS[category] : 'Today'}</p><h2 id="agent-today-sheet-title">{item?.title || LABELS[category]}</h2></div>
        <button type="button" aria-label="Close details" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      {item ? <div className="agent-today-detail">
        {item.body && <p>{item.body}</p>}
        <dl>
          <div><dt>{item.kind === 'followUps' ? 'Due' : 'When'}</dt><dd>{item.meta}</dd></div>
          {item.status && <div><dt>Status</dt><dd>{item.status}</dd></div>}
          {item.location && <div><dt>Location</dt><dd>{item.location}</dd></div>}
          {item.assignedName && <div><dt>Assigned to</dt><dd>{item.assignedName}</dd></div>}
        </dl>
        {item.description && <p className="agent-today-notes">{item.description}</p>}
        {item.to && <button className="agent-page-link" type="button" onClick={() => { onClose(); onOpen(item.to) }}>Open related deal<ArrowRight size={17} aria-hidden="true" /></button>}
      </div> : <div className="agent-today-sheet-list">
        {!today.available[category] ? <><p>We couldn’t load {LABELS[category].toLowerCase()}.</p><button type="button" className="agent-page-link" onClick={() => { onClose(); onRefresh() }}>Try again<ArrowRight size={17} aria-hidden="true" /></button></>
          : today.items[category].length ? today.items[category].map((entry) => <button className="agent-today-sheet-row" type="button" key={entry.id} onClick={() => openItem(entry)}><span><strong>{entry.title}</strong>{entry.body && <span>{entry.body}</span>}<small>{entry.meta}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)
            : <p>{EMPTY[category]}</p>}
      </div>}
    </dialog>
  )
}
