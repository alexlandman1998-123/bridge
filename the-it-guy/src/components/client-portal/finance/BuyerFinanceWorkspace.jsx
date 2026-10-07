import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, Download, ExternalLink, FileText, Mail, Phone } from 'lucide-react'
import Modal from '../../ui/Modal'
import { createBuyerPortalTheme } from '../buyerPortalTheme'
import { fetchBuyerQuotePdf } from '../../../core/clientPortal/buyerQuotePdf'
import { buyerFinanceBankKey } from '../../../core/clientPortal/buyerFinancePresentationModel'

const surface = 'rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:p-6'
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#31475c]'
const safeUrl = value => /^https?:\/\//i.test(String(value || '')) ? value : ''

const lenderBrands = [
  { name: 'Absa', match: /absa/i, logo: '/brand/banks/absa.png' },
  { name: 'FNB', match: /fnb|first national/i, logo: '/brand/banks/fnb.png' },
  { name: 'Nedbank', match: /nedbank/i, logo: '/brand/banks/nedbank.png' },
  { name: 'Standard Bank', match: /standard/i, logo: '/brand/banks/standard-bank.png' },
  { name: 'Investec', match: /investec/i, logo: '/brand/banks/investec.webp' },
  { name: 'Capitec', match: /capitec/i, logo: '/brand/banks/capitec.svg' },
  { name: 'SA Home Loans', match: /sa[ -]*home[ -]*loans/i, logo: '/brand/banks/sa-home-loans.svg' },
]

function BrandLogo({ name, src, className = '' }) {
  const [failedSrc, setFailedSrc] = useState('')
  return src && failedSrc !== src
    ? <img src={src} alt={`${name} logo`} onError={() => setFailedSrc(src)} className={`object-contain ${className}`} />
    : <span className="text-base font-semibold text-[#31475c]">{name || 'Originator not assigned'}</span>
}

