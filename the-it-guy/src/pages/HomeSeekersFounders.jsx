import { founderBio, founderFullBio, rodeBio } from './homeSeekersJoinCopy'
import { FounderPortrait } from './homeSeekersJoinContent'
import { JoinActions } from './HomeSeekersJoinActions'

export default function HomeSeekersFounders() {
  return <>
    <h2 id="founder-title">Meet the founders.</h2>
    <div className="hs-founders__grid">
      <article className="hs-founders__card" aria-labelledby="thomas-founder-title">
        <header className="hs-founders__identity">
          <FounderPortrait src="/brand/homeseekers/thomas-potgieter-polo.jpg" width={1066} height={1600} />
          <div><h3 id="thomas-founder-title">Thomas Potgieter</h3><p className="hs-founders__role">Founder, Home Seekers</p></div>
        </header>
        <div className="hs-founders__bio">{founderBio.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
        <details className="hs-founders__details">
          <summary>Read Thomas’s full bio</summary>
          <div className="hs-founders__bio">{founderFullBio.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
        </details>
      </article>
      <article className="hs-founders__card" aria-labelledby="rode-founder-title">
        <header className="hs-founders__identity">
          <div className="hs-join-rebuild__portrait hs-join-rebuild__portrait--photo"><img src="/brand/homeseekers/rode-potgieter.jpg" alt="Rode Potgieter, co-founder of Home Seekers" width="400" height="600" loading="lazy" decoding="async" /></div>
          <div><h3 id="rode-founder-title">Rode Potgieter</h3><p className="hs-founders__role">Co-founder, Home Seekers</p></div>
        </header>
        <div className="hs-founders__bio">{rodeBio.slice(0, 3).map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
        <details className="hs-founders__details">
          <summary>Read Rode’s full bio</summary>
          <div className="hs-founders__bio">{rodeBio.slice(3).map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
        </details>
      </article>
    </div>
    <div className="hs-founders__call">
      <blockquote>Thirty minutes. We look at your last twelve months together and you decide if it makes sense.<cite>Thomas Potgieter</cite></blockquote>
      <JoinActions section="founder" />
    </div>
  </>
}
