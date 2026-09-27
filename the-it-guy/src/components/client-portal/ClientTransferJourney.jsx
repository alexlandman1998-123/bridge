import { useState } from 'react'
import { Building2, CalendarDays, CheckCircle2, ChevronDown, Clock3, GraduationCap, Scale, UserRound } from 'lucide-react'

const rgba = (hex, alpha) => {
  const normalized = String(hex || '#087955').replace('#', '')
  const value = Number.parseInt(normalized.length === 3 ? normalized.split('').map(c => c + c).join('') : normalized.slice(0, 6), 16)
  if (!Number.isFinite(value)) return `rgba(8,121,85,${alpha})`
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`
}

function StageCard({ stage, index, isLast, isCurrent, model, brand }) {
  const [expanded, setExpanded] = useState(isCurrent)
  const [showWhy, setShowWhy] = useState(true)
  const completed = stage.status === 'completed'
  const blocked = stage.status === 'blocked'
  const update = stage.latestUpdate
  const date = update?.createdAt ? new Date(update.createdAt) : null
  const updateDate = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : ''
  const number = String(index + 1).padStart(2, '0')
  const currentDetail = [
    { label: 'Currently', value: stage.currentStatus, helper: stage.waitingOn ? `Waiting on ${stage.waitingOn}` : 'Your transfer team is handling this step.', Icon: Clock3 },
    { label: 'Usually takes', value: stage.duration || 'Timing to be confirmed', helper: 'A guide for this stage, not a deadline.', Icon: CalendarDays },
    { label: 'You need to do', value: model.clientAction, helper: model.clientActionDetail, Icon: UserRound },
  ]
  return <article className="relative grid grid-cols-[48px_minmax(0,1fr)] gap-4">
    {!isLast ? <span className="absolute left-6 top-10 h-[calc(100%-10px)] w-px" style={{ backgroundColor: completed || isCurrent ? rgba(brand, 0.32) : '#dbe5ef' }} /> : null}
    <div className="relative z-10 flex justify-center">
      <span className={`flex items-center justify-center rounded-full font-semibold ${isCurrent ? 'h-12 w-12 text-base text-white shadow-[0_10px_26px_rgba(15,23,42,0.16)]' : 'mt-1 h-9 w-9 text-sm'}`}
        style={{ backgroundColor: completed || isCurrent ? brand : '#c7d1dc', color: '#ffffff' }}>
        {completed ? <CheckCircle2 size={18} /> : number}
      </span>
    </div>
    <div className={isLast ? '' : 'pb-4'}>
      <div className={`rounded-[18px] border p-4 transition ${isCurrent ? 'bg-[#fbfffd] shadow-[0_14px_34px_rgba(15,23,42,0.06)]' : 'bg-white'}`}
        style={{ borderColor: isCurrent ? rgba(brand, 0.2) : '#dbe5ef' }}>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex w-full items-start justify-between gap-4 text-left">
          <div className="flex items-start gap-4">
            <span className="hidden text-sm font-semibold text-[#52657b] sm:block">{number}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[#142132]">{stage.title}</h3>
                {isCurrent ? <span className="rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold" style={{ borderColor: rgba(brand, 0.2), backgroundColor: rgba(brand, 0.08), color: brand }}>{blocked ? 'Needs attention' : 'We are here'}</span> : null}
                {stage.delayStatus === 'delayed' ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.68rem] font-semibold text-amber-900">Delay reported</span> : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#52657b]">{stage.description}</p>
              {completed ? <p className="mt-1 text-xs font-medium text-[#667085]">Completed</p> : null}
            </div>
          </div>
          <ChevronDown size={18} className={`mt-1 shrink-0 text-[#142132] transition ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded ? <div className="mt-5 space-y-4">
          {isCurrent ? <>
            {stage.delayStatus === 'delayed' && stage.delayReason ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Delay: {stage.delayReason}</p> : null}
            <div className="grid gap-4 rounded-[16px] border border-[#e4ebf3] bg-white p-4 lg:grid-cols-3 lg:divide-x lg:divide-[#dbe5ef]">
              {currentDetail.map(({ label, value, helper, Icon }) => <div key={label} className="flex items-start gap-3 lg:px-4 first:lg:pl-0 last:lg:pr-0">
                <Icon size={21} className="mt-1 shrink-0 text-[#142132]" />
                <div><p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{label}</p>
                  <h4 className="mt-1 text-sm font-semibold text-[#142132]">{value}</h4>
                  <p className="mt-1 text-sm leading-5 text-[#52657b]">{helper}</p></div>
              </div>)}
            </div>
            <div className="rounded-[16px] border border-[#e4ebf3] bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eef5f2]" style={{ color: brand }}><UserRound size={21} /></span>
                  <div><p className="text-sm font-semibold text-[#142132]">Latest update from your transferring attorney</p>
                    {update ? <><p className="mt-1 text-xs font-medium text-[#667085]">{updateDate}{model.updateIsOld ? ' · Older update' : ''}</p>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52657b]">{update.message}</p></>
                      : <p className="mt-2 text-sm leading-6 text-[#52657b]">No update has been published for this stage yet.</p>}</div>
                </div>
                <button type="button" aria-expanded={showWhy} onClick={() => setShowWhy(value => !value)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132]">Why is this needed?<ChevronDown size={16} className={showWhy ? 'rotate-180' : ''} /></button>
              </div>
            </div>
          </> : null}
          {(!isCurrent || showWhy) ? <div className="rounded-[16px] border border-[#e4ebf3] bg-[#fbfdff] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Why is this needed?</p>
            <p className="mt-2 text-sm leading-6 text-[#52657b]">{stage.education}</p>
          </div> : null}
        </div> : null}
      </div>
    </div>
  </article>
}

