import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, MoreHorizontal, X } from 'lucide-react';

export default function RentalLeadActionsMenu({ lead, onOpen, onLost, disabled }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);
  useEffect(() => {
    if (!position) return undefined;
    const dismiss = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setPosition(null);
    };
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      setPosition(null);
      triggerRef.current?.focus();
    };
    const close = () => setPosition(null);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('click', dismiss, true);
    document.addEventListener('focusin', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    menuRef.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('click', dismiss, true);
      document.removeEventListener('focusin', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [position]);
  return <>
    <button
      ref={triggerRef}
      type="button"
      data-rental-control="lead-actions"
      aria-label={`Actions for ${lead.name}`}
      aria-expanded={Boolean(position)}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (position) { setPosition(null); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        setPosition({ left: Math.max(8, Math.min(rect.right - 192, window.innerWidth - 200)), ...(rect.bottom + 110 > window.innerHeight ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) });
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#dbe4ee] bg-white text-[#5b7289] hover:bg-[#f5f9fc] disabled:opacity-60"
    ><MoreHorizontal size={18} aria-hidden="true" /></button>
    {position ? createPortal(<div
      ref={menuRef}
      role="group"
      aria-label={`Lead actions for ${lead.name}`}
      style={position}
      className="fixed z-[70] w-48 rounded-[14px] border border-[#dbe4ee] bg-white p-1.5 shadow-lg"
      onClick={(event) => { event.stopPropagation(); setPosition(null); }}
    >
      <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[#20364d] hover:bg-[#f5f9fc]" onClick={() => onOpen(lead)}><ArrowUpRight size={16} aria-hidden="true" />Open lead</button>
      <button type="button" disabled={lead.outcome?.status === 'lost'} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[#9a4038] hover:bg-[#fff5f4] disabled:opacity-50" onClick={() => onLost(lead)}><X size={16} aria-hidden="true" />Mark as lost</button>
    </div>, document.body) : null}
  </>;
}
