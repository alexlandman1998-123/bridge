import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { money, rentalFileFee, rentalExampleRent, rentalExampleCommission, rentalExampleFee, rentalExampleAgentIncome, rentalAgentCharges, rentalClientRecommendations } from './homeSeekersJoinCopy'
export function Eyebrow({ children }) {
  return <p className="hs-join__eyebrow"><span aria-hidden="true">❯</span>{children}</p>
}

export function CheckList({ items }) {
  return <ul className="hs-join__checklist">{items.map((item) => <li key={item}><Check size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul>
}

export function AgentTestimonialVideo() {
  const videoRef = useRef(null)
  const [issue, setIssue] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const poster = '/assets/homeseekers/agent-story-poster-09b58dde8d57.jpg'
  useEffect(() => {
    if (!waiting) return undefined
    const timeout = window.setTimeout(() => {
      setWaiting(false)
      setIssue('slow')
    }, 15000)
    return () => window.clearTimeout(timeout)
  }, [waiting])
  function retry() {
    setIssue(null)
    setWaiting(false)
    videoRef.current?.load()
  }
  return <div role="region" className="hs-join__video" aria-labelledby="agents-video-title">
    <h2 id="agents-video-title">What our agents say</h2>
    <p>Amanda’s story.</p>
    <div className="hs-join__video-stage">
      <video
        ref={videoRef}
        src="/assets/homeseekers/agent-story-bc2542f538b1.mp4"
        poster={poster}
        title="What our agents say"
        aria-describedby="agents-video-help"
        width="640"
        height="360"
        controls
        playsInline
        preload="none"
        hidden={issue === 'error'}
        onPlay={() => setWaiting(true)}
        onPlaying={() => { setWaiting(false); setIssue(null) }}
        onPause={() => setWaiting(false)}
        onEnded={() => setWaiting(false)}
        onWaiting={() => { if (!videoRef.current?.paused) setWaiting(true) }}
        onError={() => {
          videoRef.current?.pause()
          setWaiting(false)
          setIssue('error')
        }}
      >Your browser cannot play this video. You can watch it on YouTube using the link below.</video>
      {issue && <img className={`hs-join__video-poster${issue === 'slow' ? ' hs-join__video-poster--loading' : ''}`} src={poster} width="640" height="360" alt="Thomas and Amanda in the agent interview" />}
    </div>
    <div className="hs-join__video-help">
      <p id="agents-video-help" role={issue ? 'alert' : undefined}>{issue === 'slow' ? 'The video is still loading. You can wait, retry or watch on YouTube.' : issue ? 'The video could not be loaded. Try again or watch on YouTube.' : 'Press play to watch our agent’s story.'}</p>
      <div>
        {issue && <a href="#agents-video-title" onClick={(event) => { event.preventDefault(); retry() }}>Retry video</a>}
        <a href="https://www.youtube.com/watch?v=1cmCKGbUlrE&t=9s" target="_blank" rel="noopener" referrerPolicy="strict-origin-when-cross-origin">Watch on YouTube<span className="sr-only"> (opens in a new tab)</span><ArrowRight size={17} aria-hidden="true" /></a>
      </div>
    </div>
  </div>
}

export function RentalFees({ compact = false }) {
  const Heading = compact ? 'h4' : 'h3'
  return <div className="hs-join__rental-fees">
    <section>
      <Heading>What Home Seekers charges you, the agent</Heading>
      <table className="hs-join__pricing-table"><caption>Agent charges, excluding VAT</caption><thead><tr><th scope="col">Charge</th><th scope="col">Amount</th></tr></thead><tbody>
        {rentalAgentCharges.map(([charge, amount]) => <tr key={charge}><th scope="row">{charge}</th><td>{amount}</td></tr>)}
      </tbody></table>
      <p className="hs-join__fine">The {money(rentalFileFee)} file fee is paid by the agent once per new rental file. The 3.5% fee is calculated on rent collected.</p>
    </section>
    <section>
      <Heading>What you can charge your client</Heading>
      <table className="hs-join__pricing-table"><caption>Recommended client charges, excluding VAT</caption><thead><tr><th scope="col">Suggested charge</th><th scope="col">Amount</th></tr></thead><tbody>
        {rentalClientRecommendations.map(([charge, amount]) => <tr key={charge}><th scope="row">{charge}</th><td>{amount}</td></tr>)}
      </tbody></table>
      <p className="hs-join__fine">These are suggested fees for you to agree with your landlord or tenant. Home Seekers does not charge you these amounts.</p>
    </section>
  </div>
}

export function RentalExample({ compact = false }) {
  const Heading = compact ? 'h4' : 'h3'
  return <aside className="hs-join__rental-example">
    <Heading>One property. The numbers made clear.</Heading>
    <p>For illustration, a property rents for {money(rentalExampleRent)} a month and you charge a 10% management fee.</p>
    <dl>
      <div><dt>Your monthly commission: {money(rentalExampleRent)} × 10%</dt><dd>{money(rentalExampleCommission)}</dd></div>
      <div><dt>Home Seekers’ fee: {money(rentalExampleRent)} × 3.5%</dt><dd>{money(rentalExampleFee)}</dd></div>
      <div><dt>Remaining for you</dt><dd>{money(rentalExampleAgentIncome)} / month</dd></div>
    </dl>
    <p className="hs-join__fine">The {money(rentalFileFee)} file fee is once off, separate from this monthly calculation. All figures exclude VAT and other costs.</p>
    <Heading>A new lease: suggested client fees</Heading>
    <p>{money(1800)} admin / contract + {money(700)} in and out inspections = <strong>{money(1800 + 700)}</strong> in suggested client charges.</p>
    <p>Less the {money(rentalFileFee)} Home Seekers file fee leaves <strong>{money(1800 + 700 - rentalFileFee)}</strong> before your inspection and other costs, separate from your management commission.</p>
  </aside>
}


export function MobileDetails({ children }) {
  const [open,setOpen] = useState(() => Boolean(window.matchMedia?.('(min-width: 761px)').matches))
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 761px)')
    if (!media) return undefined
    const changed = () => setOpen(media.matches)
    media.addEventListener?.('change', changed)
    return () => media.removeEventListener?.('change', changed)
  }, [])
  return <details className="hs-join-rebuild__mobile-details" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>Show details</summary>{children}</details>
}

export function FounderPortrait({ src = '/brand/homeseekers/thomas-potgieter.jpg', width = 399, height = 600 }) {
  return <div className="hs-join-rebuild__portrait hs-join-rebuild__portrait--photo"><img src={src} alt="Thomas Potgieter, founder of Home Seekers" width={width} height={height} loading="lazy" decoding="async" /></div>
}
