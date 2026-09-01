import { Copy, Send, Sparkles } from 'lucide-react'
import Button from '../ui/Button'

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export default function DevelopmentAgentLaunchBrief({ brief, onCopy, onOpenMarketing }) {
  if (!brief) return null
  const price = brief.priceFrom ? brief.priceTo && brief.priceTo !== brief.priceFrom ? `${currency.format(brief.priceFrom)} – ${currency.format(brief.priceTo)}` : `From ${currency.format(brief.priceFrom)}` : 'Pricing on request'
  return <section className="rounded-[20px] border border-[#cfe5d8] bg-[#f4fbf7] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-[#2e704d]"><Sparkles size={14} />Agent launch brief</span><h3 className="mt-2 text-[1.05rem] font-semibold tracking-[-0.025em] text-[#163a29]">{brief.availableCount} homes available · {price}</h3><p className="mt-1 text-sm leading-6 text-[#537462]">{brief.unitTypes.length ? `${brief.unitTypes.join(' · ')}. ` : ''}{brief.noTransferDuty ? 'No transfer duty options available. ' : ''}Share current stock, then use the availability map to match a buyer.</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="secondary" onClick={onCopy}><Copy size={13} />Copy</Button><Button type="button" size="sm" variant="secondary" onClick={onOpenMarketing}><Send size={13} />Sales pack</Button></div></div></section>
}