export default function ClientTransferJourney({ model, audience = 'buyer', propertyTitle = '', propertyImageUrl = '',
  partyName = '', priceLabel = '', attorneyName = '', attorneyFirm = '', brand = '#087955', accent = brand, heroOverlayStyle = null }) {
  const [guideOpen, setGuideOpen] = useState(false)
  if (model?.status !== 'ready') return <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-6 text-sm text-[#52657b]">
    Your transfer journey will appear once the legal matter is ready. Refresh this page if you are expecting an update.
  </section>
  const current = model.currentStage
  const statusItems = [
    { label: 'Transfer status', value: current?.title || 'Transfer complete', helper: current?.currentStatus || '', Icon: Scale },
    { label: 'Transfer attorney', value: attorneyName || 'Transfer team', helper: attorneyFirm || '', Icon: UserRound },
    { label: 'Currently waiting on', value: model.waitingOn, helper: '', Icon: Building2 },
    { label: 'Estimated registration', value: model.estimatedRegistration, helper: '', Icon: CalendarDays },
  ]
  return <section data-client-transfer-journey={audience} className="space-y-5">
    <div className="relative isolate overflow-hidden rounded-[28px] border border-white/70 bg-slate-900 text-white shadow-[0_22px_54px_rgba(15,23,42,0.16)]">
      {propertyImageUrl ? <img src={propertyImageUrl} alt="" className="absolute inset-0 z-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 z-10" style={heroOverlayStyle || { background: 'linear-gradient(90deg,rgba(3,8,9,0.9),rgba(6,13,14,0.7) 60%,rgba(8,16,16,0.45))' }} />
      <div className="relative z-20 grid min-h-[310px] gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-8">
        <div className="flex flex-col justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/75">Your {audience === 'seller' ? 'sale' : 'purchase'}</p>
          <h1 className="mt-4 max-w-5xl text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.06em] text-white lg:text-[3.5rem] 2xl:text-[4.15rem]">{propertyTitle || 'Your property transfer'}</h1></div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[[audience === 'seller' ? 'Seller' : 'Buyer', partyName || (audience === 'seller' ? 'Seller' : 'Buyer')], ['Purchase price', priceLabel || 'See sale agreement'], ['Current stage', current?.title || 'Transfer complete']].map(([label, value]) => <article key={label} className="rounded-[18px] border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
              <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/70">{label}</span>
              <strong className="mt-1 block text-sm font-semibold text-white">{value}</strong>
            </article>)}
          </div>
        </div>
        <div className="rounded-[24px] border border-white/20 bg-white/10 p-5 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Progress</p>
          <div className="mt-5 flex items-center justify-center"><div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(${accent} ${model.progressPercent * 3.6}deg,rgba(255,255,255,0.24) 0deg)` }}>
            <span className="absolute inset-3 rounded-full bg-slate-950/70" />
            <span className="relative text-center"><strong className="block text-4xl tracking-[-0.05em]">{model.progressPercent}%</strong><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Complete</span></span>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-white/80">{model.nextStage ? `Next: ${model.nextStage.title}.` : 'Registration milestone reached.'}</p>
        </div>
      </div>
    </div>
    <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="grid gap-4 lg:grid-cols-4 lg:divide-x lg:divide-[#dbe5ef]">
        {statusItems.map(({ label, value, helper, Icon }) => <article key={label} className="flex items-start gap-3 lg:px-5 first:lg:pl-0 last:lg:pr-0">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dbe5ef] text-[#142132]"><Icon size={20} /></span>
          <div><p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{label}</p>
            <h3 className="mt-1 text-sm font-semibold text-[#142132]">{value}</h3>
            {helper ? <p className="mt-1 text-xs font-semibold text-[#52657b]">{helper}</p> : null}</div>
        </article>)}
      </div>
      <p className="mt-4 border-t border-[#e4ebf3] pt-3 text-xs leading-5 text-[#667085]">*Timelines are estimates and can change with banks, municipalities, attorneys and the Deeds Office.</p>
    </section>
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6">
      <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[#142132]">The conveyancing process</h2>
      <p className="mt-2 text-sm leading-6 text-[#52657b]">Step-by-step journey of how the property is being transferred{audience === 'buyer' ? ' into your name' : ''}.</p>
      <div className="mt-6">{model.stages.map((stage, index) => <StageCard key={`${stage.key}:${current?.key === stage.key}`} stage={stage} index={index} isLast={index === model.stages.length - 1}
        isCurrent={current?.key === stage.key} model={model} brand={brand} />)}</div>
      <div className="mt-5 rounded-[18px] border p-4" style={{ borderColor: rgba(brand, 0.16), backgroundColor: rgba(brand, 0.04) }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white" style={{ color: brand }}><GraduationCap size={21} /></span>
            <div><h3 className="text-sm font-semibold text-[#142132]">Want to understand more about the process?</h3>
              <p className="mt-1 text-sm leading-5 text-[#52657b]">Learn more about conveyancing and what happens at each stage.</p></div>
          </div>
          <button type="button" aria-expanded={guideOpen} onClick={() => setGuideOpen(value => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border bg-white px-4 text-sm font-semibold text-[#142132]">{guideOpen ? 'Hide conveyancing guide' : 'View conveyancing guide'}<ChevronDown size={16} className={guideOpen ? 'rotate-180' : ''} /></button>
        </div>
        {guideOpen ? <ol className="mt-4 grid gap-3 border-t border-[#dbe5ef] pt-4 md:grid-cols-2">
          {model.stages.map((stage, index) => <li key={stage.key} className="rounded-[12px] bg-white p-3 text-sm text-[#52657b]"><strong className="block text-[#142132]">{index + 1}. {stage.title}</strong><span className="mt-1 block leading-5">{stage.education}</span></li>)}
        </ol> : null}
      </div>
    </section>
  </section>
}
