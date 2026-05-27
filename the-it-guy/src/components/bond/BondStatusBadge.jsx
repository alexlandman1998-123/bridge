import { cn } from '../../lib/utils'

const TONE_CLASS_BY_KEY = Object.freeze({
  neutral: 'border-[#dbe5f0] bg-[#f8fbff] text-[#46617b]',
  slate: 'border-[#e2e8f0] bg-[#f8fafc] text-[#66758b]',
  blue: 'border-[#d7e4f8] bg-[#f7fbff] text-[#204b84]',
  indigo: 'border-[#d9def8] bg-[#f8f9ff] text-[#4154a3]',
  emerald: 'border-[#d5e9dc] bg-[#f5fcf8] text-[#25724b]',
  amber: 'border-[#f2dfb5] bg-[#fffaf0] text-[#8a5a12]',
  rose: 'border-[#efcfd6] bg-[#fff5f7] text-[#9b394d]',
})

const STATUS_TO_TONE = Object.freeze({
  active: 'blue',
  awaiting_contact: 'amber',
  new_request: 'slate',
  docs_requested: 'amber',
  documents_required: 'amber',
  docs_received: 'blue',
  ready_for_submission: 'blue',
  application_submitted: 'blue',
  submitted: 'blue',
  bank_reviewing: 'indigo',
  bank_feedback: 'indigo',
  approval_granted: 'emerald',
  approved: 'emerald',
  grant_signed: 'indigo',
  instruction_sent: 'blue',
  registered: 'emerald',
  awaiting_instruction: 'amber',
  in_transfer: 'neutral',
  at_risk: 'rose',
  overdue: 'rose',
  declined: 'rose',
  cancelled: 'slate',
  compliance_review: 'amber',
  compliance_flag: 'rose',
  client_portal_active: 'blue',
})

export default function BondStatusBadge({
  label = '',
  status = 'neutral',
  tone = '',
  className = '',
}) {
  const resolvedTone = tone || STATUS_TO_TONE[status] || 'neutral'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
        TONE_CLASS_BY_KEY[resolvedTone] || TONE_CLASS_BY_KEY.neutral,
        className,
      )}
    >
      {label}
    </span>
  )
}