function FinanceJourney({ stages = [], theme }) {
  if (!stages.length) return null
  const currentIndex = stages.findIndex(stage => stage.state === 'current')
  const progress = Math.max(0, currentIndex) / Math.max(1, stages.length - 1) * 100
  return <section className={surface}>
    <h2 className="text-base font-semibold text-[#142132]">Your bond application</h2>
    <div className="relative mt-6">
      <div aria-hidden="true" className="absolute left-[10%] right-[10%] top-[18px] hidden h-0.5 bg-[#e3ebf4] sm:block">
        <div className="hidden h-full sm:block" style={{ width: `${progress}%`, backgroundColor: theme.primary }} />
      </div>
      <ol aria-label="Bond application progress" className="relative grid gap-6 sm:grid-cols-5 sm:gap-3">
        {stages.map((stage, index) => <li key={stage.key} data-finance-stage={stage.state} aria-current={stage.state === 'current' ? 'step' : undefined} className="relative flex min-w-0 items-start gap-4 sm:flex-col sm:items-center sm:text-center">
          {index < stages.length - 1 ? <span aria-hidden="true" className="absolute -bottom-6 left-[17px] top-9 w-0.5 sm:hidden" style={{ backgroundColor: stage.state === 'complete' ? theme.primary : '#e3ebf4' }} /> : null}
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-4 border-white text-xs font-semibold ring-1 ring-[#dbe5ef]" style={{ backgroundColor: stage.state === 'upcoming' ? '#eef3f7' : theme.primary, color: stage.state === 'upcoming' ? '#718196' : '#fff' }}>
            {stage.state === 'complete' ? <CheckCircle2 size={16} /> : stage.state === 'current' ? <Clock3 size={16} /> : index + 1}
          </span>
          <div><h3 className="text-sm font-semibold text-[#142132]">{stage.label}</h3><p className="mt-1 text-xs leading-5 text-[#667085]">{stage.helper}</p>
            {stage.state === 'current' ? <p className="mt-2 text-xs font-semibold" style={{ color: theme.primary }}>Current stage</p> : null}</div>
        </li>)}
      </ol>
    </div>

  </section>
}

function LenderCards({ model, onOpenQuote, resolveQuote, columns }) {
  const [selected, setSelected] = useState(null)
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState('')
  async function quoteAction(offer, action) {
    setDownloadError('')
    setDownloading(offer.id)
    let popup = null
    try {
      const resolver = resolveQuote || (async quote => ({ url: safeUrl(quote.quoteDocument?.url || quote.downloadUrl), name: quote.quoteDocument?.name }))
      if (action === 'view') {
        // Reserve the tab during the click, before awaiting the secure reader.
        popup = window.open('', '_blank')
        if (!popup) throw new Error('Your browser blocked the PDF tab. Please allow popups or download the PDF.')
        popup.opener = null
        const document = await resolver(offer)
        if (!safeUrl(document?.url)) throw new Error('This quote PDF is not available.')
        popup.location.replace(document.url)
      } else {
        const { blob, name } = await fetchBuyerQuotePdf({ offer, resolveQuote: resolver })
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = name || `${offer.bankName}-quote.pdf`
        link.click()
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
      }
    } catch (error) {
      popup?.close()
      setDownloadError(error.message || 'The quote could not be opened. Please retry.')
    } finally { setDownloading('') }
  }

  const offers = model?.offers || []
  const banks = [...(model?.bankApplications || [])]
  for (const offer of offers) if (!banks.some(bank => buyerFinanceBankKey(bank.bankName) === buyerFinanceBankKey(offer.bankName))) {
    banks.push({ id: `quote-${offer.id}`, bankName: offer.bankName, status: 'Quote received' })
  }
  const currentBank = selected ? banks.find(bank => buyerFinanceBankKey(bank.bankName) === buyerFinanceBankKey(selected.bankName)) : null
  useEffect(() => { if (selected && !currentBank) setSelected(null) }, [selected, currentBank])
  const quotes = currentBank ? offers.filter(offer => buyerFinanceBankKey(offer.bankName) === buyerFinanceBankKey(currentBank.bankName)) : []
  return <section className={surface}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#142132]">Bank applications</h2><span className="text-xs text-[#667085]">{banks.length} lender{banks.length === 1 ? '' : 's'}</span></div>
    {banks.length ? <div className={`mt-5 grid gap-3 ${columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
      {banks.map(bank => {
        const available = offers.filter(offer => buyerFinanceBankKey(offer.bankName) === buyerFinanceBankKey(bank.bankName))
        return <button type="button" key={bank.id} data-finance-bank={bank.id} onClick={() => { setDownloadError(''); setSelected(bank) }} className="min-w-0 rounded-2xl border border-[#dbe5ef] bg-[#fbfdff] p-4 text-left transition hover:border-[#a9bbcb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={`View ${bank.bankName} application`}>
          <div className="flex items-center justify-between gap-2"><span className="flex h-12 w-28 items-center"><BrandLogo name={bank.bankName} src={lenderBrands.find(brand => brand.match.test(bank.bankName))?.logo} className="max-h-10 max-w-full" /></span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${available.length ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{available.length ? 'Quote received' : bank.status}</span></div>
          <h3 className="mt-4 text-base font-semibold text-[#142132]">{bank.bankName}</h3>
          <p className="mt-2 text-xs leading-5 text-[#667085]">{bank.latestUpdate || (available.length ? `${available.length} quote${available.length === 1 ? '' : 's'} available to review` : 'Your consultant will share the next bank response.')}</p>
          <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#31475c]">{available.length ? 'View quote' : 'View application'}<ExternalLink size={13} /></span>
        </button>
      })}
    </div> : <p className="mt-4 rounded-xl border border-dashed border-[#dbe5ef] p-5 text-sm leading-6 text-[#667085]">{model?.bankApplicationsUnavailable ? 'Bank applications are temporarily unavailable. Please refresh in a moment.' : 'Your consultant has not shared any bank submissions yet. They will appear here when recorded.'}</p>}
    <Modal open={Boolean(currentBank)} onClose={() => setSelected(null)} title={currentBank?.bankName || 'Bank application'} subtitle={quotes.length ? 'Quotes shared by your finance team' : currentBank?.status || ''}>
      <div className="mb-5 flex items-center justify-between gap-4 rounded-xl bg-[#f6f9fc] p-4">
        <BrandLogo name={currentBank?.bankName} src={lenderBrands.find(brand => brand.match.test(currentBank?.bankName || ''))?.logo} className="h-12 w-36 object-left" />
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#31475c]">{quotes.length ? 'Quote received' : currentBank?.status || 'Awaiting response'}</span>
      </div>
      {downloadError ? <p role="alert" className="mb-4 text-sm text-red-700">{downloadError}</p> : null}
      {quotes.length ? <div className="space-y-4">{quotes.map(offer => {
        const document = offer.quoteDocument || null
        const url = safeUrl(document?.url || offer.downloadUrl)
        return <article key={offer.id} data-finance-offer={offer.id} className="rounded-xl border border-[#dbe5ef] p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm min-[380px]:grid-cols-2">{[['Loan amount', offer.amountLabel], ['Interest rate', offer.rateLabel || 'Not provided'], ['Monthly repayment', offer.repaymentLabel || 'Not provided'], ['Valid until', offer.validUntil || 'Not provided']].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f6f9fc] p-3"><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 break-words font-semibold text-[#142132]">{value}</dd></div>)}</dl>
          {offer.conditionsSummary ? <p className="mt-4 text-sm leading-6 text-[#52657b]">{offer.conditionsSummary}</p> : null}
          <div className="mt-5 border-t border-[#e3ebf4] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#718196]">Quote document</p>
            <div className="mt-3 flex flex-col gap-4 rounded-xl border border-[#dbe5ef] p-4">
              <div className="flex min-w-0 items-start gap-3"><FileText size={22} className="shrink-0 text-[#52657b]" /><div className="min-w-0"><p className="break-words text-sm font-semibold text-[#142132]">{document?.name || `${offer.bankName} quote`}</p><p className="mt-1 text-xs text-[#667085]">{url || document ? 'Shared by your finance team' : 'Your consultant has not shared the PDF yet.'}</p></div></div>
              {(url || (document && resolveQuote)) ? <div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(downloading)} onClick={() => void quoteAction(offer, 'view')} className={`${button} disabled:opacity-50`}><ExternalLink size={15} />View PDF</button><button type="button" disabled={Boolean(downloading)} onClick={() => void quoteAction(offer, 'download')} className={`${button} disabled:opacity-50`}><Download size={15} />{downloading === offer.id ? 'Opening…' : 'Download PDF'}</button></div> : document && onOpenQuote ? <button type="button" className={button} onClick={() => onOpenQuote(document)}><FileText size={15} />Open quote document</button> : null}
            </div>
          </div>
        </article>
      })}</div> : <p className="text-sm leading-6 text-[#52657b]">{currentBank?.latestUpdate || 'No quote has been shared for this application yet.'}</p>}
    </Modal>
  </section>
}

function CashFundsCard({ model, cashProofAction }) {
  return <section className={surface}>
    <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eef3f7] text-[#31475c]"><FileText size={20} /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-[#718196]">{model.mode === 'hybrid' ? 'Cash contribution' : 'Cash purchase'}</p><h2 className="mt-1 text-base font-semibold text-[#142132]">Proof of funds</h2><p className="mt-2 text-sm leading-6 text-[#52657b]">Upload proof of the funds available for {model.mode === 'hybrid' ? 'your cash contribution' : 'your purchase'}. Your team will review the document.</p></div></div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#e3ebf4] pt-4"><div><p className="text-xs text-[#667085]">{model.mode === 'hybrid' ? 'Cash contribution' : 'Purchase price'}</p><p className="mt-1 font-semibold text-[#142132]">{model.mode === 'hybrid' ? model.cashContributionLabel : model.purchasePriceLabel}</p></div>{cashProofAction}</div>
  </section>
}

export default function BuyerFinanceWorkspace({ model, theme: themeInput, primaryAction = null, secondaryAction = null, cashProofAction = null, onOpenQuote = null, resolveQuote = null, refreshAction = null, showLenders = true, lenderColumns = 3, afterLenders = null }) {
  const theme = themeInput?.primary ? themeInput : createBuyerPortalTheme(themeInput)
  if (!model) return null
  return <section data-buyer-finance="workspace" data-finance-source={model.source} data-finance-mode={model.mode} className="space-y-5">
    {model.isCashFinance || model.mode === 'hybrid' ? <CashFundsCard model={model} cashProofAction={cashProofAction || secondaryAction} /> : null}
    {model.isBondFinance ? <>
      <section className={surface}>
        <div className="grid items-center gap-5 sm:grid-cols-[1fr_1.4fr_1fr] sm:gap-6">
          <div className="flex min-h-16 items-center border-b border-[#e3ebf4] pb-5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6"><BrandLogo name={model.manager?.company || model.manager?.name} src={safeUrl(model.manager?.logo) || (/betterbond/i.test(`${model.manager?.company} ${model.manager?.name}`) ? '/brand/originators/betterbond.svg' : /ooba/i.test(`${model.manager?.company} ${model.manager?.name}`) ? '/brand/originators/ooba.webp' : '')} className="max-h-14 w-full max-w-[190px]" /></div>
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-[#718196]">Your bond consultant</p><h2 className="mt-2 break-words text-lg font-semibold text-[#142132]">{model.manager?.name || (model.isDirectFinance ? 'Finance arranged directly' : 'Awaiting consultant assignment')}</h2>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#31475c]">{model.manager?.email && !/\.example$|\.test$/i.test(model.manager.email) ? <a href={`mailto:${model.manager.email}`} className="inline-flex items-center gap-1 break-all"><Mail size={14} />{model.manager.email}</a> : null}{model.manager?.phone ? <a href={`tel:${model.manager.phone}`} className="inline-flex items-center gap-1"><Phone size={14} />{model.manager.phone}</a> : null}</div>
          </div>
          <div className="border-t border-[#e3ebf4] pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right"><p className="text-xs font-semibold uppercase tracking-wider text-[#718196]">Requested bond</p><p className="mt-2 text-xl font-semibold text-[#142132]">{model.requestedAmountLabel}</p></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#e3ebf4] pt-4"><div><p className="text-sm font-semibold text-[#142132]">{model.status}</p><p className="mt-1 text-xs leading-5 text-[#667085]">{model.firstAction?.description || model.statusHelper}</p></div><div className="flex flex-wrap gap-2">{refreshAction}{primaryAction}{secondaryAction}</div></div>
      </section>
      <FinanceJourney stages={model.stages} theme={theme} />
      {showLenders ? <LenderCards model={model} onOpenQuote={onOpenQuote} resolveQuote={resolveQuote} columns={lenderColumns} /> : null}
      {afterLenders}
    </> : null}
  </section>
}
