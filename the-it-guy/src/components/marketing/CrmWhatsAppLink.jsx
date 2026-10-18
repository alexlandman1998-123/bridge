import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'

export default function CrmWhatsAppLink({ organisationId, kind, recordId }) {
  if (!organisationId || !recordId) return null
  const params = new URLSearchParams({ section: 'whatsapp', view: 'inbox', organisationId, crmKind: kind, crmRecord: recordId })
  return <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#405b75]" to={`/marketing?${params}`}><MessageCircle size={16} />WhatsApp</Link>
}
